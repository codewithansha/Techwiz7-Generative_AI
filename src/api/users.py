from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database.models import User
from database.session import get_db
from security.auth import AdminUser, hash_password
from src.api.schemas import RegisterRequest, UserOut

router = APIRouter(prefix="/api/v1/users", tags=["users"])


@router.get("", response_model=list[UserOut])
def list_users(user: AdminUser, db: Session = Depends(get_db)):
    return db.query(User).all()


@router.post("", response_model=UserOut)
def create_staff(payload: RegisterRequest, user: AdminUser, db: Session = Depends(get_db)):
    if db.query(User).filter(User.email == payload.email).first():
        raise HTTPException(status_code=409, detail="Email exists")
    row = User(
        email=payload.email,
        full_name=payload.full_name,
        hashed_password=hash_password(payload.password),
        role=payload.role,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.patch("/{user_id}/active")
def set_active(user_id: int, is_active: bool, user: AdminUser, db: Session = Depends(get_db)):
    row = db.query(User).filter(User.id == user_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="User not found")
    row.is_active = is_active
    db.commit()
    return UserOut.model_validate(row)
