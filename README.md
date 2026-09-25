# SupportNova · ResponseX Intelligence

SupportNova is complaint intelligence for **NimbusCarta**, a fictional consumer-electronics marketplace. It is built for *SupportNova – Generative AI PowerPlay SRS v1.0*.

- **Pipeline 1 (GenAI)** reads a complaint and drafts structured intelligence: category, urgency, routing, policy, resolution and a customer reply.
- **Pipeline 2 (Python)** independently works out the correct answer from the Complaint Resolution Rule Matrix and the approved policies.
- Pipeline 2 checks every GenAI claim against that answer. Disagreements, risky promises and contradictions go to a human reviewer.

GenAI never approves its own output.

| | |
|---|---|
| Live demo | _add the deployed URL here_ (deploy with `render.yaml`, see below) |
| Demo video | _add the .mp4 / YouTube link here_ |
| Technical blog | _add the blog link here_ |
| Requirement coverage | [documentation/SRS_TRACEABILITY.md](documentation/SRS_TRACEABILITY.md): every SRS item → code → test |
| Step-by-step walkthrough | [documentation/walkthrough/WALKTHROUGH.md](documentation/walkthrough/WALKTHROUGH.md) (also `.docx`): one complaint from submission to closure, 31 screenshots |

## Highlights

- **Dual pipeline with Python as ground truth.**
  - 113 hand-written resolution rules and 46 escalation rules.
  - Urgency is never driven by sentiment. Mandatory escalation is enforced even when GenAI misses it.
- **Grounded policy handling.**
  - 26 real PDF/DOCX policies, SOPs and FAQs, parsed by numbered section, with BM25 retrieval.
  - A precedence resolver makes the active policy beat FAQs and older versions. It flags a complaint or reply that relies on the lower-ranked statement.
  - Outdated, draft or expired rules quoted by customers are detected.
- **Conditional eligibility.**
  - Refund, replacement and compensation are checked against the policy conditions: purchase window, product condition, prior replacement and warranty.
  - Anything that cannot be verified is marked "needs check", never guessed.
- **Guarded conversation.** Agents message customers from the case. Replies promising refunds, compensation or timelines the policy does not support are blocked. Only reviewers can override, and every override is audited.
- **Nova assistant** (floating chat on every page):
  - Customers can file a complaint (the form is prefilled), track cases, ask policy questions (answers cite the source) and reach a human.
  - Staff can summarize and explain cases, find similar ones, check SLA and the queue, and draft a policy-safe reply.
  - Nova is role-scoped and refuses prompt injection.
- **Human oversight.**
  - Review queue with all eight SRS actions, including **Modify**: edit fields and the approved customer response.
  - The original recommendation is kept next to the final decision.
- **Hidden-data ready.**
  - **Evaluation** page: import a CSV/JSON complaint pack and get per-field accuracy, a case-type breakdown, mismatches and the SRS comparison report.
  - Policy upload shows a **change-impact report** (sections changed, timelines changed, rules and escalation rules affected, open complaints to re-analyze) with one-click batch re-analysis.
- **Live configuration.** Categories, subcategories, departments, resolution rules (create, edit, toggle), escalation rules, the priority table, SLA targets, and the high-value and repeat thresholds all change without code, and every change is audited.
- **Customer experience.** Status timeline, messages, CSAT rating on closure, reopen, and notifications.
- **Security.**
  - JWT + Argon2 and RBAC for 5 roles. Login throttling (429 after 5 failures).
  - PII masking before GenAI: emails, phones, cards, CNIC.
  - Upload validation with magic bytes and path-traversal protection.
  - The app refuses to start in production with a default secret.

## Quick start (local)

Full fresh-machine instructions without Docker: [documentation/INSTALLATION.md](documentation/INSTALLATION.md).

```powershell
cd D:\Techwiz-7\support-nova
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env          # set SECRET_KEY and a GenAI key
docker compose up -d db         # or use a local PostgreSQL 16
uvicorn src.main:app --reload --port 8000
```

In a second terminal:

```powershell
cd frontend
npm install
npm run dev
```

Open http://localhost:5173 (Swagger: http://localhost:8000/docs, health: http://localhost:8000/health).

On first start the API creates tables, applies migrations and seeds NimbusCarta data: departments, categories, the rule matrix from `complaint_rules/rule_matrix.csv`, policies from `sample_documents/`, and users.

### GenAI configuration

- Set one or more of `OPENAI_API_KEY`, `GEMINI_API_KEY`, `ANTHROPIC_API_KEY` and `GROK_API_KEY` (or `XAI_API_KEY`).
- `GENAI_PROVIDER` picks the first provider to try. `GENAI_FALLBACK_PROVIDERS` sets the order to try the others.
- Each provider gets `GENAI_MAX_RETRIES` attempts inside a `GENAI_TOTAL_BUDGET_SECONDS` budget. After that the case continues Python-only and goes to review.
- A provider that returns a permanent error (such as no credit) is paused. After topping it up, click **Resume** in Settings.

`scripts/check_genai_providers.py` tests each configured key.

**Free fallbacks:**

- **Groq** (groq.com, not xAI Grok). Set `GROQ_API_KEY`; get one at https://console.groq.com/keys. The default model is `GROQ_MODEL=llama-3.3-70b-versatile`.
- **Ollama** (local, no key). Run the `ollama/ollama` container on port 11434 and pull a model (`docker exec <container> ollama pull qwen2.5:3b`). Then set `OLLAMA_ENABLED=true`, `OLLAMA_BASE_URL=http://localhost:11434` and `OLLAMA_MODEL=qwen2.5:3b`.
  - Ollama always runs last, and gets its own `OLLAMA_TIMEOUT_SECONDS` (90) because a CPU model is slower than a hosted API.
  - A 7B/8B model such as `qwen2.5:7b` or `llama3.1:8b` writes noticeably better replies than the 3B model.

The default chain is `GENAI_FALLBACK_PROVIDERS=groq,grok,gemini,anthropic,ollama`.

## Deploy (one service)

The `Dockerfile` builds the React app, and FastAPI serves it from the same origin as the API.

```bash
docker build -t supportnova .
docker run -p 8000:8000 -e DATABASE_URL=postgresql+psycopg://user:pass@host:5432/supportnova -e SECRET_KEY=$(openssl rand -hex 32) -e APP_ENV=production supportnova
```

On **Render**: New → Blueprint → select this repository. `render.yaml` creates the web service and a PostgreSQL database, and generates `SECRET_KEY`. Add a GenAI key in the service's Environment tab.

## Seeded logins

| Role | Email | Password |
|---|---|---|
| Administrator | admin@nimbuscarta.example | ChangeMeNow!23 |
| Agent | agent@nimbuscarta.example | AgentPass!23 |
| Reviewer | reviewer@nimbuscarta.example | ReviewPass!23 |
| Manager | manager@nimbuscarta.example | ManagerPass!23 |
| Customer | customer@nimbuscarta.example | CustomerPass!23 |

Change these before a public deployment.

## What each role sees

| Role | In the web app |
|---|---|
| Customer | File a complaint (4-step wizard with attachments), track status and department, read and reply to messages, rate and close or reopen, Nova assistant. Internal analysis and notes are never shown. |
| Agent | Dashboard of unassigned and own cases; filters (category, department, priority, urgency, sentiment, escalation, SLA risk, review, dates); analyze (tone, Python-only); both recommendations side by side; eligibility conditions; policy precedence; conversation with the promise guard; request information; status and assignment; structured JSON; audit history. |
| Reviewer | Everything an agent sees, plus the review queue (approve, reject, modify, reclassify, reassign, escalate, regenerate, comment) and batch re-analysis after policy changes. |
| Manager | All complaints; Reports (volume trend, categories, departments, products, sentiment, SLA, CSAT, first response, trends); eight exports (CSV/XLSX/PDF); Evaluation workbench. |
| Administrator | Everything, plus Knowledge base (upload, version status, change impact) and Settings (pipelines and thresholds, rules, escalation rules, taxonomy, SLA and priority, users). |

A walkthrough of one complaint from submission to closure is in [documentation/APPLICATION_FLOW.md](documentation/APPLICATION_FLOW.md).

## Evaluating with a hidden pack

1. Sign in as manager or administrator, open **Evaluation**, and drop a CSV or JSON file.
   - Required columns: `title` and `description`.
   - Optional columns: product, order, customer type, channel, previous reference, requested resolution, `customer_ref`, and `expected_*` labels.
   - The format is in [hidden_test_ready/README.md](hidden_test_ready/README.md) and `hidden_test_ready/example_hidden_pack.csv`.
2. Every row goes through normal intake and both pipelines. The page shows per-field accuracy, accuracy by case type and every mismatch, and downloads the comparison report.
3. From the command line, the same service writes `reports/comparison_report.csv/.xlsx` and a summary:

```powershell
python scripts\run_evaluation.py hidden_test_ready\example_hidden_pack.csv
```

A hidden policy document is handled from **Knowledge base → Upload document**. The response lists the change impact, and **Re-analyze affected complaints** refreshes every case that relied on the old text.

## Reports and evidence (`reports/`)

| File | Contents | Regenerate |
|---|---|---|
| `comparison_report.csv/.xlsx`, `comparison_summary.md` | SRS Deliverable 8 columns for all 532 dataset complaints, accuracy by field and case type | `python scripts\run_evaluation.py sample_complaints\nimbuscarta_500.json --reset` |
| `complaint_intelligence_report.md/.xlsx` | Distributions: category, department, urgency, priority, sentiment, escalation reasons, SLA, policies cited, review reasons, repeats, products | `python scripts\complaint_intelligence_report.py` |
| `security_testing_report.md` | 35 adversarial and security tests: attack, expected, actual, mitigation | `python scripts\security_report.py` |
| `rule_matrix.xlsx` + `documentation/RULE_MATRIX.md` | Full rule matrix and how matching works | `python scripts\export_rule_matrix.py` |

The report scripts use a disposable `supportnova_reports` database and refuse the real one. GenAI columns read "not run (no provider credit)" until a key with credit is configured. Nothing is simulated.

## Tests

```powershell
docker exec support-nova-db-1 psql -U supportnova -c "CREATE DATABASE supportnova_test;"
$env:SUPPORTNOVA_TEST_DATABASE_URL="postgresql+psycopg://supportnova:supportnova@localhost:5432/supportnova_test"
pytest -q
```

The suite has 260 tests. It covers:

- rules and priority traps, the dataset and the rule matrix, parsing and citation integrity;
- the GenAI retry/fallback path with recorded responses;
- API integration: RBAC, review, messaging, CSAT, notifications, evaluation, assistant, exports;
- live configuration and policy change impact;
- security and adversarial cases.

Without the variable, only the unit tests run. The integration database is dropped and recreated, so its name must contain `test` or `scratch`.

Frontend checks: `cd frontend; npm run build` (type check + build).

## Project layout

| Folder | Purpose |
|---|---|
| `src/api`, `src/services` | FastAPI routes; intake, analysis, access, messaging, evaluation services |
| `genai_pipeline/`, `prompt_templates/`, `schemas/` | Pipeline 1: provider chain, versioned prompts, JSON schema |
| `python_validation/`, `complaint_rules/`, `routing_rules/`, `escalation_rules/` | Pipeline 2: rules, eligibility, sentiment estimate, validation |
| `knowledge_base/`, `document_processing/` | Retrieval, precedence, change impact; parsing and chunking |
| `hallucination_checks/`, `comparison_engine/`, `security/` | Promise and hallucination checks, comparison, injection/PII/throttle/audit |
| `chatbot/` | Nova assistant |
| `database/` | Models, migrations, seed |
| `config/` | Settings and live thresholds |
| `frontend/` | React 19 + Vite + Zustand + Recharts |
| `sample_complaints/`, `sample_documents/`, `hidden_test_ready/` | Dataset, knowledge base, hidden-pack format |
| `reports/`, `documentation/`, `tests/`, `scripts/` | Evidence, docs, tests, tooling |

## Main API

| Area | Endpoints |
|---|---|
| Auth | `POST /api/v1/auth/login` (form) · `/login-json` · `/register` (customers only) · `GET /me` |
| Complaints | `POST /api/v1/complaints` · `GET /api/v1/complaints?category=&priority=&review=true&reanalysis=true&limit=&offset=` (total count in `X-Total-Count`) · `GET /{id}` · `POST /{id}/analyze` · `PATCH /{id}/status` · `POST /{id}/assign` · `POST /{id}/review` · `POST /{id}/customer-decision` · `GET/POST /{id}/messages` · `POST /{id}/messages/check` · `POST /reanalyze-flagged` |
| Knowledge base | `POST /api/v1/knowledge-base/documents` (returns `impact`) · `GET /documents` · `GET /documents/{id}/chunks` · `PATCH /documents/{id}/status` |
| Configuration | `/api/v1/config/categories` (+ `/{code}/subcategories`) · `/departments` · `/rules` (+ `PATCH /rules/{code}`) · `/escalation-rules` · `/sla-policies` · `/priority-rules` · `/thresholds` · `/genai` |
| Assistant | `POST /api/v1/assistant/chat` · `GET /sessions/{id}` |
| Evaluation | `POST /api/v1/evaluation/import` · `GET /runs` · `GET /runs/{id}` · `GET /runs/{id}/report?fmt=csv\|xlsx` |
| Analytics | `/api/v1/dashboards/{admin\|agent\|customer}` · `/analytics` · `/analytics/trends` · `/reports/export?report=&fmt=csv\|xlsx\|pdf` |
| Notifications | `GET /api/v1/notifications` · `POST /seen` |

## Assumptions

- NimbusCarta and all customers, orders and policies are fictional.
- Customer replies are delivered inside the app (Conversation thread plus notifications). Email and SMS gateways are out of scope.
- Retrieval uses BM25 over numbered policy sections. The `DocumentChunk.embedding` column is reserved for pgvector without API changes.
- Hidden packs and documents go through the Evaluation page and Knowledge base upload. No code changes are needed.

## Limitations

- Live GenAI output could not be captured while every provider key was out of credit. The path is covered by tests with recorded provider responses. Add a key to see Pipeline 1 live.
- Rule matching is whole-word keyword matching. Wording that uses none of a rule's keywords is labelled `Unclassified` and sent to review rather than guessed.
- The dataset's expected labels come from the rule matrix. Accuracy against them is a consistency check; an independently labelled pack gives the real measure (see `reports/comparison_summary.md`).
- Login throttling state is per process. A multi-instance deployment would move it to Redis.

## Submission checklist

- [x] Source code in the SRS folder structure
- [x] Complaint dataset (532, labelled, 21 case types) and knowledge base (26 PDF/DOCX)
- [x] Rule matrix (CSV, XLSX, documented)
- [x] Prompt templates and versions, JSON schema
- [x] Comparison, complaint intelligence and security reports
- [x] Installation, flow, architecture and traceability documents
- [x] AI_USAGE.md
- [ ] Deployed URL (run `render.yaml`) and credentials in this README
- [ ] Demo video (.mp4) and technical blog (≥2000 words) linked above
- [ ] Team contribution record and verifying members signed in AI_USAGE.md
- [ ] Regular commits from every member
