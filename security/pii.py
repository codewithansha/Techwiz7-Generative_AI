import re

PII_PATTERNS = [
    # Pakistani CNIC: 12345-1234567-1
    (re.compile(r"\b\d{5}-\d{7}-\d\b"), "[REDACTED_ID]"),
    # Card numbers: 13-19 digits, written solid or in groups ("4111 1111 1111 1111", "4111-1111-...").
    (re.compile(r"\b(?:\d[ -]?){12,18}\d\b"), "[REDACTED_CARD]"),
    (re.compile(r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", re.I), "[REDACTED_EMAIL]"),
    (re.compile(r"\b(?:\+?\d{1,3}[-.\s]?)?(?:\d{3}[-.\s]?){2}\d{4}\b"), "[REDACTED_PHONE]"),
]


def mask_pii(text: str) -> str:
    masked = text
    for pattern, replacement in PII_PATTERNS:
        masked = pattern.sub(replacement, masked)
    return masked
