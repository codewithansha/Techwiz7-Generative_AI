"""Run the security / adversarial test suite and write reports/security_testing_report.md.

    python scripts/security_report.py [--out reports/]

Runs tests/test_security_adversarial.py with pytest (JUnit XML) against the disposable test
database (SUPPORTNOVA_TEST_DATABASE_URL, default supportnova_test; its schema is dropped).
The attack, expected result and mitigation of each test come from ``CASES`` in the test
module, so the report cannot drift from the tests. Expected failures (xfail) are real
weaknesses and are listed under Findings.
"""

from __future__ import annotations

import argparse
import os
import subprocess
import sys
import xml.etree.ElementTree as ET
import tempfile
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TEST_FILE = "tests/test_security_adversarial.py"
DEFAULT_TEST_DB = "postgresql+psycopg://supportnova:supportnova@localhost:5432/supportnova_test"

MITIGATIONS = [
    ("Prompt-injection detection", "security/prompt_injection.py", "Regex patterns over title, description and requested resolution. A hit sets `is_adversarial`, raises the `prompt_injection` flag and sends the case to manual review (python_validation/pipeline.py)."),
    ("Untrusted-data fencing", "security/prompt_injection.py, genai_pipeline/pipeline.py, prompt_templates/complaint_intelligence.v2.*.j2", "Complaint text goes inside UNTRUSTED markers and policy excerpts inside POLICY EXCERPT markers. The system prompt says marked text is data, not instructions."),
    ("Independent ground truth", "python_validation/pipeline.py, complaint_rules/engine.py, escalation_rules/engine.py", "Category, urgency, priority, routing and escalation come only from rules. GenAI output never changes them, and a GenAI answer that misses an escalation is flagged."),
    ("Promise and hallucination checks", "hallucination_checks/detector.py", "Refund, replacement, compensation, deadline and exception language is checked against rule eligibility. Invented ids, amounts and policy references are flagged."),
    ("Policy validity", "knowledge_base/precedence.py, knowledge_base/retrieval.py", "Unknown policy ids raise `invalid_policy_id`. Superseded, draft and expired documents are never used as grounding, and customer quotes of them raise `cites_outdated_policy`."),
    ("Outbound message guard", "src/api/complaints.py (messages, messages/check)", "Agents cannot send unsupported promises or timelines (422). Only reviewers and above can override."),
    ("Authentication", "security/auth.py", "JWT HS256 with explicit `algorithms=[...]` (no alg=none), expiry, and a user lookup on every request (deactivated users rejected)."),
    ("Role-based access", "security/auth.py (StaffUser, ReviewerUser, ManagerUser, AdminUser), src/api/*", "Per-endpoint role dependencies. Configuration, users and knowledge uploads are admin-only."),
    ("Row-level access", "src/services/access.py, src/api/complaints.py::_get_visible_complaint, src/api/assistant.py", "Customers see only their own complaints and conversations. Agents see unassigned complaints or their own."),
    ("Registration hardening", "src/api/auth.py::register, src/services/intake.py", "Public sign-up always creates a standard customer. A customer-supplied customer_type is ignored."),
    ("PII masking", "security/pii.py, genai_pipeline/pipeline.py, chatbot/assistant.py", "Emails, phone numbers, card numbers (solid, spaced or dashed) and CNICs are masked before text goes to a GenAI provider."),
    ("Login throttling", "security/throttle.py, src/api/auth.py", "Five wrong passwords for one account from one client within 5 minutes lock that pair for 5 minutes (429 + Retry-After); success clears the counter."),
    ("Production secret guard", "src/main.py lifespan", "The app refuses to start with APP_ENV=production and the published development SECRET_KEY."),
    ("Upload validation", "document_processing/validate.py, config/settings.py (max_upload_mb)", "Extension allow-list, size limit, magic-byte signature check, empty-file rejection, and `safe_filename` against path traversal."),
    ("Input sanitisation", "complaint_processing/preprocess.py::sanitize_input", "Angle brackets are stripped from complaint fields and customer-facing notes before storage."),
    ("Audit trail", "security/audit.py", "Uploads, analysis, reviews, configuration changes and blocked assistant injections are written to the audit log."),
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--out", default="reports", help="Output directory (default reports/)")
    parser.add_argument("--junit", default=None, help="Keep the JUnit XML at this path (default: temporary file)")
    return parser.parse_args()


def run_pytest(xml_path: Path) -> int:
    env = dict(os.environ)
    env.setdefault("SUPPORTNOVA_TEST_DATABASE_URL", DEFAULT_TEST_DB)
    env.setdefault("PYTHONIOENCODING", "utf-8")
    cmd = [sys.executable, "-m", "pytest", "-q", TEST_FILE, f"--junitxml={xml_path}", "-o", "junit_family=xunit2", "-p", "no:cacheprovider"]
    print("running:", " ".join(cmd), flush=True)
    return subprocess.run(cmd, cwd=ROOT, env=env).returncode


def parse_junit(xml_path: Path) -> dict[str, list[dict]]:
    results: dict[str, list[dict]] = defaultdict(list)
    for case in ET.parse(xml_path).getroot().iter("testcase"):
        name = case.get("name", "")
        base, _, param = name.partition("[")
        status, message = "passed", ""
        for child in case:
            if child.tag == "skipped":
                kind = child.get("type", "")
                status = "xfailed" if "xfail" in kind.lower() or "xfail" in (child.get("message") or "").lower() else "skipped"
                message = child.get("message") or ""
            elif child.tag in ("failure", "error"):
                status = "failed" if child.tag == "failure" else "error"
                message = (child.get("message") or "").splitlines()[0][:200] if child.get("message") else ""
        results[base].append({"param": param.rstrip("]"), "status": status, "message": message, "time": float(case.get("time") or 0)})
    return results


def summarise(runs: list[dict]) -> tuple[str, str]:
    counts = Counter(r["status"] for r in runs)
    n = len(runs)
    if counts["failed"] or counts["error"]:
        verdict = "FAIL"
    elif counts["xfailed"]:
        verdict = "KNOWN WEAKNESS (xfail)"
    elif counts["skipped"] == n:
        verdict = "SKIPPED"
    else:
        verdict = "PASS"
    detail = ", ".join(f"{v} {k}" for k, v in counts.items() if v)
    return verdict, detail


def write_report(out: Path, results: dict[str, list[dict]], returncode: int) -> Path:
    sys.path.insert(0, str(ROOT))
    from tests.test_security_adversarial import CASES

    totals = defaultdict(int)
    for runs in results.values():
        for r in runs:
            totals[r["status"]] += 1
    lines = [
        "# Security testing report",
        "",
        f"Generated {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')} by `python scripts/security_report.py`, which runs",
        f"`{TEST_FILE}` (SRS Deliverable 10) through the real FastAPI app and a disposable PostgreSQL database.",
        "GenAI is replaced by a fixed answer that *obeys* each attack, to show what the validators catch. No provider was called.",
        "",
        f"**{sum(totals.values())} test runs: {totals['passed']} passed, {totals['xfailed']} expected failures (known weaknesses), "
        f"{totals['failed'] + totals['error']} failed, {totals['skipped']} skipped.** pytest exit code {returncode}.",
        "",
        "## Results",
        "",
        "| # | Test case | Attack | Expected | Actual | Result |",
        "|---|---|---|---|---|---|",
    ]
    findings = []
    for index, (name, (attack, expected, _mitigation)) in enumerate(CASES.items(), start=1):
        runs = results.get(name, [])
        if not runs:
            lines.append(f"| {index} | `{name}` | {attack} | {expected} | not run | MISSING |")
            continue
        verdict, detail = summarise(runs)
        if verdict == "PASS":
            actual = "As expected" + (f" ({detail})" if len(runs) > 1 else "")
        elif verdict.startswith("KNOWN"):
            actual = "Weakness confirmed: " + (runs[0]["message"].removeprefix("reason: ") or "see findings")
            findings.append((name, runs))
        else:
            actual = "; ".join(f"{r['param'] or 'run'}: {r['status']} {r['message']}" for r in runs if r["status"] != "passed")
        lines.append(f"| {index} | `{name}` | {attack} | {expected} | {actual.replace('|', '/')} | **{verdict}** |")
    unknown = sorted(set(results) - set(CASES))
    for name in unknown:
        verdict, detail = summarise(results[name])
        lines.append(f"| - | `{name}` | (not described in CASES) | | {detail} | **{verdict}** |")

    lines += ["", "## Findings (weaknesses confirmed by xfail tests)", ""]
    if not findings:
        lines.append("None.")
    for name, runs in findings:
        attack, expected, mitigation = CASES[name]
        lines += [
            f"### `{name}`",
            "",
            f"- **Attack:** {attack}",
            f"- **Observed:** {runs[0]['message'].removeprefix('reason: ')}",
            f"- **Where:** {mitigation}",
            f"- **Runs:** " + ", ".join(f"`{r['param'] or name}` {r['status']}" for r in runs),
            "",
        ]
    lines += ["## Mitigations in place", "", "| Control | Files | What it does |", "|---|---|---|"]
    for control, files, what in MITIGATIONS:
        lines.append(f"| {control} | {files} | {what} |")
    lines += ["", "## Per-test mitigation references", "", "| Test case | Mitigation (files) |", "|---|---|"]
    for name, (_a, _e, mitigation) in CASES.items():
        lines.append(f"| `{name}` | {mitigation} |")
    lines.append("")
    path = out / "security_testing_report.md"
    path.write_text("\n".join(lines), encoding="utf-8")
    return path


def main() -> None:
    args = parse_args()
    out = Path(args.out)
    out = out if out.is_absolute() else ROOT / out
    out.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        xml_path = Path(args.junit) if args.junit else Path(tmp) / "security_tests_junit.xml"
        code = run_pytest(xml_path)
        if not xml_path.exists():
            raise SystemExit(f"pytest produced no JUnit XML (exit code {code}).")
        results = parse_junit(xml_path)
    path = write_report(out, results, code)
    print(f"wrote {path}")
    sys.exit(0 if code == 0 else code)


if __name__ == "__main__":
    main()
