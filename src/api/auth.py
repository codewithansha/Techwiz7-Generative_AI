from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from database.models import Customer, CustomerType, User, UserRole
from database.session import get_db
from security.auth import CurrentUser, create_access_token, hash_password, verify_password
from security import throttle
from security.audit import write_audit
from src.api.schemas import LoginRequest, RegisterRequest, TokenResponse, UserOut

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


@router.post("/login", response_model=TokenResponse)
def login(request: Request, form: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = _authenticate(db, form.username, form.password, _client(request))
    return TokenResponse(access_token=create_access_token(user.email, user.role.value), role=user.role.value)


@router.post("/login-json", response_model=TokenResponse)
def login_json(request: Request, payload: LoginRequest, db: Session = Depends(get_db)):
    user = _authenticate(db, payload.email, payload.password, _client(request))
    return TokenResponse(access_token=create_access_token(user.email, user.role.value), role=user.role.value)


def _client(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def _authenticate(db: Session, email: str, password: str, client: str) -> User:
    wait = throttle.retry_after(email, client)
    if wait:
        raise HTTPException(status_code=429, detail=f"Too many failed sign-in attempts. Try again in {wait} seconds.", headers={"Retry-After": str(wait)})
    user = db.query(User).filter(User.email == email).first()
    if not user or not verify_password(password, user.hashed_password):
        throttle.record_failure(email, client)
        raise HTTPException(status_code=401, detail="Invalid email or password")
    throttle.record_success(email, client)
    return user


@router.post("/register", response_model=UserOut)
def register(payload: RegisterRequest, db: Session = Depends(get_db)):
    if db.query(User).filter(User.email == payload.email).first():
        raise HTTPException(status_code=409, detail="Email already registered")
    # Public registration is limited to customers. Staff accounts are created by administrators.
    role = UserRole.customer if payload.role != UserRole.administrator else UserRole.customer
    user = User(
        email=payload.email,
        full_name=payload.full_name,
        hashed_password=hash_password(payload.password),
        role=role,
    )
    db.add(user)
    db.flush()
    count = db.query(Customer).count() + 1
    while db.query(Customer).filter(Customer.customer_code == f"CUST-{10000 + count}").first():
        count += 1  # codes stay unique even after customers were deleted
    db.add(
        Customer(
            user_id=user.id,
            customer_code=f"CUST-{10000 + count}",
            display_name=payload.full_name,
            customer_type=CustomerType.standard,
            email=payload.email,
            is_vip=False,
        )
    )
    write_audit(db, actor_id=user.id, entity_type="user", entity_id=str(user.id), action="register")
    db.commit()
    db.refresh(user)
    return user


@router.get("/me", response_model=UserOut)
def me(user: CurrentUser):
    return user
