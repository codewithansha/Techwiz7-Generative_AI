import re
from datetime import date

from sqlalchemy.orm import Session

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


def policy_status(db: Session, document_code: str | None) -> dict:
    """Applicability of a cited policy code (SRS step 26) based on its versions in the KB."""
    code = (document_code or "").strip()
    if not code:
        return {"known": False, "applicability": "not_applicable", "active_version": None, "versions": []}
    docs = db.query(KnowledgeDocument).filter(KnowledgeDocument.document_code == code).all()
    versions = [{"version": d.version, "status": d.status.value} for d in docs]
    if not docs:
        return {"known": False, "applicability": "not_applicable", "active_version": None, "versions": []}
    usable = sorted((d for d in docs if is_usable_policy(d)), key=sort_key)
    if usable:
        return {"known": True, "applicability": "applicable", "active_version": usable[0].version, "versions": versions}
    return {"known": True, "applicability": "outdated", "active_version": None, "versions": versions}


def sort_key(document: KnowledgeDocument) -> tuple:
    return (
        PRECEDENCE.get(document.category, 90),
        -(document.effective_date.toordinal() if document.effective_date else 0),
        document.version,
    )


# ---- precedence between documents that answer the same question (SRS 1.8 #10) ----
_NEGATED = re.compile(r"\b(?:not|never|no|cannot|isn't|aren't|won't)\b", re.I)
_FACT = re.compile(
    r"\b(\d+(?:\s*[-–]\s*\d+)?)\s*(?:business\s+|working\s+|calendar\s+)?(day|hour|week|percent|%)s?\b|\b(instant(?:ly)?|immediate(?:ly)?|same[- ]day|automatic(?:ally)?)\b",
    re.I,
)
_INSTANT = {"instant": "0", "instantly": "0", "immediate": "0", "immediately": "0", "same-day": "0", "same day": "0"}


def _facts(text: str) -> dict[str, set[str]]:
    """Timelines and rates stated in affirmative sentences: {'day': {'7-10'}, 'percent': {'10'}}."""
    facts: dict[str, set[str]] = {}
    for sentence in re.split(r"(?<=[.!?])\s+", text or ""):
        if _NEGATED.search(sentence):
            continue
        for number, unit, word in _FACT.findall(sentence):
            if word:
                word = word.lower()
                if word.startswith("automatic"):
                    facts.setdefault("automatic", set()).add("yes")
                else:
                    facts.setdefault("day", set()).add(_INSTANT.get(word, "0"))
                continue
            unit = "percent" if unit in {"%", "percent"} else unit.lower()
            facts.setdefault(unit, set()).add(re.sub(r"\s+", "", number).replace("–", "-"))
    return facts


def _topic(code: str) -> set[str]:
    parts = (code or "").upper().split("-")
    return {p for p in parts if p.isalpha() and p not in {"POL", "SOP", "FAQ", "GD", "TPL"}}


def resolve_precedence(chunks: list[dict], preferred_code: str | None = None) -> dict:
    """Which retrieved document governs, and where a lower-precedence one says something different.

    The governing document is the rule's cited policy when it was retrieved and is usable,
    otherwise the usable document with the best precedence rank. A related lower-ranked
    document (FAQ, guideline, template, older SOP) that states a different timeline, rate or
    automatic entitlement is reported as a conflict; the governing document always wins.
    """
    usable = [c for c in chunks if c.get("usable")]
    if not usable:
        return {"governing": None, "overridden": [], "conflicts": []}
    rank = {cat.value: value for cat, value in PRECEDENCE.items()}
    by_code: dict[str, list[dict]] = {}
    for chunk in usable:
        by_code.setdefault(chunk["document_code"], []).append(chunk)
    if preferred_code in by_code:
        governing_code = preferred_code
    else:
        governing_code = min(by_code, key=lambda code: (rank.get(by_code[code][0].get("category"), 90), code))
    head = by_code[governing_code][0]
    governing_rank = rank.get(head.get("category"), 90)
    governing_facts = _facts(" ".join(c["content"] for c in by_code[governing_code]))
    overridden, conflicts = [], []
    for code, items in by_code.items():
        category = items[0].get("category")
        if code == governing_code or rank.get(category, 90) <= governing_rank:
            continue
        text = " ".join(c["content"] for c in items)
        related = governing_code in text or bool(_topic(code) & _topic(governing_code))
        if not related:
            continue
        overridden.append({"document_code": code, "category": category, "version": items[0].get("version")})
        for unit, values in _facts(text).items():
            known = governing_facts.get(unit)
            if unit == "automatic" and "automatic" not in governing_facts:
                known = set()
            if known is None:
                continue
            differing = sorted(values - known)
            if differing:
                conflicts.append({
                    "document_code": code,
                    "category": category,
                    "unit": unit,
                    "lower_says": differing,
                    "governing_says": sorted(known),
                    "chunk_code": next((c["chunk_code"] for c in items if _facts(c["content"]).get(unit)), items[0]["chunk_code"]),
                })
    return {
        "governing": {"document_code": governing_code, "version": head.get("version"), "category": head.get("category"), "section": head.get("section")},
        "overridden": overridden,
        "conflicts": conflicts,
    }


def relies_on_conflict(text: str, conflict: dict) -> bool:
    """True when the complaint or a draft reply repeats the lower-precedence statement."""
    stated = _facts(text).get(conflict["unit"], set())
    return bool(stated & set(conflict["lower_says"]))
