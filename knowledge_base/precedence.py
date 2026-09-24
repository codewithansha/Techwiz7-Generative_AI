from datetime import date

from database.models import DocumentCategory, DocumentStatus, KnowledgeDocument

PRECEDENCE = {
    DocumentCategory.policy: 10,
    DocumentCategory.compliance: 15,
    DocumentCategory.sla: 20,
    DocumentCategory.sop: 30,
    DocumentCategory.escalation: 35,
    DocumentCategory.routing: 40,
    DocumentCategory.guideline: 50,
    DocumentCategory.template: 60,
    DocumentCategory.faq: 80,
}


def is_usable_policy(document: KnowledgeDocument, as_of: date | None = None) -> bool:
    as_of = as_of or date.today()
    if document.status != DocumentStatus.active:
        return False
    if document.effective_date and document.effective_date > as_of:
        return False
    if document.expiry_date and document.expiry_date < as_of:
        return False
    return True


def sort_key(document: KnowledgeDocument) -> tuple:
    return (
        PRECEDENCE.get(document.category, 90),
        -(document.effective_date.toordinal() if document.effective_date else 0),
        document.version,
    )
