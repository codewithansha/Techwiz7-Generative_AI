from __future__ import annotations

import re

from sqlalchemy.orm import Session

from complaint_processing.preprocess import extract_metadata
from complaint_rules.engine import classify_from_rules
from comparison_engine.compare import compare_outputs
from database.models import Complaint
from escalation_rules.engine import evaluate_escalation
from hallucination_checks.detector import detect_hallucinations, detect_unsupported_promises
from python_validation.schema import validate_schema
from routing_rules.engine import recommend_departments
from security.prompt_injection import detect_prompt_injection

MISSING_HINTS = {
    "order": r"\bNC-\d{6,}\b",
    "amount": r"(?:PKR|USD|Rs\.?|\$)\s?\d",
    "product": r".{3,}",
}


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
) -> dict:
    text = f"{complaint.title}\n{complaint.description}"
    python_class = classify_from_rules(db, text)
    routing = recommend_departments(db, text, python_class)
    escalation = evaluate_escalation(
        db,
        text=text,
        category=python_class.get("issue_category", ""),
        customer_type=complaint.customer_type.value,
        is_repeat=is_repeat,
        open_count=open_count,
    )
    urgency = python_class.get("urgency", "medium")
    if escalation.get("force_urgency"):
        urgency = _max_urgency(urgency, escalation["force_urgency"])
    priority = _priority_from_urgency(urgency, vip=complaint.customer_type.value in {"vip", "enterprise"})
    # Sentiment must never set urgency. Keep python urgency from rules/escalation only.
    missing = detect_missing_information(complaint)
    python_output = {
        "complaint_id": complaint.complaint_code,
        "issue_category": python_class.get("issue_category"),
        "subcategory": python_class.get("subcategory"),
        "department": routing.get("primary_department"),
        "supporting_departments": routing.get("supporting_departments"),
        "urgency": urgency,
        "priority": python_class.get("priority") or priority,
        "policy_id": python_class.get("policy_id"),
        "policy_section": python_class.get("policy_section"),
        "escalation_required": bool(python_class.get("escalation_required") or escalation["escalation_required"]),
        "escalation_level": escalation["escalation_level"]
        if escalation["escalation_required"]
        else python_class.get("escalation_level", "no_escalation"),
        "escalation_reasons": escalation.get("reasons", []),
        "required_actions": python_class.get("required_actions", []),
        "prohibited_actions": python_class.get("prohibited_actions", []),
        "follow_up_required": python_class.get("follow_up_required", True),
        "refund_eligible": python_class.get("refund_eligible"),
        "replacement_eligible": python_class.get("replacement_eligible"),
        "compensation_permitted": python_class.get("compensation_permitted", False),
        "rule_code": python_class.get("rule_code"),
        "missing_information": missing,
        "entities": extract_metadata(text),
        "prompt_injection": detect_prompt_injection(text),
    }
    if python_output["escalation_required"] and python_output["escalation_level"] == "no_escalation":
        python_output["escalation_level"] = "supervisor_review"

    schema_result = {"valid": False, "errors": ["No GenAI output"]}
    flags: list[dict] = []
    comparison = {}
    if genai_output:
        schema_result = validate_schema(
            genai_output,
            allowed_categories=allowed_categories,
            allowed_departments=allowed_departments,
            allowed_policies=allowed_policies,
        )
        comparison = compare_outputs(genai_output, python_output)
        flags.extend(detect_unsupported_promises(genai_output.get("customer_response", ""), python_output))
        flags.extend(detect_hallucinations(genai_output, text, policy_chunks))
        flags.extend(_resolution_flags(genai_output, python_output))
        if genai_output.get("compensation_recommended") and not python_output.get("compensation_permitted"):
            flags.append({"code": "unsupported_compensation", "detail": "Compensation is not permitted."})
        if genai_output.get("refund_eligible") is True and python_output.get("refund_eligible") is False:
            flags.append({"code": "refund_not_eligible", "detail": "Rule matrix denies refund eligibility."})

    policy_ok = True
    policy_id = (genai_output or {}).get("policy_id") or python_output.get("policy_id")
    if policy_id and allowed_policies and policy_id not in allowed_policies:
        policy_ok = False
        flags.append({"code": "invalid_policy_id", "value": policy_id})

    injection = python_output["prompt_injection"]
    if injection.get("detected"):
        flags.append({"code": "prompt_injection", "patterns": injection.get("patterns")})

    requires_review = bool(
        flags
        or python_output["escalation_required"]
        or missing
        or injection.get("detected")
    )
    if genai_output:
        requires_review = bool(
            requires_review
            or (comparison.get("requires_manual_review") if comparison else True)
            or not schema_result.get("valid")
        )
    # Critical escalation must never be dropped because GenAI missed it.
    if python_output["escalation_required"]:
        requires_review = True

    score = comparison.get("verification_score") if comparison else 0
    if flags:
        score = max(0, (score or 0) - 5 * len(flags))
    checks = {
        "schema": schema_result,
        "routing": {"python_department": python_output["department"]},
        "escalation": {
            "python_required": python_output["escalation_required"],
            "python_level": python_output["escalation_level"],
        },
        "policy_traceable": policy_ok,
        "sentiment_does_not_drive_urgency": True,
    }
    return {
        "python_output": python_output,
        "checks": checks,
        "flags": flags,
        "comparison": comparison,
        "verification_score": score,
        "requires_manual_review": requires_review,
    }


def detect_missing_information(complaint: Complaint) -> list[str]:
    missing = []
    text = f"{complaint.title} {complaint.description} {complaint.order_reference} {complaint.product_or_service}"
    if not complaint.order_reference and not re.search(r"\bNC-\d{6,}\b", text, re.I):
        missing.append("order_number")
    if not complaint.product_or_service.strip():
        missing.append("product")
    if len(complaint.description.strip()) < 40:
        missing.append("problem_description")
    if not extract_metadata(complaint.description).get("dates") and "date" in complaint.description.lower():
        pass
    return missing


def _resolution_flags(genai_output: dict, python_output: dict) -> list[dict]:
    flags = []
    steps = " ".join(genai_output.get("resolution_steps") or []).lower()
    for required in python_output.get("required_actions") or []:
        if required.lower() not in steps and required.lower() not in (genai_output.get("customer_response") or "").lower():
            flags.append({"code": "missing_mandatory_action", "action": required})
    for prohibited in python_output.get("prohibited_actions") or []:
        if prohibited.lower() in steps or prohibited.lower() in (genai_output.get("customer_response") or "").lower():
            flags.append({"code": "prohibited_action", "action": prohibited})
    return flags


def _priority_from_urgency(urgency: str, vip: bool = False) -> str:
    mapping = {"low": "P3", "medium": "P2", "high": "P1", "critical": "P0"}
    priority = mapping.get(urgency, "P2")
    if vip and priority == "P3":
        return "P2"
    return priority


def _max_urgency(a: str, b: str) -> str:
    rank = {"low": 1, "medium": 2, "high": 3, "critical": 4}
    return a if rank.get(a, 0) >= rank.get(b, 0) else b
