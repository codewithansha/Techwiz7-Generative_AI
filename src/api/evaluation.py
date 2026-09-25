import csv
from io import BytesIO, StringIO

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from database.models import EvaluationRun
from database.session import get_db
from security.audit import write_audit
from security.auth import ManagerUser
from src.services.evaluation import ImportError_, comparison_report_rows, create_run, parse_pack, results, start_run

router = APIRouter(prefix="/api/v1/evaluation", tags=["evaluation"])


@router.post("/import")
def import_pack(
    user: ManagerUser,
    db: Session = Depends(get_db),
    file: UploadFile = File(...),
    name: str = Form(""),
    use_genai: bool = Form(False),
):
    """Import a CSV/JSON complaint pack and analyze every row in the background."""
    content = file.file.read()
    if len(content) > 20 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File exceeds 20 MB.")
    try:
        rows = parse_pack(file.filename or "", content)
        run = create_run(db, name=name or file.filename or "Evaluation", rows=rows, user_id=user.id, use_genai=use_genai)
    except (ImportError_, ValueError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    write_audit(db, actor_id=user.id, entity_type="evaluation", entity_id=str(run.id), action="import", details={"rows": run.total, "use_genai": use_genai, "file": file.filename})
    db.commit()
    start_run(run.id)
    return {"id": run.id, "total": run.total, "status": run.status}


@router.get("/runs")
def list_runs(user: ManagerUser, db: Session = Depends(get_db)):
    return [
        {"id": r.id, "name": r.name, "status": r.status, "total": r.total, "processed": r.processed, "use_genai": r.use_genai, "created_at": r.created_at}
        for r in db.query(EvaluationRun).order_by(EvaluationRun.id.desc()).limit(50).all()
    ]


@router.get("/runs/{run_id}")
def get_run(run_id: int, user: ManagerUser, db: Session = Depends(get_db), include_rows: bool = False):
    run = db.get(EvaluationRun, run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Evaluation run not found")
    data = results(db, run)
    if not include_rows:
        data.pop("rows")
    return data


@router.get("/runs/{run_id}/report")
def comparison_report(run_id: int, user: ManagerUser, db: Session = Depends(get_db), fmt: str = "csv"):
    """GenAI vs Python comparison report (SRS deliverable 8) as CSV or Excel."""
    run = db.get(EvaluationRun, run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Evaluation run not found")
    records = comparison_report_rows(results(db, run))
    filename = f"comparison-report-run-{run.id}"
    if fmt == "xlsx":
        import pandas as pd

        buffer = BytesIO()
        pd.DataFrame(records).to_excel(buffer, index=False, sheet_name="comparison")
        buffer.seek(0)
        return StreamingResponse(buffer, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", headers={"Content-Disposition": f"attachment; filename={filename}.xlsx"})
    output = StringIO()
    if records:
        writer = csv.DictWriter(output, fieldnames=list(records[0].keys()))
        writer.writeheader()
        writer.writerows(records)
    return StreamingResponse(iter([output.getvalue()]), media_type="text/csv", headers={"Content-Disposition": f"attachment; filename={filename}.csv"})
