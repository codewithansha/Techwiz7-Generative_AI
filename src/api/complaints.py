from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy import or_
from sqlalchemy.orm import Session, selectinload

from complaint_processing.preprocess import content_hash, sanitize_input, validate_complaint_payload
from complaint_processing.sla import refresh_sla_risk
from config.settings import get_settings
from database.models import (
    Complaint,
    ComplaintAttachment,
    ComplaintStatus,
    Customer,
    ReviewAction,
    ReviewActionType,
    User,
    UserRole,
)
from database.session import get_db
from document_processing.validate import validate_complaint_attachment
from security.audit import write_audit
from security.auth import CurrentUser, ReviewerUser, StaffUser
from src.api.schemas import AnalyzeRequest, AssignRequest, ComplaintCreate, ReviewRequest, StatusUpdate
from src.services.analysis import analyze_complaint, ensure_not_duplicate_block, next_complaint_code, serialize_complaint

router = APIRouter(prefix="/api/v1/complaints", tags=["complaints"])


def _customer_for_user(db: Session, user: User) -> Customer | None:
    return db.query(Customer).filter(Customer.user_id == user.id).first()


def _analysis_loaders():
    """selectin loading keeps sibling collections from multiplying into a cartesian product."""
    return (
        selectinload(Complaint.genai_runs),
        selectinload(Complaint.validation_results),
        selectinload(Complaint.comparisons),
    )


@router.post("")
def submit_complaint(
    payload: ComplaintCreate,
    user: CurrentUser,
    db: Session = Depends(get_db),
):
    errors = validate_complaint_payload(payload.model_dump())
    if errors:
        raise HTTPException(status_code=422, detail=errors)
    title = sanitize_input(payload.title)
    description = sanitize_input(payload.description)
    customer = _customer_for_user(db, user)
    if user.role == UserRole.customer and not customer:
        raise HTTPException(status_code=400, detail="Customer profile is missing.")
    if user.role != UserRole.customer and payload.customer_code:
        customer = db.query(Customer).filter(Customer.customer_code == payload.customer_code).first()
    duplicate = ensure_not_duplicate_block(db, f"{title}\n{description}", customer.id if customer else None)
    complaint = Complaint(
        complaint_code=next_complaint_code(db),
        customer_id=customer.id if customer else None,
        submitted_by_id=user.id,
        title=title,
        description=description,
        normalized_text=f"{title} {description}".lower(),
        content_hash=content_hash(f"{title}\n{description}"),
        product_or_service=sanitize_input(payload.product_or_service),
        order_reference=payload.order_reference.strip(),
        previous_complaint_reference=payload.previous_complaint_reference.strip(),
        customer_type=payload.customer_type,
        preferred_contact_channel=payload.preferred_contact_channel,
        requested_resolution=sanitize_input(payload.requested_resolution),
        duplicate_of_id=duplicate.get("match_id"),
    )
    db.add(complaint)
    write_audit(db, actor_id=user.id, entity_type="complaint", entity_id=complaint.complaint_code, action="submit")
    db.commit()
    db.refresh(complaint)
    return {
        "complaint": serialize_complaint(complaint),
        "near_duplicate": duplicate.get("near_duplicate"),
        "near_duplicate_of": duplicate.get("match_code"),
    }


@router.post("/{complaint_id}/attachments")
def add_attachment(
    complaint_id: int,
    user: CurrentUser,
    db: Session = Depends(get_db),
    file: UploadFile = File(...),
):
    complaint = _get_visible_complaint(db, user, complaint_id)
    content = file.file.read()
    validate_complaint_attachment(file, content)
    dest_dir = get_settings().upload_path / "complaints" / str(complaint.id)
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest = dest_dir / (file.filename or "attachment.bin")
    dest.write_bytes(content)
    row = ComplaintAttachment(
        complaint_id=complaint.id,
        filename=file.filename or dest.name,
        content_type=file.content_type or "application/octet-stream",
        storage_path=str(dest),
        size_bytes=len(content),
    )
    db.add(row)
    db.commit()
    return {"id": row.id, "filename": row.filename}


@router.get("")
def list_complaints(
    user: CurrentUser,
    db: Session = Depends(get_db),
    status: str | None = None,
    category: str | None = None,
    department: str | None = None,
    priority: str | None = None,
    sentiment: str | None = None,
    q: str | None = None,
    sla_risk: bool | None = None,
    escalated: bool | None = None,
    review: bool | None = None,
):
    query = db.query(Complaint).options(*_analysis_loaders())
    if user.role == UserRole.customer:
        customer = _customer_for_user(db, user)
        query = query.filter(Complaint.customer_id == (customer.id if customer else -1))
    elif user.role == UserRole.agent:
        query = query.filter(or_(Complaint.assigned_to_id == user.id, Complaint.assigned_to_id.is_(None)))
    if status:
        query = query.filter(Complaint.status == ComplaintStatus(status))
    if sla_risk is True:
        query = query.filter(Complaint.sla_risk.is_(True))
    if escalated is True:
        query = query.filter(Complaint.status == ComplaintStatus.escalated)
    if q:
        like = f"%{q}%"
        query = query.filter(
            or_(
                Complaint.complaint_code.ilike(like),
                Complaint.title.ilike(like),
                Complaint.order_reference.ilike(like),
            )
        )
    rows = query.order_by(Complaint.id.desc()).limit(200).all()
    payload = []
    for row in rows:
        refresh_sla_risk(row)
        item = serialize_complaint(row)
        if category and (item.get("python") or {}).get("issue_category") != category:
            continue
        if department and (item.get("python") or {}).get("department") != department:
            continue
        if priority and (item.get("python") or {}).get("priority") != priority:
            continue
        if sentiment and (item.get("genai") or {}).get("sentiment") != sentiment:
            continue
        if review is True and not item.get("requires_manual_review"):
            continue
        payload.append(item)
    return payload


@router.get("/queue/manual-review")
def manual_review_queue(user: ReviewerUser, db: Session = Depends(get_db)):
    rows = db.query(Complaint).options(*_analysis_loaders()).order_by(Complaint.id.desc()).all()
    return [
        serialize_complaint(row)
        for row in rows
        if row.validation_results and row.validation_results[-1].requires_manual_review
    ]


@router.get("/{complaint_id}")
def get_complaint(complaint_id: int, user: CurrentUser, db: Session = Depends(get_db)):
    complaint = _get_visible_complaint(db, user, complaint_id)
    refresh_sla_risk(complaint)
    return serialize_complaint(complaint)


@router.post("/{complaint_id}/analyze")
def analyze(complaint_id: int, user: StaffUser, payload: AnalyzeRequest, db: Session = Depends(get_db)):
    complaint = db.query(Complaint).filter(Complaint.id == complaint_id).first()
    if not complaint:
        raise HTTPException(status_code=404, detail="Complaint not found")
    return analyze_complaint(db, complaint, tone=payload.tone, skip_genai=payload.skip_genai, actor_id=user.id)


@router.patch("/{complaint_id}/status")
def update_status(complaint_id: int, payload: StatusUpdate, user: StaffUser, db: Session = Depends(get_db)):
    complaint = db.query(Complaint).filter(Complaint.id == complaint_id).first()
    if not complaint:
        raise HTTPException(status_code=404, detail="Complaint not found")
    complaint.status = ComplaintStatus(payload.status)
    if payload.note:
        complaint.latest_update = payload.note
    write_audit(db, actor_id=user.id, entity_type="complaint", entity_id=complaint.complaint_code, action="status")
    db.commit()
    return serialize_complaint(complaint)


@router.post("/{complaint_id}/assign")
def assign(complaint_id: int, payload: AssignRequest, user: StaffUser, db: Session = Depends(get_db)):
    complaint = db.query(Complaint).filter(Complaint.id == complaint_id).first()
    if not complaint:
        raise HTTPException(status_code=404, detail="Complaint not found")
    if payload.agent_id:
        complaint.assigned_to_id = payload.agent_id
    if payload.department_id:
        complaint.assigned_department_id = payload.department_id
    complaint.status = ComplaintStatus.assigned
    complaint.latest_update = "Assigned"
    db.commit()
    return serialize_complaint(complaint)


@router.post("/{complaint_id}/review")
def review_complaint(complaint_id: int, payload: ReviewRequest, user: ReviewerUser, db: Session = Depends(get_db)):
    complaint = db.query(Complaint).filter(Complaint.id == complaint_id).first()
    if not complaint:
        raise HTTPException(status_code=404, detail="Complaint not found")
    try:
        action = ReviewActionType(payload.action)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail="Unknown review action") from exc
    original = complaint.genai_runs[-1].structured_output if complaint.genai_runs else {}
    review = ReviewAction(
        complaint_id=complaint.id,
        reviewer_id=user.id,
        action=action,
        original_recommendation=original,
        final_decision=payload.final_decision or original,
        comments=payload.comments,
    )
    db.add(review)
    if action == ReviewActionType.approve:
        complaint.status = ComplaintStatus.in_progress
        complaint.latest_update = "Reviewer approved recommendation."
    elif action == ReviewActionType.reject:
        complaint.status = ComplaintStatus.analyzed
        complaint.latest_update = "Reviewer rejected recommendation."
    elif action == ReviewActionType.escalate:
        complaint.status = ComplaintStatus.escalated
        complaint.latest_update = "Reviewer escalated."
    elif action == ReviewActionType.regenerate:
        db.commit()
        return analyze_complaint(db, complaint, actor_id=user.id)
    elif action == ReviewActionType.reassign and payload.final_decision.get("department_id"):
        complaint.assigned_department_id = payload.final_decision["department_id"]
        complaint.status = ComplaintStatus.assigned
    write_audit(
        db,
        actor_id=user.id,
        entity_type="complaint",
        entity_id=complaint.complaint_code,
        action=f"review_{action.value}",
        details={"original": original, "final": review.final_decision, "comments": payload.comments},
    )
    db.commit()
    return serialize_complaint(complaint)


def _get_visible_complaint(db: Session, user: User, complaint_id: int) -> Complaint:
    complaint = (
        db.query(Complaint)
        .options(*_analysis_loaders())
        .filter(Complaint.id == complaint_id)
        .first()
    )
    if not complaint:
        raise HTTPException(status_code=404, detail="Complaint not found")
    if user.role == UserRole.customer:
        customer = _customer_for_user(db, user)
        if not customer or complaint.customer_id != customer.id:
            raise HTTPException(status_code=403, detail="Not allowed")
    return complaint
