import uuid
from pathlib import Path
from datetime import date, datetime, time, timedelta, timezone

from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import func, or_
from sqlalchemy.orm import Session, selectinload

from complaint_processing.preprocess import sanitize_input
from complaint_processing.sla import mark_first_response
from config.settings import get_settings
from database.models import (
    AuditLog,
    Complaint,
    ComplaintAttachment,
    ComplaintStatus,
    Customer,
    ComplaintFeedback,
    ComplaintMessage,
    Department,
    FollowUp,
    ReviewAction,
    ReviewActionType,
    User,
    UserRole,
)
from database.session import get_db
from document_processing.attachments import extract_attachment
from document_processing.validate import safe_filename, validate_complaint_attachment
from security.audit import write_audit
from security.auth import CurrentUser, ReviewerUser, StaffUser
from src.services.access import customer_for, scope_complaints, visibility_error
from src.services.intake import IntakeError, create_complaint
from src.api.schemas import AnalyzeRequest, AssignRequest, ComplaintCreate, CustomerDecision, MessageCreate, ReviewRequest, StatusUpdate
from src.services.messaging import reply_flags
from src.services.analysis import (
    analyze_complaint,
    customer_update,
    sync_classification,
    serialize_complaint,
)

router = APIRouter(prefix="/api/v1/complaints", tags=["complaints"])


def _customer_for_user(db: Session, user: User) -> Customer | None:
    return customer_for(db, user)


def _audience(user: User) -> str:
    return "customer" if user.role == UserRole.customer else "staff"


def _loaders():
    """selectin loading keeps sibling collections from multiplying into a cartesian product."""
    return (
        selectinload(Complaint.genai_runs),
        selectinload(Complaint.validation_results),
        selectinload(Complaint.comparisons),
        selectinload(Complaint.reviews),
        selectinload(Complaint.attachments),
        selectinload(Complaint.assigned_department),
        selectinload(Complaint.assigned_to),
        selectinload(Complaint.customer),
        selectinload(Complaint.duplicate_of),
        selectinload(Complaint.followups),
        selectinload(Complaint.messages).selectinload(ComplaintMessage.author),
        selectinload(Complaint.feedback),
    )


def _get_complaint(db: Session, complaint_id: int) -> Complaint:
    complaint = db.query(Complaint).options(*_loaders()).filter(Complaint.id == complaint_id).first()
    if not complaint:
        raise HTTPException(status_code=404, detail="Complaint not found")
    return complaint


@router.post("")
def submit_complaint(
    payload: ComplaintCreate,
    user: CurrentUser,
    db: Session = Depends(get_db),
):
    customer = _customer_for_user(db, user)
    if user.role == UserRole.customer and not customer:
        raise HTTPException(status_code=400, detail="Customer profile is missing.")
    if user.role != UserRole.customer and payload.customer_code:
        customer = db.query(Customer).filter(Customer.customer_code == payload.customer_code.strip()).first()
        if not customer:
            raise HTTPException(status_code=422, detail=[f"Unknown customer reference {payload.customer_code}."])
    try:
        complaint, duplicate = create_complaint(db, payload.model_dump(), customer=customer, submitted_by_id=user.id)
    except IntakeError as exc:
        raise HTTPException(status_code=exc.status, detail=exc.errors if exc.status == 422 else exc.errors[0]) from exc
    db.commit()
    complaint = _get_complaint(db, complaint.id)
    return {
        "complaint": serialize_complaint(complaint, audience=_audience(user)),
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
    original = safe_filename(file.filename or "", "attachment.bin")
    dest = dest_dir / f"{uuid.uuid4().hex[:8]}_{original}"
    dest.write_bytes(content)
    evidence = extract_attachment(original, content)
    row = ComplaintAttachment(
        complaint_id=complaint.id,
        filename=original,
        content_type=file.content_type or "application/octet-stream",
        storage_path=str(dest),
        size_bytes=len(content),
        extracted_text=evidence["text"] or None,
        facts=evidence["facts"],
    )
    db.add(row)
    if complaint.validation_results:
        # New evidence can change eligibility, missing information and the GenAI draft.
        complaint.needs_reanalysis = True
    write_audit(
        db,
        actor_id=user.id,
        entity_type="complaint",
        entity_id=complaint.complaint_code,
        action="attachment",
        details={"filename": original, "kind": evidence["facts"].get("kind"), "characters": evidence["facts"].get("characters", 0)},
    )
    db.commit()
    return {"id": row.id, "filename": row.filename, "size_bytes": row.size_bytes, "kind": evidence["facts"].get("kind"), "facts": evidence["facts"]}


INLINE_TYPES = {".pdf": "application/pdf", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".txt": "text/plain; charset=utf-8"}


@router.get("/{complaint_id}/attachments/{attachment_id}")
def get_attachment(complaint_id: int, attachment_id: int, user: CurrentUser, db: Session = Depends(get_db), download: bool = False):
    """Serve an attachment to anyone who may see the complaint (the customer who filed it, or staff)."""
    complaint = _get_visible_complaint(db, user, complaint_id)
    row = next((a for a in complaint.attachments if a.id == attachment_id), None)
    if row is None:
        raise HTTPException(status_code=404, detail="Attachment not found")
    path = Path(row.storage_path)
    root = (get_settings().upload_path / "complaints").resolve()
    if not path.is_file() or root not in path.resolve().parents:
        raise HTTPException(status_code=404, detail="The stored file is missing.")
    ext = path.suffix.lower()
    media = INLINE_TYPES.get(ext, "application/octet-stream")
    disposition = "attachment" if download or ext not in INLINE_TYPES else "inline"
    return FileResponse(
        path,
        media_type=media,
        filename=row.filename,
        content_disposition_type=disposition,
        # Uploaded content is served as a file, never interpreted as a page of this app.
        headers={"X-Content-Type-Options": "nosniff", "Content-Security-Policy": "sandbox", "Cache-Control": "private, no-store"},
    )


@router.get("")
def list_complaints(
    response: Response,
    user: CurrentUser,
    db: Session = Depends(get_db),
    status: str | None = None,
    category: str | None = None,
    department: str | None = None,
    priority: str | None = None,
    urgency: str | None = None,
    sentiment: str | None = None,
    q: str | None = None,
    sla_risk: bool | None = None,
    escalated: bool | None = None,
    review: bool | None = None,
    reanalysis: bool | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    limit: int = 200,
    offset: int = 0,
):
    """Search and filter in SQL on the denormalized classification columns, then paginate.

    The total match count is returned in the ``X-Total-Count`` header.
    """
    query = scope_complaints(db, user, db.query(Complaint))
    if status:
        try:
            query = query.filter(Complaint.status == ComplaintStatus(status))
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=f"Unknown status '{status}'") from exc
    if date_from:
        query = query.filter(Complaint.created_at >= datetime.combine(date_from, time.min, tzinfo=timezone.utc))
    if date_to:
        query = query.filter(Complaint.created_at <= datetime.combine(date_to, time.max, tzinfo=timezone.utc))
    if q:
        like = f"%{q.strip()}%"
        query = query.outerjoin(Customer, Complaint.customer_id == Customer.id).filter(
            or_(
                Complaint.complaint_code.ilike(like),
                Complaint.title.ilike(like),
                Complaint.order_reference.ilike(like),
                Complaint.product_or_service.ilike(like),
                Customer.customer_code.ilike(like),
            )
        )
    if sla_risk is True:
        # Same rule as refresh_sla_risk: the configured share of the window has elapsed.
        query = query.filter(
            Complaint.sla_resolution_due.isnot(None),
            ~Complaint.status.in_([ComplaintStatus.resolved, ComplaintStatus.closed]),
            func.now() >= Complaint.created_at + (Complaint.sla_resolution_due - Complaint.created_at) * (func.coalesce(Complaint.sla_risk_percent, 75) / 100.0),
        )
    if user.role != UserRole.customer:
        if category:
            query = query.filter(Complaint.category == category)
        if department:
            query = query.join(Department, Complaint.assigned_department_id == Department.id).filter(Department.name == department)
        if priority:
            query = query.filter(Complaint.priority == priority)
        if urgency:
            query = query.filter(Complaint.urgency == urgency)
        if sentiment:
            query = query.filter(Complaint.sentiment == sentiment.lower())
        escalated_expr = or_(Complaint.status == ComplaintStatus.escalated, Complaint.escalation_required.is_(True))
        if escalated is True:
            query = query.filter(escalated_expr)
        elif escalated is False:
            query = query.filter(~escalated_expr)
        if review is True:
            query = query.filter(Complaint.pending_review.is_(True))
        if reanalysis is True:
            query = query.filter(Complaint.needs_reanalysis.is_(True))
    response.headers["X-Total-Count"] = str(query.count())
    rows = (
        query.options(*_loaders())
        .order_by(Complaint.id.desc())
        .offset(max(0, offset))
        .limit(max(1, min(limit, 1000)))
        .all()
    )
    audience = _audience(user)
    return [serialize_complaint(row, audience=audience) for row in rows]


@router.get("/queue/manual-review")
def manual_review_queue(user: ReviewerUser, db: Session = Depends(get_db), limit: int = 200):
    rows = (
        db.query(Complaint)
        .options(*_loaders())
        .filter(Complaint.pending_review.is_(True))
        .order_by(Complaint.priority.asc().nulls_last(), Complaint.id.desc())
        .limit(max(1, min(limit, 1000)))
        .all()
    )
    return [serialize_complaint(row) for row in rows]


@router.post("/reanalyze-flagged")
def reanalyze_flagged(user: ReviewerUser, payload: AnalyzeRequest, db: Session = Depends(get_db), limit: int = 25):
    """Re-run both pipelines for open complaints a policy change marked as needing it."""
    rows = (
        db.query(Complaint)
        .filter(Complaint.needs_reanalysis.is_(True))
        .order_by(Complaint.priority.asc().nulls_last(), Complaint.id)
        .limit(max(1, min(limit, 100)))
        .all()
    )
    done, failed = [], []
    for row in rows:
        try:
            analyze_complaint(db, row, tone=payload.tone, skip_genai=payload.skip_genai, actor_id=user.id)
            done.append(row.complaint_code)
        except HTTPException as exc:
            db.rollback()
            failed.append({"complaint_code": row.complaint_code, "error": str(exc.detail)})
    remaining = db.query(func.count(Complaint.id)).filter(Complaint.needs_reanalysis.is_(True)).scalar() or 0
    return {"reanalyzed": done, "failed": failed, "remaining": remaining}


@router.get("/{complaint_id}")
def get_complaint(complaint_id: int, user: CurrentUser, db: Session = Depends(get_db)):
    complaint = _get_visible_complaint(db, user, complaint_id)
    return serialize_complaint(complaint, audience=_audience(user))


@router.get("/{complaint_id}/history")
def complaint_history(complaint_id: int, user: StaffUser, db: Session = Depends(get_db)):
    """Audit trail: every action plus the original recommendation next to each reviewer decision."""
    complaint = _get_visible_complaint(db, user, complaint_id)
    actors = {u.id: u.full_name for u in db.query(User).all()}
    audit = (
        db.query(AuditLog)
        .filter(AuditLog.entity_type == "complaint", AuditLog.entity_id == complaint.complaint_code)
        .order_by(AuditLog.id)
        .all()
    )
    return {
        "audit": [
            {"at": a.created_at, "actor": actors.get(a.actor_id, "system"), "action": a.action, "details": a.details}
            for a in audit
        ],
        "reviews": [
            {
                "at": r.created_at,
                "reviewer": actors.get(r.reviewer_id),
                "action": r.action.value,
                "comments": r.comments,
                "original_recommendation": r.original_recommendation,
                "final_decision": r.final_decision,
            }
            for r in complaint.reviews
        ],
        "genai_runs": [
            {
                "at": r.created_at,
                "provider": r.provider,
                "model": r.model,
                "prompt_version": r.prompt_version,
                "attempt": r.attempt,
                "latency_ms": r.latency_ms,
                "valid": r.is_valid_schema,
                "error": r.error_message,
                "policy_versions": r.policy_versions,
            }
            for r in complaint.genai_runs
        ],
        "followups": [
            {"scheduled_at": f.scheduled_at, "type": f.follow_up_type, "message": f.message, "completed": f.completed}
            for f in sorted(complaint.followups, key=lambda f: f.id)
        ],
    }


@router.post("/{complaint_id}/analyze")
def analyze(complaint_id: int, user: StaffUser, payload: AnalyzeRequest, db: Session = Depends(get_db)):
    complaint = _get_visible_complaint(db, user, complaint_id)
    return analyze_complaint(db, complaint, tone=payload.tone, skip_genai=payload.skip_genai, actor_id=user.id)


@router.patch("/{complaint_id}/status")
def update_status(complaint_id: int, payload: StatusUpdate, user: StaffUser, db: Session = Depends(get_db)):
    complaint = _get_visible_complaint(db, user, complaint_id)
    try:
        new_status = ComplaintStatus(payload.status)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=f"Unknown status '{payload.status}'") from exc
    previous = complaint.status.value
    complaint.status = new_status
    # A typed note is written for the customer (the UI says so); otherwise use standard wording.
    complaint.latest_update = sanitize_input(payload.note) or customer_update(new_status)
    mark_first_response(complaint)
    if new_status in (ComplaintStatus.resolved, ComplaintStatus.closed):
        _settle_followups(db, complaint, confirm_resolution=new_status == ComplaintStatus.resolved)
    write_audit(
        db,
        actor_id=user.id,
        entity_type="complaint",
        entity_id=complaint.complaint_code,
        action="status",
        details={"from": previous, "to": new_status.value, "note": payload.note},
    )
    db.commit()
    return serialize_complaint(_get_complaint(db, complaint_id))


@router.post("/{complaint_id}/assign")
def assign(complaint_id: int, payload: AssignRequest, user: StaffUser, db: Session = Depends(get_db)):
    complaint = _get_visible_complaint(db, user, complaint_id)
    details = {}
    if payload.agent_id:
        agent = db.query(User).filter(User.id == payload.agent_id, User.is_active.is_(True)).first()
        if not agent or agent.role == UserRole.customer:
            raise HTTPException(status_code=422, detail="Assignee must be an active staff user.")
        if user.role == UserRole.agent and agent.id != user.id:
            raise HTTPException(status_code=403, detail="Agents can only assign complaints to themselves.")
        complaint.assigned_to_id = agent.id
        details["agent"] = agent.full_name
    if payload.department_id:
        if not db.query(Department).filter(Department.id == payload.department_id).first():
            raise HTTPException(status_code=422, detail="Unknown department.")
        complaint.assigned_department_id = payload.department_id
        details["department_id"] = payload.department_id
    if not details:
        raise HTTPException(status_code=422, detail="Provide agent_id or department_id.")
    # Taking ownership must not hide an escalation or undo work already in progress.
    if complaint.status in (ComplaintStatus.new, ComplaintStatus.analyzed, ComplaintStatus.reopened):
        complaint.status = ComplaintStatus.assigned
    dept_name = db.query(Department).filter(Department.id == complaint.assigned_department_id).first()
    complaint.latest_update = customer_update(complaint.status, dept_name.name if dept_name else None)
    write_audit(db, actor_id=user.id, entity_type="complaint", entity_id=complaint.complaint_code, action="assign", details=details)
    db.commit()
    return serialize_complaint(_get_complaint(db, complaint_id))


@router.post("/{complaint_id}/review")
def review_complaint(complaint_id: int, payload: ReviewRequest, user: ReviewerUser, db: Session = Depends(get_db)):
    complaint = _get_complaint(db, complaint_id)
    try:
        action = ReviewActionType(payload.action)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail="Unknown review action") from exc
    latest_val = complaint.validation_results[-1] if complaint.validation_results else None
    genai = next((r.structured_output for r in reversed(complaint.genai_runs) if r.structured_output), {})
    # Both pipelines' outputs are preserved as the original recommendation.
    original = {"genai": genai, "python": latest_val.python_output if latest_val else {}}
    decision = dict(payload.final_decision or {})
    department_id = decision.get("department_id")
    if department_id is not None:
        dept = db.query(Department).filter(Department.id == int(department_id)).first()
        if not dept:
            raise HTTPException(status_code=422, detail="Unknown department.")
        decision["department"] = dept.name
    if action in {ReviewActionType.reassign, ReviewActionType.reclassify} and not decision:
        raise HTTPException(status_code=422, detail=f"{action.value} needs a final decision (e.g. department_id or issue_category).")
    if action == ReviewActionType.modify and not decision and not payload.comments:
        raise HTTPException(status_code=422, detail="Describe the modification in comments or final_decision.")

    review = ReviewAction(
        complaint_id=complaint.id,
        reviewer_id=user.id,
        action=action,
        original_recommendation=original,
        final_decision=decision or {"accepted": "python" if action == ReviewActionType.approve else None},
        comments=payload.comments,
    )
    db.add(review)
    # Reviewer comments are internal: they go to the review record and audit log only.
    if action == ReviewActionType.approve:
        complaint.status = ComplaintStatus.in_progress
    elif action == ReviewActionType.reject:
        complaint.status = ComplaintStatus.analyzed
    elif action == ReviewActionType.escalate:
        complaint.status = ComplaintStatus.escalated
    elif action in {ReviewActionType.reassign, ReviewActionType.reclassify, ReviewActionType.modify}:
        if department_id is not None:
            complaint.assigned_department_id = int(department_id)
        complaint.status = ComplaintStatus.assigned if action == ReviewActionType.reassign else ComplaintStatus.in_progress
    if action not in (ReviewActionType.comment, ReviewActionType.regenerate):
        dept = db.query(Department).filter(Department.id == complaint.assigned_department_id).first()
        complaint.latest_update = customer_update(complaint.status, dept.name if dept else None)
    db.flush()
    sync_classification(complaint)
    write_audit(
        db,
        actor_id=user.id,
        entity_type="complaint",
        entity_id=complaint.complaint_code,
        action=f"review_{action.value}",
        details={"original": original, "final": review.final_decision, "comments": payload.comments},
    )
    db.commit()
    if action == ReviewActionType.regenerate:
        return analyze_complaint(db, _get_complaint(db, complaint_id), tone=decision.get("tone", "professional"), actor_id=user.id)["complaint"]
    return serialize_complaint(_get_complaint(db, complaint_id))


@router.post("/{complaint_id}/customer-decision")
def customer_decision(complaint_id: int, payload: CustomerDecision, user: CurrentUser, db: Session = Depends(get_db)):
    """The customer confirms a resolution (closing it) or reopens it because the fix failed."""
    if user.role != UserRole.customer:
        raise HTTPException(status_code=403, detail="Only the customer who raised the complaint can confirm or reopen it.")
    complaint = _get_visible_complaint(db, user, complaint_id)
    if complaint.status != ComplaintStatus.resolved:
        raise HTTPException(status_code=409, detail="Only a resolved complaint can be confirmed or reopened.")
    comment = sanitize_input(payload.comment)
    if payload.action == "confirm":
        complaint.status = ComplaintStatus.closed
        complaint.latest_update = "Thank you for confirming. Your complaint is closed."
        _settle_followups(db, complaint, confirm_resolution=False)
        if payload.rating:
            db.add(ComplaintFeedback(complaint_id=complaint.id, rating=payload.rating, comment=comment))
    elif payload.action == "reopen":
        if len(comment) < 10:
            raise HTTPException(status_code=422, detail="Please tell us briefly what is still wrong (at least 10 characters).")
        complaint.status = ComplaintStatus.reopened
        complaint.is_repeat = True
        complaint.latest_update = customer_update(ComplaintStatus.reopened)
        _settle_followups(db, complaint, confirm_resolution=False)
        # Keep the customer's reason in front of the owning agent as an open action item.
        complaint.follow_up_at = datetime.now(timezone.utc)
        db.add(FollowUp(complaint_id=complaint.id, scheduled_at=complaint.follow_up_at, message=comment, follow_up_type="customer_reopened"))
    else:
        raise HTTPException(status_code=422, detail="action must be 'confirm' or 'reopen'")
    write_audit(
        db,
        actor_id=user.id,
        entity_type="complaint",
        entity_id=complaint.complaint_code,
        action=f"customer_{payload.action}",
        details={"comment": comment, "rating": payload.rating},
    )
    db.commit()
    return serialize_complaint(_get_complaint(db, complaint_id), audience="customer")


@router.get("/{complaint_id}/messages")
def list_messages(complaint_id: int, user: CurrentUser, db: Session = Depends(get_db)):
    """The conversation. Customers never see internal notes."""
    complaint = _get_visible_complaint(db, user, complaint_id)
    customer = user.role == UserRole.customer
    rows = [m for m in complaint.messages if not (customer and m.direction == "internal")]
    if customer:
        for m in rows:
            if m.direction == "to_customer" and not m.read_by_customer:
                m.read_by_customer = True
        db.commit()
    return [_message_out(m, customer) for m in rows]


@router.post("/{complaint_id}/messages/check")
def check_message(complaint_id: int, payload: MessageCreate, user: StaffUser, db: Session = Depends(get_db)):
    """Validate a draft before sending: unsupported promises and invented facts."""
    complaint = _get_visible_complaint(db, user, complaint_id)
    return {"flags": [] if payload.internal else reply_flags(complaint, payload.body)}


@router.post("/{complaint_id}/messages")
def post_message(complaint_id: int, payload: MessageCreate, user: CurrentUser, db: Session = Depends(get_db)):
    complaint = _get_visible_complaint(db, user, complaint_id)
    body = sanitize_input(payload.body)
    if not body:
        raise HTTPException(status_code=422, detail="Message is empty.")
    flags: list[dict] = []
    if user.role == UserRole.customer:
        if complaint.status == ComplaintStatus.closed:
            raise HTTPException(status_code=409, detail="This complaint is closed. Please submit a new complaint.")
        direction, source = "from_customer", "customer"
        if complaint.status == ComplaintStatus.awaiting_customer:
            complaint.status = ComplaintStatus.in_progress
            complaint.latest_update = customer_update(ComplaintStatus.in_progress)
    elif payload.internal:
        direction, source = "internal", "agent"
    else:
        direction = "to_customer"
        source = "genai_draft" if payload.source == "genai_draft" else "agent"
        flags = reply_flags(complaint, body)
        if flags and not payload.override:
            raise HTTPException(
                status_code=422,
                detail=["This message needs changes before it can be sent: "]
                + [f"{f['code'].replace('_', ' ')} — {f.get('detail') or f.get('value') or ''}".strip(" —") for f in flags],
            )
        if flags and user.role not in (UserRole.reviewer, UserRole.manager, UserRole.administrator):
            raise HTTPException(status_code=403, detail="Only a reviewer can send a message with validation flags.")
        if payload.request_information:
            complaint.status = ComplaintStatus.awaiting_customer
        complaint.latest_update = (
            customer_update(ComplaintStatus.awaiting_customer) if payload.request_information else "You have a new message from our support team."
        )
    if direction == "to_customer":
        mark_first_response(complaint)
    message = ComplaintMessage(complaint_id=complaint.id, author_id=user.id, direction=direction, body=body, source=source, flags=flags)
    db.add(message)
    write_audit(
        db,
        actor_id=user.id,
        entity_type="complaint",
        entity_id=complaint.complaint_code,
        action=f"message_{direction}",
        details={"source": source, "flags": [f["code"] for f in flags], "override": bool(flags)},
    )
    db.commit()
    db.refresh(message)
    return _message_out(message, user.role == UserRole.customer)


def _message_out(m: ComplaintMessage, for_customer: bool) -> dict:
    author = m.author.full_name if m.author else "System"
    if for_customer and m.direction == "to_customer":
        author = "NimbusCarta Support"
    return {
        "id": m.id,
        "direction": m.direction,
        "body": m.body,
        "author": author,
        "source": None if for_customer else m.source,
        "flags": [] if for_customer else m.flags,
        "created_at": m.created_at,
        "read_by_customer": m.read_by_customer,
    }


def _settle_followups(db: Session, complaint: Complaint, *, confirm_resolution: bool) -> None:
    """Pending follow-ups are done once a case is resolved; a resolution check-in replaces them."""
    for followup in db.query(FollowUp).filter(FollowUp.complaint_id == complaint.id, FollowUp.completed.is_(False)).all():
        followup.completed = True
    if confirm_resolution:
        complaint.follow_up_at = datetime.now(timezone.utc) + timedelta(days=2)
        db.add(
            FollowUp(
                complaint_id=complaint.id,
                scheduled_at=complaint.follow_up_at,
                message="Check the resolution worked for the customer, then close the complaint.",
                follow_up_type="resolution_confirmation",
            )
        )
    else:
        complaint.follow_up_at = None


def _get_visible_complaint(db: Session, user: User, complaint_id: int) -> Complaint:
    complaint = _get_complaint(db, complaint_id)
    error = visibility_error(db, user, complaint)
    if error:
        raise HTTPException(status_code=403, detail=error)
    return complaint

