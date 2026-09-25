"""Run a labelled complaint pack through the pipelines and write the SRS comparison report.

    python scripts/run_evaluation.py sample_complaints/nimbuscarta_500.json
    python scripts/run_evaluation.py hidden_test_ready/example_hidden_pack.csv --limit 20 --out reports/
    python scripts/run_evaluation.py pack.json --genai          # also call Pipeline 1 (needs provider credit)

Uses the application's own evaluation service (src/services/evaluation.py): rows are created
through the normal intake path, analysed in file order (so repeat detection sees earlier
complaints of the same customer_ref), and scored against their expected_* labels.

GenAI (Pipeline 1) is skipped unless --genai is given. Its columns then read
"not run (no provider credit)". Nothing is invented in their place.

Writes to --out (default reports/):
  comparison_report.csv / .xlsx   SRS Deliverable 8 columns, one row per complaint
  comparison_summary.md           per-field accuracy, accuracy by case type, mismatch analysis

Database: DATABASE_URL or --database-url (default supportnova_reports). The real
``supportnova`` database is refused. --reset drops and recreates a *_reports database first.
"""

from __future__ import annotations

import argparse
import csv
import sys
import time
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import _reports_db  # noqa: E402

ROOT = _reports_db.ROOT
NOT_RUN = "not run (no provider credit)"
FIELDS = ["category", "subcategory", "department", "urgency", "priority", "escalation"]
SRS_COLUMNS = [
    "Complaint ID", "Dataset ID", "Case type", "Actual/Expected category", "GenAI category", "Python category",
    "GenAI dept", "Python dept", "GenAI urgency", "Python urgency", "GenAI escalation", "Python escalation",
    "Policy reference", "Match/Mismatch", "Verification status", "Explanation of disagreement",
]
# SRS column title -> column title produced by src.services.evaluation.comparison_report_rows
SERVICE_TITLES = {
    "Actual/Expected category": "Expected category", "GenAI dept": "GenAI department", "Python dept": "Python department",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("pack", help="Labelled pack (.json or .csv)")
    parser.add_argument("--limit", type=int, default=None, help="Only the first N rows (after --offset)")
    parser.add_argument("--offset", type=int, default=0, help="Skip the first N rows (for a held-out slice)")
    parser.add_argument("--out", default="reports", help="Output directory (default reports/)")
    parser.add_argument("--genai", action="store_true", help="Also run Pipeline 1 (GenAI); needs provider credit")
    parser.add_argument("--database-url", default=None, help="Defaults to DATABASE_URL or supportnova_reports")
    parser.add_argument("--reset", action="store_true", help="Drop and recreate the (reports/test) database first")
    parser.add_argument("--name", default=None, help="Evaluation run name")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    url = _reports_db.configure(args.database_url)
    _reports_db.prepare(reset=args.reset)

    from sqlalchemy.orm import selectinload

    from database.models import Complaint, EvaluationRun, User, UserRole
    from database.session import SessionLocal
    from src.services import evaluation as ev

    pack = Path(args.pack)
    rows = ev.parse_pack(pack.name, pack.read_bytes())
    total_in_pack = len(rows)
    rows = rows[args.offset:]
    if args.limit is not None:
        rows = rows[: args.limit]
    if not rows:
        raise SystemExit("No rows selected.")

    db = SessionLocal()
    try:
        actor = db.query(User).filter(User.role == UserRole.manager).first() or db.query(User).filter(User.role == UserRole.administrator).first()
        name = args.name or f"{pack.name} rows {args.offset + 1}-{args.offset + len(rows)} ({'GenAI+Python' if args.genai else 'Python only'})"
        run = ev.create_run(db, name=name, rows=rows, user_id=actor.id, use_genai=args.genai)
        run_id = run.id
    finally:
        db.close()

    started = time.perf_counter()
    print(f"Evaluation run {run_id}: analysing {len(rows)} complaints ({'GenAI + Python' if args.genai else 'Python only'}) ...", flush=True)
    ev._process(run_id)  # the same worker the API starts in a background thread, run inline here
    elapsed = time.perf_counter() - started

    db = SessionLocal()
    try:
        run = db.get(EvaluationRun, run_id)
        data = ev.results(db, run)
        report = ev.comparison_report_rows(data)
        ids = [r["complaint_id"] for r in data["rows"] if r["complaint_id"]]
        complaints = {
            c.id: c
            for c in db.query(Complaint).options(selectinload(Complaint.validation_results)).filter(Complaint.id.in_(ids)).all()
        }
        details = {cid: _details(c) for cid, c in complaints.items()}
    finally:
        db.close()

    out_dir = Path(args.out)
    if not out_dir.is_absolute():
        out_dir = ROOT / out_dir
    out_dir.mkdir(parents=True, exist_ok=True)
    records = build_records(data, report, details, genai_run=args.genai)
    write_csv(out_dir / "comparison_report.csv", records)
    xlsx = write_xlsx(out_dir / "comparison_report.xlsx", records)
    meta = {
        "pack": str(pack.as_posix()), "total_in_pack": total_in_pack, "offset": args.offset, "selected": len(rows),
        "database": _reports_db.db_name(url), "genai": args.genai, "elapsed": elapsed, "run": data["run"],
    }
    write_summary(out_dir / "comparison_summary.md", data, details, meta)
    acc = data["accuracy"]["python"]
    print("Python accuracy: " + ", ".join(f"{k} {acc[k]}%" for k in FIELDS))
    print(f"wrote {out_dir / 'comparison_report.csv'}" + (f", {xlsx}" if xlsx else "") + f", {out_dir / 'comparison_summary.md'} in {elapsed:.0f}s")


def _details(complaint) -> dict:
    val = complaint.validation_results[-1] if complaint.validation_results else None
    python = (val.python_output if val else {}) or {}
    return {
        "rule_code": python.get("rule_code"),
        "escalation_rules": [r.get("rule_code") for r in python.get("escalation_rules") or []],
        "secondary": [s.get("issue_category") for s in python.get("secondary_issues") or []],
        "is_repeat": bool(complaint.is_repeat),
        "related": python.get("related_complaints") or [],
        "flags": [f.get("code") for f in (val.flags if val else []) or []],
        "review_reasons": ((val.checks or {}).get("review_reasons") if val else []) or [],
        "manual_review": bool(val and val.requires_manual_review),
        "customer_type": complaint.customer_type.value,
        "complaint_code": complaint.complaint_code,
        "amounts": [r.get("amount") for r in python.get("escalation_rules") or [] if r.get("amount") is not None],
        "extracted_amounts": ((python.get("entities") or {}).get("amounts") or []),
    }


def _expected_mismatches(row: dict) -> list[str]:
    out = []
    for field in FIELDS:
        expected = row.get(f"expected_{field}")
        if expected in (None, ""):
            continue
        if _norm(row.get(f"python_{field}")) != _norm(expected):
            out.append(f"{field}: expected {_fmt(expected)}, Python {_fmt(row.get(f'python_{field}'))}")
    return out


def _norm(value) -> str:
    from src.services.evaluation import _norm as service_norm

    return service_norm(value)


def _fmt(value) -> str:
    if isinstance(value, bool):
        return "true" if value else "false"
    return "-" if value in (None, "") else str(value)


def build_records(data: dict, report: list[dict], details: dict, *, genai_run: bool) -> list[dict]:
    records = []
    for row, rec in zip(data["rows"], report):
        out = {}
        for column in SRS_COLUMNS:
            value = rec.get(SERVICE_TITLES.get(column, column))
            if column.startswith("GenAI") and value is None:
                value = NOT_RUN if not genai_run else "no output (GenAI failed)"
            out[column] = _fmt(value) if isinstance(value, bool) else (value if value is not None else "")
        d = details.get(row["complaint_id"], {})
        parts = []
        if row.get("error"):
            parts.append(f"Import rejected: {row['error']}")
        elif not genai_run:
            parts.append("GenAI not run (no provider credit); Python rule matrix is the verified result.")
        elif rec.get("Explanation of disagreement"):
            parts.append(str(rec["Explanation of disagreement"]))
        misses = _expected_mismatches(row)
        if misses:
            parts.append("Python vs expected label: " + "; ".join(misses) + ".")
        if d:
            basis = f"Basis: rule {d['rule_code'] or 'none'}"
            if d["escalation_rules"]:
                basis += f", escalation rules {', '.join(d['escalation_rules'])}"
            if d["is_repeat"]:
                basis += f", repeat of {', '.join(d['related']) or 'earlier complaint'}"
            parts.append(basis + ".")
        out["Explanation of disagreement"] = " ".join(parts)
        records.append(out)
    return records


def write_csv(path: Path, records: list[dict]) -> None:
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=SRS_COLUMNS)
        writer.writeheader()
        writer.writerows(records)


def write_xlsx(path: Path, records: list[dict]) -> Path | None:
    try:
        from openpyxl import Workbook
        from openpyxl.styles import Font, PatternFill
        from openpyxl.utils import get_column_letter
    except ImportError:
        return None
    wb = Workbook()
    ws = wb.active
    ws.title = "Comparison report"
    ws.append(SRS_COLUMNS)
    for rec in records:
        ws.append([rec[c] for c in SRS_COLUMNS])
    for cell in ws[1]:
        cell.font, cell.fill = Font(bold=True, color="FFFFFF"), PatternFill("solid", fgColor="1F4E79")
    red = PatternFill("solid", fgColor="F8D7DA")
    match_col = SRS_COLUMNS.index("Match/Mismatch") + 1
    for row in ws.iter_rows(min_row=2):
        if row[match_col - 1].value == "Mismatch":
            row[match_col - 1].fill = red
    for index, column in enumerate(SRS_COLUMNS, start=1):
        ws.column_dimensions[get_column_letter(index)].width = 70 if column.startswith("Explanation") else 18
    ws.freeze_panes = "B2"
    ws.auto_filter.ref = ws.dimensions
    wb.save(path)
    return path


def _pct(correct: int, scored: int) -> str:
    return f"{100 * correct / scored:.1f}%" if scored else "n/a"


def _code_number(code: str) -> int:
    digits = "".join(ch for ch in str(code or "") if ch.isdigit())
    return int(digits) if digits else 0


def cause_key(m: dict, d: dict) -> str:
    """Classify why the live result differs from the label, from facts recorded in the analysis."""
    field = m["field"]
    rules = d.get("escalation_rules") or []
    if field in ("escalation", "urgency", "priority"):
        later = [c for c in d.get("related") or [] if _code_number(c) > _code_number(d.get("complaint_code"))]
        if "ESC-REP-01" in rules and later:
            return "repeat_sees_later_rows"
        if "ESC-HIGH-VALUE" in rules:
            return "high_value_amount"
        if rules:
            return "other_escalation_rule"
        return "no_escalation_rule"
    if m.get("python") in (None, "", "Unclassified", "Unspecified"):
        return "no_rule_match"
    if d.get("secondary") and m["expected"] in d["secondary"]:
        return "secondary_only"
    return "different_rule"


CAUSES = {
    "repeat_sees_later_rows": "ESC-REP-01 fired because repeat detection linked this complaint to rows that come *later* in the pack. "
    "`create_run` inserts every row before `_process` analyses any, and `detect_repeat_unresolved` looks at all other open complaints "
    "of the customer, not only earlier ones. The generator (like a live, one-at-a-time intake) only counts earlier rows.",
    "high_value_amount": "ESC-HIGH-VALUE fired on an amount that is not in the complaint: `extract_metadata` read an order number "
    "followed by \", PKR\" as an amount.",
    "other_escalation_rule": "A different escalation rule fired live than in the offline labels.",
    "no_escalation_rule": "No escalation rule fired live, although the label expects escalation.",
    "no_rule_match": "No rule keyword matched live.",
    "secondary_only": "The expected category was found only as a secondary issue (primary/secondary tie-break).",
    "different_rule": "The live pipeline selected a different rule.",
}


def likely_cause(m: dict, d: dict) -> str:
    key = cause_key(m, d)
    if key == "repeat_sees_later_rows":
        later = [c for c in d.get("related") or [] if _code_number(c) > _code_number(d.get("complaint_code"))]
        return f"Linked to later row(s) {', '.join(later)} (see cause A)."
    if key == "high_value_amount":
        return f"Parsed amounts {d.get('extracted_amounts')}; threshold hit on {', '.join(f'{a:,.0f}' for a in d.get('amounts') or [])} (see cause B)."
    if key == "other_escalation_rule":
        return f"Escalation rules fired live: {', '.join(d.get('escalation_rules') or [])}."
    return CAUSES[key]


def write_summary(path: Path, data: dict, details: dict, meta: dict) -> None:
    rows = [r for r in data["rows"] if r["analyzed"]]
    acc, labelled = data["accuracy"]["python"], data["labelled"]
    by_case: dict[str, dict] = defaultdict(lambda: {"n": 0, **{f: [0, 0] for f in FIELDS}, "all": [0, 0]})
    for r in rows:
        case = r.get("case_type") or "unlabelled"
        stats = by_case[case]
        stats["n"] += 1
        row_ok = True
        for field in FIELDS:
            expected = r.get(f"expected_{field}")
            if expected in (None, ""):
                continue
            ok = _norm(r.get(f"python_{field}")) == _norm(expected)
            stats[field][0] += ok
            stats[field][1] += 1
            row_ok &= ok
        stats["all"][0] += row_ok
        stats["all"][1] += 1
    manual = sum(1 for r in rows if details.get(r["complaint_id"], {}).get("manual_review"))
    flags = Counter(f for r in rows for f in set(details.get(r["complaint_id"], {}).get("flags", [])))
    all_ok = sum(1 for r in rows if not _expected_mismatches(r))
    mismatches = [m for m in data["mismatches"]]
    code_to_row = {r["complaint_code"]: r for r in data["rows"]}

    run = meta["run"]
    lines = [
        "# GenAI vs Python comparison summary",
        "",
        f"Generated {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')} by `python scripts/run_evaluation.py {meta['pack']}"
        + (f" --offset {meta['offset']}" if meta["offset"] else "") + (" --genai" if meta["genai"] else "") + "`.",
        "",
        "| | |",
        "|---|---|",
        f"| Pack | `{meta['pack']}`: rows {meta['offset'] + 1}-{meta['offset'] + meta['selected']} of {meta['total_in_pack']} "
        + ("(the whole file)" if meta["selected"] == meta["total_in_pack"] else "(subset)") + " |",
        f"| Database | `{meta['database']}` (disposable; evaluation run #{run['id']}, status {run['status']}) |",
        f"| Complaints analysed | {len(rows)} ({data['import_errors']} rejected at intake) in {meta['elapsed']:.0f} s |",
        f"| Pipeline 1 (GenAI) | {'run' if meta['genai'] else NOT_RUN}; GenAI rows scored: {data['genai_rows']} |",
        "| Pipeline 2 (Python rules) | run on every row; this is the ground truth the app acts on |",
        f"| Sent to manual review | {manual} of {len(rows)} ({_pct(manual, len(rows))}) |",
        "",
        "## Read this first: what the accuracy figures mean",
        "",
        "The `expected_*` labels in `sample_complaints/nimbuscarta_500.json` (and the hidden-pack example) were",
        "produced by `scripts/generate_complaints.py`. It runs **the same Python pipeline** against the seeded rule",
        "matrix in memory (see `sample_complaints/README.md`). Python accuracy against these labels is therefore",
        "**not an independent measure of classification quality**. It is a consistency and regression check. It",
        "shows whether the live, database-backed pipeline (intake validation, repeat and near-duplicate detection",
        "against earlier rows, policy retrieval, configurable priority table) reproduces what the rule matrix",
        "predicts offline. A figure below 100% points to a real difference between those two paths, or to a",
        "label that is stale since the rules changed. It does not point to a modelling error.",
        "",
        "Independent accuracy needs labels written by a person who has not seen the rule output, for example the",
        "judges' hidden pack. The same script runs such a pack unchanged.",
        "",
        "GenAI accuracy and GenAI-Python agreement are **not reported**, because no GenAI provider had credit when",
        f"this report was generated. Every GenAI column in `comparison_report.csv` reads \"{NOT_RUN}\".",
        "No GenAI output was simulated.",
        "",
        "## Per-field accuracy (Python vs expected label)",
        "",
        "| Field | Python accuracy | Labelled rows | GenAI accuracy | GenAI-Python agreement |",
        "|---|---:|---:|---|---|",
    ]
    for field in FIELDS:
        genai_acc = data["accuracy"]["genai"][field]
        agree = data["agreement"][field]
        lines.append(
            f"| {field} | {acc[field] if acc[field] is not None else 'n/a'}% | {labelled[field]} | "
            f"{f'{genai_acc}%' if genai_acc is not None else NOT_RUN} | {f'{agree}%' if agree is not None else NOT_RUN} |"
        )
    lines += [
        "",
        f"All six fields correct on **{all_ok} of {len(rows)}** complaints ({_pct(all_ok, len(rows))}).",
        "",
        "## Accuracy by case type",
        "",
        "Cell = Python correct / labelled for that field. \"All\" = rows with every labelled field correct.",
        "",
        "| Case type | Rows | " + " | ".join(FIELDS) + " | All |",
        "|---|---:|" + "---:|" * (len(FIELDS) + 1),
    ]
    for case, s in sorted(by_case.items(), key=lambda kv: (kv[1]["all"][0] / max(kv[1]["all"][1], 1), kv[0])):
        cells = [f"{s[f][0]}/{s[f][1]}" if s[f][1] else "-" for f in FIELDS]
        lines.append(f"| {case} | {s['n']} | " + " | ".join(cells) + f" | {_pct(*s['all'])} |")

    lines += ["", "## Validation flags raised (rows with at least one)", "", "| Flag | Rows |", "|---|---:|"]
    for code, count in flags.most_common():
        lines.append(f"| `{code}` | {count} |")

    lines += ["", f"## Mismatches ({len(mismatches)} field-level, on {len({m['complaint_code'] for m in mismatches})} complaints)", ""]
    if not mismatches:
        lines.append("None: the live pipeline reproduced every expected label.")
    else:
        by_field = Counter(m["field"] for m in mismatches)
        by_case_type = Counter(m.get("case_type") or "unlabelled" for m in mismatches)
        lines.append("By field: " + ", ".join(f"{k} {v}" for k, v in by_field.most_common()) + ".")
        lines.append("By case type: " + ", ".join(f"{k} {v}" for k, v in by_case_type.most_common()) + ".")
        lines += [
            "",
            "| Complaint | Dataset ID | Case type | Field | Expected | Python | Live basis | Likely cause |",
            "|---|---|---|---|---|---|---|---|",
        ]
        for m in mismatches:
            row = code_to_row.get(m["complaint_code"], {})
            d = details.get(row.get("complaint_id"), {})
            basis = f"rule {d.get('rule_code') or 'none'}"
            if d.get("escalation_rules"):
                basis += "; esc " + ", ".join(d["escalation_rules"])
            if d.get("is_repeat"):
                basis += "; repeat"
            lines.append(
                f"| {m['complaint_code']} | {row.get('dataset_id') or ''} | {m.get('case_type') or ''} | {m['field']} | "
                f"{_fmt(m['expected'])} | {_fmt(m['python'])} | {basis} | {likely_cause(m, d)} |"
            )
    if mismatches:
        causes = Counter()
        for m in mismatches:
            row = code_to_row.get(m["complaint_code"], {})
            causes[(m["complaint_code"], cause_key(m, details.get(row.get("complaint_id"), {})))] += 1
        per_cause = Counter(key for _, key in causes)
        letters = {"repeat_sees_later_rows": "A", "high_value_amount": "B"}
        lines += ["", "### Analysis of the mismatches", ""]
        for key, n in per_cause.most_common():
            label = f"Cause {letters[key]}" if key in letters else "Other"
            lines.append(f"- **{label}: {n} complaint(s).** {CAUSES[key]}")
        routing_ok = not any(m["field"] in ("category", "subcategory", "department") for m in mismatches)
        missed = [m for m in mismatches if m["field"] == "escalation" and _norm(m["expected"]) == "true"]
        lines.append("")
        if routing_ok:
            lines.append("Category, subcategory and department match on every analysed row, so the rule matrix reproduced every "
                         "routing label. The mismatches are escalation, and the urgency/priority it raises. They come from the "
                         "live code paths named above, which the offline label generator does not share, and are reported as "
                         "application bugs rather than fixed here.")
        lines.append(f"Missed mandatory escalations (expected true, Python false): **{len(missed)}**."
                     + (" Every escalation mismatch over-escalates, which is the fail-safe direction." if not missed else ""))
    errors = [r for r in data["rows"] if r.get("error")]
    if errors:
        lines += ["", "## Rows rejected at intake", "", "| Row | Dataset ID | Reason |", "|---|---|---|"]
        for r in errors:
            lines.append(f"| {r['row']} | {r.get('dataset_id') or ''} | {str(r['error']).replace('|', '/')} |")
        if all("Previous complaint" in str(r["error"]) for r in errors):
            lines += [
                "",
                "These rows cite a `previous_complaint_reference` (CMP-xxxxx) that does not exist in a fresh database. The dataset",
                "generator writes placeholder codes, but live complaint codes derive from database ids, and intake correctly",
                "rejects references to unknown complaints (`tests/test_api_integration.py::test_invalid_references_are_rejected`).",
                "So the dataset cannot be imported as-is for these rows. They are excluded from every accuracy figure above.",
            ]
    lines.append("")
    path.write_text("\n".join(lines), encoding="utf-8")


if __name__ == "__main__":
    main()
