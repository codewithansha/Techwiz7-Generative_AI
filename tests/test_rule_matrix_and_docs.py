"""The rule matrix, the knowledge-base documents it cites, and the helpers around them."""

from collections import Counter
from pathlib import Path

import pytest

from database.seed import CATEGORIES, DOCUMENTS, SUBCATEGORIES, _document_sections, load_rule_matrix
from document_processing.parser import parse_document
from hallucination_checks.detector import detect_unsupported_promises
from python_validation.sentiment import estimate_sentiment

ROOT = Path(__file__).resolve().parent.parent
MATRIX = load_rule_matrix()
TITLES = {code: (title, body) for code, title, _, body in DOCUMENTS}


def test_matrix_meets_srs_minimums_and_has_no_filler():
    assert len(MATRIX) >= 100
    assert len({r["rule_code"] for r in MATRIX}) == len(MATRIX), "rule codes must be unique"
    assert not [r for r in MATRIX if r["policy_code"] == "GEN-POL-01" and "Apply matching SOP" in r["required_actions"]]
    per_sub = Counter((r["category_code"], r["subcategory_code"]) for r in MATRIX)
    assert set(per_sub) == {(c, s) for c, s, _, _ in SUBCATEGORIES}
    assert min(per_sub.values()) >= 3
    assert {r["category_code"] for r in MATRIX} == {code for code, _, _ in CATEGORIES}
    assert all(r["required_actions"] and r["conditions"]["keywords"] for r in MATRIX)


def test_every_rule_citation_resolves_to_a_real_document_section():
    sections: dict[str, set[str]] = {}
    for rule in MATRIX:
        code, section = rule["policy_code"], rule["policy_section"]
        assert code in TITLES, f"{rule['rule_code']} cites unknown policy {code}"
        if code not in sections:
            parsed, path = _document_sections(code, "1.0", *TITLES[code])
            assert path is not None, f"no sample document for {code}"
            sections[code] = {s["section"] for s in parsed}
        assert not section or section in sections[code] or any(s.startswith(section + ".") for s in sections[code]), (
            f"{rule['rule_code']} cites {code} §{section}, which the document does not have"
        )


def test_escalating_rules_are_high_or_critical():
    for rule in MATRIX:
        if rule["escalation_required"]:
            assert rule["urgency"].value in {"high", "critical"}, rule["rule_code"]


def test_pdf_sections_follow_numbered_headings_and_drop_running_headers():
    path = ROOT / "sample_documents" / "DEL-POL-04_v1.0_delivery-policy.pdf"
    sections = parse_document(path, path.read_bytes())
    numbers = [s["section"] for s in sections]
    assert {"5.2", "6.1", "7.0"} <= set(numbers)
    assert all(s["page_number"] for s in sections)
    assert not any("NimbusCarta internal" in s["content"] for s in sections)


def test_docx_sections_use_heading_numbers():
    path = ROOT / "sample_documents" / "REF-POL-01_v1.0_refund-policy.docx"
    numbers = [s["section"] for s in parse_document(path, path.read_bytes())]
    assert "4.1" in numbers and "5.3" in numbers
    assert numbers.count("1") == 1


@pytest.mark.parametrize(
    "text, label",
    [
        ("I AM FURIOUS!!! This is the WORST service ever, absolutely useless", "strongly_negative"),
        ("The parcel is late and I am disappointed", "negative"),
        ("My charger gives off a burning smell when charging.", "neutral"),
        ("Thanks, the team was very helpful and I am happy", "positive"),
    ],
)
def test_sentiment_estimate(text, label):
    assert estimate_sentiment(text)["sentiment"] == label


def test_emotion_indicators_do_not_imply_urgency():
    result = estimate_sentiment("This is ridiculous and unacceptable, I want this fixed immediately")
    assert {"anger", "urgency"} <= set(result["emotion_indicators"])
    assert "urgency" not in result or result.get("urgency") is None


@pytest.mark.parametrize(
    "reply",
    [
        "Don't worry, we'll refund you straight away.",
        "Your refund will be processed today.",
        "A replacement is on its way to you.",
        "You'll receive a voucher for the trouble.",
    ],
)
def test_contracted_and_passive_promises_are_flagged(reply):
    assert detect_unsupported_promises(reply, {"refund_eligible": None, "replacement_eligible": None})


def test_timeline_must_come_from_policy():
    reply = "We will update you within 24 hours."
    assert [f["code"] for f in detect_unsupported_promises(reply, {})] == ["unsupported_timeline"]
    assert detect_unsupported_promises(reply, {}, grounding="Updates are sent within 24 hours of escalation.") == []
