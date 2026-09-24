from sqlalchemy.orm import Session

from complaint_rules.engine import classify_from_rules
from database.models import Department


def recommend_departments(db: Session, text: str, python_result: dict | None = None) -> dict:
    result = python_result or classify_from_rules(db, text)
    primary_code = result.get("department")
    department = db.query(Department).filter(Department.code == primary_code).first()
    if not department:
        department = db.query(Department).filter(Department.name == primary_code).first()
    return {
        "primary_department": department.name if department else primary_code,
        "primary_code": department.code if department else primary_code,
        "supporting_departments": result.get("supporting_departments") or [],
    }
