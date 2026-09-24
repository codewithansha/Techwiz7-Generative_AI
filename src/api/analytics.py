from collections import Counter, defaultdict
from io import BytesIO, StringIO

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session, joinedload

from database.models import Complaint, ComplaintStatus, Customer, UserRole
from database.session import get_db
from security.auth import AdminUser, CurrentUser, ManagerUser, StaffUser

router = APIRouter(prefix="/api/v1", tags=["analytics"])


def _all_complaints(db: Session) -> list[Complaint]:
    return (
        db.query(Complaint)
        .options(joinedload(Complaint.validation_results), joinedload(Complaint.comparisons), joinedload(Complaint.genai_runs))
        .all()
    )


@router.get("/dashboards/admin")
def admin_dashboard(user: AdminUser, db: Session = Depends(get_db)):
    rows = _all_complaints(db)
    return _metrics(rows)


@router.get("/dashboards/agent")
def agent_dashboard(user: StaffUser, db: Session = Depends(get_db)):
    rows = _all_complaints(db)
    if user.role == UserRole.agent:
        rows = [r for r in rows if r.assigned_to_id in {None, user.id}]
    return {
        "assigned": [ _brief(r) for r in rows if r.assigned_to_id == user.id],
        "queue": [_brief(r) for r in rows if r.status in {ComplaintStatus.new, ComplaintStatus.analyzed}],
        "escalation_warnings": [_brief(r) for r in rows if r.status == ComplaintStatus.escalated],
    }


@router.get("/dashboards/customer")
def customer_dashboard(user: CurrentUser, db: Session = Depends(get_db)):
    customer = db.query(Customer).filter(Customer.user_id == user.id).first()
    if user.role == UserRole.customer and not customer:
        return []
    query = db.query(Complaint)
    if user.role == UserRole.customer:
        query = query.filter(Complaint.customer_id == customer.id)
    rows = query.order_by(Complaint.id.desc()).limit(100).all()
    return [
        {
            "complaint_code": row.complaint_code,
            "status": row.status.value,
            "submitted_date": row.created_at,
            "department_id": row.assigned_department_id,
            "latest_update": row.latest_update,
            "resolution_status": row.status.value,
        }
        for row in rows
    ]


@router.get("/analytics")
def analytics(user: ManagerUser, db: Session = Depends(get_db)):
    return _metrics(_all_complaints(db))


@router.get("/analytics/trends")
def trends(user: ManagerUser, db: Session = Depends(get_db)):
    rows = _all_complaints(db)
    by_day = defaultdict(Counter)
    for row in rows:
        day = (row.created_at.date().isoformat() if row.created_at else "unknown")
        category = (row.validation_results[-1].python_output.get("issue_category") if row.validation_results else "unanalyzed")
        by_day[day][category] += 1
    spikes = []
    category_totals = Counter()
    for day, counter in by_day.items():
        category_totals.update(counter)
    average = (sum(category_totals.values()) / max(len(category_totals), 1))
    for category, total in category_totals.items():
        if total > average * 1.5:
            spikes.append({"category": category, "count": total, "note": "Above average volume"})
    return {"daily": {day: dict(counter) for day, counter in by_day.items()}, "spikes": spikes}


@router.get("/reports/export")
def export_report(user: ManagerUser, db: Session = Depends(get_db), fmt: str = "csv"):
    rows = _all_complaints(db)
    records = [_row(r) for r in rows]
    if fmt == "xlsx":
        import pandas as pd

        buffer = BytesIO()
        pd.DataFrame(records).to_excel(buffer, index=False)
        buffer.seek(0)
        return StreamingResponse(
            buffer,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": "attachment; filename=supportnova-report.xlsx"},
        )
    if fmt == "pdf":
        from reportlab.lib.pagesizes import letter
        from reportlab.pdfgen import canvas

        buffer = BytesIO()
        pdf = canvas.Canvas(buffer, pagesize=letter)
        pdf.drawString(40, 750, "SupportNova Complaint Intelligence Report")
        y = 720
        for record in records[:40]:
            pdf.drawString(40, y, f"{record['complaint_code']} {record['status']} {record['category']} {record['verification_status']}")
            y -= 16
            if y < 40:
                pdf.showPage()
                y = 750
        pdf.save()
        buffer.seek(0)
        return StreamingResponse(buffer, media_type="application/pdf", headers={"Content-Disposition": "attachment; filename=supportnova-report.pdf"})
    import csv

    output = StringIO()
    writer = csv.DictWriter(output, fieldnames=list(records[0].keys()) if records else ["complaint_code"])
    writer.writeheader()
    for record in records:
        writer.writerow(record)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=supportnova-report.csv"},
    )


def _metrics(rows: list[Complaint]) -> dict:
    categories = Counter()
    departments = Counter()
    priorities = Counter()
    sentiments = Counter()
    statuses = Counter(r.status.value for r in rows)
    mismatches = 0
    reviews = 0
    escalations = 0
    repeats = 0
    sla_risks = 0
    for row in rows:
        python = row.validation_results[-1].python_output if row.validation_results else {}
        genai = row.genai_runs[-1].structured_output if row.genai_runs else {}
        categories[python.get("issue_category") or "unanalyzed"] += 1
        departments[python.get("department") or "unassigned"] += 1
        priorities[python.get("priority") or "n/a"] += 1
        sentiments[genai.get("sentiment") or "n/a"] += 1
        if row.comparisons and row.comparisons[-1].mismatch_count:
            mismatches += 1
        if row.validation_results and row.validation_results[-1].requires_manual_review:
            reviews += 1
        if row.status == ComplaintStatus.escalated or python.get("escalation_required"):
            escalations += 1
        if row.is_repeat:
            repeats += 1
        if row.sla_risk:
            sla_risks += 1
    return {
        "total": len(rows),
        "statuses": dict(statuses),
        "categories": dict(categories),
        "departments": dict(departments),
        "priorities": dict(priorities),
        "sentiments": dict(sentiments),
        "escalations": escalations,
        "sla_risks": sla_risks,
        "genai_python_mismatches": mismatches,
        "manual_review_cases": reviews,
        "repeat_complaints": repeats,
    }


def _brief(row: Complaint) -> dict:
    python = row.validation_results[-1].python_output if row.validation_results else {}
    genai = row.genai_runs[-1].structured_output if row.genai_runs else {}
    return {
        "id": row.id,
        "complaint_code": row.complaint_code,
        "title": row.title,
        "status": row.status.value,
        "category": python.get("issue_category"),
        "priority": python.get("priority"),
        "sentiment": genai.get("sentiment"),
        "validation_status": row.comparisons[-1].verification_status if row.comparisons else "pending",
        "escalation": python.get("escalation_required"),
        "suggested_response": (genai or {}).get("customer_response"),
    }


def _row(row: Complaint) -> dict:
    python = row.validation_results[-1].python_output if row.validation_results else {}
    genai = row.genai_runs[-1].structured_output if row.genai_runs else {}
    cmp = row.comparisons[-1] if row.comparisons else None
    return {
        "complaint_code": row.complaint_code,
        "status": row.status.value,
        "category": python.get("issue_category"),
        "genai_category": genai.get("issue_category"),
        "department": python.get("department"),
        "genai_department": genai.get("department"),
        "urgency": python.get("urgency"),
        "genai_urgency": genai.get("urgency"),
        "escalation": python.get("escalation_required"),
        "policy": python.get("policy_id"),
        "verification_status": cmp.verification_status if cmp else "",
        "score": row.validation_results[-1].verification_score if row.validation_results else "",
    }
