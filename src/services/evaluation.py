"""Bulk import and scoring of complaint packs (e.g. the hidden evaluation dataset).

Each row is created through the normal intake path, analyzed by both pipelines in a
background thread, and compared with its optional expected labels. Nothing here is
specific to one dataset: new categories, rules or policies are picked up from config.
"""

from __future__ import annotations

import csv
import io
import json
import logging
import threading
from collections import Counter, defaultdict

from sqlalchemy.orm import Session, selectinload

from database.models import Complaint, Customer, CustomerType, EvaluationItem, EvaluationRun
from database.session import SessionLocal
from src.services.analysis import analyze_complaint, latest_genai_output
from src.services.intake import IntakeError, create_complaint

logger = logging.getLogger("supportnova.evaluation")

INPUT_FIELDS = [
    "title", "description", "product_or_service", "order_reference", "customer_type", "channel",
    "previous_complaint_reference", "requested_resolution", "customer_ref", "incident_date",
]
EXPECTED_FIELDS = [
    "expected_category", "expected_subcategory", "expected_department", "expected_urgency",
    "expected_priority", "expected_escalation",
]
# expected label -> (python/genai output key)
SCORED = {
    "category": "issue_category",
    "subcategory": "subcategory",
    "department": "department",
    "urgency": "urgency",
    "priority": "priority",
    "escalation": "escalation_required",
}
MAX_ROWS = 5000
MAX_GENAI_ROWS = 150  # a GenAI call can take ~15 s; keep live-GenAI runs demo-sized


class ImportError_(ValueError):
    pass


def parse_pack(filename: str, content: bytes) -> list[dict]:
    """CSV or JSON (a list of objects, or {"complaints": [...]}) into row dicts."""
    name = (filename or "").lower()
    text = content.decode("utf-8-sig", errors="replace")
    if name.endswith(".json"):
        data = json.loads(text)
        rows = data.get("complaints") if isinstance(data, dict) else data
        if not isinstance(rows, list):
            raise ImportError_("JSON must be a list of complaint objects or {\"complaints\": [...]}.")
    elif name.endswith(".csv"):
        rows = list(csv.DictReader(io.StringIO(text)))
    else:
        raise ImportError_("Upload a .csv or .json file.")
    if not rows:
        raise ImportError_("The file contains no complaints.")
    if len(rows) > MAX_ROWS:
        raise ImportError_(f"At most {MAX_ROWS} complaints per import.")
    missing = [f for f in ("title", "description") if f not in rows[0]]
    if missing:
        raise ImportError_(f"Missing required column(s): {', '.join(missing)}.")
    return [{k.strip(): (v.strip() if isinstance(v, str) else v) for k, v in row.items() if k} for row in rows]


def create_run(db: Session, *, name: str, rows: list[dict], user_id: int, use_genai: bool) -> EvaluationRun:
    if use_genai and len(rows) > MAX_GENAI_ROWS:
        raise ImportError_(f"Live GenAI runs are limited to {MAX_GENAI_ROWS} complaints; run the rest Python-only.")
    run = EvaluationRun(name=name[:255] or "Evaluation", created_by_id=user_id, use_genai=use_genai, total=len(rows), status="queued")
    db.add(run)
    db.flush()
    customers: dict[str, Customer] = {}
    for number, row in enumerate(rows, start=1):
        expected = {k: row.get(k) for k in EXPECTED_FIELDS if row.get(k) not in (None, "")}
        for extra in ("case_type", "id", "expected_policy"):
            if row.get(extra):
                expected[extra] = row[extra]
        item = EvaluationItem(run_id=run.id, row_number=number, expected=expected)
        try:
            customer = _customer(db, customers, row.get("customer_ref"), row.get("customer_type"))
            fields = {k: row.get(k) or "" for k in INPUT_FIELDS if k != "customer_ref"}
            complaint, _ = create_complaint(db, fields, customer=customer, submitted_by_id=user_id, block_exact_duplicates=False, strict_references=False)
            item.complaint_id = complaint.id
        except IntakeError as exc:
            item.error = "; ".join(exc.errors)
        db.add(item)
    db.commit()
    return run


def start_run(run_id: int) -> None:
    thread = threading.Thread(target=_process, args=(run_id,), name=f"evaluation-{run_id}", daemon=True)
    thread.start()


def _process(run_id: int) -> None:
    db = SessionLocal()
    try:
        run = db.get(EvaluationRun, run_id)
        run.status = "running"
        db.commit()
        items = db.query(EvaluationItem).filter(EvaluationItem.run_id == run_id).order_by(EvaluationItem.id).all()
        for item in items:
            if item.complaint_id:
                complaint = db.query(Complaint).options(
                    selectinload(Complaint.validation_results), selectinload(Complaint.genai_runs),
                    selectinload(Complaint.reviews), selectinload(Complaint.attachments),
                ).get(item.complaint_id)
                try:
                    analyze_complaint(db, complaint, skip_genai=not run.use_genai, actor_id=run.created_by_id)
                except Exception as exc:  # noqa: BLE001 — record and continue with the next row
                    db.rollback()
                    item = db.get(EvaluationItem, item.id)
                    item.error = f"Analysis failed: {exc}"[:500]
                    logger.exception("Evaluation %s row %s failed", run_id, item.row_number)
            run = db.get(EvaluationRun, run_id)
            run.processed += 1
            db.commit()
        run.status = "done"
        db.commit()
    except Exception as exc:  # noqa: BLE001
        db.rollback()
        run = db.get(EvaluationRun, run_id)
        if run:
            run.status = "failed"
            run.error = str(exc)[:1000]
            db.commit()
        logger.exception("Evaluation %s failed", run_id)
    finally:
        db.close()


def _customer(db: Session, cache: dict, ref: str | None, customer_type: str | None) -> Customer | None:
    """Simulated customers keyed by customer_ref, so repeats in a pack link to one history."""
    ref = (ref or "").strip()
    if not ref:
        return None
    if ref in cache:
        return cache[ref]
    customer = db.query(Customer).filter(Customer.customer_code == ref).first()
    if not customer:
        try:
            ctype = CustomerType(customer_type or "standard")
        except ValueError:
            ctype = CustomerType.standard
        customer = Customer(customer_code=ref[:64], display_name=ref, customer_type=ctype, email=f"{ref.lower()}@simulated.nimbuscarta.example", is_vip=ctype == CustomerType.vip)
        db.add(customer)
        db.flush()
    cache[ref] = customer
    return customer


def _norm(value) -> str:
    if isinstance(value, bool):
        return "true" if value else "false"
    return str(value if value is not None else "").strip().lower()


def results(db: Session, run: EvaluationRun) -> dict:
    """Accuracy per field for Python and GenAI, their agreement, and every mismatch."""
    items = (
        db.query(EvaluationItem)
        .options(
            selectinload(EvaluationItem.complaint).selectinload(Complaint.validation_results),
            selectinload(EvaluationItem.complaint).selectinload(Complaint.genai_runs),
            selectinload(EvaluationItem.complaint).selectinload(Complaint.comparisons),
        )
        .filter(EvaluationItem.run_id == run.id)
        .order_by(EvaluationItem.id)
        .all()
    )
    correct = {"python": Counter(), "genai": Counter()}
    scored = {"python": Counter(), "genai": Counter()}
    by_case: dict[str, Counter] = defaultdict(Counter)
    agreement = Counter()
    rows, mismatches = [], []
    for item in items:
        complaint = item.complaint
        val = complaint.validation_results[-1] if complaint and complaint.validation_results else None
        python = (val.python_output if val else {}) or {}
        genai_run, _ = latest_genai_output(complaint) if complaint else (None, None)
        genai = (genai_run.structured_output if genai_run else {}) or {}
        cmp = complaint.comparisons[-1] if complaint and complaint.comparisons else None
        row = {
            "row": item.row_number,
            "dataset_id": item.expected.get("id"),
            "case_type": item.expected.get("case_type"),
            "complaint_id": complaint.id if complaint else None,
            "complaint_code": complaint.complaint_code if complaint else None,
            "error": item.error,
            "analyzed": bool(val),
            "verification_status": cmp.verification_status if cmp else None,
            "explanation": cmp.explanation if cmp else "",
            "policy": python.get("policy_id"),
        }
        for label, key in SCORED.items():
            expected = item.expected.get(f"expected_{label}")
            row[f"expected_{label}"] = expected
            row[f"python_{label}"] = python.get(key)
            row[f"genai_{label}"] = genai.get(key) if genai else None
            if genai and val:
                agreement[label] += _norm(genai.get(key)) == _norm(python.get(key))
            if expected in (None, "") or not val:
                continue
            for source, output in (("python", python), ("genai", genai)):
                if source == "genai" and not genai:
                    continue
                scored[source][label] += 1
                ok = _norm(output.get(key)) == _norm(expected)
                correct[source][label] += ok
                if source == "python":
                    case = item.expected.get("case_type") or "all"
                    by_case[case]["scored"] += 1
                    by_case[case]["correct"] += ok
                if not ok and source == "python":
                    mismatches.append({"row": item.row_number, "complaint_code": row["complaint_code"], "field": label, "expected": expected, "python": output.get(key), "case_type": row["case_type"]})
        rows.append(row)
    accuracy = {
        source: {label: round(100 * correct[source][label] / scored[source][label], 1) if scored[source][label] else None for label in SCORED}
        for source in ("python", "genai")
    }
    genai_rows = sum(1 for r in rows if r["genai_category"] is not None)
    return {
        "run": {
            "id": run.id, "name": run.name, "status": run.status, "total": run.total, "processed": run.processed,
            "use_genai": run.use_genai, "error": run.error, "created_at": run.created_at,
        },
        "import_errors": sum(1 for r in rows if r["error"]),
        "accuracy": accuracy,
        "labelled": {label: scored["python"][label] for label in SCORED},
        "agreement": {label: round(100 * agreement[label] / genai_rows, 1) if genai_rows else None for label in SCORED},
        "genai_rows": genai_rows,
        "by_case_type": {case: round(100 * c["correct"] / c["scored"], 1) for case, c in sorted(by_case.items()) if c["scored"]},
        "mismatches": mismatches[:300],
        "rows": rows,
    }


REPORT_COLUMNS = [
    ("complaint_code", "Complaint ID"), ("dataset_id", "Dataset ID"), ("case_type", "Case type"),
    ("expected_category", "Expected category"), ("genai_category", "GenAI category"), ("python_category", "Python category"),
    ("genai_department", "GenAI department"), ("python_department", "Python department"),
    ("genai_urgency", "GenAI urgency"), ("python_urgency", "Python urgency"),
    ("genai_escalation", "GenAI escalation"), ("python_escalation", "Python escalation"),
    ("policy", "Policy reference"), ("match", "Match/Mismatch"), ("verification_status", "Verification status"),
    ("explanation", "Explanation of disagreement"),
]


def comparison_report_rows(data: dict) -> list[dict]:
    """SRS deliverable 8: GenAI and Python comparison report."""
    out = []
    for row in data["rows"]:
        expected_ok = all(
            row.get(f"expected_{k}") in (None, "") or _norm(row.get(f"python_{k}")) == _norm(row.get(f"expected_{k}"))
            for k in ("category", "department", "urgency", "escalation")
        )
        genai_ok = row.get("genai_category") is None or all(
            _norm(row.get(f"genai_{k}")) == _norm(row.get(f"python_{k}")) for k in ("category", "department", "urgency", "escalation")
        )
        match = "Match" if expected_ok and genai_ok else "Mismatch"
        record = {title: row.get(key) for key, title in REPORT_COLUMNS if key != "match"}
        record["Match/Mismatch"] = match if row.get("analyzed") else "Not analyzed"
        if row.get("error"):
            record["Explanation of disagreement"] = row["error"]
        out.append({title: record.get(title) for _, title in REPORT_COLUMNS})
    return out
