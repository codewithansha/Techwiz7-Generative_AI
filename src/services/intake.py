"""Complaint intake shared by the submit form and the bulk evaluation import."""

import uuid
from datetime import date

from sqlalchemy.orm import Session

from complaint_processing.duplicates import find_duplicates
from complaint_processing.preprocess import content_hash, sanitize_input, validate_complaint_payload
from database.models import Channel, Complaint, Customer, CustomerType
from security.audit import write_audit
from src.services.analysis import complaint_code_for


def _incident_date(value):
    """Accept a date, an ISO string, or nothing; reject dates in the future."""
    if not value:
        return None
    if isinstance(value, str):
        try:
            value = date.fromisoformat(value.strip()[:10])
        except ValueError as exc:
            raise IntakeError([f"Invalid incident date '{value}'. Use YYYY-MM-DD."]) from exc
    if value > date.today():
        raise IntakeError(["Incident date cannot be in the future."])
    return value


class IntakeError(Exception):
    def __init__(self, errors: list[str], status: int = 422) -> None:
        super().__init__("; ".join(errors))
        self.errors = errors
        self.status = status


def create_complaint(
    db: Session,
    fields: dict,
    *,
    customer: Customer | None,
    submitted_by_id: int | None,
    block_exact_duplicates: bool = True,
    strict_references: bool = True,
) -> tuple[Complaint, dict]:
    """Validate, sanitize, duplicate-check and store one complaint (status ``new``).

    Returns the complaint and the duplicate check result. Raises ``IntakeError`` with
    human-readable reasons; nothing is written in that case.

    ``strict_references=False`` (bulk imports) keeps a previous-complaint reference that is
    not in this system instead of rejecting the row; validation then flags it.
    """
    errors = validate_complaint_payload(fields)
    if errors:
        raise IntakeError(errors)
    title = sanitize_input(fields.get("title") or "")
    description = sanitize_input(fields.get("description") or "")
    previous = (fields.get("previous_complaint_reference") or "").strip().upper()
    if previous:
        cited = db.query(Complaint).filter(Complaint.complaint_code == previous).first()
        if (not cited and strict_references) or (cited and customer and cited.customer_id not in (None, customer.id)):
            raise IntakeError([f"Previous complaint {previous} was not found for this customer."])
    duplicate = find_duplicates(db, text=f"{title}\n{description}", customer_id=customer.id if customer else None)
    if duplicate.get("exact") and block_exact_duplicates:
        raise IntakeError([f"Exact duplicate of {duplicate['match_code']}"], status=409)

    # A customer cannot promote themselves to VIP; the type comes from the profile.
    requested_type = fields.get("customer_type") or "standard"
    try:
        customer_type = customer.customer_type if customer else CustomerType(requested_type)
    except ValueError as exc:
        raise IntakeError([f"Unknown customer type '{requested_type}'."]) from exc
    try:
        channel = Channel(fields.get("channel") or "web")
    except ValueError as exc:
        raise IntakeError([f"Unknown channel '{fields.get('channel')}'."]) from exc

    complaint = Complaint(
        # Placeholder until the insert assigns an id; replaced before commit.
        complaint_code=f"TMP-{uuid.uuid4().hex[:24]}",
        customer_id=customer.id if customer else None,
        submitted_by_id=submitted_by_id,
        title=title,
        description=description,
        normalized_text=f"{title} {description}".lower(),
        content_hash=content_hash(f"{title}\n{description}"),
        product_or_service=sanitize_input(fields.get("product_or_service") or ""),
        order_reference=(fields.get("order_reference") or "").strip().upper(),
        previous_complaint_reference=previous,
        customer_type=customer_type,
        channel=channel,
        preferred_contact_channel=sanitize_input(fields.get("preferred_contact_channel") or "") or "email",
        requested_resolution=sanitize_input(fields.get("requested_resolution") or ""),
        incident_date=_incident_date(fields.get("incident_date")),
        duplicate_of_id=duplicate.get("match_id"),
    )
    db.add(complaint)
    db.flush()
    complaint.complaint_code = complaint_code_for(complaint.id)
    write_audit(db, actor_id=submitted_by_id, entity_type="complaint", entity_id=complaint.complaint_code, action="submit")
    return complaint, duplicate
