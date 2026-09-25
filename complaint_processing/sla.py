from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from database.models import Complaint, ComplaintStatus, CustomerType, PriorityCode, SlaPolicy

DEFAULT_RESPONSE_MINUTES = {"P0": 30, "P1": 120, "P2": 480, "P3": 1440}
DEFAULT_RESOLUTION_HOURS = {"P0": 4, "P1": 24, "P2": 72, "P3": 168}


def _aware(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def apply_sla(db: Session, complaint: Complaint, priority: str) -> None:
    """Set SLA targets for the complaint's priority and customer type.

    Targets run from the moment the complaint was submitted, so re-running analysis does
    not silently extend the deadline; a priority change moves it to the new target.
    """
    policy = (
        db.query(SlaPolicy)
        .filter(SlaPolicy.is_active.is_(True), SlaPolicy.priority == PriorityCode(priority))
        .order_by(SlaPolicy.customer_type.is_(None))
        .first()
    )
    if complaint.customer_type != CustomerType.standard:
        typed = (
            db.query(SlaPolicy)
            .filter(
                SlaPolicy.is_active.is_(True),
                SlaPolicy.priority == PriorityCode(priority),
                SlaPolicy.customer_type == complaint.customer_type,
            )
            .first()
        )
        policy = typed or policy
    if policy:
        response_minutes, resolution_hours, risk_pct = policy.first_response_minutes, policy.resolution_hours, policy.risk_threshold_percent
    else:
        response_minutes = DEFAULT_RESPONSE_MINUTES.get(priority, 480)
        resolution_hours = DEFAULT_RESOLUTION_HOURS.get(priority, 72)
        risk_pct = 75
    start = _aware(complaint.created_at) or datetime.now(timezone.utc)
    complaint.sla_first_response_due = start + timedelta(minutes=response_minutes)
    complaint.sla_resolution_due = start + timedelta(hours=resolution_hours)
    complaint.sla_risk_percent = risk_pct or 75
    refresh_sla_risk(complaint)


def refresh_sla_risk(complaint: Complaint, now: datetime | None = None) -> bool:
    """At risk once the configured share of the resolution window has been used."""
    now = now or datetime.now(timezone.utc)
    due = _aware(complaint.sla_resolution_due)
    start = _aware(complaint.created_at) or now
    # A finished complaint cannot breach its SLA any more.
    if not due or complaint.status in (ComplaintStatus.resolved, ComplaintStatus.closed):
        complaint.sla_risk = False
        return False
    total = (due - start).total_seconds()
    used = (now - start).total_seconds()
    threshold = (complaint.sla_risk_percent or 75) / 100
    complaint.sla_risk = total > 0 and (used / total) >= threshold
    return complaint.sla_risk


def mark_first_response(complaint: Complaint) -> None:
    """The first customer-visible staff action stops the first-response clock."""
    if complaint.first_responded_at is None:
        complaint.first_responded_at = datetime.now(timezone.utc)


def first_response_status(complaint: Complaint, now: datetime | None = None) -> str:
    """met | breached | pending | overdue (no response yet and past due) | n/a."""
    due = _aware(complaint.sla_first_response_due)
    if not due:
        return "n/a"
    responded = _aware(complaint.first_responded_at)
    if responded:
        return "met" if responded <= due else "breached"
    return "overdue" if (now or datetime.now(timezone.utc)) > due else "pending"
