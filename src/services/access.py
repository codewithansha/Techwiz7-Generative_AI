"""Row-level visibility of complaints, shared by the API and the assistant."""

from sqlalchemy import or_
from sqlalchemy.orm import Query, Session

from database.models import Complaint, Customer, User, UserRole


def customer_for(db: Session, user: User) -> Customer | None:
    return db.query(Customer).filter(Customer.user_id == user.id).first()


def scope_complaints(db: Session, user: User, query: Query) -> Query:
    """Customers see their own complaints; agents see unassigned ones and their own queue."""
    if user.role == UserRole.customer:
        customer = customer_for(db, user)
        return query.filter(Complaint.customer_id == (customer.id if customer else -1))
    if user.role == UserRole.agent:
        return query.filter(or_(Complaint.assigned_to_id == user.id, Complaint.assigned_to_id.is_(None)))
    return query


def visibility_error(db: Session, user: User, complaint: Complaint) -> str | None:
    """None when the user may see the complaint, otherwise the reason they may not."""
    if user.role == UserRole.customer:
        customer = customer_for(db, user)
        if not customer or complaint.customer_id != customer.id:
            return "Not allowed"
    elif user.role == UserRole.agent and complaint.assigned_to_id not in (None, user.id):
        return "This complaint is assigned to another agent."
    return None
