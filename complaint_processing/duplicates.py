from sqlalchemy import or_
from sqlalchemy.orm import Session
from rapidfuzz import fuzz

from complaint_processing.preprocess import content_hash, normalize_text
from database.models import Complaint, ComplaintStatus


NEAR_DUPLICATE_THRESHOLD = 88


def find_duplicates(db: Session, *, text: str, customer_id: int | None) -> dict:
    digest = content_hash(text)
    exact = (
        db.query(Complaint)
        .filter(Complaint.content_hash == digest)
        .order_by(Complaint.id.desc())
        .first()
    )
    if exact:
        return {"exact": True, "near_duplicate": False, "match_id": exact.id, "match_code": exact.complaint_code}

    candidates_query = db.query(Complaint)
    if customer_id:
        candidates_query = candidates_query.filter(Complaint.customer_id == customer_id)
    candidates = candidates_query.order_by(Complaint.id.desc()).limit(50).all()
    normalized = normalize_text(text).lower()
    best = None
    best_score = 0
    for candidate in candidates:
        score = fuzz.token_set_ratio(normalized, candidate.normalized_text.lower())
        if score > best_score:
            best_score = score
            best = candidate
    if best and best_score >= NEAR_DUPLICATE_THRESHOLD:
        return {
            "exact": False,
            "near_duplicate": True,
            "score": best_score,
            "match_id": best.id,
            "match_code": best.complaint_code,
        }
    return {"exact": False, "near_duplicate": False, "match_id": None}


def detect_repeat_unresolved(db: Session, *, customer_id: int | None, category_hint: str = "") -> dict:
    if not customer_id:
        return {"is_repeat": False, "open_count": 0}
    open_statuses = [
        ComplaintStatus.new,
        ComplaintStatus.analyzed,
        ComplaintStatus.assigned,
        ComplaintStatus.in_progress,
        ComplaintStatus.awaiting_customer,
        ComplaintStatus.escalated,
        ComplaintStatus.reopened,
    ]
    query = db.query(Complaint).filter(
        Complaint.customer_id == customer_id,
        Complaint.status.in_(open_statuses),
    )
    open_count = query.count()
    return {"is_repeat": open_count >= 1, "open_count": open_count, "category_hint": category_hint}
