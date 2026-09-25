from datetime import date, datetime
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
    channel: str = "web"
    incident_date: date | None = None


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


class CustomerDecision(BaseModel):
    action: str  # "confirm" closes a resolved complaint, "reopen" says the fix did not work
    comment: str = ""
    rating: int | None = Field(default=None, ge=1, le=5)  # CSAT, only with "confirm"


class MessageCreate(BaseModel):
    body: str = Field(min_length=1, max_length=5000)
    internal: bool = False
    source: str = "agent"  # agent | genai_draft
    override: bool = False  # send despite validation flags (reviewer and above only)
    request_information: bool = False  # also move the case to awaiting_customer


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


class DepartmentCreate(BaseModel):
    code: str = Field(min_length=2, max_length=32)
    name: str = Field(min_length=2, max_length=128)
    description: str = ""


class SubcategoryCreate(BaseModel):
    code: str = Field(min_length=2, max_length=64)
    name: str = Field(min_length=2, max_length=128)
    keywords: list[str] = Field(default_factory=list)


class EscalationRuleCreate(BaseModel):
    rule_code: str = Field(min_length=3, max_length=64)
    name: str
    keywords: list[str] = Field(default_factory=list)
    categories: list[str] = Field(default_factory=list)
    customer_types: list[str] = Field(default_factory=list)
    min_repeat_count: int = Field(default=0, ge=0)
    escalation_level: str
    reason: str
    force_urgency: str | None = None


class EscalationRuleUpdate(BaseModel):
    keywords: list[str] | None = None
    categories: list[str] | None = None
    min_repeat_count: int | None = Field(default=None, ge=0)
    escalation_level: str | None = None
    force_urgency: str | None = None
    is_active: bool | None = None


class ActiveToggle(BaseModel):
    is_active: bool


class SlaUpdate(BaseModel):
    first_response_minutes: int = Field(gt=0)
    resolution_hours: int = Field(gt=0)


class PriorityRuleUpdate(BaseModel):
    priority: str


class ThresholdUpdate(BaseModel):
    value: float


class RuleUpdate(BaseModel):
    """Every field optional: only what is sent changes."""

    keywords: list[str] | None = None
    department_code: str | None = None
    supporting_department_codes: list[str] | None = None
    urgency: str | None = None
    priority: str | None = None
    policy_code: str | None = None
    policy_section: str | None = None
    escalation_required: bool | None = None
    escalation_level: str | None = None
    required_actions: list[str] | None = None
    prohibited_actions: list[str] | None = None
    follow_up_required: bool | None = None
    refund_eligible: bool | None = None
    replacement_eligible: bool | None = None
    compensation_permitted: bool | None = None
