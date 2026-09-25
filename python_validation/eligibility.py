"""Refund and replacement eligibility against the policy conditions (SRS step 30).

The rule matrix says whether a complaint type *can* get a refund or replacement. This module
checks the conditions the policies attach to that promise, using only facts on the complaint:

- RPL-POL-01 1: verified defect, within 30 days of delivery, product in original condition;
- RPL-POL-01 2: no replacement already issued for the same order;
- REF-POL-01 2: returns within 14 days if unused, or within warranty when a defect is verified;
- WAR-POL-03 1/4: 12-month warranty, void for water or physical damage after delivery.

A failed condition makes the outcome ``False``; a condition that cannot be checked from the
complaint (for example no purchase date) leaves it at the rule's value and is listed under
``needs_check`` so an agent verifies it instead of anyone guessing.
"""

from __future__ import annotations

import re
from datetime import date

from sqlalchemy.orm import Session

from database.models import Complaint, ComplaintStatus, ValidationResult

REPLACEMENT_WINDOW_DAYS = 30
RETURN_WINDOW_DAYS = 14
WARRANTY_DAYS = 365
DEFECT_CATEGORIES = {"product defect", "warranty", "safety"}

CUSTOMER_DAMAGE = re.compile(
    r"\b(?:i|my (?:son|daughter|kid|child))\s+(?:dropped|broke|spilled|cracked|smashed)\b|\b(?:water damage|fell in water|got wet|spilled (?:water|coffee|tea|juice))\b",
    re.I,
)
USED = re.compile(r"\b(?:used it for|been using|after using|worn|opened and used)\b", re.I)
UNUSED = re.compile(r"\b(?:unused|unopened|sealed|never used|still in the box|original packaging)\b", re.I)
PRIOR_REPLACEMENT = re.compile(r"\b(?:second replacement|replacement (?:also|is also|too)|already (?:got|received|had) a replacement|previous replacement)\b", re.I)


def _age_days(complaint: Complaint, evidence_date: date | None = None) -> int | None:
    start = complaint.incident_date or evidence_date
    if not start:
        return None
    reference = complaint.created_at.date() if complaint.created_at else date.today()
    return max(0, (reference - start).days)


def _prior_replacements(db: Session, complaint: Complaint) -> int:
    """Earlier closed complaints on the same order whose outcome was a replacement."""
    if not complaint.order_reference:
        return 0
    rows = (
        db.query(Complaint)
        .filter(
            Complaint.order_reference == complaint.order_reference,
            Complaint.id != complaint.id,
            Complaint.status.in_([ComplaintStatus.resolved, ComplaintStatus.closed]),
        )
        .all()
    )
    count = 0
    for row in rows:
        latest = db.query(ValidationResult).filter(ValidationResult.complaint_id == row.id).order_by(ValidationResult.id.desc()).first()
        if latest and (latest.python_output or {}).get("replacement_eligible") is True:
            count += 1
    return count


def evaluate_eligibility(db: Session, complaint: Complaint, *, text: str, category: str | None, refund: bool | None, replacement: bool | None, evidence_date: date | None = None) -> dict:
    checks: list[dict] = []
    needs_check: list[str] = []
    age = _age_days(complaint, evidence_date)
    dated_by = "attached invoice" if not complaint.incident_date and evidence_date else "purchase/delivery"
    defect = (category or "").lower() in DEFECT_CATEGORIES
    customer_damage = bool(CUSTOMER_DAMAGE.search(text))
    used = bool(USED.search(text)) and not UNUSED.search(text)
    prior = _prior_replacements(db, complaint) + (1 if PRIOR_REPLACEMENT.search(text) else 0)

    def check(name: str, passed: bool | None, detail: str, policy: str) -> bool | None:
        checks.append({"check": name, "passed": passed, "detail": detail, "policy": policy})
        if passed is None:
            needs_check.append(name)
        return passed

    lowered = text.lower()
    cat = (category or "").lower()
    # Only test a remedy that is in play: the rule grants it, or it is undecided and the
    # complaint is about a defect or asks for it. A refund already under way (Refund Delay)
    # is not re-tested against the return window.
    wants_replacement = replacement is True or (replacement is None and (defect or "replac" in lowered))
    wants_refund = refund is True or (refund is None and "refund" in lowered and cat != "refund")

    replacement_out = replacement
    if wants_replacement:
        results = [
            check(
                "replacement_window",
                None if age is None else age <= REPLACEMENT_WINDOW_DAYS,
                "No purchase or delivery date given" if age is None else f"{age} days since {dated_by} (limit {REPLACEMENT_WINDOW_DAYS})",
                "RPL-POL-01 §1",
            ),
            check(
                "product_condition",
                False if customer_damage else None if not UNUSED.search(text) else True,
                "Damage caused after delivery is described" if customer_damage else "Original condition confirmed by the customer" if UNUSED.search(text) else "Condition to be confirmed on inspection",
                "RPL-POL-01 §1 · WAR-POL-03 §4",
            ),
            check(
                "no_previous_replacement",
                prior == 0,
                "No earlier replacement on this order" if prior == 0 else f"{prior} earlier replacement(s) on this order — supervisor approval needed",
                "RPL-POL-01 §2",
            ),
        ]
        if any(r is False for r in results):
            replacement_out = False

    refund_out = refund
    if wants_refund:
        if defect:
            passed = None if age is None else age <= WARRANTY_DAYS
            detail = "No purchase date; warranty window unknown" if age is None else f"{age} days since purchase (warranty {WARRANTY_DAYS})"
            result = check("warranty_window", passed, detail, "WAR-POL-03 §1 · REF-POL-01 §2")
        else:
            passed = None if age is None else age <= RETURN_WINDOW_DAYS and not used
            detail = "No purchase date; return window unknown" if age is None else f"{age} days since delivery (return limit {RETURN_WINDOW_DAYS})" + ("; item was used" if used else "")
            result = check("return_window", passed, detail, "REF-POL-01 §2")
        if customer_damage:
            result = check("damage_after_delivery", False, "Water or physical damage after delivery voids the claim", "WAR-POL-03 §4")
        if result is False:
            refund_out = False

    return {
        "refund_eligible": refund_out,
        "replacement_eligible": replacement_out,
        "checks": checks,
        "needs_check": needs_check,
        "rule_refund_eligible": refund,
        "rule_replacement_eligible": replacement,
    }
