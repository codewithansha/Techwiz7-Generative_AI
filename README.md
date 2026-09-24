# SupportNova backend

FastAPI + PostgreSQL complaint-intelligence API for **NimbusCarta**, a fictional consumer-electronics marketplace. The design follows *SupportNova-Generative AI PowerPlay_SRS*: Pipeline 1 (GenAI) drafts structured complaint intelligence; Pipeline 2 (plain Python) independently checks the draft against the Complaint Resolution Rule Matrix. Where they disagree, the case goes to a human reviewer.

## What this backend covers

- JWT auth and roles: customer, agent, reviewer, manager, administrator
- Complaint submit, validate, sanitize, duplicate/repeat detection, SLA timers
- Knowledge-base upload (PDF, DOCX, plus optional TXT/MD/CSV), parse, chunk, version, precedence
- Configurable categories, departments, SLAs, and 100+ resolution rules / 30+ escalation rules
- GenAI structured JSON (OpenAI, Gemini, Anthropic, Grok, or Cursor) with Grok then Cursor as fallbacks
- Independent Python validation, routing, urgency (not from sentiment), escalation traps
- Hallucination and unsupported-promise flags, prompt-injection wrapping
- Manual review queue, reviewer override + append-only audit log
- Agent/admin/customer dashboards, analytics, CSV/XLSX/PDF export

## Prerequisites

- Python 3.11+
- PostgreSQL 16 (or Docker)
- A GenAI API key for Pipeline 1 (primary plus optional Grok/Cursor fallbacks). Pipeline 2 still runs without a key.

## Setup

```powershell
cd D:\Techwiz-7\support-nova
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env
```

Start PostgreSQL:

```powershell
docker compose up -d db
```

Edit `.env`:

- `DATABASE_URL=postgresql+psycopg://supportnova:supportnova@localhost:5432/supportnova`
- `SECRET_KEY` to a long random string
- `OPENAI_API_KEY` (or `GEMINI_API_KEY` / `ANTHROPIC_API_KEY`)
- `GENAI_PROVIDER=openai` (or `gemini` / `anthropic` / `grok` / `cursor`)
- Fallback keys used automatically if the primary provider fails: `GROK_API_KEY` (or `XAI_API_KEY`) and `CURSOR_API_KEY`
- `GENAI_FALLBACK_PROVIDERS=grok,cursor`

Never commit `.env`.

## Run

```powershell
uvicorn src.main:app --reload --host 0.0.0.0 --port 8000
```

Start the React frontend in a second terminal:

```powershell
cd frontend
npm install
npm run dev
```

Open http://localhost:5173. The frontend uses Zustand (the React equivalent of
Vue's Pinia) for persisted authentication and application state. Set
`VITE_API_URL` in `frontend/.env` when the API is not running at
`http://localhost:8000`.

On first start the API creates tables and seeds NimbusCarta reference data (departments, categories, rules, sample policies, users).

- Swagger UI: http://localhost:8000/docs
- Health: http://localhost:8000/health

Optional schema migrations after the database is up:

```powershell
alembic revision --autogenerate -m "sync schema"
alembic upgrade head
```

## Seeded logins

| Role | Email | Password |
|---|---|---|
| administrator | admin@nimbuscarta.example | ChangeMeNow!23 |
| agent | agent@nimbuscarta.example | AgentPass!23 |
| reviewer | reviewer@nimbuscarta.example | ReviewPass!23 |
| manager | manager@nimbuscarta.example | ManagerPass!23 |
| customer | customer@nimbuscarta.example | CustomerPass!23 |

Change these before any public deployment.

## Typical evaluator flow

1. `POST /api/v1/auth/login` with form fields `username` (email) and `password`, or `POST /api/v1/auth/login-json`.
2. Admin uploads policies: `POST /api/v1/knowledge-base/documents` (multipart).
3. Admin can add categories/rules without code changes: `/api/v1/config/...`
4. Customer or agent `POST /api/v1/complaints`.
5. Agent `POST /api/v1/complaints/{id}/analyze` (`{"tone":"professional"}`). Use `"skip_genai": true` to run only Python validation.
6. Review mismatches: `GET /api/v1/complaints/queue/manual-review` then `POST /api/v1/complaints/{id}/review`.
7. Dashboards: `/api/v1/dashboards/admin`, `/agent`, `/customer`.
8. Export: `GET /api/v1/reports/export?fmt=csv` (`xlsx` / `pdf`).

### Analyze response shape

Each analysis stores:

- GenAI structured JSON, provider, model, prompt version, attempts
- Python ground-truth output (category, department, urgency, escalation, eligibility)
- Field-by-field comparison and a computed verification score
- Flags: prompt injection, unsupported promises, missing mandatory actions, ungrounded claims

## Tests

```powershell
pytest
python scripts\generate_complaints.py
```

## Project layout (SRS folders)

`genai_pipeline/`, `python_validation/`, `complaint_rules/`, `routing_rules/`, `escalation_rules/`, `prompt_templates/`, `schemas/`, `comparison_engine/`, `hallucination_checks/`, `security/`, `document_processing/`, `knowledge_base/`, `database/`, `tests/`

## Assumptions

- Fictional organization: **NimbusCarta** (consumer electronics e-commerce). No real customer data.
- Reply drafts are stored in the app; email/SMS is not sent.
- Semantic retrieval uses token overlap against active policy chunks (pgvector can be added later without changing APIs).
- Hidden evaluation packs are processed through existing upload/config/analyze endpoints, not by editing core code.
