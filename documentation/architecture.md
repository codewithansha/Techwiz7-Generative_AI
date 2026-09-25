# SupportNova architecture and design report

SupportNova is the NimbusCarta complaint intelligence platform.

- **Pipeline 1** is Generative AI. It reads a complaint and drafts a structured analysis and a reply.
- **Pipeline 2** is Python. It independently works out the correct answer from approved rules and policies, checks Pipeline 1 against it, and decides what a human must review.

GenAI never approves its own output. This document describes the architecture, data flows, use cases, activities, sequences and data model. The diagrams are Mermaid, which renders on GitHub.

## 1. System architecture

```mermaid
flowchart LR
  subgraph Browser["React SPA (frontend/)"]
    UI[Role dashboards<br/>complaint wizard<br/>review queue<br/>knowledge base<br/>reports · evaluation]
    Nova[Nova assistant widget]
  end
  subgraph API["FastAPI (src/)"]
    Auth[auth · RBAC]
    Complaints[complaints · messages · review]
    KB[knowledge-base]
    Config[config · thresholds]
    Analytics[analytics · reports]
    Eval[evaluation import]
    Chat[assistant]
    Notify[notifications]
  end
  subgraph P1["Pipeline 1 · GenAI"]
    Prompts[versioned Jinja prompts]
    Client[provider chain<br/>retries · deadline · cooldown]
  end
  subgraph P2["Pipeline 2 · Python ground truth"]
    Pre[pre-processing · duplicates]
    Rules[rule matrix engine]
    Esc[escalation engine]
    Route[routing]
    Ret[BM25 retrieval · precedence]
    Elig[eligibility]
    Guard[schema · promise · hallucination checks]
    Cmp[comparison · verification score]
  end
  DB[(PostgreSQL)]
  Files[(uploads/ · sample_documents/)]
  UI --> API
  Nova --> Chat
  Complaints --> P2
  Complaints --> P1
  Chat --> Ret
  Chat -.phrasing only.-> Client
  P1 --> Guard
  P2 --> DB
  KB --> Files
  KB --> DB
  API --> DB
```

| Layer | Folder | Responsibility |
|---|---|---|
| Presentation | `frontend/src` | Role-based SPA. The UI hides actions outside the user's role, and the API enforces the same limits. |
| API | `src/api` | REST endpoints, request validation (Pydantic), role guards (`security/auth.py`). |
| Services | `src/services` | Intake, analysis orchestration, access scoping, messaging guard, evaluation. |
| Pipeline 1 | `genai_pipeline`, `prompt_templates`, `schemas` | Prompt rendering, provider calls with fallback, structured JSON. |
| Pipeline 2 | `python_validation`, `complaint_rules`, `routing_rules`, `escalation_rules`, `knowledge_base`, `hallucination_checks`, `comparison_engine` | Rules, retrieval, precedence, eligibility, checks, comparison. |
| Documents | `document_processing` | Validation, PDF/DOCX parsing by numbered section, chunking. |
| Assistant | `chatbot` | Intent routing and extractive, grounded answers (Nova). |
| Data | `database` | Models, idempotent migrations, seed from `complaint_rules/rule_matrix.csv` and `sample_documents/`. |
| Runtime config | `config` | `.env` settings, plus `config/runtime.py` thresholds that are editable live. |
| Security | `security` | JWT + Argon2, prompt-injection detection and wrapping, PII masking, audit log. |

## 2. Data flow diagrams

### Level 0 (context)

```mermaid
flowchart LR
  C([Customer]) -- complaint, replies, rating --> S((SupportNova))
  S -- status, messages, resolution --> C
  A([Agent]) -- analysis request, replies, status --> S
  S -- brief, recommendation, flags --> A
  R([Reviewer]) -- decisions --> S
  S -- review queue --> R
  M([Manager]) -- report requests, hidden packs --> S
  S -- analytics, reports, accuracy --> M
  AD([Administrator]) -- documents, rules, thresholds --> S
  S -- change impact --> AD
  S -- prompt + untrusted complaint --> G([GenAI provider])
  G -- structured JSON --> S
```

### Level 1 (complaint analysis)

```mermaid
flowchart TB
  In[1 · Intake<br/>validate · sanitize · dedupe] --> D1[(complaints)]
  D1 --> P[2 · Pipeline 2<br/>rule match · escalation · routing · SLA]
  KB[(knowledge_documents · document_chunks)] --> Ret[3 · Retrieval + precedence]
  Ret --> P
  Ret --> G[4 · Pipeline 1<br/>prompt · provider chain]
  D1 --> G
  G --> V[5 · Validation<br/>schema · promises · hallucination · eligibility]
  P --> V
  V --> Cmp[6 · Comparison · verification score]
  Cmp --> D2[(genai_runs · validation_results · comparisons)]
  Cmp --> Q{review needed?}
  Q -- yes --> RQ[7 · Manual review queue]
  Q -- no --> Work[8 · Agent works the case]
  RQ --> Work
  Work --> Msg[9 · Guarded customer messages]
  Msg --> D3[(complaint_messages · audit_log)]
```

## 3. Use cases

```mermaid
flowchart LR
  Customer((Customer))
  Agent((Agent))
  Reviewer((Reviewer))
  Manager((Manager))
  Admin((Administrator))
  subgraph SupportNova
    UC1[Submit complaint]
    UC2[Track status · ask Nova]
    UC3[Reply · rate resolution · reopen]
    UC4[Analyze complaint]
    UC5[Message customer · request info]
    UC6[Update status · assign]
    UC7[Review: approve / reject / modify /<br/>reclassify / reassign / escalate /<br/>regenerate / comment]
    UC8[View analytics · export reports]
    UC9[Import hidden pack · score accuracy]
    UC10[Upload policy · see change impact]
    UC11[Edit rules · thresholds · SLA · taxonomy]
    UC12[Manage users]
  end
  Customer --> UC1 & UC2 & UC3
  Agent --> UC4 & UC5 & UC6
  Reviewer --> UC7 & UC4
  Manager --> UC8 & UC9
  Admin --> UC10 & UC11 & UC12 & UC8
```

| Role | Can | Cannot |
|---|---|---|
| Customer | File, track and reply to their own complaints; rate and close or reopen; ask Nova | See internal notes, other customers, staff pages |
| Agent | Analyze, message, assign and change status on unassigned and own complaints | Override the promise guard, make review decisions, change configuration |
| Reviewer | Everything an agent can, plus all review actions, batch re-analysis and guard override (audited) | Configuration |
| Manager | All complaints, analytics, reports, evaluation | Configuration |
| Administrator | Everything, plus documents, rules, thresholds, users | — |

## 4. Activity: complaint lifecycle

```mermaid
stateDiagram-v2
  [*] --> submitted: customer or staff submits
  submitted --> analyzed: both pipelines run
  analyzed --> escalated: mandatory escalation
  analyzed --> assigned: routed / assigned
  assigned --> in_progress: agent works it
  in_progress --> awaiting_customer: request information
  awaiting_customer --> in_progress: customer replies
  escalated --> in_progress: reviewer approves
  in_progress --> resolved: agent resolves
  resolved --> closed: customer confirms and rates
  resolved --> reopened: customer reopens
  reopened --> analyzed: re-analysis keeps repeat flag
  closed --> [*]
```

## 5. Sequences

### Analyzing a complaint

```mermaid
sequenceDiagram
  actor Agent
  participant API as FastAPI
  participant P2 as Pipeline 2 (Python)
  participant KB as Retrieval
  participant P1 as Pipeline 1 (GenAI)
  participant DB as PostgreSQL
  Agent->>API: POST /complaints/{id}/analyze
  API->>P2: repeat check, rule match, escalation, routing
  API->>KB: BM25 policy chunks (usable versions first)
  API->>P1: prompt vN + wrapped complaint + chunks
  alt provider answers valid JSON in budget
    P1-->>API: structured intelligence
  else invalid, timeout or no credit
    P1-->>API: failure after retries → Python-only result
  end
  API->>P2: validate: schema, eligibility, precedence, promises, hallucination
  P2-->>API: python_output, flags, review reasons, score
  API->>DB: genai_run, validation_result, comparison, SLA, follow-up, audit
  API-->>Agent: complaint with both recommendations
```

### Sending a reply

```mermaid
sequenceDiagram
  actor Agent
  participant API
  participant Guard as reply_flags
  actor Customer
  Agent->>API: POST /complaints/{id}/messages {body}
  API->>Guard: promises, timelines vs governing policy, invented facts
  alt flags raised and no reviewer override
    API-->>Agent: 422 with flags (nothing sent)
  else clean, or reviewer override (audited)
    API->>API: store, first-response SLA, status change
    API-->>Customer: "NimbusCarta Support" message + notification
  end
```

### Hidden policy update

```mermaid
sequenceDiagram
  actor Admin
  participant KB as /knowledge-base/documents
  participant Impact as policy_change_impact
  actor Reviewer
  Admin->>KB: upload DEL-POL-04 v3.0 (active)
  KB->>KB: validate · parse · chunk · supersede v1.0
  KB->>Impact: diff sections and timelines; rules citing the code; escalation rules naming it
  KB->>KB: flag open complaints that relied on it (needs_reanalysis)
  KB-->>Admin: impact report
  Reviewer->>KB: POST /complaints/reanalyze-flagged
  KB-->>Reviewer: re-analyzed codes, remaining 0
```

## 6. Data model (core tables)

```mermaid
erDiagram
  USERS ||--o| CUSTOMERS : "customer profile"
  CUSTOMERS ||--o{ COMPLAINTS : files
  DEPARTMENTS ||--o{ COMPLAINTS : "assigned to"
  COMPLAINTS ||--o{ GENAI_RUNS : "Pipeline 1"
  COMPLAINTS ||--o{ VALIDATION_RESULTS : "Pipeline 2"
  COMPLAINTS ||--o{ COMPARISONS : compares
  COMPLAINTS ||--o{ REVIEW_ACTIONS : reviewed
  COMPLAINTS ||--o{ COMPLAINT_MESSAGES : thread
  COMPLAINTS ||--o| COMPLAINT_FEEDBACK : CSAT
  COMPLAINTS ||--o{ FOLLOWUPS : schedules
  COMPLAINTS ||--o{ COMPLAINT_ATTACHMENTS : evidence
  KNOWLEDGE_DOCUMENTS ||--o{ DOCUMENT_CHUNKS : "split into"
  COMPLAINT_CATEGORIES ||--o{ COMPLAINT_SUBCATEGORIES : has
  RESOLUTION_RULES }o--|| KNOWLEDGE_DOCUMENTS : "cites policy_code"
  EVALUATION_RUNS ||--o{ EVALUATION_ITEMS : scores
  CHAT_SESSIONS ||--o{ CHAT_MESSAGES : holds
```

Other tables:

- `escalation_rules`, `priority_rules`, `sla_policies`;
- `app_settings`, which holds runtime thresholds;
- `prompt_templates`;
- `audit_log`, which is append-only;
- `notification_state`.

The denormalized columns on `complaints` let filters and dashboards run in SQL:

- `category`, `subcategory`, `urgency`, `priority`, `sentiment`;
- `escalation_required`, `pending_review`, `needs_reanalysis`;
- `sla_*`, `first_responded_at`.

They are refreshed by `sync_classification()` after each analysis or review.

## 7. Key design decisions

1. **Python is the ground truth.** Urgency, priority, routing, escalation and eligibility all come from configurable tables. Sentiment is recorded but never read by urgency logic (`urgency_basis` in checks).
2. **Policy precedence.** An active policy beats a compliance document, which beats SLA, SOP, escalation, routing, guideline, template and then FAQ (`knowledge_base/precedence.py`). Superseded, draft and expired documents are never the primary basis.
   - When a lower-ranked document states a different timeline, rate or automatic entitlement, `resolve_precedence` records the conflict. For example, the FAQ says card refunds can be instant, while REF-POL-01 says 7–10 business days.
   - A complaint or draft reply that relies on the lower-ranked statement is flagged `lower_precedence_conflict` and goes to review.
3. **Eligibility is conditional.** The rule says whether a remedy can apply. `python_validation/eligibility.py` then checks the policy conditions: the 30-day replacement window, product condition, prior replacements, the return window and the warranty. Anything it cannot verify is listed as "needs check", never guessed.
4. **Untrusted input.** Complaint text and uploaded documents are wrapped as data, scanned for injection, and never obeyed. Nova refuses injection attempts and filters staff-only content for customers.
5. **Nothing fabricated.** Without GenAI, scores are `null`, GenAI columns read "not run", and the Python sentiment is labelled as an estimate.
6. **Live configuration.** Categories, subcategories, departments, rules (create, edit, toggle), escalation rules, the priority table, SLA targets and thresholds all change at runtime and are audited.
7. **Hidden data readiness.** Complaint packs import through the Evaluation page. Policy documents upload with a change-impact report and a batch re-analysis.

## 8. Deployment

```mermaid
flowchart LR
  User((Browser)) -->|HTTPS| Web["Docker container<br/>uvicorn src.main:app<br/>serves /api + built SPA"]
  Web --> PG[(Managed PostgreSQL)]
  Web -->|optional| LLM[GenAI provider APIs]
```

- `Dockerfile` builds the React app and runs FastAPI. FastAPI serves the SPA from the same origin, so no CORS setup is needed.
- `render.yaml` provisions the web service and the database, and generates `SECRET_KEY`.
- Hosted `postgres://` URLs are converted to the psycopg driver automatically.
- For local setup without Docker, see `documentation/INSTALLATION.md`.
