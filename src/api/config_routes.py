from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database.models import (
    ComplaintCategory,
    ComplaintSubcategory,
    Department,
    EscalationLevel,
    EscalationRule,
    PriorityCode,
    ResolutionRule,
    UrgencyLevel,
)
from database.session import get_db
from security.auth import AdminUser, StaffUser
from src.api.schemas import CategoryCreate, RuleCreate

router = APIRouter(prefix="/api/v1/config", tags=["config"])


@router.get("/departments")
def list_departments(user: StaffUser, db: Session = Depends(get_db)):
    return [{"id": d.id, "code": d.code, "name": d.name} for d in db.query(Department).all()]


@router.post("/departments")
def create_department(code: str, name: str, user: AdminUser, db: Session = Depends(get_db)):
    if db.query(Department).filter(Department.code == code).first():
        raise HTTPException(status_code=409, detail="Department exists")
    row = Department(code=code, name=name)
    db.add(row)
    db.commit()
    db.refresh(row)
    return {"id": row.id, "code": row.code, "name": row.name}


@router.get("/categories")
def list_categories(user: StaffUser, db: Session = Depends(get_db)):
    rows = db.query(ComplaintCategory).all()
    return [
        {
            "id": c.id,
            "code": c.code,
            "name": c.name,
            "default_department_id": c.default_department_id,
            "subcategories": [{"code": s.code, "name": s.name, "keywords": s.keywords} for s in c.subcategories],
        }
        for c in rows
    ]


@router.post("/categories")
def create_category(payload: CategoryCreate, user: AdminUser, db: Session = Depends(get_db)):
    dept = db.query(Department).filter(Department.code == payload.default_department_code).first()
    if not dept:
        raise HTTPException(status_code=404, detail="Department not found")
    row = ComplaintCategory(code=payload.code, name=payload.name, description=payload.description, default_department_id=dept.id)
    db.add(row)
    db.flush()
    for sub in payload.subcategories:
        db.add(
            ComplaintSubcategory(
                category_id=row.id,
                code=sub["code"],
                name=sub["name"],
                keywords=sub.get("keywords") or [],
            )
        )
    db.commit()
    return {"id": row.id}


@router.get("/rules")
def list_rules(user: StaffUser, db: Session = Depends(get_db)):
    return [
        {
            "id": r.id,
            "rule_code": r.rule_code,
            "category_code": r.category_code,
            "subcategory_code": r.subcategory_code,
            "department_code": r.department_code,
            "urgency": r.urgency.value,
            "priority": r.priority.value,
            "escalation_required": r.escalation_required,
            "policy_code": r.policy_code,
            "conditions": r.conditions,
        }
        for r in db.query(ResolutionRule).all()
    ]


@router.post("/rules")
def create_rule(payload: RuleCreate, user: AdminUser, db: Session = Depends(get_db)):
    if db.query(ResolutionRule).filter(ResolutionRule.rule_code == payload.rule_code).first():
        raise HTTPException(status_code=409, detail="Rule exists")
    row = ResolutionRule(
        rule_code=payload.rule_code,
        category_code=payload.category_code,
        subcategory_code=payload.subcategory_code,
        conditions={"keywords": payload.keywords},
        department_code=payload.department_code,
        supporting_department_codes=payload.supporting_department_codes,
        urgency=UrgencyLevel(payload.urgency),
        priority=PriorityCode(payload.priority),
        policy_code=payload.policy_code,
        policy_section=payload.policy_section,
        escalation_required=payload.escalation_required,
        escalation_level=EscalationLevel(payload.escalation_level),
        required_actions=payload.required_actions,
        prohibited_actions=payload.prohibited_actions,
        follow_up_required=payload.follow_up_required,
        refund_eligible=payload.refund_eligible,
        replacement_eligible=payload.replacement_eligible,
        compensation_permitted=payload.compensation_permitted,
    )
    db.add(row)
    db.commit()
    return {"id": row.id, "rule_code": row.rule_code}


@router.get("/escalation-rules")
def list_escalation(user: StaffUser, db: Session = Depends(get_db)):
    return [
        {
            "rule_code": r.rule_code,
            "name": r.name,
            "keywords": r.keywords,
            "escalation_level": r.escalation_level.value,
            "force_urgency": r.force_urgency.value if r.force_urgency else None,
        }
        for r in db.query(EscalationRule).all()
    ]
