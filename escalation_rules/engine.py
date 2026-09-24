from __future__ import annotations

from sqlalchemy.orm import Session

from database.models import EscalationLevel, EscalationRule, UrgencyLevel


def evaluate_escalation(
    db: Session,
    *,
    text: str,
    category: str = "",
    customer_type: str = "standard",
    is_repeat: bool = False,
    open_count: int = 0,
) -> dict:
    lowered = text.lower()
    matched: list[dict] = []
    highest = EscalationLevel.no_escalation
    force_urgency: UrgencyLevel | None = None
    reasons: list[str] = []
    rank = {
        EscalationLevel.no_escalation: 0,
        EscalationLevel.supervisor_review: 1,
        EscalationLevel.department_manager: 2,
        EscalationLevel.specialist_team: 3,
        EscalationLevel.compliance_review: 4,
        EscalationLevel.critical_management: 5,
    }
    rules = db.query(EscalationRule).filter(EscalationRule.is_active.is_(True)).all()
    for rule in rules:
        keyword_hit = any(str(k).lower() in lowered for k in (rule.keywords or []) if k)
        category_hit = not rule.categories or category in rule.categories or category.lower() in [
            str(c).lower() for c in rule.categories
        ]
        repeat_hit = open_count >= rule.min_repeat_count if rule.min_repeat_count else True
        type_hit = not rule.customer_types or customer_type in rule.customer_types
        if keyword_hit and category_hit and repeat_hit and type_hit:
            if rule.min_repeat_count and not is_repeat and open_count < rule.min_repeat_count:
                continue
            if rule.min_repeat_count and open_count < rule.min_repeat_count:
                continue
            matched.append({"rule_code": rule.rule_code, "name": rule.name})
            reasons.append(rule.reason)
            if rank[rule.escalation_level] > rank[highest]:
                highest = rule.escalation_level
            if rule.force_urgency:
                if force_urgency is None or _urgency_rank(rule.force_urgency) > _urgency_rank(force_urgency):
                    force_urgency = rule.force_urgency
    return {
        "escalation_required": highest != EscalationLevel.no_escalation,
        "escalation_level": highest.value,
        "reasons": reasons,
        "matched_rules": matched,
        "force_urgency": force_urgency.value if force_urgency else None,
    }


def _urgency_rank(level: UrgencyLevel) -> int:
    return {UrgencyLevel.low: 1, UrgencyLevel.medium: 2, UrgencyLevel.high: 3, UrgencyLevel.critical: 4}[level]
