"""Complaint intelligence report from an evaluated database.

    python scripts/run_evaluation.py sample_complaints/nimbuscarta_500.json --reset   # fills supportnova_reports
    python scripts/complaint_intelligence_report.py [--out reports/] [--database-url ...]

Writes reports/complaint_intelligence_report.md and .xlsx (one sheet per table). Numbers come
from the same helpers the dashboards and exports use (src/api/analytics.py: _all_complaints,
_metrics, _extras, _report_rows, _policy_rows, _department_rows), so the report matches the UI.

Sentiment is the Python lexicon estimate (python_validation/sentiment.py) when GenAI did not
run. It describes tone only and is never used for urgency.
"""

from __future__ import annotations

import argparse
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import _reports_db  # noqa: E402

ROOT = _reports_db.ROOT
URGENCY_ORDER = ["critical", "high", "medium", "low"]
PRIORITY_ORDER = ["P0", "P1", "P2", "P3"]
SENTIMENT_ORDER = ["strongly_negative", "negative", "neutral", "positive"]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--out", default="reports", help="Output directory (default reports/)")
    parser.add_argument("--database-url", default=None, help="Defaults to DATABASE_URL or supportnova_reports")
    return parser.parse_args()


def pct(n: int, total: int) -> str:
    return f"{100 * n / total:.1f}%" if total else "n/a"


def ordered(counter: dict, order: list[str] | None = None) -> list[tuple[str, int]]:
    items = list(counter.items())
    if order:
        rank = {k: i for i, k in enumerate(order)}
        return sorted(items, key=lambda kv: (rank.get(kv[0], len(order)), kv[0]))
    return sorted(items, key=lambda kv: (-kv[1], kv[0]))


def collect(db) -> dict:
    from database.models import ComplaintStatus
    from src.api import analytics as an

    rows = an._all_complaints(db)
    analyzed = [r for r in rows if r.validation_results]
    metrics = an._metrics(rows)
    extras = an._extras(db, rows)

    escalation_levels, escalation_rules, escalation_reasons = Counter(), Counter(), Counter()
    review_reasons, flags, customer_types, channels, sentiment_by_category = Counter(), Counter(), Counter(), Counter(), {}
    repeat_by_category, genai_runs = Counter(), 0
    for row in analyzed:
        python, genai, val = an._latest(row)
        genai_runs += bool(genai)
        customer_types[row.customer_type.value] += 1
        channels[row.channel.value] += 1
        if python.get("escalation_required"):
            escalation_levels[python.get("escalation_level") or "unspecified"] += 1
            for rule in python.get("escalation_rules") or []:
                escalation_rules[f"{rule.get('rule_code')}: {rule.get('name')}"] += 1
            if not python.get("escalation_rules"):
                escalation_rules[f"{python.get('rule_code')}: rule-matrix mandated"] += 1
            for reason in python.get("escalation_reasons") or []:
                if reason.startswith("Disputed amount"):
                    reason = "Disputed amount meets the high-value threshold (amount rule)."
                escalation_reasons[reason] += 1
        if val and val.requires_manual_review:
            for reason in (val.checks or {}).get("review_reasons") or []:
                review_reasons[reason] += 1
        for code in {f.get("code") for f in (val.flags if val else []) or []}:
            flags[code] += 1
        sentiment_by_category.setdefault(row.category or "Unanalyzed", Counter())[row.sentiment or "n/a"] += 1
        if row.is_repeat:
            repeat_by_category[row.category or "Unanalyzed"] += 1

    sla_rows = an._report_rows(db, "sla")
    sla_by_priority: dict[str, Counter] = {}
    for r in sla_rows:
        c = sla_by_priority.setdefault(r["priority"] or "n/a", Counter())
        c["with_sla"] += 1
        c["at_risk"] += bool(r["at_risk"])
        c["breached"] += bool(r["breached"])
    open_count = sum(1 for r in rows if r.status not in an.CLOSED)
    return {
        "rows": rows,
        "analyzed": analyzed,
        "metrics": metrics,
        "extras": extras,
        "genai_runs": genai_runs,
        "escalation_levels": escalation_levels,
        "escalation_rules": escalation_rules,
        "escalation_reasons": escalation_reasons,
        "review_reasons": review_reasons,
        "flags": flags,
        "customer_types": customer_types,
        "channels": channels,
        "sentiment_by_category": sentiment_by_category,
        "repeat_by_category": repeat_by_category,
        "sla_by_priority": sla_by_priority,
        "sla_rows": sla_rows,
        "open_count": open_count,
        "escalated_status": sum(1 for r in rows if r.status == ComplaintStatus.escalated),
        "policy_rows": an._policy_rows(rows),
        "department_rows": an._department_rows(rows),
        "manual_rows": an._report_rows(db, "manual_review"),
    }


def build(data: dict, database: str) -> tuple[str, dict[str, list[list]]]:
    m, total = data["metrics"], len(data["analyzed"])
    sheets: dict[str, list[list]] = {}
    lines = [
        "# Complaint intelligence report",
        "",
        f"Generated {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')} by `python scripts/complaint_intelligence_report.py` "
        f"from database `{database}`.",
        "",
        "| | |",
        "|---|---|",
        f"| Complaints in database | {m['total']} |",
        f"| Analysed (Python rule matrix) | {m['analyzed']} |",
        f"| With GenAI output | {data['genai_runs']} (GenAI not run: no provider credit)" + " |",
        f"| Mandatory escalations | {m['escalations']} ({pct(m['escalations'], total)}) |",
        f"| Sent to manual review | {m['manual_review_cases']} ({pct(m['manual_review_cases'], total)}); pending {m['pending_reviews']} |",
        f"| Repeat complaints | {m['repeat_complaints']} ({pct(m['repeat_complaints'], total)}) |",
        f"| Open with SLA at risk | {m['sla_risks']} of {data['open_count']} open |",
        "",
        "All classification, routing, urgency, priority and escalation figures come from Pipeline 2 (Python rules), which",
        "is the ground truth. If this database was filled by `scripts/run_evaluation.py`, it holds the labelled synthetic",
        "NimbusCarta dataset. The distributions then describe that dataset's mix of SRS case types, not real",
        "customer traffic.",
        "",
    ]

    def table(title: str, counter: dict, *, order=None, label="Value", note: str = "", sheet: str | None = None, denom: int | None = None):
        denom = denom if denom is not None else total
        lines.extend([f"## {title}", ""])
        if note:
            lines.extend([note, ""])
        lines.extend([f"| {label} | Complaints | Share |", "|---|---:|---:|"])
        rows = ordered(counter, order)
        for key, n in rows:
            lines.append(f"| {str(key).replace('|', '/')} | {n} | {pct(n, denom)} |")
        if not rows:
            lines.append("| (none) | 0 | |")
        lines.append("")
        sheets[sheet or title[:31]] = [[label, "Complaints", "Share"]] + [[k, n, round(100 * n / denom, 1) if denom else None] for k, n in rows]

    table("Category", m["categories"], label="Category", sheet="Category")
    lines.extend(["## Department", "", "| Department | Total | Open | Resolved | Escalated (status) | SLA at risk | Avg resolution h |", "|---|---:|---:|---:|---:|---:|---:|"])
    for d in data["department_rows"]:
        lines.append(f"| {d['department']} | {d['total']} | {d['open']} | {d['resolved']} | {d['escalated']} | {d['sla_risk']} | {d['avg_resolution_hours'] or '-'} |")
    lines.append("")
    sheets["Department"] = [["Department", "Total", "Open", "Resolved", "Escalated", "SLA at risk", "Avg resolution h"]] + [
        [d["department"], d["total"], d["open"], d["resolved"], d["escalated"], d["sla_risk"], d["avg_resolution_hours"]] for d in data["department_rows"]
    ]
    table("Urgency", m["urgencies"], order=URGENCY_ORDER, label="Urgency", sheet="Urgency",
          note="From the rule matrix, raised by escalation rules. Sentiment never sets urgency.")
    table("Priority", m["priorities"], order=PRIORITY_ORDER, label="Priority", sheet="Priority",
          note="Urgency -> priority table. Never below the rule's own priority; VIP/enterprise at least P2.")
    table("Sentiment (Python lexicon estimate)", m["sentiments"], order=SENTIMENT_ORDER, label="Sentiment", sheet="Sentiment",
          note="`python_validation/sentiment.py` word-list estimate of tone, used because GenAI did not run. It describes tone only. "
               "Polite openers and sign-offs (\"thank you for your help\") count as positive words, so some complaints read as positive.")

    cats = sorted(data["sentiment_by_category"])
    lines.extend(["### Sentiment by category", "", "| Category | " + " | ".join(SENTIMENT_ORDER) + " |", "|---|" + "---:|" * len(SENTIMENT_ORDER)])
    for cat in cats:
        c = data["sentiment_by_category"][cat]
        lines.append(f"| {cat} | " + " | ".join(str(c.get(s, 0)) for s in SENTIMENT_ORDER) + " |")
    lines.append("")
    sheets["Sentiment by category"] = [["Category", *SENTIMENT_ORDER]] + [[cat, *[data["sentiment_by_category"][cat].get(s, 0) for s in SENTIMENT_ORDER]] for cat in cats]

    esc_total = sum(data["escalation_levels"].values())
    table("Escalation level", data["escalation_levels"], label="Level", sheet="Escalation level", denom=esc_total,
          note=f"{esc_total} complaints with mandatory escalation. Share is of escalated complaints.")
    table("Escalation triggers (rules fired)", data["escalation_rules"], label="Rule", sheet="Escalation rules", denom=esc_total,
          note="A complaint can fire several rules. Share is of escalated complaints.")
    table("Escalation reasons", data["escalation_reasons"], label="Reason", sheet="Escalation reasons", denom=esc_total)

    lines.extend(["## SLA risk and breach", ""])
    fr = data["extras"]["first_response"]
    lines.extend([
        f"Resolution SLA: {len(data['sla_rows'])} complaints have a resolution due date. "
        f"{sum(1 for r in data['sla_rows'] if r['at_risk'])} are at risk and {sum(1 for r in data['sla_rows'] if r['breached'])} are breached. "
        f"SLA compliance on open complaints: {m['sla_compliance'] if m['sla_compliance'] is not None else 'n/a'}%. "
        f"First response: met {fr['met']}, breached {fr['breached']}, pending {fr['pending']}, overdue {fr['overdue']}.",
        "",
        "| Priority | With SLA | At risk | Breached |",
        "|---|---:|---:|---:|",
    ])
    for p, c in ordered(data["sla_by_priority"], PRIORITY_ORDER):
        lines.append(f"| {p} | {c['with_sla']} | {c['at_risk']} | {c['breached']} |")
    lines.extend([
        "",
        "SLA clocks start when a complaint is created. Complaints loaded by a batch import all start at import time, so",
        "risk and breach counts reflect how long ago the import ran. They say nothing about real handling times.",
        "",
    ])
    sheets["SLA"] = [["Priority", "With SLA", "At risk", "Breached"]] + [[p, c["with_sla"], c["at_risk"], c["breached"]] for p, c in ordered(data["sla_by_priority"], PRIORITY_ORDER)]

    lines.extend(["## Policy citations used", "", "| Policy | Rule-matrix citations | GenAI citations |", "|---|---:|---:|"])
    for p in sorted(data["policy_rows"], key=lambda r: -r["rule_matrix_citations"]):
        lines.append(f"| {p['policy']} | {p['rule_matrix_citations']} | {p['genai_citations']} |")
    uncited = total - sum(p["rule_matrix_citations"] for p in data["policy_rows"])
    lines.extend(["", f"{uncited} analysed complaints cite no policy (no rule matched, or the category has no rule yet).", ""])
    sheets["Policy citations"] = [["Policy", "Rule-matrix citations", "GenAI citations"]] + [[p["policy"], p["rule_matrix_citations"], p["genai_citations"]] for p in data["policy_rows"]]

    table("Manual review reasons", data["review_reasons"], label="Reason", sheet="Manual review reasons", denom=m["manual_review_cases"],
          note=f"{m['manual_review_cases']} complaints need a human. A complaint can have several reasons; share is of manual-review complaints.")
    table("Validation flags", data["flags"], label="Flag", sheet="Validation flags", note="Complaints with at least one flag of each kind.")

    lines.extend(["## Repeat complaints", "", f"{m['repeat_complaints']} complaints are linked to an earlier or concurrent open complaint of the same customer.", ""])
    table("Repeat complaints by category", data["repeat_by_category"], label="Category", sheet="Repeats by category", denom=m["repeat_complaints"])
    table("Top products", m["products"], label="Product or service", sheet="Top products", note="Ten most frequent products or services.")
    table("Customer type", data["customer_types"], label="Customer type", sheet="Customer type")
    table("Channel", data["channels"], label="Channel", sheet="Channel")
    table("Status", m["statuses"], label="Status", sheet="Status")
    return "\n".join(lines), sheets


def write_xlsx(path: Path, sheets: dict[str, list[list]]) -> Path | None:
    try:
        from openpyxl import Workbook
        from openpyxl.styles import Font, PatternFill
    except ImportError:
        return None
    wb = Workbook()
    wb.remove(wb.active)
    for name, rows in sheets.items():
        ws = wb.create_sheet(name[:31])
        for row in rows:
            ws.append(row)
        for cell in ws[1]:
            cell.font, cell.fill = Font(bold=True, color="FFFFFF"), PatternFill("solid", fgColor="1F4E79")
        ws.column_dimensions["A"].width = 60
    wb.save(path)
    return path


def main() -> None:
    args = parse_args()
    url = _reports_db.configure(args.database_url)
    _reports_db.prepare(reset=False)
    from database.session import SessionLocal

    db = SessionLocal()
    try:
        data = collect(db)
        if not data["analyzed"]:
            raise SystemExit("No analysed complaints in this database. Run scripts/run_evaluation.py first.")
        text, sheets = build(data, _reports_db.db_name(url))
    finally:
        db.close()
    out = Path(args.out)
    out = out if out.is_absolute() else ROOT / out
    out.mkdir(parents=True, exist_ok=True)
    (out / "complaint_intelligence_report.md").write_text(text + "\n", encoding="utf-8")
    xlsx = write_xlsx(out / "complaint_intelligence_report.xlsx", sheets)
    print(f"wrote {out / 'complaint_intelligence_report.md'}" + (f", {xlsx}" if xlsx else ""))


if __name__ == "__main__":
    main()
