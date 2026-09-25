from __future__ import annotations

import re

from rapidfuzz import fuzz
from sqlalchemy.orm import Session

from complaint_processing.preprocess import extract_metadata
from complaint_rules.engine import UNCLASSIFIED, classify_from_rules
from comparison_engine.compare import compare_outputs
from database.models import Complaint, ComplaintCategory, Department, PriorityRule
from escalation_rules.engine import evaluate_escalation
from hallucination_checks.detector import detect_hallucinations, detect_unsupported_promises
from knowledge_base.precedence import policy_status, relies_on_conflict, resolve_precedence
from knowledge_base.retrieval import outdated_claims
from python_validation.schema import coerce_enums, validate_schema
from document_processing.attachments import evidence_summary
from python_validation.eligibility import evaluate_eligibility
from python_validation.sentiment import estimate_sentiment
from routing_rules.engine import recommend_departments
from security.prompt_injection import detect_prompt_injection

URGENCY_RANK = {"low": 1, "medium": 2, "high": 3, "critical": 4}
PRIORITY_RANK = {"P3": 1, "P2": 2, "P1": 3, "P0": 4}
DEFAULT_PRIORITY = {"low": "P3", "medium": "P2", "high": "P1", "critical": "P0"}
SENSITIVE_CATEGORIES = {"safety", "privacy", "account"}
NEGATIONS = ("do not", "don't", "never", "avoid", "must not", "should not", "no ")
EVIDENCE_CATEGORIES = {"product defect", "warranty"}


def run_python_validation(
    db: Session,
    *,
    complaint: Complaint,
    genai_output: dict | None,
    policy_chunks: list[dict],
    allowed_categories: set[str],
    allowed_departments: set[str],
    allowed_policies: set[str],
    is_repeat: bool = False,
    open_count: int = 0,
    genai_failed: bool = False,
    genai_skipped_reason: str = "",
) -> dict:
    """Pipeline 2: derive the ground truth from rules, then check the GenAI draft against it.

    Nothing here calls a GenAI API, and GenAI output never changes the Python result.
    """
    text = f"{complaint.title}\n{complaint.description}"
    # Attachments are evidence, not classification input: an invoice full of product words
    # must not change the category, but its order number, amounts and dates are used below.
    evidence = evidence_summary(complaint.attachments)
    evidence_text = "\n".join(a.extracted_text for a in complaint.attachments or [] if a.extracted_text)
    evidence_date = _parse_date(evidence.get("purchase_date"))
    python_class = classify_from_rules(db, text)
    routing = recommend_departments(db, text, python_class)
    escalation = evaluate_escalation(
        db,
        # Amounts on an attached invoice or statement count toward the high-value threshold.
        text=f"{text}\n{' '.join(evidence.get('amounts') or [])}",
        category=python_class.get("issue_category", ""),
        customer_type=complaint.customer_type.value,
        is_repeat=is_repeat,
        open_count=open_count,
    )
    # Urgency comes from the rule matrix and escalation rules only; sentiment never sets it.
    urgency = python_class.get("urgency") or "medium"
    if escalation.get("force_urgency"):
        urgency = _max_urgency(urgency, escalation["force_urgency"])
    priority = _priority(
        db,
        urgency,
        rule_priority=python_class.get("priority"),
        vip=complaint.customer_type.value in {"vip", "enterprise"},
    )
    missing = detect_missing_information(complaint, python_class.get("issue_category"), evidence)
    rule_policy = policy_status(db, python_class.get("policy_id"))
    eligibility = evaluate_eligibility(
        db,
        complaint,
        text=f"{text} {complaint.requested_resolution or ''}",
        category=python_class.get("issue_category"),
        refund=python_class.get("refund_eligible"),
        replacement=python_class.get("replacement_eligible"),
        evidence_date=evidence_date,
    )
    python_output = {
        "complaint_id": complaint.complaint_code,
        "issue_category": python_class.get("issue_category"),
        "subcategory": python_class.get("subcategory"),
        "secondary_issues": python_class.get("secondary_issues", []),
        "department": routing.get("primary_department"),
        "supporting_departments": routing.get("supporting_departments"),
        "urgency": urgency,
        "priority": priority,
        "policy_id": python_class.get("policy_id"),
        "policy_section": python_class.get("policy_section"),
        "policy_version": rule_policy["active_version"],
        "policy_applicability": rule_policy["applicability"] if python_class.get("policy_id") else "not_applicable",
        "escalation_required": bool(python_class.get("escalation_required") or escalation["escalation_required"]),
        "escalation_level": escalation["escalation_level"]
        if escalation["escalation_required"]
        else python_class.get("escalation_level", "no_escalation"),
        "escalation_reasons": escalation.get("reasons", []),
        "escalation_rules": escalation.get("matched_rules", []),
        "required_actions": python_class.get("required_actions", []),
        "prohibited_actions": python_class.get("prohibited_actions", []),
        "follow_up_required": python_class.get("follow_up_required", True),
        "refund_eligible": eligibility["refund_eligible"],
        "replacement_eligible": eligibility["replacement_eligible"],
        "eligibility": eligibility,
        "compensation_permitted": python_class.get("compensation_permitted", False),
        "rule_code": python_class.get("rule_code"),
        "rule_matched": python_class.get("matched", False),
        "missing_information": missing,
        "clarification_questions": clarification_questions(missing),
        "entities": extract_metadata(text),
        # Tone only (lexicon estimate); shown when GenAI is unavailable, never used for urgency.
        "sentiment_estimate": estimate_sentiment(f"{text}\n{complaint.requested_resolution or ''}"),
        "urgency_basis": {
            "rule": python_class.get("rule_code"),
            "rule_urgency": python_class.get("urgency") or "medium",
            "escalation_rules": [r["rule_code"] for r in escalation.get("matched_rules", [])],
            "escalation_force_urgency": escalation.get("force_urgency"),
            "inputs": ["rule matrix", "escalation rules", "priority table", "customer type"],
        },
        "prompt_injection": detect_prompt_injection(
            f"{text}\n{complaint.requested_resolution or ''}"
        ),
        "evidence": {k: v for k, v in evidence.items() if k != "items"},
    }
    python_output["evidence"]["satisfies"] = [a for a in python_output["required_actions"] if satisfied_by_evidence(a, python_output["evidence"])]
    if python_class.get("escalation_required") and not escalation["escalation_required"]:
        python_output["escalation_reasons"] = [f"Rule {python_class.get('rule_code')} mandates escalation."]
    if python_output["escalation_required"] and python_output["escalation_level"] == "no_escalation":
        python_output["escalation_level"] = "supervisor_review"

    flags: list[dict] = []
    reasons: list[str] = []
    schema_result: dict = {"valid": False, "errors": ["No GenAI output"]}
    comparison: dict = {}
    genai_policy: dict | None = None

    if genai_output:
        canonical = canonicalize_genai(db, genai_output)
        schema_result = validate_schema(
            canonical,
            allowed_categories=allowed_categories,
            allowed_departments=allowed_departments,
            allowed_policies=allowed_policies,
        )
        comparison = compare_outputs(canonical, python_output)
        response = canonical.get("customer_response") or ""
        flags.extend(detect_unsupported_promises(response, python_output, " ".join(c.get("content", "") for c in policy_chunks)))
        # Facts copied from an attachment (an invoice number, an amount) are grounded, not invented.
        flags.extend(detect_hallucinations(canonical, f"{text}\n{evidence_text}", policy_chunks, python_output))
        flags.extend(_resolution_flags(canonical, python_output))
        if canonical.get("compensation_recommended") and not python_output.get("compensation_permitted"):
            flags.append({"code": "unsupported_compensation", "detail": "Compensation is not permitted."})
        if canonical.get("refund_eligible") is True and python_output.get("refund_eligible") is False:
            flags.append({"code": "refund_not_eligible", "detail": "Rule matrix denies refund eligibility."})
        if canonical.get("replacement_eligible") is True and python_output.get("replacement_eligible") is False:
            flags.append({"code": "replacement_not_eligible", "detail": "Rule matrix denies replacement eligibility."})
        if python_output["escalation_required"] and not canonical.get("escalation_required"):
            flags.append({"code": "missed_mandatory_escalation", "detail": "; ".join(python_output["escalation_reasons"])})
        if not schema_result.get("valid"):
            reasons.append("GenAI output failed schema validation")
        if comparison.get("requires_manual_review"):
            reasons.append("GenAI and Python disagree significantly")

        cited = str(canonical.get("policy_id") or "").strip()
        if cited:
            genai_policy = policy_status(db, cited)
            if not genai_policy["known"]:
                flags.append({"code": "invalid_policy_id", "value": cited})
            elif genai_policy["applicability"] == "outdated":
                flags.append({"code": "outdated_policy", "value": cited, "detail": "Cited policy has no active version."})
            elif cited != python_output.get("policy_id"):
                genai_policy["applicability"] = "conditionally_applicable"
        elif python_output.get("policy_id"):
            flags.append({"code": "missing_policy_reference", "detail": "GenAI cited no approved policy."})
    elif genai_failed:
        flags.append({"code": "genai_failure", "detail": "Pipeline 1 returned no usable output after retries."})
        reasons.append("GenAI analysis failed; route to a human")

    if python_output["policy_id"] and not rule_policy["known"]:
        flags.append({"code": "rule_policy_missing", "value": python_output["policy_id"], "detail": "Rule cites a policy that is not in the knowledge base."})
        reasons.append("Policy support is missing")
    elif python_output["policy_applicability"] == "outdated":
        reasons.append("Rule policy has no active version")
    if _policy_conflict(policy_chunks):
        flags.append({"code": "policy_conflict", "detail": "Retrieved excerpts mix active and outdated versions of one policy."})
        reasons.append("Policy contradiction exists")
    for claim in outdated_claims(db, f"{text}\n{complaint.requested_resolution or ''}"):
        # The customer relies on a superseded, draft or expired rule; the active policy wins.
        flags.append({
            "code": "cites_outdated_policy",
            "value": f"{claim['document_code']} v{claim['version']} ({claim['status']})",
            "detail": f"Quoted: “{claim['sentence'][:160]}”. Apply the active version instead.",
        })
        reasons.append("Policy contradiction exists")

    precedence = resolve_precedence(policy_chunks, python_output.get("policy_id"))
    draft = str((canonical or {}).get("customer_response") or "") if genai_output else ""
    for conflict in precedence["conflicts"]:
        source = "complaint" if relies_on_conflict(f"{text} {complaint.requested_resolution or ''}", conflict) else "reply" if relies_on_conflict(draft, conflict) else None
        conflict["relied_on_by"] = source
        if source:
            governing = precedence["governing"]
            flags.append({
                "code": "lower_precedence_conflict",
                "value": f"{conflict['document_code']} vs {governing['document_code']}",
                "detail": f"The {source} relies on {conflict['document_code']} ({conflict['category']}: {', '.join(conflict['lower_says'])} {conflict['unit']}); {governing['document_code']} takes precedence ({', '.join(conflict['governing_says'])} {conflict['unit']}).",
            })
            reasons.append("Policy contradiction exists")
    cited_code = str((canonical or {}).get("policy_id") or "").strip() if genai_output else ""
    if cited_code and precedence["governing"] and any(o["document_code"] == cited_code for o in precedence["overridden"]):
        flags.append({"code": "lower_precedence_citation", "value": cited_code, "detail": f"{precedence['governing']['document_code']} governs this case."})

    reference = (complaint.previous_complaint_reference or "").strip().upper()
    if reference and not db.query(Complaint.id).filter(Complaint.complaint_code == reference).first():
        flags.append({"code": "unknown_previous_reference", "value": reference, "detail": "The cited earlier complaint is not in this system; confirm it with the customer."})

    if evidence["injection_in"]:
        flags.append({"code": "prompt_injection_in_attachment", "value": ", ".join(evidence["injection_in"]), "detail": "An attached file contains instruction-like text; it was passed to GenAI only as data."})
        reasons.append("Adversarial or manipulative content")
    if complaint.order_reference and evidence["order_ids"] and complaint.order_reference.upper() not in evidence["order_ids"]:
        flags.append({
            "code": "attachment_order_mismatch",
            "value": ", ".join(evidence["order_ids"]),
            "detail": f"The attachment shows {', '.join(evidence['order_ids'])} but the complaint is about {complaint.order_reference}. Confirm which order is affected.",
        })
    injection = python_output["prompt_injection"]
    if injection.get("detected"):
        flags.append({"code": "prompt_injection", "patterns": injection.get("patterns")})
        reasons.append("Adversarial or manipulative content")
    if not python_class.get("matched"):
        flags.append({"code": "no_rule_match", "detail": "No rule in the matrix matched; classification needs a human."})
        reasons.append("Complaint is ambiguous")
    elif python_class.get("ambiguous"):
        reasons.append("Complaint is ambiguous")
    if python_class.get("configured_without_rule"):
        reasons.append("Category has no resolution rule yet")
    if python_output["escalation_required"]:
        reasons.append("Mandatory escalation")
    if (python_output["issue_category"] or "").lower() in SENSITIVE_CATEGORIES:
        reasons.append("Sensitive complaint")
    if flags and not reasons:
        reasons.append("Validation flags raised")

    # Critical escalation must never be dropped because GenAI missed it: any reason at all
    # (including mandatory escalation) sends the case to a human.
    requires_review = bool(reasons or flags)

    score = None
    if comparison:
        score = max(0.0, float(comparison.get("verification_score") or 0) - 5 * len(flags))
    checks = {
        "genai_available": bool(genai_output),
        "genai_skipped_reason": genai_skipped_reason,
        "schema": schema_result,
        "classification": {
            "rule_code": python_output["rule_code"],
            "matched": python_class.get("matched", False),
            "ambiguous": python_class.get("ambiguous", False),
            "match_score": python_class.get("match_score", 0),
        },
        "routing": {
            "python_department": python_output["department"],
            "supporting_departments": python_output["supporting_departments"],
        },
        "escalation": {
            "python_required": python_output["escalation_required"],
            "python_level": python_output["escalation_level"],
            "matched_rules": escalation.get("matched_rules", []),
        },
        "policy": {
            "rule_policy": {"code": python_output["policy_id"], **rule_policy},
            "genai_policy": genai_policy,
            "precedence": precedence,
        },
        "policy_traceable": not any(f["code"] in {"invalid_policy_id", "ungrounded_policy_reference"} for f in flags),
        "review_reasons": sorted(set(reasons)),
    }
    return {
        "python_output": python_output,
        "checks": checks,
        "flags": flags,
        "comparison": comparison,
        "verification_score": score,
        "requires_manual_review": requires_review,
    }


def canonicalize_genai(db: Session, genai_output: dict) -> dict:
    """Map department codes and case variants to the configured display names before comparing."""
    data = coerce_enums(genai_output)
    departments = db.query(Department).all()
    dept_alias = {d.code.lower(): d.name for d in departments} | {d.name.lower(): d.name for d in departments}
    category_alias = {c.name.lower(): c.name for c in db.query(ComplaintCategory).all()}
    if isinstance(data.get("department"), str):
        data["department"] = dept_alias.get(data["department"].strip().lower(), data["department"])
    if isinstance(data.get("supporting_departments"), list):
        data["supporting_departments"] = [dept_alias.get(str(d).strip().lower(), d) for d in data["supporting_departments"]]
    if isinstance(data.get("issue_category"), str):
        data["issue_category"] = category_alias.get(data["issue_category"].strip().lower(), data["issue_category"])
    return data


CLARIFICATION = {
    "order_number": "Could you share your order number (it starts with NC-, for example NC-104512)?",
    "product": "Which product or service is this about?",
    "problem_description": "Could you describe what happened in a little more detail, including when it started?",
    "evidence": "Could you attach a photo or document showing the problem (for example the damage or the error)?",
    "purchase_date": "When did you buy or receive the item?",
}
DATE_CATEGORIES = {"warranty", "product defect", "refund"}


EVIDENCE_ACTIONS = [
    (re.compile(r"\b(photo|photos|picture|image|unboxing)\b", re.I), lambda ev: ev.get("photos", 0) > 0),
    (re.compile(r"\b(invoice|receipt|proof of purchase|statement)\b", re.I), lambda ev: bool(ev.get("documents") and (ev.get("order_ids") or ev.get("purchase_date") or ev.get("amounts")))),
]


def satisfied_by_evidence(action: str, evidence: dict) -> bool:
    """A 'request X from the customer' step is already done when X is attached."""
    if not re.search(r"\b(request|ask|collect|obtain|get)\b", action, re.I):
        return False
    return any(pattern.search(action) and check(evidence) for pattern, check in EVIDENCE_ACTIONS)


def _parse_date(value: str | None):
    from datetime import date

    try:
        return date.fromisoformat(value) if value else None
    except ValueError:
        return None


def clarification_questions(missing: list[str]) -> list[str]:
    """Focused questions instead of guessing (SRS step 43); used when GenAI has none."""
    return [CLARIFICATION[m] for m in missing if m in CLARIFICATION]


def detect_missing_information(complaint: Complaint, category: str | None = None, evidence: dict | None = None) -> list[str]:
    missing = []
    evidence = evidence or {}
    text = f"{complaint.title} {complaint.description} {complaint.order_reference} {complaint.product_or_service}"
    if not complaint.order_reference and not re.search(r"\bNC-\d{6,}\b", text, re.I) and not evidence.get("order_ids"):
        missing.append("order_number")
    if not complaint.product_or_service.strip():
        missing.append("product")
    if len(complaint.description.strip()) < 40:
        missing.append("problem_description")
    if (category or "").lower() in EVIDENCE_CATEGORIES and not complaint.attachments:
        missing.append("evidence")
    if (category or "").lower() in DATE_CATEGORIES and not complaint.incident_date and not extract_metadata(text).get("dates") and not evidence.get("purchase_date"):
        missing.append("purchase_date")
    return missing


def _resolution_flags(genai_output: dict, python_output: dict) -> list[dict]:
    """Mandatory actions must appear (paraphrase allowed); prohibited ones must not be offered."""
    flags = []
    steps = [str(s) for s in (genai_output.get("resolution_steps") or [])]
    guidance = [str(s) for s in (genai_output.get("agent_guidance") or [])]
    response = str(genai_output.get("customer_response") or "")
    candidates = steps + guidance + [response]
    for required in python_output.get("required_actions") or []:
        if satisfied_by_evidence(required, python_output.get("evidence") or {}):
            continue  # e.g. "Request unboxing photos" when the customer already attached a photo
        if not any(_similar(required, item) for item in candidates):
            flags.append({"code": "missing_mandatory_action", "action": required})
    offered = [s for s in steps if not s.strip().lower().startswith(NEGATIONS)] + [response]
    for prohibited in python_output.get("prohibited_actions") or []:
        if any(_similar(prohibited, item, threshold=85) and not _negated(prohibited, item) for item in offered):
            flags.append({"code": "prohibited_action", "action": prohibited})
    return flags


def _similar(action: str, text: str, threshold: int = 70) -> bool:
    action_l, text_l = action.lower(), text.lower()
    if action_l in text_l:
        return True
    # Short steps are compared word-set to word-set; long prose (the customer response)
    # is scanned for an aligned passage so unrelated sentences cannot dilute the score.
    if len(text_l) <= 3 * len(action_l):
        return fuzz.token_set_ratio(action_l, text_l) >= threshold
    return fuzz.partial_ratio(action_l, text_l) >= max(threshold, 85)


def _negated(action: str, text: str) -> bool:
    lowered = text.lower()
    index = lowered.find(action.lower().split()[0]) if action else -1
    window = lowered[max(0, index - 25) : index] if index >= 0 else ""
    return any(neg.strip() in window for neg in NEGATIONS)


def _policy_conflict(policy_chunks: list[dict]) -> bool:
    states: dict[str, set[bool]] = {}
    for chunk in policy_chunks:
        states.setdefault(chunk["document_code"], set()).add(bool(chunk.get("usable")))
    return any(len(values) > 1 for values in states.values())


def _priority(db: Session, urgency: str, *, rule_priority: str | None, vip: bool) -> str:
    """Urgency -> priority comes from the configurable priority_rules table.

    The result is never lower than the matched rule's own priority. VIP/enterprise
    customers get at least P2 but a minor VIP issue is not inflated to P1/P0.
    """
    mapping = {r.urgency.value: r.priority.value for r in db.query(PriorityRule).all()} or DEFAULT_PRIORITY
    priority = mapping.get(urgency, DEFAULT_PRIORITY.get(urgency, "P2"))
    if rule_priority and PRIORITY_RANK.get(rule_priority, 0) > PRIORITY_RANK.get(priority, 0):
        priority = rule_priority
    if vip and priority == "P3":
        priority = "P2"
    return priority


def _priority_from_urgency(urgency: str, vip: bool = False) -> str:
    priority = DEFAULT_PRIORITY.get(urgency, "P2")
    if vip and priority == "P3":
        return "P2"
    return priority


def _max_urgency(a: str, b: str) -> str:
    return a if URGENCY_RANK.get(a, 0) >= URGENCY_RANK.get(b, 0) else b


__all__ = ["UNCLASSIFIED", "run_python_validation", "detect_missing_information", "canonicalize_genai"]
