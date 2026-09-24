from __future__ import annotations

import re

from complaint_processing.preprocess import extract_metadata

PROMISE_PATTERNS = [
    (re.compile(r"\bguaranteed refund\b", re.I), "guaranteed_refund"),
    (re.compile(r"\bwe will refund\b", re.I), "unverified_refund_promise"),
    (re.compile(r"\bfull refund (is|has been) approved\b", re.I), "approved_refund_promise"),
    (re.compile(r"\bguaranteed compensation\b", re.I), "guaranteed_compensation"),
    (re.compile(r"\bwe will pay you\b", re.I), "payment_promise"),
    (re.compile(r"\bwill (arrive|be delivered) (today|tomorrow)\b", re.I), "unsupported_deadline"),
    (re.compile(r"\bpolicy exception (is|has been) approved\b", re.I), "unauthorized_exception"),
]


def detect_unsupported_promises(response: str, python_result: dict) -> list[dict]:
    flags = []
    for pattern, code in PROMISE_PATTERNS:
        if pattern.search(response or ""):
            if code in {"guaranteed_refund", "unverified_refund_promise", "approved_refund_promise"}:
                if python_result.get("refund_eligible") is not True:
                    flags.append({"code": code, "detail": "Refund language is not supported by the rule matrix."})
            elif code in {"guaranteed_compensation", "payment_promise"}:
                if not python_result.get("compensation_permitted"):
                    flags.append({"code": code, "detail": "Compensation is not permitted by approved rules."})
            else:
                flags.append({"code": code, "detail": "Statement cannot be grounded in approved rules."})
    return flags


def detect_hallucinations(output: dict, complaint_text: str, policy_chunks: list[dict]) -> list[dict]:
    flags = []
    grounded = complaint_text.lower() + "\n" + "\n".join(chunk.get("content", "").lower() for chunk in policy_chunks)
    grounded += " " + " ".join(str(v) for v in extract_metadata(complaint_text).values())
    for key in ("policy_id", "policy_section"):
        value = str(output.get(key) or "").strip()
        if value and value.lower() not in grounded and not any(
            value == chunk.get("document_code") or value == chunk.get("section") for chunk in policy_chunks
        ):
            flags.append({"code": "ungrounded_policy_reference", "field": key, "value": value})
    response = output.get("customer_response") or ""
    invented_ids = re.findall(r"\b(?:ORD|INV|TXN)-\d{5,}\b", response)
    complaint_ids = set(re.findall(r"\b(?:ORD|INV|TXN|NC)-\d{5,}\b", complaint_text, flags=re.I))
    for invented in invented_ids:
        if invented.upper() not in {item.upper() for item in complaint_ids}:
            flags.append({"code": "invented_identifier", "value": invented})
    return flags
