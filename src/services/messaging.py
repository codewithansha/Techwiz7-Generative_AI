"""Checks applied to anything staff send to a customer."""

from sqlalchemy.orm import object_session

from database.models import Complaint, DocumentStatus, KnowledgeDocument
from hallucination_checks.detector import detect_hallucinations, detect_unsupported_promises

# Only these hallucination findings are meaningful for a free-text message.
MESSAGE_FACT_FLAGS = {"invented_identifier", "ungrounded_amount"}
# Timelines customers may be given come from the cited policy or the service-level rules.
ALWAYS_GROUNDING = ("SLA-POL-01",)


def reply_flags(complaint: Complaint, body: str) -> list[dict]:
    """Unsupported promises and invented facts in a customer-facing message (SRS steps 31, 34, 35)."""
    latest = complaint.validation_results[-1].python_output if complaint.validation_results else {}
    flags = detect_unsupported_promises(body, latest or {}, _grounding(complaint, latest or {}))
    facts = detect_hallucinations(
        {"customer_response": body, "complaint_id": complaint.complaint_code},
        f"{complaint.title}\n{complaint.description}\n{complaint.order_reference}",
        [],
        latest or {},
    )
    flags.extend(f for f in facts if f["code"] in MESSAGE_FACT_FLAGS)
    return flags


def _grounding(complaint: Complaint, python: dict) -> str:
    session = object_session(complaint)
    if session is None:
        return ""
    codes = [c for c in (python.get("policy_id"), *ALWAYS_GROUNDING) if c]
    docs = (
        session.query(KnowledgeDocument.content_text)
        .filter(KnowledgeDocument.document_code.in_(codes), KnowledgeDocument.status == DocumentStatus.active)
        .all()
    )
    return " ".join(text for (text,) in docs)
