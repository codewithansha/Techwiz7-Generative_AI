"""Validate the labelled complaint dataset, the hidden-pack example and the KB documents.

Regenerate with ``python scripts/generate_complaints.py`` and
``python scripts/build_sample_documents.py`` when the rule matrix changes.
"""

from __future__ import annotations

import csv
import json
import re
from collections import Counter, defaultdict
from pathlib import Path

import pytest

from complaint_processing.preprocess import normalize_text
from complaint_rules.engine import UNCLASSIFIED
from database.models import Channel, CustomerType, EscalationLevel, PriorityCode, UrgencyLevel
from database.seed import CATEGORIES, DEPARTMENTS, DOCUMENTS, SUBCATEGORIES
from scripts.generate_complaints import CASE_TYPES, HIDDEN_COLUMNS, IMPORT_COLUMNS, predict

ROOT = Path(__file__).resolve().parent.parent
DATASET = ROOT / "sample_complaints" / "nimbuscarta_500.json"
DATASET_CSV = ROOT / "sample_complaints" / "nimbuscarta_500.csv"
HIDDEN = ROOT / "hidden_test_ready"
DOCS = ROOT / "sample_documents"

CATEGORY_CODES = {code: name for code, name, _ in CATEGORIES}
CATEGORY_NAMES = set(CATEGORY_CODES.values()) | {UNCLASSIFIED}
SUBCATEGORY_PAIRS = {(CATEGORY_CODES[c], name) for c, _, name, _ in SUBCATEGORIES} | {(UNCLASSIFIED, "Unspecified")}
DEPARTMENT_NAMES = {name for _, name in DEPARTMENTS}
POLICY_CODES = {code for code, *_ in DOCUMENTS} | {""}
ORDER = re.compile(r"^NC-\d{6}$")
PREVIOUS = re.compile(r"^CMP-\d{5,}$")
LABELS = [
    "expected_category", "expected_subcategory", "expected_department", "expected_urgency",
    "expected_priority", "expected_escalation", "expected_escalation_level", "expected_policy",
]


@pytest.fixture(scope="module")
def records() -> list[dict]:
    return json.loads(DATASET.read_text(encoding="utf-8"))


def test_at_least_500_unique_complaints(records):
    descriptions = [normalize_text(r["description"]).lower() for r in records]
    assert len(records) >= 500
    assert len(set(descriptions)) == len(records), "descriptions must be unique"
    assert len({r["id"] for r in records}) == len(records)


def test_required_text_and_formats(records):
    for r in records:
        assert r["title"].strip(), r["id"]
        assert len(r["description"].strip()) >= 20, r["id"]
        assert not r["order_reference"] or ORDER.match(r["order_reference"]), r["id"]
        assert not r["previous_complaint_reference"] or PREVIOUS.match(r["previous_complaint_reference"]), r["id"]
        assert r["customer_type"] in {c.value for c in CustomerType}, r["id"]
        assert r["channel"] in {c.value for c in Channel}, r["id"]
        assert r["customer_ref"].startswith("SIM-CUST-"), r["id"]
        assert r["notes"].strip(), r["id"]


def test_labels_use_allowed_values(records):
    for r in records:
        assert r["expected_category"] in CATEGORY_NAMES, r["id"]
        assert (r["expected_category"], r["expected_subcategory"]) in SUBCATEGORY_PAIRS, r["id"]
        assert r["expected_department"] in DEPARTMENT_NAMES, r["id"]
        assert r["expected_urgency"] in {u.value for u in UrgencyLevel}, r["id"]
        assert r["expected_priority"] in {p.value for p in PriorityCode}, r["id"]
        assert isinstance(r["expected_escalation"], bool), r["id"]
        assert r["expected_escalation_level"] in {e.value for e in EscalationLevel}, r["id"]
        assert r["expected_escalation"] == (r["expected_escalation_level"] != "no_escalation"), r["id"]
        assert r["expected_policy"] in POLICY_CODES, r["id"]
        assert r["case_type"] in CASE_TYPES, r["id"]
        assert set(r["secondary_categories"]) <= CATEGORY_NAMES, r["id"]


def test_srs_coverage_minimums(records):
    cases = Counter(r["case_type"] for r in records)
    assert set(CASE_TYPES) <= set(cases), f"missing case types: {set(CASE_TYPES) - set(cases)}"
    assert len({r["expected_category"] for r in records} - {UNCLASSIFIED}) >= 10
    assert len({(r["expected_category"], r["expected_subcategory"]) for r in records if r["expected_category"] != UNCLASSIFIED}) >= 20
    assert len({r["expected_department"] for r in records}) >= 8
    assert cases["ambiguous"] + cases["multi_issue"] >= 25
    assert sum(len(r["secondary_categories"]) >= 2 for r in records) >= 8, "need 8+ complaints with 3+ issues"
    assert cases["contradictory_policy"] >= 20
    assert cases["prompt_injection"] >= 20
    assert cases["repeated"] + cases["near_duplicate"] >= 25


def test_trap_cases_are_labelled_as_the_rules_require(records):
    for r in records:
        if r["expected_category"] == "Safety":
            assert r["expected_urgency"] == "critical" and r["expected_priority"] == "P0", r["id"]
        if r["case_type"] == "low_priority" and r["customer_type"] == "standard":
            assert r["expected_priority"] == "P3", r["id"]
        if r["case_type"] == "vip_minor":
            assert (r["expected_urgency"], r["expected_priority"]) == ("low", "P2"), r["id"]
        if r["case_type"] in {"legal_threat", "policy_exception", "high_value", "repeated", "privacy", "low_value_privacy"}:
            assert r["expected_escalation"], r["id"]


def test_repeat_groups_share_customer_and_order(records):
    groups = defaultdict(list)
    for r in records:
        for tag in r["tags"]:
            if tag.startswith("repeat_group:"):
                groups[tag].append(r)
    assert len(groups) >= 15
    for tag, members in groups.items():
        assert len({m["customer_ref"] for m in members}) == 1, tag
        assert len({m["order_reference"] for m in members}) == 1, tag
        assert members[0]["case_type"] not in {"repeated", "near_duplicate"}, f"{tag} must start with the original"
    others = [r["customer_ref"] for r in records if not any(t.startswith("repeat_group:") for t in r["tags"])]
    assert len(others) == len(set(others)), "only repeat groups may share a simulated customer"


def test_labels_match_the_rule_matrix(records):
    """Re-run Pipeline 2 on the seeded rule matrix; fails when rules changed without regenerating."""
    mismatches = []
    for r in records:
        predicted = predict(r)
        diff = {k: (r[k], predicted[k]) for k in LABELS if r[k] != predicted[k]}
        if diff:
            mismatches.append((r["id"], diff))
    assert not mismatches, f"{len(mismatches)} records disagree with the rule matrix, e.g. {mismatches[:3]}"


def test_csv_matches_json_and_uses_import_columns(records):
    with DATASET_CSV.open(encoding="utf-8", newline="") as handle:
        rows = list(csv.DictReader(handle))
    assert set(IMPORT_COLUMNS) <= set(rows[0])
    assert {"expected_category", "expected_subcategory", "expected_department", "expected_urgency",
            "expected_priority", "expected_escalation"} <= set(rows[0])
    assert [r["id"] for r in rows] == [r["id"] for r in records]
    for row, record in zip(rows, records):
        assert row["description"] == record["description"]
        assert row["expected_escalation"] == ("true" if record["expected_escalation"] else "false")


def test_hidden_pack_example_is_in_import_format():
    rows = json.loads((HIDDEN / "example_hidden_pack.json").read_text(encoding="utf-8"))
    with (HIDDEN / "example_hidden_pack.csv").open(encoding="utf-8", newline="") as handle:
        csv_rows = list(csv.DictReader(handle))
    assert len(rows) == len(csv_rows) == 20
    assert list(csv_rows[0]) == HIDDEN_COLUMNS
    for row in rows:
        assert list(row) == HIDDEN_COLUMNS
        assert not row["order_reference"] or ORDER.match(row["order_reference"])
        assert row["expected_category"] in CATEGORY_NAMES
        predicted = predict(row)
        assert all(row[k] == predicted[k] for k in HIDDEN_COLUMNS if k.startswith("expected_")), row["title"]


def test_sample_documents_open_and_have_text():
    fitz = pytest.importorskip("fitz")
    docx = pytest.importorskip("docx")
    pdfs, docxs = sorted(DOCS.glob("*.pdf")), sorted(DOCS.glob("*.docx"))
    assert len(pdfs) + len(docxs) >= 22 and pdfs and docxs
    multi_page = 0
    for path in pdfs:
        with fitz.open(path) as pdf:
            assert "".join(page.get_text() for page in pdf).strip(), path.name
            multi_page += pdf.page_count > 1
    assert multi_page >= 3
    for path in docxs:
        document = docx.Document(path)
        assert any(p.text.strip() for p in document.paragraphs), path.name
        assert any("heading" in (p.style.name or "").lower() for p in document.paragraphs), path.name
    codes = {path.name.split("_v")[0] for path in pdfs + docxs}
    assert {code for code, *_ in DOCUMENTS} <= codes, "every seeded document code needs a PDF/DOCX"
