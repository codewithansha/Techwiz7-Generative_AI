from sqlalchemy.orm import Session

from complaint_processing.duplicates import OPEN_STATUSES
from database.models import Complaint, KnowledgeDocument
from security.audit import write_audit


def flag_complaints_on_policy_change(db: Session, document: KnowledgeDocument) -> list[str]:
    """Hidden policy-update challenge: find open complaints whose resolution relied on this policy.

    A complaint is affected when either pipeline cited the document code, or when the GenAI
    run was grounded on an older version of it. Those complaints are told to re-analyze so
    responses based on the obsolete version get revised.
    """
    affected: list[str] = []
    for complaint in db.query(Complaint).filter(Complaint.status.in_(OPEN_STATUSES)).all():
        genai = next((r for r in reversed(complaint.genai_runs) if r.structured_output), None)
        latest_val = complaint.validation_results[-1] if complaint.validation_results else None
        cited = {
            str((genai.structured_output if genai else {}).get("policy_id") or ""),
            str((latest_val.python_output if latest_val else {}).get("policy_id") or ""),
        }
        grounded_versions = {
            p.get("version") for p in (genai.policy_versions if genai else []) if p.get("document_code") == document.document_code
        }
        stale_grounding = bool(grounded_versions) and document.version not in grounded_versions
        if document.document_code in cited or stale_grounding:
            # Staff-facing notice (History tab); the customer's latest update is left alone.
            write_audit(
                db,
                actor_id=None,
                entity_type="complaint",
                entity_id=complaint.complaint_code,
                action="policy_changed",
                details={"policy": document.document_code, "version": document.version, "note": "Re-analysis recommended"},
            )
            complaint.needs_reanalysis = True
            affected.append(complaint.complaint_code)
    return affected


def policy_change_impact(db: Session, document: KnowledgeDocument, previous: list[KnowledgeDocument]) -> dict:
    """What a new policy version changes (SRS 1.8 #4).

    - resolution rules that cite the document, and whether the section they cite still exists;
    - escalation rules whose reason names the document;
    - sections added, removed or reworded against the version it replaces;
    - timelines, rates or automatic entitlements that differ.
    """
    from database.models import EscalationRule, ResolutionRule
    from knowledge_base.precedence import _facts

    new_sections = {c.section or "": c.content for c in document.chunks}
    old_sections: dict[str, str] = {}
    for row in previous:
        for chunk in row.chunks:
            old_sections.setdefault(chunk.section or "", chunk.content)

    def _norm(text: str) -> str:
        return " ".join((text or "").lower().split())

    changed = sorted(s for s in set(new_sections) & set(old_sections) if _norm(new_sections[s]) != _norm(old_sections[s]))
    rules = []
    for rule in db.query(ResolutionRule).filter(ResolutionRule.policy_code == document.document_code, ResolutionRule.is_active.is_(True)).all():
        section = rule.policy_section or ""
        exists = not section or section in new_sections or any(s.startswith(section + ".") for s in new_sections)
        rules.append({
            "rule_code": rule.rule_code,
            "section": section,
            "section_exists": exists,
            "section_changed": section in changed,
        })
    escalations = [
        {"rule_code": r.rule_code, "name": r.name}
        for r in db.query(EscalationRule).filter(EscalationRule.is_active.is_(True)).all()
        if document.document_code in (r.reason or "")
    ]
    old_facts = _facts(" ".join(old_sections.values()))
    new_facts = _facts(" ".join(new_sections.values()))
    fact_changes = [
        {"unit": unit, "before": sorted(old_facts.get(unit, set())), "after": sorted(new_facts.get(unit, set()))}
        for unit in sorted(set(old_facts) | set(new_facts))
        if old_facts.get(unit, set()) != new_facts.get(unit, set())
    ] if previous else []
    return {
        "previous_versions": [row.version for row in previous],
        "sections_added": sorted(set(new_sections) - set(old_sections)) if previous else [],
        "sections_removed": sorted(set(old_sections) - set(new_sections)),
        "sections_changed": changed,
        "resolution_rules": rules,
        "rules_citing_missing_sections": [r["rule_code"] for r in rules if not r["section_exists"]],
        "escalation_rules": escalations,
        "timeline_changes": fact_changes,
        "previous_obsolete": bool(previous),
        "responses_need_revision": bool(changed or fact_changes or not previous),
    }
