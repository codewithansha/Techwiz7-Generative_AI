"""In-app notifications, derived from the audit trail plus live SLA / review state."""

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from database.models import AuditLog, Complaint, ComplaintStatus, NotificationState, UserRole
from database.session import get_db
from security.auth import CurrentUser
from src.services.access import scope_complaints

router = APIRouter(prefix="/api/v1/notifications", tags=["notifications"])

CUSTOMER_EVENTS = {
    "analyze": "Your complaint has been reviewed and routed.",
    "assign": "A support specialist is handling your complaint.",
    "status": "The status of your complaint changed.",
    "review_approve": "Our team has confirmed the next steps.",
    "review_escalate": "Your complaint was escalated for priority handling.",
    "message_to_customer": "You have a new message from support.",
}
STAFF_EVENTS = {
    "customer_reopen": "The customer reopened the complaint.",
    "customer_confirm": "The customer confirmed the resolution.",
    "message_from_customer": "The customer sent a message.",
    "assign": "A complaint was assigned.",
    "review_approve": "A reviewer approved the recommendation.",
    "review_reject": "A reviewer rejected the recommendation.",
    "review_escalate": "A reviewer escalated the complaint.",
    "review_reassign": "A reviewer reassigned the complaint.",
    "review_reclassify": "A reviewer reclassified the complaint.",
    "policy_changed": "A policy this complaint relies on changed; re-analysis is recommended.",
    "attachment": "New evidence was attached.",
}
WINDOW = timedelta(days=30)


def _last_seen(db: Session, user_id: int) -> datetime:
    state = db.get(NotificationState, user_id)
    return state.last_seen_at if state else datetime.fromtimestamp(0, timezone.utc)


@router.get("")
def list_notifications(user: CurrentUser, db: Session = Depends(get_db), limit: int = 30):
    since = datetime.now(timezone.utc) - WINDOW
    visible = scope_complaints(db, user, db.query(Complaint.id, Complaint.complaint_code, Complaint.title, Complaint.assigned_to_id))
    if user.role == UserRole.agent:
        # Agents are notified about their own cases, not every unassigned one.
        visible = visible.filter(Complaint.assigned_to_id == user.id)
    complaints = {row.complaint_code: row for row in visible.all()}
    events = CUSTOMER_EVENTS if user.role == UserRole.customer else STAFF_EVENTS
    rows = []
    if complaints:
        rows = (
            db.query(AuditLog)
            .filter(
                AuditLog.entity_type == "complaint",
                AuditLog.entity_id.in_(list(complaints)),
                AuditLog.action.in_(list(events)),
                AuditLog.created_at >= since,
                (AuditLog.actor_id.is_(None)) | (AuditLog.actor_id != user.id),
            )
            .order_by(AuditLog.id.desc())
            .limit(limit)
            .all()
        )
    last_seen = _last_seen(db, user.id)
    items = []
    for row in rows:
        complaint = complaints[row.entity_id]
        details = row.details or {}
        text = events[row.action]
        if row.action == "status" and user.role == UserRole.customer and details.get("to"):
            text = f"Status changed to {str(details['to']).replace('_', ' ')}."
        if row.action == "customer_reopen" and details.get("comment"):
            text = f"Reopened by the customer: “{details['comment'][:120]}”"
        items.append(
            {
                "id": f"audit-{row.id}",
                "complaint_id": complaint.id,
                "complaint_code": complaint.complaint_code,
                "title": complaint.title,
                "text": text,
                "kind": row.action,
                "at": row.created_at,
                "unread": row.created_at > last_seen,
            }
        )
    items.extend(_live_items(db, user))
    items.sort(key=lambda i: (not i["unread"], -(i["at"].timestamp() if i["at"] else 0)))
    return {"unread": sum(1 for i in items if i["unread"]), "items": items[:limit]}


@router.post("/seen")
def mark_seen(user: CurrentUser, db: Session = Depends(get_db)):
    state = db.get(NotificationState, user.id)
    now = datetime.now(timezone.utc)
    if state:
        state.last_seen_at = now
    else:
        db.add(NotificationState(user_id=user.id, last_seen_at=now))
    db.commit()
    return {"ok": True}


def _live_items(db: Session, user) -> list[dict]:
    """Current state that needs attention; always shown as unread until resolved."""
    if user.role == UserRole.customer:
        rows = scope_complaints(db, user, db.query(Complaint)).filter(Complaint.status == ComplaintStatus.resolved).limit(5).all()
        return [
            {"id": f"confirm-{c.id}", "complaint_id": c.id, "complaint_code": c.complaint_code, "title": c.title,
             "text": "Please confirm the resolution worked, or reopen it.", "kind": "confirm_resolution", "at": c.updated_at, "unread": True}
            for c in rows
        ]
    items = []
    now = datetime.now(timezone.utc)
    mine = db.query(Complaint).filter(Complaint.assigned_to_id == user.id, ~Complaint.status.in_([ComplaintStatus.resolved, ComplaintStatus.closed]))
    for c in mine.filter(Complaint.sla_resolution_due.isnot(None)).limit(50).all():
        from complaint_processing.sla import refresh_sla_risk

        if refresh_sla_risk(c):
            overdue = c.sla_resolution_due and c.sla_resolution_due < now
            items.append({"id": f"sla-{c.id}", "complaint_id": c.id, "complaint_code": c.complaint_code, "title": c.title,
                          "text": "SLA breached." if overdue else "SLA at risk: over the risk threshold of the resolution window.",
                          "kind": "sla_risk", "at": c.sla_resolution_due, "unread": True})
    if user.role in (UserRole.reviewer, UserRole.manager, UserRole.administrator):
        pending = db.query(Complaint).filter(Complaint.pending_review.is_(True)).count()
        if pending:
            items.append({"id": "review-queue", "complaint_id": None, "complaint_code": None, "title": "Review queue",
                          "text": f"{pending} complaint(s) waiting for a reviewer decision.", "kind": "review_queue", "at": now, "unread": True})
    return items
