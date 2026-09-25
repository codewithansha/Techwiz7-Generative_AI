"""Nova, the SupportNova assistant.

A deterministic intent router decides WHAT to answer and which data the user may see;
GenAI (when available) only phrases grounded policy answers. Every GenAI answer passes
the same promise and hallucination guards as Pipeline 1, and falls back to an extractive
answer built from the approved policy text when GenAI is unavailable or unsafe.
"""

from __future__ import annotations

import re
import time
from collections import defaultdict, deque
from dataclasses import dataclass, field
from datetime import datetime, timezone

from rapidfuzz import fuzz
from sqlalchemy.orm import Session, selectinload

from complaint_processing.preprocess import sanitize_input
from complaint_processing.sla import refresh_sla_risk
from complaint_rules.engine import UNCLASSIFIED, classify_from_rules
from database.models import Complaint, ComplaintStatus, User, UserRole
from genai_pipeline.client import GenAIError, generate_json
from hallucination_checks.detector import detect_hallucinations, detect_unsupported_promises
from knowledge_base.precedence import PRECEDENCE
from knowledge_base.retrieval import retrieve_policy_chunks
from prompt_templates.loader import render_named
from security.pii import mask_pii
from security.prompt_injection import detect_prompt_injection, wrap_untrusted_complaint, wrap_untrusted_policy
from src.services.access import scope_complaints, visibility_error
from src.services.analysis import pending_review, serialize_complaint
from src.services.messaging import reply_flags

ASSISTANT_PROMPT = ("assistant", "v1")
CODE = re.compile(r"\bCMP-\d{5,}\b", re.I)
ORDER = re.compile(r"\bNC-\d{6,}\b", re.I)
STAFF = {UserRole.agent, UserRole.reviewer, UserRole.manager, UserRole.administrator}
CLOSED = {ComplaintStatus.resolved, ComplaintStatus.closed}
PROBLEM_WORDS = re.compile(
    r"\b(broken|damaged|cracked|not working|stopped working|doesn'?t work|faulty|defect|refund|charged|overcharged|"
    r"late|delayed|never arrived|not arrived|missing|lost|wrong item|hacked|locked out|leak|rude|overheat\w*|"
    r"smoke|sparks?|burning|shock|complain\w*|problem|issue|cancel\w*|warranty|personal data|privacy|"
    r"data (breach|leak)|(emailed|shared|leaked|exposed) my)\b",
    re.I,
)
# Internal documents (routing rules, SOPs, escalation procedures, templates) are for staff only.
CUSTOMER_DOC_CATEGORIES = {"policy", "faq", "sla", "compliance"}
RATE_LIMIT = (30, 300)  # messages per window (seconds) per user
_recent: dict[int, deque] = defaultdict(deque)


@dataclass
class Reply:
    text: str
    intent: str
    source: str = "system"  # system | knowledge_base | genai
    citations: list[dict] = field(default_factory=list)
    actions: list[dict] = field(default_factory=list)
    complaints: list[dict] = field(default_factory=list)
    flags: list[str] = field(default_factory=list)

    def as_dict(self) -> dict:
        return {
            "reply": self.text,
            "intent": self.intent,
            "source": self.source,
            "citations": self.citations,
            "actions": self.actions,
            "complaints": self.complaints,
            "flags": self.flags,
        }


class RateLimited(Exception):
    pass


def check_rate_limit(user_id: int) -> None:
    limit, window = RATE_LIMIT
    now = time.monotonic()
    bucket = _recent[user_id]
    while bucket and now - bucket[0] > window:
        bucket.popleft()
    if len(bucket) >= limit:
        raise RateLimited(f"You have sent {limit} messages in {window // 60} minutes. Please wait a moment.")
    bucket.append(now)


def answer(db: Session, user: User, message: str, *, history: list[dict], complaint_id: int | None = None) -> dict:
    text = sanitize_input(message)[:2000]
    if not text:
        return Reply("Please type a question.", "empty").as_dict()

    injection = detect_prompt_injection(text)
    if injection["detected"]:
        reply = Reply(
            "I can't follow instructions like that. I can explain our approved policies, check the status of "
            "your complaints, or help you file a new one. How can I help?",
            "blocked",
            flags=["prompt_injection"],
        )
        reply.actions.append({"type": "suggest", "label": "What is the refund policy?"})
        return reply.as_dict()

    context = _context_complaint(db, user, text, complaint_id)
    intent = detect_intent(text, user, context is not None)
    handler = HANDLERS.get(intent, _policy_answer)
    reply = handler(db, user, text, history=history, context=context)
    return reply.as_dict()


def detect_intent(text: str, user: User, has_context: bool) -> str:
    t = text.lower()
    staff = user.role in STAFF
    if re.fullmatch(r"(hi|hello|hey|salam|assalam[- ]?o[- ]?alaikum|good (morning|afternoon|evening))[!. ]*", t):
        return "greeting"
    if re.search(r"\b(what can you do|help me|how do(es)? (this|it) work|what are you)\b", t) and len(t) < 80:
        return "help"
    if re.search(r"\b(human|real person|talk to (an? )?(agent|someone|person)|speak to (an? )?(agent|someone|person)|call me)\b", t):
        return "handoff"
    if staff:
        if re.search(r"\b(summar(y|ise|ize)|brief me|overview of)\b", t) and (has_context or CODE.search(t)):
            return "summarize"
        if re.search(r"\bwhy\b", t) and re.search(r"\b(priority|p[0-3]|urgent|urgency|escalat\w*|critical|classif\w*|categor\w*|routed|department)\b", t):
            return "explain"
        # "duplicate" alone is usually a billing term ("duplicate charge"), not a request to find cases.
        if re.search(r"\b(similar|related)\b", t) or re.search(r"\bduplicates?\b(?! (charge|payment|debit|transaction|billing))", t) and re.search(r"\b(complaints?|cases?|tickets?|find|show|any)\b", t):
            return "similar"
        if re.search(r"\b(sla|at risk|overdue|breach\w*|deadline)\b", t):
            return "sla"
        if re.search(r"\b(review queue|pending review|needs? review|awaiting review)\b", t):
            return "queue"
        if re.search(r"\b(draft|write|suggest)\b.*\b(reply|response|message|email)\b", t) and (has_context or CODE.search(t)):
            return "draft"
    if CODE.search(t) or re.search(r"\b(status|update|track|progress|where is|what happened)\b.*\b(complaint|ticket|case|order|request)\b", t):
        return "track"
    if re.search(r"\b(my|all|open|recent) (complaints|tickets|cases)\b", t):
        return "list"
    if user.role == UserRole.customer and PROBLEM_WORDS.search(t) and not re.match(r"^(what|how|when|can|do|does|is|are|which|who)\b", t):
        return "file"
    return "policy"


# ---------------------------------------------------------------- handlers

def _greeting(db, user, text, **_) -> Reply:
    first = (user.full_name or "there").split()[0]
    reply = Reply(f"Hi {first}! I'm Nova, the NimbusCarta support assistant. " + _capabilities(user), "greeting")
    reply.actions = _suggestions(user)
    return reply


def _help(db, user, text, **_) -> Reply:
    reply = Reply(_capabilities(user), "help")
    reply.actions = _suggestions(user)
    return reply


def _handoff(db, user, text, **_) -> Reply:
    if user.role == UserRole.customer:
        reply = Reply(
            "Our support team handles every complaint personally. File a complaint and an agent will pick it up; "
            "you can follow every update and message them from the complaint page.",
            "handoff",
        )
        reply.actions.append({"type": "open_complaint", "label": "File a complaint", "prefill": {}})
        return reply
    return Reply("Use the review queue or assign the case to yourself from the complaint page to take it over.", "handoff")


def _track(db, user, text, *, context=None, **_) -> Reply:
    codes = [c.upper() for c in CODE.findall(text)]
    rows: list[Complaint] = []
    if codes:
        found = _load(db).filter(Complaint.complaint_code.in_(codes)).all()
        rows = [c for c in found if visibility_error(db, user, c) is None]
        if not rows:
            return Reply(f"I couldn't find {', '.join(codes)} among the complaints you can access.", "track")
    elif context is not None:
        rows = [context]
    else:
        rows = scope_complaints(db, user, _load(db)).order_by(Complaint.id.desc()).limit(3).all()
        if not rows:
            reply = Reply("You don't have any complaints yet.", "track")
            if user.role == UserRole.customer:
                reply.actions.append({"type": "open_complaint", "label": "File a complaint", "prefill": {}})
            return reply
    lines = [_status_line(c, user) for c in rows]
    reply = Reply("\n".join(lines), "track")
    reply.complaints = [_brief(c, user) for c in rows]
    return reply


def _list(db, user, text, **_) -> Reply:
    rows = scope_complaints(db, user, _load(db)).order_by(Complaint.id.desc()).limit(8).all()
    if not rows:
        return _track(db, user, text)
    open_rows = [c for c in rows if c.status not in CLOSED]
    reply = Reply(f"You have {len(open_rows)} open of the {len(rows)} most recent complaints:", "list")
    reply.complaints = [_brief(c, user) for c in rows]
    return reply


def _file(db, user, text, *, history=None, **_) -> Reply:
    """Pre-classify with the rule matrix and hand a pre-filled draft to the complaint form."""
    description = _collect_description(text, history or [])
    preview = classify_from_rules(db, description)
    order = ORDER.search(description)
    prefill = {
        "title": _title_from(text),
        "description": description,
        "order_reference": order.group(0).upper() if order else "",
    }
    parts = []
    # For escalating issues (safety, privacy, account takeover) lead with the instruction from
    # the policy the matched rule cites, e.g. SAF-POL-01 "unplug the device".
    safety = _policy_chunk(db, preview.get("policy_id"), description) if preview.get("escalation_required") else None
    if safety:
        lead = "Your safety comes first: " if (preview.get("issue_category") or "").lower() == "safety" else "Important: "
        parts.append(lead + _customer_voice(_best_sentences(safety["content"], "unplug stop using escalate preserve " + description, 2, customer=True)))
    if preview.get("issue_category") and preview["issue_category"] != UNCLASSIFIED:
        parts.append(f"This sounds like a {preview['issue_category'].lower()} issue ({preview['subcategory']}), which our {_dept_name(db, preview.get('department'))} team handles.")
    else:
        parts.append("I'm sorry you're having trouble.")
    missing = []
    if not order:
        missing.append("your order number (NC-000000)")
    if len(description) < 60:
        missing.append("a little more detail about what happened")
    if missing:
        parts.append("To speed things up, please include " + " and ".join(missing) + ".")
    parts.append("I've prepared a complaint for you. Review it and submit when you're ready.")
    reply = Reply(" ".join(parts), "file", source="knowledge_base" if safety else "system")
    reply.actions.append({"type": "open_complaint", "label": "Review & submit complaint", "prefill": prefill})
    if safety:
        reply.citations.append(_citation(safety))
    return reply


def _summarize(db, user, text, *, context=None, **_) -> Reply:
    complaint = context or _first_visible_code(db, user, text)
    if complaint is None:
        return Reply("Open a complaint or mention its code (e.g. CMP-00012) and I'll summarize it.", "summarize")
    data = serialize_complaint(complaint)
    py, ai = data.get("python") or {}, data.get("genai") or {}
    if not py:
        return Reply(f"{complaint.complaint_code} has not been analyzed yet. Run the analysis first.", "summarize")
    lines = [
        f"{complaint.complaint_code} · {complaint.title} · status {complaint.status.value.replace('_', ' ')}.",
        f"Verified as {py.get('issue_category')} / {py.get('subcategory')} → {py.get('department')}, urgency {py.get('urgency')}, priority {py.get('priority')}.",
    ]
    if ai.get("complaint_summary"):
        lines.append(f"GenAI summary: {ai['complaint_summary']}")
    if py.get("escalation_required"):
        lines.append(f"Mandatory escalation ({py.get('escalation_level', '').replace('_', ' ')}): {'; '.join(py.get('escalation_reasons') or [])}")
    if data.get("pending_review"):
        lines.append("Waiting for review: " + ", ".join((data.get("checks") or {}).get("review_reasons") or []))
    if py.get("missing_information"):
        lines.append("Missing: " + ", ".join(m.replace("_", " ") for m in py["missing_information"]))
    if py.get("required_actions"):
        lines.append("Mandatory actions: " + "; ".join(py["required_actions"]))
    reply = Reply("\n".join(lines), "summarize")
    reply.complaints = [_brief(complaint, user)]
    return reply


def _explain(db, user, text, *, context=None, **_) -> Reply:
    complaint = context or _first_visible_code(db, user, text)
    if complaint is None:
        return Reply("Open a complaint or mention its code and I'll explain how it was classified.", "explain")
    py = (serialize_complaint(complaint).get("python")) or {}
    if not py:
        return Reply(f"{complaint.complaint_code} has not been analyzed yet.", "explain")
    parts = [
        f"{complaint.complaint_code} matched rule {py.get('rule_code') or '— (no rule matched)'} → {py.get('issue_category')} / {py.get('subcategory')}, routed to {py.get('department')}."
    ]
    rules = py.get("escalation_rules") or []
    if rules:
        parts.append(
            "Escalation rules that fired: "
            + "; ".join(f"{r.get('rule_code')} ({', '.join(r.get('keywords') or []) or r.get('name')})" for r in rules)
            + f", giving level {py.get('escalation_level', '').replace('_', ' ')}."
        )
    parts.append(
        f"Urgency {py.get('urgency')} comes from the rule matrix and escalation rules, then maps to priority {py.get('priority')} through the priority table. "
        "Sentiment is never used to set urgency."
    )
    if py.get("policy_id"):
        parts.append(f"Policy basis: {py['policy_id']} §{py.get('policy_section') or '—'} ({(py.get('policy_applicability') or '').replace('_', ' ')}).")
    return Reply(" ".join(parts), "explain")


def _similar(db, user, text, *, context=None, **_) -> Reply:
    complaint = context or _first_visible_code(db, user, text)
    probe = f"{complaint.title} {complaint.description}" if complaint else re.sub(r"\b(similar|related|duplicates?|find|show|complaints?)\b", " ", text, flags=re.I)
    candidates = scope_complaints(db, user, _load(db)).order_by(Complaint.id.desc()).limit(400).all()
    scored = []
    for other in candidates:
        if complaint and other.id == complaint.id:
            continue
        score = fuzz.token_set_ratio(probe.lower(), f"{other.title} {other.description}".lower())
        if score >= 55:
            scored.append((score, other))
    scored.sort(key=lambda s: -s[0])
    if not scored:
        return Reply("I didn't find similar complaints.", "similar")
    reply = Reply(f"Found {len(scored)} similar complaint(s); the closest are:", "similar")
    reply.complaints = [{**_brief(c, user), "similarity": s} for s, c in scored[:5]]
    return reply


def _sla(db, user, text, **_) -> Reply:
    rows = scope_complaints(db, user, _load(db)).filter(~Complaint.status.in_(CLOSED), Complaint.sla_resolution_due.isnot(None)).all()
    for row in rows:
        refresh_sla_risk(row)
    at_risk = sorted((r for r in rows if r.sla_risk), key=lambda r: r.sla_resolution_due)
    if not at_risk:
        return Reply("No open complaints in your scope are at SLA risk right now.", "sla")
    reply = Reply(f"{len(at_risk)} complaint(s) have used over 75% of their resolution window:", "sla")
    reply.complaints = [_brief(c, user) for c in at_risk[:8]]
    return reply


def _queue(db, user, text, **_) -> Reply:
    if user.role not in {UserRole.reviewer, UserRole.manager, UserRole.administrator}:
        return Reply("The manual-review queue is handled by reviewers. I can summarize your own cases instead.", "queue")
    rows = [c for c in _load(db).order_by(Complaint.id.desc()).limit(500).all() if pending_review(c)]
    reply = Reply(f"{len(rows)} complaint(s) are waiting for a reviewer decision.", "queue")
    reply.complaints = [_brief(c, user) for c in rows[:8]]
    reply.actions.append({"type": "link", "label": "Open review queue", "to": "/review"})
    return reply


def _draft(db, user, text, *, context=None, **_) -> Reply:
    complaint = context or _first_visible_code(db, user, text)
    if complaint is None:
        return Reply("Open the complaint you want a reply for, then ask again.", "draft")
    data = serialize_complaint(complaint)
    ai, py = data.get("genai") or {}, data.get("python") or {}
    if ai.get("customer_response"):
        body = ai["customer_response"]
        source = "genai"
    else:
        # Grounded template: acknowledge, summarize, next step, no promises (SRS step 32).
        dept = py.get("department") or "support"
        body = (
            f"Thank you for contacting NimbusCarta about \"{complaint.title}\". We're sorry for the trouble this has caused. "
            f"Our {dept} team has your complaint ({complaint.complaint_code}) and is reviewing it against our policy. "
            "We will update you as soon as the next step is confirmed."
        )
        source = "system"
    flags = reply_flags(complaint, body)
    reply = Reply(body, "draft", source=source, flags=[f["code"] for f in flags])
    reply.actions.append({"type": "use_draft", "label": "Use in reply", "complaint_id": complaint.id, "text": body})
    return reply


def _policy_answer(db, user, text, *, history=None, context=None, **_) -> Reply:
    found = retrieve_policy_chunks(db, text, limit=8)
    # Section 0 is the document's metadata header (ID, title, version, dates), not policy text.
    found = [c for c in found if str(c.get("section") or "") != "0" and not (c.get("content") or "").lstrip().startswith("Document ID")]
    if user.role == UserRole.customer:
        found = [c for c in found if c.get("category") in CUSTOMER_DOC_CATEGORIES]
    chunks = [c for c in found if c["usable"]][:4] or found[:2]
    if not chunks:
        reply = Reply(
            "I couldn't find that in our approved policies. If something went wrong with an order, I can help you file a complaint.",
            "policy",
        )
        if user.role == UserRole.customer:
            reply.actions.append({"type": "open_complaint", "label": "File a complaint", "prefill": {"description": text}})
        return reply
    facts = _facts_for(db, user, context)
    generated = _generate(user, text, chunks, facts, history or [])
    if generated:
        return generated
    # Same precedence rule as Pipeline 2: among comparably relevant excerpts, a policy
    # outranks an SOP, guideline or FAQ, so the answer never quotes a FAQ the policy overrides.
    best = max(c.get("score", 0) for c in chunks)
    rank = {cat.value: value for cat, value in PRECEDENCE.items()}
    contenders = [c for c in chunks if c.get("usable") and c.get("score", 0) >= 0.5 * best]
    if contenders:
        top = min(contenders, key=lambda c: (rank.get(c.get("category"), 90), -c.get("score", 0)))
        chunks = [top] + [c for c in chunks if c is not top]
    top = chunks[0]
    customer = user.role == UserRole.customer
    # Choose sentences from every retrieved section of the governing document, not just the first.
    same_doc = " ".join(c["content"] for c in chunks if c["document_code"] == top["document_code"] and c.get("usable", True))
    body = _best_sentences(same_doc or top["content"], text, 2, customer=customer)
    extra = ""
    related = next((c for c in chunks[1:] if c["document_code"] != top["document_code"]), None)
    if related and related["document_code"] != top["document_code"] and related.get("score", 0) >= 0.6 * top.get("score", 0):
        extra = f" Related: {related['title']} — " + _best_sentences(related["content"], text, 1, customer=customer)
    text_out = f"According to our {top['title']} ({top['document_code']}): {body}{extra}"
    reply = Reply(_customer_voice(text_out) if user.role == UserRole.customer else text_out, "policy", source="knowledge_base")
    reply.citations = [_citation(c) for c in _unique_docs([top] + ([related] if extra else []))]
    return reply


HANDLERS = {
    "greeting": _greeting,
    "help": _help,
    "handoff": _handoff,
    "track": _track,
    "list": _list,
    "file": _file,
    "summarize": _summarize,
    "explain": _explain,
    "similar": _similar,
    "sla": _sla,
    "queue": _queue,
    "draft": _draft,
    "policy": _policy_answer,
}


# ---------------------------------------------------------------- GenAI phrasing (guarded)

def _generate(user: User, question: str, chunks: list[dict], facts: list[str], history: list[dict]) -> Reply | None:
    history_text = "\n".join(f"{m.get('role')}: {mask_pii(str(m.get('content', '')))[:300]}" for m in history[-6:]) or "(none)"
    system, prompt = render_named(
        *ASSISTANT_PROMPT,
        {
            "role": user.role.value,
            "facts": facts,
            "policy_chunks": [{**c, "content": wrap_untrusted_policy(c["content"])} for c in chunks],
            "history": wrap_untrusted_complaint(history_text),
            "question": wrap_untrusted_complaint(mask_pii(question)),
        },
    )
    try:
        result = generate_json(system, prompt, budget_seconds=8)
    except GenAIError:
        return None
    text = str(result["structured"].get("answer") or "").strip()
    if not text:
        return None
    # The same guards as Pipeline 1: no promises the rules don't allow, no invented facts.
    grounding = " ".join(c["content"] for c in chunks) + " " + " ".join(facts)
    if detect_unsupported_promises(text, {}, grounding) or detect_hallucinations({"customer_response": text}, grounding, chunks):
        return None
    cited = {str(s) for s in result["structured"].get("sources") or []}
    used = [c for c in _unique_docs(chunks) if c["document_code"] in cited] or _unique_docs(chunks)[:2]
    reply = Reply(text[:1500], "policy", source="genai")
    reply.citations = [_citation(c) for c in used[:3]]
    return reply


# ---------------------------------------------------------------- helpers

def _load(db: Session):
    return db.query(Complaint).options(
        selectinload(Complaint.validation_results),
        selectinload(Complaint.genai_runs),
        selectinload(Complaint.comparisons),
        selectinload(Complaint.reviews),
        selectinload(Complaint.assigned_department),
        selectinload(Complaint.attachments),
        selectinload(Complaint.followups),
    )


def _context_complaint(db: Session, user: User, text: str, complaint_id: int | None) -> Complaint | None:
    if complaint_id:
        complaint = _load(db).filter(Complaint.id == complaint_id).first()
        if complaint and visibility_error(db, user, complaint) is None:
            return complaint
    return None


def _first_visible_code(db: Session, user: User, text: str) -> Complaint | None:
    match = CODE.search(text)
    if not match:
        return None
    complaint = _load(db).filter(Complaint.complaint_code == match.group(0).upper()).first()
    return complaint if complaint and visibility_error(db, user, complaint) is None else None


def _status_line(c: Complaint, user: User) -> str:
    refresh_sla_risk(c)
    dept = c.assigned_department.name if c.assigned_department else "being assigned"
    line = f"{c.complaint_code} — {c.title}: {c.status.value.replace('_', ' ')}, department {dept}. Latest update: {c.latest_update}"
    if c.sla_resolution_due and c.status not in CLOSED:
        line += f" Target resolution: {c.sla_resolution_due.astimezone(timezone.utc):%d %b %H:%M} UTC."
    if c.status == ComplaintStatus.resolved and user.role == UserRole.customer:
        line += " If it isn't fixed, you can reopen it from the complaint page."
    return line


def _brief(c: Complaint, user: User) -> dict:
    return {
        "id": c.id,
        "complaint_code": c.complaint_code,
        "title": c.title,
        "status": c.status.value,
        "department": c.assigned_department.name if c.assigned_department else None,
        "sla_risk": bool(c.sla_risk),
    }


def _facts_for(db: Session, user: User, context: Complaint | None) -> list[str]:
    facts = [f"Today is {datetime.now(timezone.utc):%d %B %Y}."]
    if context is not None:
        data = serialize_complaint(context, audience="customer" if user.role == UserRole.customer else "staff")
        facts.append(f"The user is looking at complaint {data['complaint_code']} (status {data['status']}, department {data.get('department') or 'unassigned'}).")
    return facts


def _collect_description(text: str, history: list[dict]) -> str:
    """Join the customer's recent messages so a multi-message description is kept together."""
    earlier = [str(m.get("content", "")) for m in history[-4:] if m.get("role") == "user" and PROBLEM_WORDS.search(str(m.get("content", "")))]
    parts = [p for p in earlier if p and p not in text] + [text]
    return sanitize_input(" ".join(parts))[:2000]


def _title_from(text: str) -> str:
    first = re.split(r"(?<=[.!?])\s", text.strip())[0]
    return (first[:77] + "…") if len(first) > 80 else first


STAFF_ONLY_SENTENCE = re.compile(r"\b(internal|agents?|staff|reply|replies|notes?|logs?|disciplinary|supervisor approval|liability)\b", re.I)


TIME_QUESTION = re.compile(r"\b(how long|how many (days|hours|weeks)|when (will|do|does|can|should)|how soon|how quickly|timeline|take)\b", re.I)
TIMELINE = re.compile(r"\b\d+(\s*[-–]\s*\d+)?\s*(business |working |calendar )?(days?|hours?|weeks?|months?)\b", re.I)


def _best_sentences(content: str, question: str, count: int, *, customer: bool = False) -> str:
    sentences = [s.strip() for s in re.split(r"(?<=[.!?])\s+", content.replace("\n", " ")) if len(s.strip()) > 20]
    if customer:
        # Policies mix customer rules with instructions to staff; customers only get the former.
        sentences = [s for s in sentences if not STAFF_ONLY_SENTENCE.search(s)] or sentences[:1]
    if not sentences:
        return content[:300]
    q = set(re.findall(r"[a-z]{4,}", question.lower()))
    # "How long / when / how many days" questions want the sentence that states the timeline.
    wants_time = bool(TIME_QUESTION.search(question))

    def score(sentence: str) -> float:
        overlap = len(q & set(re.findall(r"[a-z]{4,}", sentence.lower())))
        return overlap + (2 if wants_time and TIMELINE.search(sentence) else 0)

    ranked = sorted(sentences, key=lambda s: -score(s))
    chosen = sorted(ranked[:count], key=sentences.index)
    return " ".join(chosen)


VOICE = [
    (re.compile(r"\binstruct the customer to\b", re.I), "please"),
    (re.compile(r"\bdo not tell the customer to keep using\b", re.I), "do not keep using"),
    (re.compile(r"\bthe customer's\b", re.I), "your"),
    (re.compile(r"\bthe customer\b", re.I), "you"),
    (re.compile(r"\bcustomers\b", re.I), "you"),
    (re.compile(r"\bescalate immediately to safety\b", re.I), "our Safety team is alerted immediately"),
]


def _customer_voice(text: str) -> str:
    """Policies are written for staff; address the customer directly without changing meaning."""
    for pattern, replacement in VOICE:
        text = pattern.sub(replacement, text)
    return re.sub(r"(^|[.!?]\s+)([a-z])", lambda m: m.group(1) + m.group(2).upper(), text)


def _policy_chunk(db: Session, code: str | None, query: str) -> dict | None:
    """Best chunk of the active, in-date version of one policy."""
    if not code:
        return None
    from database.models import DocumentChunk, KnowledgeDocument
    from knowledge_base.precedence import is_usable_policy

    docs = [d for d in db.query(KnowledgeDocument).filter(KnowledgeDocument.document_code == code).all() if is_usable_policy(d)]
    if not docs:
        return None
    doc = max(docs, key=lambda d: d.effective_date or datetime.min.date())
    chunks = db.query(DocumentChunk).filter(DocumentChunk.document_id == doc.id).all()
    if not chunks:
        return None
    q = set(re.findall(r"[a-z]{4,}", query.lower()))
    best = max(chunks, key=lambda c: len(q & set(re.findall(r"[a-z]{4,}", c.content.lower()))))
    return {
        "document_code": doc.document_code,
        "title": doc.title,
        "version": doc.version,
        "status": doc.status.value,
        "section": best.section,
        "content": best.content,
    }


def _unique_docs(chunks: list[dict]) -> list[dict]:
    seen, out = set(), []
    for c in chunks:
        if c["document_code"] not in seen:
            seen.add(c["document_code"])
            out.append(c)
    return out


def _citation(chunk: dict) -> dict:
    return {
        "document_code": chunk["document_code"],
        "title": chunk["title"],
        "version": chunk["version"],
        "section": chunk["section"],
        "status": chunk["status"],
    }


def _dept_name(db: Session, code: str | None) -> str:
    from database.models import Department

    row = db.query(Department).filter(Department.code == code).first() if code else None
    return row.name if row else "support"


def _capabilities(user: User) -> str:
    if user.role == UserRole.customer:
        return "I can explain our policies (refunds, delivery, warranty, privacy…), check the status of your complaints, and help you file a new one."
    return (
        "I can answer policy questions with sources, summarize a case, explain why it was classified or escalated, "
        "find similar complaints, list SLA risks, show the review queue, and draft a policy-safe reply."
    )


def _suggestions(user: User) -> list[dict]:
    if user.role == UserRole.customer:
        labels = ["Where is my complaint?", "What is the refund policy?", "My charger is overheating", "How long does delivery take?"]
    else:
        labels = ["Which complaints are at SLA risk?", "What is in the review queue?", "What does the warranty policy say about damaged items?", "Find similar complaints"]
    return [{"type": "suggest", "label": label} for label in labels]
