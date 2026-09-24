from datetime import datetime, timedelta, timezone

from fastapi import HTTPException
from sqlalchemy import or_
from sqlalchemy.orm import Session

from config.settings import get_settings
from complaint_processing.duplicates import detect_repeat_unresolved, find_duplicates
from complaint_processing.preprocess import content_hash, extract_metadata, sanitize_input
from complaint_processing.sla import apply_sla
from comparison_engine.compare import compare_outputs
from database.models import (
    ComparisonResult,
    Complaint,
    ComplaintCategory,
    ComplaintStatus,
    Department,
    FollowUp,
    KnowledgeDocument,
    ValidationResult,
)
from genai_pipeline.pipeline import run_genai_pipeline
from knowledge_base.retrieval import retrieve_policy_chunks
from python_validation.pipeline import run_python_validation
from security.audit import write_audit


def next_complaint_code(db: Session) -> str:
    last = db.query(Complaint).order_by(Complaint.id.desc()).first()
    number = (last.id + 1) if last else 1
    return f"CMP-{number:05d}"


def analyze_complaint(db: Session, complaint: Complaint, *, tone: str = "professional", skip_genai: bool = False, actor_id: int | None = None) -> dict:
    categories = [c.name for c in db.query(ComplaintCategory).filter(ComplaintCategory.is_active.is_(True)).all()]
    departments = [d.name for d in db.query(Department).filter(Department.is_active.is_(True)).all()]
    allowed_categories = set(categories)
    allowed_departments = set(departments) | {d.code for d in db.query(Department).all()}
    allowed_policies = {d.document_code for d in db.query(KnowledgeDocument).all()}

    repeat = detect_repeat_unresolved(db, customer_id=complaint.customer_id)
    complaint.is_repeat = repeat["is_repeat"]
    repeat_context = f"open_count={repeat['open_count']}"

    genai_output = None
    genai_run = None
    policy_chunks: list[dict] = []
    settings = get_settings()
    has_key = settings.has_any_genai_key()
    if not skip_genai and not has_key:
        skip_genai = True
    if not skip_genai:
        genai_run, policy_chunks = run_genai_pipeline(
            db,
            complaint,
            categories=categories,
            departments=departments,
            tone=tone,
            repeat_context=repeat_context,
        )
        genai_output = genai_run.structured_output or None
        if genai_run.error_message:
            genai_run.routed_to_manual_review = True
    else:
        policy_chunks = retrieve_policy_chunks(
            db, f"{complaint.title} {complaint.description} {complaint.product_or_service}"
        )

    validation = run_python_validation(
        db,
        complaint=complaint,
        genai_output=genai_output,
        policy_chunks=policy_chunks,
        allowed_categories=allowed_categories,
        allowed_departments=allowed_departments,
        allowed_policies=allowed_policies,
        is_repeat=repeat["is_repeat"],
        open_count=repeat["open_count"],
    )
    python_out = validation["python_output"]
    dept = (
        db.query(Department)
        .filter(
            or_(
                Department.name == python_out.get("department"),
                Department.code == python_out.get("department"),
            )
        )
        .first()
    )
    if dept:
        complaint.assigned_department_id = dept.id

    apply_sla(db, complaint, python_out.get("priority") or "P2")
    if python_out.get("follow_up_required"):
        complaint.follow_up_at = datetime.now(timezone.utc) + timedelta(days=2)
        db.add(
            FollowUp(
                complaint_id=complaint.id,
                scheduled_at=complaint.follow_up_at,
                message=python_out.get("escalation_reasons") and "Follow up after escalation review." or "Follow up on resolution progress.",
                follow_up_type="status_update",
            )
        )

    if python_out.get("escalation_required"):
        complaint.status = ComplaintStatus.escalated
        complaint.latest_update = "Python validation required escalation."
    elif validation["requires_manual_review"]:
        complaint.status = ComplaintStatus.analyzed
        complaint.latest_update = "Queued for manual review."
    else:
        complaint.status = ComplaintStatus.analyzed
        complaint.latest_update = "Analyzed and verified."

    result = ValidationResult(
        complaint_id=complaint.id,
        genai_run_id=genai_run.id if genai_run else None,
        python_output=python_out,
        checks=validation["checks"],
        flags=validation["flags"],
        verification_score=validation["verification_score"] or 0,
        requires_manual_review=validation["requires_manual_review"],
    )
    db.add(result)
    comparison_payload = validation.get("comparison") or compare_outputs(genai_output or {}, python_out)
    comparison = ComparisonResult(
        complaint_id=complaint.id,
        field_comparisons=comparison_payload.get("field_comparisons", {}),
        match_count=comparison_payload.get("match_count", 0),
        mismatch_count=comparison_payload.get("mismatch_count", 0),
        verification_status=comparison_payload.get("verification_status", "manual_review"),
        explanation=comparison_payload.get("explanation", ""),
    )
    db.add(comparison)
    write_audit(
        db,
        actor_id=actor_id,
        entity_type="complaint",
        entity_id=complaint.complaint_code,
        action="analyze",
        details={"verification_status": comparison.verification_status, "score": result.verification_score},
    )
    db.commit()
    db.refresh(complaint)
    return {
        "complaint": complaint,
        "genai": genai_output,
        "python": python_out,
        "comparison": comparison_payload,
        "flags": validation["flags"],
        "verification_score": result.verification_score,
        "requires_manual_review": result.requires_manual_review,
        "metadata": extract_metadata(complaint.description),
        "prompt_injection": python_out.get("prompt_injection"),
        "policy_chunks": policy_chunks,
        "genai_error": genai_run.error_message if genai_run else "",
    }


def serialize_complaint(complaint: Complaint) -> dict:
    latest_genai = complaint.genai_runs[-1] if complaint.genai_runs else None
    latest_val = complaint.validation_results[-1] if complaint.validation_results else None
    latest_cmp = complaint.comparisons[-1] if complaint.comparisons else None
    return {
        "id": complaint.id,
        "complaint_code": complaint.complaint_code,
        "title": complaint.title,
        "description": complaint.description,
        "status": complaint.status.value,
        "product_or_service": complaint.product_or_service,
        "order_reference": complaint.order_reference,
        "customer_type": complaint.customer_type.value,
        "channel": complaint.channel.value,
        "latest_update": complaint.latest_update,
        "sla_risk": complaint.sla_risk,
        "sla_resolution_due": complaint.sla_resolution_due,
        "follow_up_at": complaint.follow_up_at,
        "is_repeat": complaint.is_repeat,
        "is_adversarial": complaint.is_adversarial,
        "assigned_department_id": complaint.assigned_department_id,
        "assigned_to_id": complaint.assigned_to_id,
        "created_at": complaint.created_at,
        "genai": latest_genai.structured_output if latest_genai else None,
        "genai_meta": {
            "provider": latest_genai.provider,
            "model": latest_genai.model,
            "prompt_version": latest_genai.prompt_version,
            "attempt": latest_genai.attempt,
            "error": latest_genai.error_message,
        }
        if latest_genai
        else None,
        "python": latest_val.python_output if latest_val else None,
        "flags": latest_val.flags if latest_val else [],
        "verification_score": latest_val.verification_score if latest_val else None,
        "requires_manual_review": latest_val.requires_manual_review if latest_val else None,
        "comparison": {
            "fields": latest_cmp.field_comparisons,
            "status": latest_cmp.verification_status,
            "explanation": latest_cmp.explanation,
        }
        if latest_cmp
        else None,
    }


def ensure_not_duplicate_block(db: Session, text: str, customer_id: int | None) -> dict:
    found = find_duplicates(db, text=text, customer_id=customer_id)
    if found.get("exact"):
        raise HTTPException(
            status_code=409,
            detail=f"Exact duplicate of {found['match_code']}",
        )
    return found
