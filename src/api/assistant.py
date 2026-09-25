from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from chatbot.assistant import RateLimited, answer, check_rate_limit
from database.models import ChatMessage, ChatSession
from database.session import get_db
from security.audit import write_audit
from security.auth import CurrentUser

router = APIRouter(prefix="/api/v1/assistant", tags=["assistant"])


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    session_id: int | None = None
    complaint_id: int | None = None


@router.post("/chat")
def chat(payload: ChatRequest, user: CurrentUser, db: Session = Depends(get_db)):
    try:
        check_rate_limit(user.id)
    except RateLimited as exc:
        raise HTTPException(status_code=429, detail=str(exc)) from exc
    session = None
    if payload.session_id:
        session = db.query(ChatSession).filter(ChatSession.id == payload.session_id, ChatSession.user_id == user.id).first()
    if session is None:
        session = ChatSession(user_id=user.id, title=payload.message.strip()[:80] or "Conversation")
        db.add(session)
        db.flush()
    history = [{"role": m.role, "content": m.content} for m in session.messages[-10:]]
    result = answer(db, user, payload.message, history=history, complaint_id=payload.complaint_id)
    db.add(ChatMessage(session_id=session.id, role="user", content=payload.message[:2000], meta={"complaint_id": payload.complaint_id}))
    db.add(ChatMessage(session_id=session.id, role="assistant", content=result["reply"], meta={k: v for k, v in result.items() if k != "reply"}))
    if "prompt_injection" in result["flags"]:
        write_audit(db, actor_id=user.id, entity_type="assistant", entity_id=str(session.id), action="injection_blocked", details={"message": payload.message[:500]})
    db.commit()
    return {"session_id": session.id, **result}


@router.get("/sessions/{session_id}")
def get_session(session_id: int, user: CurrentUser, db: Session = Depends(get_db)):
    session = db.query(ChatSession).filter(ChatSession.id == session_id, ChatSession.user_id == user.id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return {
        "session_id": session.id,
        "messages": [{"role": m.role, "content": m.content, **(m.meta or {}), "at": m.created_at} for m in session.messages],
    }
