from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from database.models import CustomerType, UserRole


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class RegisterRequest(BaseModel):
    email: EmailStr
    full_name: str
    password: str = Field(min_length=8)
    role: UserRole = UserRole.customer
    customer_type: CustomerType = CustomerType.standard


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: str
    full_name: str
    role: UserRole
    is_active: bool


class ComplaintCreate(BaseModel):
    title: str
    description: str
    product_or_service: str = ""
    order_reference: str = ""
    previous_complaint_reference: str = ""
    customer_type: CustomerType = CustomerType.standard
    preferred_contact_channel: str = "email"
    requested_resolution: str = ""
    customer_code: str | None = None


class ComplaintOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    complaint_code: str
    title: str
    description: str
    status: str
    product_or_service: str
    order_reference: str
    customer_type: str
    latest_update: str
    sla_risk: bool
    is_repeat: bool
    created_at: datetime
    assigned_department_id: int | None


class AnalyzeRequest(BaseModel):
    tone: str = "professional"
    skip_genai: bool = False


class ReviewRequest(BaseModel):
    action: str
    comments: str = ""
    final_decision: dict = Field(default_factory=dict)


class StatusUpdate(BaseModel):
    status: str
    note: str = ""


class AssignRequest(BaseModel):
    agent_id: int | None = None
    department_id: int | None = None


class DocumentMeta(BaseModel):
    document_code: str
    title: str
    version: str
    category: str
    status: str = "active"
    effective_date: Optional[str] = None
    expiry_date: Optional[str] = None


class RuleCreate(BaseModel):
    rule_code: str
    category_code: str
    subcategory_code: str
    keywords: list[str] = Field(default_factory=list)
    department_code: str
    supporting_department_codes: list[str] = Field(default_factory=list)
    urgency: str
    priority: str
    policy_code: str = ""
    policy_section: str = ""
    escalation_required: bool = False
    escalation_level: str = "no_escalation"
    required_actions: list[str] = Field(default_factory=list)
    prohibited_actions: list[str] = Field(default_factory=list)
    follow_up_required: bool = True
    refund_eligible: bool | None = None
    replacement_eligible: bool | None = None
    compensation_permitted: bool = False


class CategoryCreate(BaseModel):
    code: str
    name: str
    description: str = ""
    default_department_code: str
    subcategories: list[dict] = Field(default_factory=list)
