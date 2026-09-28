import csv
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from io import BytesIO, StringIO
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session, selectinload

from complaint_processing.sla import first_response_status, refresh_sla_risk
from database.models import Complaint, ComplaintFeedback, ComplaintStatus, Customer, Department, UserRole
from database.session import get_db
from security.auth import AdminUser, CurrentUser, ManagerUser, StaffUser
from src.services.analysis import latest_genai_output, pending_review

router = APIRouter(prefix="/api/v1", tags=["analytics"])

CLOSED = {ComplaintStatus.resolved, ComplaintStatus.closed}
REPORTS = {
    "complaints": "Complaint analysis",
    "comparison": "GenAI / Python comparison",
    "escalations": "Escalations",
    "sla": "SLA status",
    "manual_review": "Manual reviews",
    "departments": "Department performance",
    "policy_usage": "Policy usage",
    "resolution_compliance": "Resolution compliance",
}


def _all_complaints(db: Session) -> list[Complaint]:
    rows = (
        db.query(Complaint)
        .options(
            selectinload(Complaint.validation_results),
            selectinload(Complaint.comparisons),
            selectinload(Complaint.genai_runs),
            selectinload(Complaint.reviews),
            selectinload(Complaint.assigned_department),
            selectinload(Complaint.customer),
        )
        .order_by(Complaint.id)
        .all()
    )
    for row in rows:
        refresh_sla_risk(row)
    return rows


def _latest(row: Complaint) -> tuple[dict, dict, object]:
    genai_run, _ = latest_genai_output(row)
    python = row.validation_results[-1].python_output if row.validation_results else {}
    return (python or {}), (genai_run.structured_output if genai_run else {}), row.validation_results[-1] if row.validation_results else None


@router.get("/dashboards/admin")
def admin_dashboard(user: AdminUser, db: Session = Depends(get_db)):
    rows = _all_complaints(db)
    return {**_metrics(rows), **_extras(db, rows)}


@router.get("/dashboards/agent")
def agent_dashboard(user: StaffUser, db: Session = Depends(get_db)):
    rows = _all_complaints(db)
    if user.role == UserRole.agent:
        rows = [r for r in rows if r.assigned_to_id in {None, user.id}]
    open_rows = [r for r in rows if r.status not in CLOSED]
    return {
        "assigned": [_brief(r) for r in reversed(open_rows) if r.assigned_to_id == user.id],
        "queue": [_brief(r) for r in reversed(open_rows) if r.status in {ComplaintStatus.new, ComplaintStatus.analyzed, ComplaintStatus.reopened} and r.assigned_to_id is None],
        "escalation_warnings": [_brief(r) for r in reversed(open_rows) if r.status == ComplaintStatus.escalated or _latest(r)[0].get("escalation_required")],
        "sla_risks": [_brief(r) for r in reversed(open_rows) if r.sla_risk],
    }


@router.get("/dashboards/customer")
def customer_dashboard(user: CurrentUser, db: Session = Depends(get_db)):
    customer = db.query(Customer).filter(Customer.user_id == user.id).first()
    if user.role == UserRole.customer and not customer:
        return []
    query = db.query(Complaint).options(selectinload(Complaint.assigned_department))
    if user.role == UserRole.customer:
        query = query.filter(Complaint.customer_id == customer.id)
    rows = query.order_by(Complaint.id.desc()).limit(100).all()
    return [
        {
            "id": row.id,
            "complaint_code": row.complaint_code,
            "title": row.title,
            "status": row.status.value,
            "submitted_date": row.created_at,
            "department": row.assigned_department.name if row.assigned_department else None,
            "latest_update": row.latest_update,
            "resolution_status": "resolved" if row.status in CLOSED else "open",
        }
        for row in rows
    ]


@router.get("/analytics")
def analytics(user: ManagerUser, db: Session = Depends(get_db)):
    rows = _all_complaints(db)
    return {**_metrics(rows), **_extras(db, rows)}


@router.get("/analytics/trends")
def trends(user: ManagerUser, db: Session = Depends(get_db), days: int = 7):
    """Compare the latest window with the one before it to spot rising categories and escalation spikes."""
    rows = _all_complaints(db)
    now = datetime.now(timezone.utc)
    window = timedelta(days=max(1, days))
    by_day: dict[str, Counter] = defaultdict(Counter)
    escalations_by_day: Counter = Counter()
    current, previous = Counter(), Counter()
    products_current: Counter = Counter()
    for row in rows:
        created = row.created_at if row.created_at.tzinfo else row.created_at.replace(tzinfo=timezone.utc)
        python, _, _ = _latest(row)
        category = python.get("issue_category") or "Unanalyzed"
        day = created.date().isoformat()
        by_day[day][category] += 1
        if python.get("escalation_required") or row.status == ComplaintStatus.escalated:
            escalations_by_day[day] += 1
        if created >= now - window:
            current[category] += 1
            if row.product_or_service:
                products_current[(row.product_or_service, category)] += 1
        elif created >= now - 2 * window:
            previous[category] += 1
    rising = []
    for category, count in current.items():
        before = previous.get(category, 0)
        if count >= 3 and count >= 1.5 * max(before, 1):
            rising.append({"category": category, "current": count, "previous": before, "note": f"Rising {category.lower()} complaints"})
    recurring = [
        {"product": product, "category": category, "count": count, "note": "Recurring product issue"}
        for (product, category), count in products_current.most_common()
        if count >= 3
    ]
    daily_escalations = list(escalations_by_day.values())
    average = sum(daily_escalations) / len(daily_escalations) if daily_escalations else 0
    spikes = [
        {"date": day, "escalations": count, "note": "Escalation spike"}
        for day, count in sorted(escalations_by_day.items())
        if average and count >= 2 * average and count >= 3
    ]
    repeat_failures = sum(1 for r in rows if r.is_repeat and r.created_at and (r.created_at if r.created_at.tzinfo else r.created_at.replace(tzinfo=timezone.utc)) >= now - window)
    return {
        "window_days": window.days,
        "daily": {day: dict(counter) for day, counter in sorted(by_day.items())},
        "rising_categories": sorted(rising, key=lambda r: -r["current"]),
        "recurring_product_issues": recurring[:10],
        "escalation_spikes": spikes,
        "repeated_service_failures": repeat_failures,
    }


@router.get("/reports")
def list_reports(user: ManagerUser):
    return [{"key": key, "name": name} for key, name in REPORTS.items()]


@router.get("/reports/export")
def export_report(user: ManagerUser, db: Session = Depends(get_db), fmt: str = "csv", report: str = "complaints"):
    if report not in REPORTS:
        raise HTTPException(status_code=422, detail=f"Unknown report '{report}'. Use one of: {', '.join(REPORTS)}.")
    if fmt not in {"csv", "xlsx", "pdf"}:
        raise HTTPException(status_code=422, detail="fmt must be csv, xlsx or pdf")
    records = _report_rows(db, report)
    filename = f"supportnova-{report}.{fmt}"
    headers = {"Content-Disposition": f"attachment; filename={filename}"}
    columns = list(records[0].keys()) if records else ["complaint_code"]
    if fmt == "xlsx":
        buffer = _xlsx(REPORTS[report], columns, records)
        return StreamingResponse(buffer, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", headers=headers)
    if fmt == "pdf":
        return StreamingResponse(_pdf(REPORTS[report], columns, records), media_type="application/pdf", headers=headers)
    output = StringIO()
    writer = csv.DictWriter(output, fieldnames=columns)
    writer.writeheader()
    writer.writerows(records)
    return StreamingResponse(iter([output.getvalue()]), media_type="text/csv", headers=headers)


def _xlsx(title: str, columns: list[str], records: list[dict]) -> BytesIO:
    import openpyxl
    from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
    from openpyxl.utils import get_column_letter

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = title[:31].replace(":", " ").replace("/", " ")
    ws.views.sheetView[0].showGridLines = True

    generated = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    col_count = max(len(columns), 1)
    last_col_letter = get_column_letter(col_count)

    # ── Row 1: Brand Header Banner (SupportNova Deep Teal & Cyan)
    ws.merge_cells(f"A1:{last_col_letter}1")
    top_cell = ws["A1"]
    top_cell.value = "SUPPORTNOVA  ·  RESPONSEX AI INTELLIGENCE"
    top_cell.fill = PatternFill(start_color="03171D", end_color="03171D", fill_type="solid")
    top_cell.font = Font(name="Segoe UI", size=13, bold=True, color="00D6D6")
    top_cell.alignment = Alignment(horizontal="left", vertical="center", indent=1)
    ws.row_dimensions[1].height = 28

    # ── Row 2: Subtitle & Metadata
    ws.merge_cells(f"A2:{last_col_letter}2")
    sub_cell = ws["A2"]
    sub_cell.value = f"Report: {title}   |   Exported: {generated}   |   Total Records: {len(records):,}   |   Scope: Operational Audit"
    sub_cell.fill = PatternFill(start_color="072B35", end_color="072B35", fill_type="solid")
    sub_cell.font = Font(name="Segoe UI", size=9.5, bold=False, color="E2F1F5")
    sub_cell.alignment = Alignment(horizontal="left", vertical="center", indent=1)
    ws.row_dimensions[2].height = 20

    # ── Row 3: Accent Separator (Signature Cyan)
    ws.merge_cells(f"A3:{last_col_letter}3")
    sep_cell = ws["A3"]
    sep_cell.fill = PatternFill(start_color="00D6D6", end_color="00D6D6", fill_type="solid")
    ws.row_dimensions[3].height = 3.5

    # ── Row 4: Column Headers
    header_fill = PatternFill(start_color="04262E", end_color="04262E", fill_type="solid")
    header_font = Font(name="Segoe UI", size=9.5, bold=True, color="E6F8FA")
    header_border = Border(
        bottom=Side(style="medium", color="00D6D6"),
        top=Side(style="thin", color="063540"),
        left=Side(style="thin", color="063540"),
        right=Side(style="thin", color="063540"),
    )
    ws.row_dimensions[4].height = 24

    for col_idx, col in enumerate(columns, 1):
        cell = ws.cell(row=4, column=col_idx, value=col.replace("_", " ").title())
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        cell.border = header_border

    # ── Row 5+: Data Rows
    even_fill = PatternFill(start_color="FFFFFF", end_color="FFFFFF", fill_type="solid")
    odd_fill = PatternFill(start_color="F2F9FA", end_color="F2F9FA", fill_type="solid")
    data_font = Font(name="Segoe UI", size=9, color="0F172A")
    data_border = Border(
        bottom=Side(style="thin", color="DCEAEF"),
        top=Side(style="thin", color="DCEAEF"),
        left=Side(style="thin", color="DCEAEF"),
        right=Side(style="thin", color="DCEAEF"),
    )

    for r_idx, record in enumerate(records[:5000], start=5):
        ws.row_dimensions[r_idx].height = 18
        row_fill = odd_fill if r_idx % 2 == 1 else even_fill
        for c_idx, col in enumerate(columns, 1):
            val = record.get(col, "")
            val_clean = "" if val is None else val
            cell = ws.cell(row=r_idx, column=c_idx, value=val_clean)
            cell.fill = row_fill
            cell.font = data_font
            cell.border = data_border
            align_h = "center" if col in {"status", "urgency", "priority", "id", "created_at"} else "left"
            cell.alignment = Alignment(horizontal=align_h, vertical="center")

    # Column Widths
    for c_idx, col in enumerate(columns, 1):
        col_letter = get_column_letter(c_idx)
        max_len = len(col.replace("_", " "))
        for r in records[:50]:
            v_len = len(str(r.get(col, "")))
            if v_len > max_len:
                max_len = v_len
        ws.column_dimensions[col_letter].width = min(max(max_len + 4, 12), 48)

    ws.freeze_panes = "A5"
    if records:
        ws.auto_filter.ref = f"A4:{last_col_letter}{len(records) + 4}"

    buffer = BytesIO()
    wb.save(buffer)
    buffer.seek(0)
    return buffer


def _pdf(title: str, columns: list[str], records: list[dict]) -> BytesIO:
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import landscape, letter
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
    from reportlab.pdfgen import canvas
    from reportlab.platypus import Image, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

    class _ReportCanvas(canvas.Canvas):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, **kwargs)
            self._saved_page_states = []

        def showPage(self):
            self._saved_page_states.append(dict(self.__dict__))
            self._startPage()

        def save(self):
            num_pages = len(self._saved_page_states)
            for state in self._saved_page_states:
                self.__dict__.update(state)
                self.draw_page_decorations(num_pages)
                super().showPage()
            super().save()

        def draw_page_decorations(self, page_count):
            self.saveState()
            self.setStrokeColor(colors.HexColor("#00D6D6"))
            self.setLineWidth(1)
            self.line(24, 26, 792 - 24, 26)

            self.setFont("Helvetica", 7)
            self.setFillColor(colors.HexColor("#64748B"))
            self.drawString(24, 16, "SupportNova · ResponseX AI Intelligence Platform · Confidential Operational Report")
            self.drawRightString(792 - 24, 16, f"Page {self._pageNumber} of {page_count}")
            self.restoreState()

    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=landscape(letter),
        leftMargin=24,
        rightMargin=24,
        topMargin=20,
        bottomMargin=36,
    )
    styles = getSampleStyleSheet()
    content_width = 744
    generated = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")

    # Brand Logo path
    root_dir = Path(__file__).resolve().parent.parent.parent
    logo_path = root_dir / "frontend" / "public" / "logo.png"

    header_title_style = ParagraphStyle(
        "HeaderTitle",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=12,
        leading=15,
        textColor=colors.HexColor("#FFFFFF"),
    )
    header_meta_style = ParagraphStyle(
        "HeaderMeta",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=7.5,
        leading=10.5,
        alignment=2,
        textColor=colors.HexColor("#A5F3FC"),
    )

    logo_flowable = (
        Image(str(logo_path), width=28, height=28)
        if logo_path.exists()
        else Paragraph("<font color='#00D6D6' size=14><b>[SN]</b></font>", styles["Normal"])
    )

    left_block = [
        Paragraph("<font color='#00D6D6' size=13><b>SUPPORTNOVA</b></font> <font color='#67E8F9' size=8.5><b>· RESPONSEX AI INTELLIGENCE</b></font>", styles["Normal"]),
        Spacer(1, 2),
        Paragraph(f"<b>{title}</b>", header_title_style),
        Spacer(1, 1),
        Paragraph("<font color='#8AA3AA' size=7.5>OPERATIONAL AUDIT &amp; DECISION ENGINE REPORT</font>", styles["Normal"]),
    ]

    right_block = [
        Paragraph("<font color='#8AA3AA'>ENVIRONMENT: </font><font color='#00D6D6'><b>PRODUCTION AUDIT</b></font>", header_meta_style),
        Paragraph(f"<font color='#8AA3AA'>EXPORTED: </font><font color='#FFFFFF'>{generated}</font>", header_meta_style),
        Paragraph(f"<font color='#8AA3AA'>TOTAL RECORDS: </font><font color='#48E8B5'><b>{len(records):,}</b></font>", header_meta_style),
    ]

    header_table = Table([[logo_flowable, left_block, right_block]], colWidths=[36, 440, 268])
    header_table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#021419")),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("TOPPADDING", (0, 0), (-1, -1), 8),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
                ("LEFTPADDING", (0, 0), (-1, -1), 10),
                ("RIGHTPADDING", (0, 0), (-1, -1), 12),
                ("LINEBELOW", (0, -1), (-1, -1), 2.5, colors.HexColor("#00D6D6")),
            ]
        )
    )

    # ── Table Building
    cell_style = styles["BodyText"].clone("cell", fontSize=6.2, leading=7.8, textColor=colors.HexColor("#0F172A"))
    cell_center = styles["BodyText"].clone("cell_center", fontSize=6.2, leading=7.8, alignment=1, textColor=colors.HexColor("#0F172A"))
    head_style = styles["BodyText"].clone("head", fontSize=7, leading=8.5, textColor=colors.HexColor("#E6F8FA"), fontName="Helvetica-Bold", alignment=1)

    table_data = [[Paragraph(c.replace("_", " ").upper(), head_style) for c in columns]]

    # Proportional column weights
    weights = []
    for c in columns:
        clow = c.lower()
        if "id" in clow or "status" in clow or "urgency" in clow or "priority" in clow:
            weights.append(50)
        elif "date" in clow or "created" in clow or "time" in clow:
            weights.append(75)
        elif "code" in clow or "customer" in clow:
            weights.append(70)
        elif "product" in clow or "department" in clow or "category" in clow:
            weights.append(100)
        elif "desc" in clow or "title" in clow or "summary" in clow:
            weights.append(130)
        else:
            weights.append(70)

    total_w = sum(weights) or 1
    calc_widths = [(w / total_w) * content_width for w in weights]

    def format_badge(col_name: str, val_str: str) -> str:
        v = val_str.lower()
        if col_name in {"urgency", "priority", "status"}:
            if v in {"critical", "p0", "breached", "overdue", "rejected", "failed"}:
                return f"<font color='#E94F63'><b>{val_str}</b></font>"
            elif v in {"high", "p1", "in_progress", "pending", "warning"}:
                return f"<font color='#D97706'><b>{val_str}</b></font>"
            elif v in {"resolved", "closed", "met", "true", "yes"}:
                return f"<font color='#059669'><b>{val_str}</b></font>"
            elif v in {"medium", "p2", "assigned", "analyzed"}:
                return f"<font color='#00AEB5'><b>{val_str}</b></font>"
        return val_str

    for record in records[:500]:
        row_cells = []
        for c in columns:
            raw_val = str(record.get(c, "") if record.get(c) is not None else "")[:160].replace("&", "&amp;").replace("<", "&lt;")
            styled_val = format_badge(c, raw_val)
            align = cell_center if c in {"status", "urgency", "priority", "id"} else cell_style
            row_cells.append(Paragraph(styled_val, align))
        table_data.append(row_cells)

    data_table = Table(table_data, colWidths=calc_widths, repeatRows=1)
    data_table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#04262E")),
                ("LINEBELOW", (0, 0), (-1, 0), 2, colors.HexColor("#00D6D6")),
                ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#D3E5E9")),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("TOPPADDING", (0, 0), (-1, -1), 3),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
                ("LEFTPADDING", (0, 0), (-1, -1), 3.5),
                ("RIGHTPADDING", (0, 0), (-1, -1), 3.5),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.HexColor("#FFFFFF"), colors.HexColor("#F2F9FA")]),
            ]
        )
    )

    story = [
        header_table,
        Spacer(1, 8),
        data_table if records else Paragraph("No records found.", styles["Normal"]),
    ]

    doc.build(story, canvasmaker=_ReportCanvas)
    buffer.seek(0)
    return buffer


def _report_rows(db: Session, report: str) -> list[dict]:
    rows = _all_complaints(db)
    if report == "departments":
        return _department_rows(rows)
    if report == "policy_usage":
        return _policy_rows(rows)
    if report == "resolution_compliance":
        return _compliance_rows(rows)
    out = []
    for row in rows:
        python, genai, val = _latest(row)
        cmp = row.comparisons[-1] if row.comparisons else None
        base = {"complaint_code": row.complaint_code, "created_at": row.created_at.isoformat() if row.created_at else "", "status": row.status.value}
        if report == "complaints":
            out.append(
                {
                    **base,
                    "customer": row.customer.customer_code if row.customer else "",
                    "product": row.product_or_service,
                    "category": python.get("issue_category", ""),
                    "subcategory": python.get("subcategory", ""),
                    "department": python.get("department", ""),
                    "urgency": python.get("urgency", ""),
                    "priority": python.get("priority", ""),
                    "sentiment": genai.get("sentiment", ""),
                    "escalation": python.get("escalation_required", ""),
                    "sla_risk": row.sla_risk,
                    "repeat": row.is_repeat,
                    "verification_status": cmp.verification_status if cmp else "",
                    "verification_score": val.verification_score if val and (val.checks or {}).get("genai_available", True) else "",
                }
            )
        elif report == "comparison" and val:
            fields = cmp.field_comparisons if cmp else {}
            out.append(
                {
                    "complaint_code": row.complaint_code,
                    "genai_category": genai.get("issue_category", ""),
                    "python_category": python.get("issue_category", ""),
                    "genai_department": genai.get("department", ""),
                    "python_department": python.get("department", ""),
                    "genai_urgency": genai.get("urgency", ""),
                    "python_urgency": python.get("urgency", ""),
                    "genai_escalation": genai.get("escalation_required", ""),
                    "python_escalation": python.get("escalation_required", ""),
                    "genai_policy": genai.get("policy_id", ""),
                    "python_policy": python.get("policy_id", ""),
                    "match": "match" if fields and all(f.get("match") for f in fields.values()) else ("mismatch" if fields else "no GenAI output"),
                    "verification_status": cmp.verification_status if cmp else "",
                    "explanation": cmp.explanation if cmp else "",
                }
            )
        elif report == "escalations" and (python.get("escalation_required") or row.status == ComplaintStatus.escalated):
            out.append(
                {
                    **base,
                    "category": python.get("issue_category", ""),
                    "department": python.get("department", ""),
                    "level": python.get("escalation_level", ""),
                    "reasons": "; ".join(python.get("escalation_reasons") or []),
                    "genai_flagged": genai.get("escalation_required", ""),
                }
            )
        elif report == "sla" and row.sla_resolution_due:
            out.append(
                {
                    **base,
                    "priority": python.get("priority", ""),
                    "resolution_due": row.sla_resolution_due.isoformat(),
                    "at_risk": row.sla_risk,
                    "breached": row.status not in CLOSED and row.sla_resolution_due < datetime.now(timezone.utc),
                }
            )
        elif report == "manual_review" and val and val.requires_manual_review:
            review = row.reviews[-1] if row.reviews else None
            out.append(
                {
                    **base,
                    "pending": pending_review(row),
                    "reasons": "; ".join((val.checks or {}).get("review_reasons") or []),
                    "flags": ", ".join(f.get("code", "") for f in val.flags or []),
                    "reviewer_action": review.action.value if review else "",
                    "reviewer_comments": review.comments if review else "",
                }
            )
    return out


def _department_rows(rows: list[Complaint]) -> list[dict]:
    stats: dict[str, dict] = defaultdict(lambda: {"total": 0, "open": 0, "resolved": 0, "escalated": 0, "sla_risk": 0, "hours": []})
    for row in rows:
        name = row.assigned_department.name if row.assigned_department else "Unassigned"
        s = stats[name]
        s["total"] += 1
        s["resolved" if row.status in CLOSED else "open"] += 1
        s["escalated"] += row.status == ComplaintStatus.escalated
        s["sla_risk"] += bool(row.sla_risk)
        hours = _resolution_hours(row)
        if hours is not None:
            s["hours"].append(hours)
    return [
        {
            "department": name,
            "total": s["total"],
            "open": s["open"],
            "resolved": s["resolved"],
            "escalated": s["escalated"],
            "sla_risk": s["sla_risk"],
            "avg_resolution_hours": round(sum(s["hours"]) / len(s["hours"]), 1) if s["hours"] else "",
        }
        for name, s in sorted(stats.items())
    ]


def _policy_rows(rows: list[Complaint]) -> list[dict]:
    usage: Counter = Counter()
    genai_usage: Counter = Counter()
    for row in rows:
        python, genai, _ = _latest(row)
        if python.get("policy_id"):
            usage[python["policy_id"]] += 1
        if genai.get("policy_id"):
            genai_usage[genai["policy_id"]] += 1
    codes = sorted(set(usage) | set(genai_usage))
    return [{"policy": code, "rule_matrix_citations": usage.get(code, 0), "genai_citations": genai_usage.get(code, 0)} for code in codes]


def _compliance_rows(rows: list[Complaint]) -> list[dict]:
    out = []
    for row in rows:
        python, genai, val = _latest(row)
        if not val or not genai:
            continue
        codes = [f.get("code", "") for f in val.flags or []]
        out.append(
            {
                "complaint_code": row.complaint_code,
                "rule_code": python.get("rule_code", ""),
                "missing_mandatory_actions": codes.count("missing_mandatory_action"),
                "prohibited_actions": codes.count("prohibited_action"),
                "unsupported_promises": sum(c in {"guaranteed_refund", "unverified_refund_promise", "approved_refund_promise", "payment_promise", "replacement_promise", "unsupported_deadline", "unauthorized_exception", "unsupported_compensation"} for c in codes),
                "ungrounded_claims": sum(c in {"ungrounded_policy_reference", "invented_identifier", "ungrounded_amount"} for c in codes),
                "compliant": not codes,
            }
        )
    return out


def _resolution_hours(row: Complaint) -> float | None:
    if row.status not in CLOSED or not row.updated_at or not row.created_at:
        return None
    return (row.updated_at - row.created_at).total_seconds() / 3600


def _extras(db: Session, rows: list[Complaint]) -> dict:
    """CSAT, first-response SLA and a daily volume series (SRS steps 55, 64, 65)."""
    ratings = [r for (r,) in db.query(ComplaintFeedback.rating).all()]
    feedback_rows = (
        db.query(
            ComplaintFeedback.rating,
            Department.name.label("department_name"),
            Complaint.category,
            Complaint.assigned_to,
        )
        .join(Complaint, ComplaintFeedback.complaint_id == Complaint.id)
        .outerjoin(Department, Complaint.assigned_department_id == Department.id)
        .all()
    )
    dept_ratings: dict[str, list[int]] = {}
    cat_ratings: dict[str, list[int]] = {}
    agent_ratings: dict[str, list[int]] = {}
    for r, dept_name, category, agent_name in feedback_rows:
        if dept_name:
            dept_ratings.setdefault(dept_name, []).append(r)
        if category:
            cat_ratings.setdefault(category, []).append(r)
        if agent_name:
            agent_ratings.setdefault(agent_name, []).append(r)

    by_department = {k: round(sum(v) / len(v), 2) for k, v in dept_ratings.items()}
    by_category = {k: round(sum(v) / len(v), 2) for k, v in cat_ratings.items()}
    by_agent = {k: round(sum(v) / len(v), 2) for k, v in agent_ratings.items()}

    first = Counter(first_response_status(r) for r in rows)
    answered = first["met"] + first["breached"]
    today = datetime.now(timezone.utc).date()
    days = [today - timedelta(days=i) for i in range(13, -1, -1)]
    per_day = Counter(r.created_at.date() for r in rows if r.created_at)
    escalations_per_day = Counter(r.created_at.date() for r in rows if r.created_at and (r.escalation_required or r.status == ComplaintStatus.escalated))
    return {
        "csat": {
            "average": round(sum(ratings) / len(ratings), 2) if ratings else None,
            "responses": len(ratings),
            "distribution": {str(k): ratings.count(k) for k in range(1, 6)},
            "by_department": by_department,
            "by_category": by_category,
            "by_agent": by_agent,
        },
        "first_response": {
            "met": first["met"],
            "breached": first["breached"],
            "pending": first["pending"],
            "overdue": first["overdue"],
            "compliance": round(100 * first["met"] / answered, 1) if answered else None,
        },
        "daily_volume": [
            {"date": d.isoformat(), "complaints": per_day.get(d, 0), "escalations": escalations_per_day.get(d, 0)} for d in days
        ],
    }


def _metrics(rows: list[Complaint]) -> dict:
    categories, departments, priorities, urgencies, sentiments, products = (Counter() for _ in range(6))
    statuses = Counter(r.status.value for r in rows)
    mismatches = reviews = pending = escalations = repeats = sla_risks = analyzed = compared = verified = 0
    scores: list[float] = []
    hours: list[float] = []
    for row in rows:
        python, genai, val = _latest(row)
        if val:
            analyzed += 1
        # Effective classification (Python ground truth, or a reviewer's reclassification).
        categories[row.category or "Unanalyzed"] += 1
        departments[row.assigned_department.name if row.assigned_department else "Unassigned"] += 1
        priorities[row.priority or "n/a"] += 1
        urgencies[row.urgency or "n/a"] += 1
        sentiments[row.sentiment or "n/a"] += 1
        if row.product_or_service:
            products[row.product_or_service] += 1
        cmp = row.comparisons[-1] if row.comparisons else None
        if cmp and cmp.field_comparisons:
            compared += 1
            verified += cmp.verification_status == "verified"
            mismatches += bool(cmp.mismatch_count)
            if val:
                scores.append(val.verification_score)
        if val and val.requires_manual_review:
            reviews += 1
        pending += bool(row.pending_review)
        escalations += bool(row.status == ComplaintStatus.escalated or row.escalation_required)
        repeats += bool(row.is_repeat)
        sla_risks += bool(row.sla_risk)
        h = _resolution_hours(row)
        if h is not None:
            hours.append(h)
    open_with_sla = [r for r in rows if r.sla_resolution_due and r.status not in CLOSED]
    return {
        "total": len(rows),
        "analyzed": analyzed,
        "statuses": dict(statuses),
        "categories": dict(categories),
        "departments": dict(departments),
        "priorities": dict(priorities),
        "urgencies": dict(urgencies),
        "sentiments": dict(sentiments),
        "products": dict(products.most_common(10)),
        "escalations": escalations,
        "sla_risks": sla_risks,
        "genai_python_mismatches": mismatches,
        "genai_compared": compared,
        "verified_matches": verified,
        # None rather than a made-up number when nothing has been compared yet.
        "agreement_rate": round(100 * verified / compared, 1) if compared else None,
        "average_verification_score": round(sum(scores) / len(scores), 1) if scores else None,
        "sla_compliance": round(100 * (1 - sum(r.sla_risk for r in open_with_sla) / len(open_with_sla)), 1) if open_with_sla else None,
        "average_resolution_hours": round(sum(hours) / len(hours), 1) if hours else None,
        "manual_review_cases": reviews,
        "pending_reviews": pending,
        "repeat_complaints": repeats,
    }


def _brief(row: Complaint) -> dict:
    python, genai, val = _latest(row)
    return {
        "id": row.id,
        "complaint_code": row.complaint_code,
        "title": row.title,
        "status": row.status.value,
        "created_at": row.created_at,
        "category": python.get("issue_category"),
        "priority": python.get("priority"),
        "sentiment": genai.get("sentiment"),
        "genai_recommendation": genai.get("complaint_summary") or genai.get("primary_issue"),
        "validation_status": row.comparisons[-1].verification_status if row.comparisons else "pending",
        "verification_score": val.verification_score if val and (val.checks or {}).get("genai_available", True) else None,
        "escalation": python.get("escalation_required"),
        "escalation_level": python.get("escalation_level"),
        "sla_risk": row.sla_risk,
        "suggested_response": genai.get("customer_response"),
        "translated_title": getattr(row, "translated_title", None),
        "source_language": getattr(row, "source_language", "en") or "en",
    }

