from __future__ import annotations

import re

from sqlalchemy.orm import Session

from database.models import ComplaintCategory, ComplaintSubcategory, ResolutionRule

TOKEN = re.compile(r"[a-zA-Z]{3,}")


def classify_from_rules(db: Session, text: str) -> dict:
    lowered = text.lower()
    tokens = set(TOKEN.findall(lowered))
    rules = db.query(ResolutionRule).filter(ResolutionRule.is_active.is_(True)).all()
    best: ResolutionRule | None = None
    best_score = 0
    for rule in rules:
        keywords = [str(k).lower() for k in (rule.conditions or {}).get("keywords", [])]
        score = sum(1 for kw in keywords if kw and kw in lowered)
        score += len(tokens.intersection({kw.replace(" ", "") for kw in keywords}))
        if score > best_score:
            best_score = score
            best = rule
    if not best:
        categories = db.query(ComplaintCategory).filter(ComplaintCategory.is_active.is_(True)).all()
        fallback = categories[0] if categories else None
        return {
            "issue_category": fallback.name if fallback else "General",
            "subcategory": "Unspecified",
            "department": fallback.default_department.name if fallback and fallback.default_department else "Customer Relations",
            "rule_code": None,
            "matched": False,
        }
    return {
        "issue_category": _category_name(db, best.category_code),
        "subcategory": _subcategory_name(db, best.subcategory_code),
        "department": best.department_code,
        "supporting_departments": best.supporting_department_codes or [],
        "urgency": best.urgency.value,
        "priority": best.priority.value,
        "policy_id": best.policy_code,
        "policy_section": best.policy_section,
        "escalation_required": best.escalation_required,
        "escalation_level": best.escalation_level.value,
        "required_actions": best.required_actions or [],
        "prohibited_actions": best.prohibited_actions or [],
        "follow_up_required": best.follow_up_required,
        "refund_eligible": best.refund_eligible,
        "replacement_eligible": best.replacement_eligible,
        "compensation_permitted": best.compensation_permitted,
        "rule_code": best.rule_code,
        "matched": best_score > 0,
        "match_score": best_score,
    }


def _category_name(db: Session, code: str) -> str:
    row = db.query(ComplaintCategory).filter(ComplaintCategory.code == code).first()
    return row.name if row else code


def _subcategory_name(db: Session, code: str) -> str:
    row = db.query(ComplaintSubcategory).filter(ComplaintSubcategory.code == code).first()
    return row.name if row else code
