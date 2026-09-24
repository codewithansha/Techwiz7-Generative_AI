from sqlalchemy.orm import Session

from database.models import Complaint, ComplaintStatus, KnowledgeDocument


def flag_complaints_on_policy_change(db: Session, document: KnowledgeDocument) -> int:
    """Hidden policy-update challenge: mark open complaints that cited the previous version."""
    affected = 0
    open_statuses = [
        ComplaintStatus.new,
        ComplaintStatus.analyzed,
        ComplaintStatus.assigned,
        ComplaintStatus.in_progress,
        ComplaintStatus.awaiting_customer,
        ComplaintStatus.escalated,
        ComplaintStatus.reopened,
    ]
    complaints = db.query(Complaint).filter(Complaint.status.in_(open_statuses)).all()
    for complaint in complaints:
        latest = complaint.comparisons[-1] if complaint.comparisons else None
        genai = complaint.genai_runs[-1] if complaint.genai_runs else None
        cited = ""
        if genai and genai.structured_output:
            cited = str(genai.structured_output.get("policy_id") or "")
        if cited == document.document_code:
            complaint.latest_update = (
                f"Policy {document.document_code} v{document.version} changed; re-analysis recommended."
            )
            affected += 1
        elif latest:
            pass
    return affected
