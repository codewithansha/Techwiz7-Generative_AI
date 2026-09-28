# SupportNova — Master Project Documentation

> **Audit-based documentation.** Every statement in this document has been verified against the actual source files. Where something could not be confirmed from the code, it is clearly marked as **Not confirmed / Not found**.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Repository Layout & File Inventory](#2-repository-layout--file-inventory)
3. [Technology Stack](#3-technology-stack)
4. [Architecture Overview](#4-architecture-overview)
5. [Backend Entry Point](#5-backend-entry-point)
6. [Database Schema](#6-database-schema)
7. [Role & Permission System](#7-role--permission-system)
8. [Authentication & Security](#8-authentication--security)
9. [Configuration System](#9-configuration-system)
10. [Complaint Lifecycle](#10-complaint-lifecycle)
11. [GenAI Pipeline (Pipeline 1)](#11-genai-pipeline-pipeline-1)
12. [Python Validation Pipeline (Pipeline 2)](#12-python-validation-pipeline-pipeline-2)
13. [Comparison Engine](#13-comparison-engine)
14. [Complaint Classification Rules Engine](#14-complaint-classification-rules-engine)
15. [Knowledge Base & Document Processing](#15-knowledge-base--document-processing)
16. [SLA System](#16-sla-system)
17. [Multilingual & Translation System](#17-multilingual--translation-system)
18. [Notification System](#18-notification-system)
19. [AI Assistant](#19-ai-assistant)
20. [Evaluation Framework](#20-evaluation-framework)
21. [Analytics & Reporting](#21-analytics--reporting)
22. [Backend API Reference](#22-backend-api-reference)
23. [Frontend Application](#23-frontend-application)
24. [Frontend Page Inventory](#24-frontend-page-inventory)
25. [Frontend State Management](#25-frontend-state-management)
26. [Frontend Design System](#26-frontend-design-system)
27. [Products & Orders Subsystem](#27-products--orders-subsystem)
28. [Test Suite](#28-test-suite)
29. [Seed Data](#29-seed-data)
30. [Deployment & Environment Variables](#30-deployment--environment-variables)
31. [Demo Accounts](#31-demo-accounts)

---

## 1. Project Overview

SupportNova is an **intelligent customer support complaint management platform** targeting a consumer electronics e-commerce organization. Its core differentiator is a **dual-pipeline AI architecture**: every complaint is analyzed by two completely independent systems whose outputs are automatically compared, and any disagreement flags the case for human review.

**Domain**: Consumer electronics e-commerce (confirmed from `config/settings.py`: `organization_domain = "Consumer electronics e-commerce"`)

**Organization name**: SupportNova (confirmed from `config/settings.py`)

**Core value proposition**:
- Automated triage, classification, routing, and policy-grounded resolution for customer complaints
- Dual-pipeline AI verification: GenAI (LLM) output is cross-validated by a deterministic Python engine
- Role-differentiated workspace for customers, agents, reviewers, managers, and administrators
- Full audit trail, SLA enforcement, knowledge-base grounding, and multilingual support

---

## 2. Repository Layout & File Inventory

All paths are relative to the project root (`SupportNova_Project/`).

```
SupportNova_Project/
│
├── src/                          # FastAPI application layer
│   ├── main.py                   # App factory, lifespan, middleware, route registration
│   ├── api/                      # Endpoint modules
│   │   ├── auth.py               # Login, registration, /me
│   │   ├── complaints.py         # Full complaint CRUD + analysis trigger
│   │   ├── analytics.py          # Dashboards, metrics, trends, reports, export
│   │   ├── assistant.py          # AI assistant chat endpoint
│   │   ├── config_api.py         # Settings/rules CRUD (rules, SLA, departments, etc.)
│   │   ├── evaluation.py         # CSV/XLSX import-based accuracy evaluation
│   │   ├── knowledge_base.py     # Document upload, chunking, status management
│   │   ├── notifications.py      # Notification listing and mark-seen
│   │   ├── products.py           # Products catalog endpoint
│   │   ├── orders.py             # Orders + invoice endpoints (PDF, PNG)
│   │   ├── translation.py        # Translation, detect-language, preference endpoints
│   │   └── users.py              # User CRUD and admin controls
│   └── services/
│       └── analysis.py           # Core analysis orchestrator (calls both pipelines)
│
├── database/
│   ├── models.py                 # All SQLAlchemy ORM models
│   ├── session.py                # Database session factory
│   └── seed.py                   # Reference data seeding (departments, categories, rules, docs, users, products, orders)
│
├── config/
│   ├── settings.py               # Pydantic BaseSettings — all app configuration
│   └── runtime.py                # Dynamic threshold runtime getter
│
├── security/
│   ├── auth.py                   # JWT creation/validation, password hashing, role guards
│   ├── pii.py                    # PII masking (emails, phones, card numbers) before LLM
│   ├── prompt_injection.py       # Prompt injection detection patterns
│   ├── audit.py                  # Audit log writer
│   └── throttle.py               # Rate limiting logic
│
├── genai_pipeline/
│   ├── client.py                 # Multi-provider LLM client with failover chain
│   └── pipeline.py               # Orchestrates GenAI call + policy retrieval
│
├── python_validation/
│   └── pipeline.py               # Deterministic validation: rule-matching, escalation, hallucination detection
│
├── comparison_engine/
│   └── compare.py                # Field-by-field comparison of GenAI vs Python outputs
│
├── complaint_rules/
│   ├── engine.py                 # Keyword-based rule classification engine
│   ├── matching.py               # Keyword scoring and position utilities
│   └── rule_matrix.csv           # Resolution Rule Matrix (seeded from DB, also exported here)
│
├── complaint_processing/
│   ├── duplicates.py             # Near-duplicate and repeat complaint detection
│   ├── preprocess.py             # Metadata extraction from complaint text
│   └── sla.py                    # SLA application, risk refresh, first-response tracking
│
├── knowledge_base/
│   ├── retrieval.py              # Policy chunk retrieval for GenAI context
│   ├── precedence.py             # Policy precedence hierarchy (which policy governs)
│   └── impact.py                 # Policy change impact analysis
│
├── document_processing/
│   ├── attachments.py            # File upload processing, evidence extraction (PDF, image, DOCX, TXT)
│   ├── chunking.py               # Document to section chunks
│   ├── parser.py                 # PDF/DOCX/TXT text extraction
│   └── validate.py               # Attachment validation (size, type)
│
├── prompt_templates/
│   └── loader.py                 # Prompt template loader (versions v1, v2, v3)
│
├── tests/
│   ├── conftest.py               # Pytest fixtures (test DB, test client)
│   ├── test_api_integration.py   # End-to-end API integration tests (34 KB)
│   ├── test_attachments.py       # File upload and evidence extraction tests
│   ├── test_core_rules.py        # Rule engine unit tests
│   ├── test_dataset.py           # Evaluation dataset tests
│   ├── test_genai_fallback.py    # GenAI provider failover tests
│   ├── test_live_config.py       # Live configuration API tests
│   ├── test_local_providers.py   # Local provider (Ollama) tests
│   ├── test_matching_and_checks.py  # Keyword matching and check logic tests
│   ├── test_multilingual.py      # Multilingual/translation tests
│   ├── test_priority_traps.py    # Priority override trap tests
│   ├── test_rule_matrix_and_docs.py # Rule matrix and knowledge doc tests
│   └── test_security_adversarial.py # Security and adversarial input tests (36 KB)
│
├── frontend/                     # React + TypeScript SPA
│   ├── src/
│   │   ├── SupportNovaApp.tsx    # Main application component (2209 lines)
│   │   ├── api.ts                # Full typed API client (all backend calls)
│   │   ├── types.ts              # All TypeScript interface/type definitions
│   │   ├── store.ts              # Zustand global state store
│   │   ├── ui.tsx                # Shared UI component library
│   │   ├── supportnova.css       # Main stylesheet (6239 lines)
│   │   ├── Assistant.tsx         # Floating AI assistant widget
│   │   ├── Engagement.tsx        # Conversation, CSAT, EvaluationPage, NotificationBell, StarRating
│   │   ├── SupportNovaLoginHero.tsx  # Login page hero component
│   │   ├── SystemTourModal.tsx   # In-app system/role tour modal
│   │   ├── TeamPage.tsx          # Team credits page (/team)
│   │   ├── CategoryOverviewStats.tsx # Category statistics widget
│   │   └── team-members.css      # Team page styles
│   ├── index.html
│   ├── vite.config.ts
│   ├── tsconfig.json
│   └── package.json
│
├── .env.example                  # Full environment variable template
├── requirements.txt              # Python dependencies
└── PROJECT_DOCUMENTATION.md     # This file
```

---

## 3. Technology Stack

### Backend

| Concern | Technology | Confirmed Source |
|---|---|---|
| Web Framework | **FastAPI** | `requirements.txt`, `src/main.py` |
| Python Version | >=3.11 | `requirements.txt` |
| ORM | **SQLAlchemy 2.x** (sync, psycopg 3 driver) | `requirements.txt`, `database/models.py` |
| Database | **PostgreSQL** | `config/settings.py` |
| Configuration | **pydantic-settings** (`BaseSettings`) | `config/settings.py` |
| Authentication | **python-jose** (JWT, HS256), **passlib** (Argon2 + bcrypt) | `security/auth.py` |
| AI — OpenAI | **openai** SDK | `requirements.txt` |
| AI — Google | **google-generativeai** | `requirements.txt` |
| AI — Anthropic | **anthropic** | `requirements.txt` |
| AI — Groq | **groq** (OpenAI-compatible) | `requirements.txt` |
| AI — Ollama | HTTP call to local `ollama` server | `genai_pipeline/client.py` |
| File parsing | **pdfplumber** (PDF), **python-docx** (DOCX), **Pillow** (images) | `requirements.txt` |
| Rate limiting | Custom token-bucket (`security/throttle.py`) | `security/throttle.py` |
| Report export | **openpyxl** (XLSX), built-in `csv` | `requirements.txt` |
| PDF invoices | **reportlab** | `requirements.txt` |
| Image invoices | **Pillow** | `requirements.txt` |
| Similarity | **difflib** (`SequenceMatcher`) | `complaint_processing/duplicates.py` |
| Testing | **pytest**, **pytest-asyncio**, **httpx** | `requirements.txt` |

### Frontend

| Concern | Technology | Confirmed Source |
|---|---|---|
| Framework | **React 18** + **TypeScript** | `frontend/package.json` |
| Build Tool | **Vite** | `frontend/vite.config.ts` |
| Routing | **React Router v6** | `frontend/package.json` |
| Global State | **Zustand** | `frontend/src/store.ts` |
| Charts | **Recharts** (Area, Bar, Pie, Scatter) | `frontend/src/SupportNovaApp.tsx` |
| Icons | **Lucide React** | `frontend/src/SupportNovaApp.tsx` |
| Notifications | **Sonner** (toast library) | `frontend/package.json` |
| Fonts | **DM Sans** + **Manrope** (Google Fonts) | `frontend/src/supportnova.css` |
| Styling | **Vanilla CSS** with CSS custom properties | `frontend/src/supportnova.css` |
| API Client | Custom `fetch`-based client (`api.ts`) | `frontend/src/api.ts` |

---

## 4. Architecture Overview

```
Browser (React SPA)
  Role-gated pages, Recharts dashboards, real-time toasts
      |
      | REST (JSON) — Bearer JWT
      |
FastAPI Application (src/main.py)
  CORS, static files, lifespan, rate limiter
  Routers: auth, complaints, analytics, assistant, config, evaluation,
           knowledge-base, notifications, products, orders, translation, users
      |
      +--- PostgreSQL (SQLAlchemy)
      |
      +--- Pipeline 1: GenAI (LLM)
      |    Multi-provider failover: openai -> groq -> grok -> gemini -> anthropic -> ollama
      |
      +--- Pipeline 2: Python Validation
      |    Deterministic rules, escalation engine, hallucination guard, policy conflict check
      |
      +--- Comparison Engine
           7-field comparison: verified / partial_match / manual_review
```

**Key architectural decisions observed in the code:**

1. **Python is Ground Truth**: Sentiment from GenAI is labelled *"do not affect urgency"* in the UI. Urgency, priority, routing, and escalation are always set by the Python pipeline.
2. **Safety First in Classification**: The rule engine (`complaint_rules/engine.py`) always promotes an escalation-mandating rule over any other match regardless of keyword score.
3. **Time-budgeted GenAI**: The GenAI chain has a hard `genai_total_budget_seconds` (default: 15s) to stay within the 20-second SRS target.
4. **Human-in-the-loop**: Disagreements between pipelines trigger `requires_manual_review`, blocking automated resolution and queuing the case for human review.

---

## 5. Backend Entry Point

**File**: `src/main.py`

### Lifespan events
On startup:
1. Database tables are created via `Base.metadata.create_all(engine)`
2. Reference data is seeded via `seed_reference_data(db)` (idempotent)
3. GenAI provider chain is initialized

On shutdown: Database connection pool is disposed.

### Registered API routers (all confirmed from src/main.py)
- `auth` → `/api/v1/auth`
- `complaints` → `/api/v1/complaints`
- `analytics` → `/api/v1` (dashboards, analytics, trends, reports)
- `assistant` → `/api/v1/assistant`
- `config_api` → `/api/v1/config`
- `evaluation` → `/api/v1/evaluation`
- `knowledge_base` → `/api/v1/knowledge-base`
- `notifications` → `/api/v1/notifications`
- `products` → `/api/v1/products`
- `orders` → `/api/v1/orders`
- `translation` → `/api/v1/translation`
- `users` → `/api/v1/users`

### Middleware
- **CORS**: Origins from `CORS_ORIGINS` env var (comma-separated)
- **Static files**: React `dist/` served at `/` when `FRONTEND_DIST` is configured
- **Rate limiter**: Applied per IP/user via `security/throttle.py`

### Health endpoint
`GET /health` returns `{ "status": "ok", "database": "ok|error", "genai_configured": bool }`

---

## 6. Database Schema

**File**: `database/models.py`

**Driver**: `postgresql+psycopg` (psycopg 3 sync driver)

### Core Tables

#### users
| Column | Type | Notes |
|---|---|---|
| id | Integer PK | |
| email | String (unique) | Login identifier |
| full_name | String | |
| hashed_password | String | Argon2 hash |
| role | Enum(UserRole) | customer, agent, reviewer, manager, administrator |
| is_active | Boolean | Soft deactivation |
| created_at | DateTime | |

#### customers
| Column | Type | Notes |
|---|---|---|
| id | Integer PK | |
| user_id | FK → users | One-to-one |
| customer_code | String (unique) | e.g. CUST-10001 |
| customer_type | Enum(CustomerType) | standard, vip, wholesale, enterprise |
| preferred_language | String | ISO code or 'auto' |

#### complaints
| Column | Type | Notes |
|---|---|---|
| id | Integer PK | |
| complaint_code | String | CMP-{id:05d}, unique |
| title | String | |
| description | Text | Raw customer text |
| status | Enum(ComplaintStatus) | new, analyzed, assigned, in_progress, awaiting_customer, escalated, resolved, closed, reopened |
| product_or_service | String | |
| order_reference | String | Format: NC-XXXXXX |
| previous_complaint_reference | String | Format: CMP-XXXXX |
| customer_type | String | |
| customer_code | String | |
| channel | String | web, email, chat, portal, messaging |
| preferred_contact_channel | String | email, chat, phone |
| requested_resolution | Text | |
| latest_update | Text | Customer-visible status message |
| sla_risk | Boolean | Computed when >=75% of SLA window elapsed |
| sla_resolution_due | DateTime | |
| sla_first_response_due | DateTime | |
| first_responded_at | DateTime | |
| follow_up_at | DateTime | |
| is_repeat | Boolean | |
| is_adversarial | Boolean | |
| duplicate_of | String | Linked complaint code |
| incident_date | Date | Optional |
| source_language | String | Detected language code |
| translated_title | String | English translation |
| translated_description | Text | English translation |
| translation_confidence | Float | |
| needs_reanalysis | Boolean | Set when a referenced policy is updated |
| customer_id | FK → customers | |
| assigned_to_id | FK → users | |
| assigned_department_id | FK → departments | |
| created_at / updated_at / analyzed_at | DateTime | |

**Relationships**: `validation_results`, `genai_runs`, `comparisons`, `attachments`, `messages`, `reviews`, `followups`, `feedback`

#### genai_runs
| Column | Type | Notes |
|---|---|---|
| id | Integer PK | |
| complaint_id | FK → complaints | |
| provider | String | openai / gemini / anthropic / grok / groq / ollama |
| model | String | Specific model name |
| prompt_version | String | v1 / v2 / v3 |
| attempt | Integer | Retry number |
| structured_output | JSONB | Full GenAI response as structured dict |
| raw_response | Text | Raw LLM text output |
| valid | Boolean | Whether output parsed successfully |
| error | String | Error message if failed |
| latency_ms | Integer | |
| policy_versions | JSONB | Policy docs retrieved for context |
| created_at | DateTime | |

#### validation_results
| Column | Type | Notes |
|---|---|---|
| id | Integer PK | |
| complaint_id | FK → complaints | |
| python_output | JSONB | Full Python pipeline classification result |
| flags | JSONB | Validation issues raised |
| evidence | JSONB | Extracted attachment evidence |
| created_at | DateTime | |

#### comparison_results
| Column | Type | Notes |
|---|---|---|
| id | Integer PK | |
| complaint_id | FK → complaints | |
| field_comparisons | JSONB | Per-field match/mismatch dict |
| match_count | Integer | |
| mismatch_count | Integer | |
| verification_score | Float | 0-100 |
| verification_status | String | verified / partial_match / manual_review |
| requires_manual_review | Boolean | |
| created_at | DateTime | |

#### complaint_messages
| Column | Type | Notes |
|---|---|---|
| id | Integer PK | |
| complaint_id | FK → complaints | |
| direction | Enum | to_customer / from_customer / internal |
| body | Text | |
| author | String | |
| source | String | genai / agent / customer / system |
| flags | JSONB | Validation flags |
| read_by_customer | Boolean | |
| translated_body | Text | |
| source_language / target_language | String | |
| translation_status / translation_confidence | String / Float | |
| created_at | DateTime | |

#### knowledge_documents
| Column | Type | Notes |
|---|---|---|
| id | Integer PK | |
| document_code | String (unique) | e.g. SAF-POL-01 |
| title | String | |
| version | String | |
| category | Enum(DocumentCategory) | policy, sop, faq, sla, routing, escalation, compliance, guideline, template |
| status | Enum(DocumentStatus) | active, draft, previous, superseded |
| effective_date / expiry_date | Date | |
| usable | Boolean | active AND within date window |

#### document_chunks
`id`, `document_id` (FK), `chunk_code`, `section`, `heading`, `page_number`, `version`, `content`

#### departments
`id`, `code` (e.g. BIL), `name`, `description`, `is_active`

#### complaint_categories
`id`, `code`, `name`, `is_active`, `default_department_id`

#### complaint_subcategories
`id`, `category_id`, `code`, `name`, `keywords` (JSONB), `is_active`

#### resolution_rules
| Column | Type | Notes |
|---|---|---|
| id | Integer PK | |
| rule_code | String (unique) | e.g. RR-001 |
| category_code / subcategory_code | String | |
| department_code | String | |
| urgency | Enum(UrgencyLevel) | low, medium, high, critical |
| priority | Enum(PriorityCode) | P0, P1, P2, P3 |
| escalation_required | Boolean | |
| escalation_level | Enum(EscalationLevel) | no_escalation, supervisor_review, department_manager, specialist_team, compliance_review, critical_management |
| policy_code / policy_section | String | |
| conditions | JSONB | { "keywords": [...] } |
| required_actions / prohibited_actions | JSONB | String lists |
| supporting_department_codes | JSONB | |
| follow_up_required | Boolean | |
| refund_eligible / replacement_eligible | Boolean nullable | True / False / None (needs check) |
| compensation_permitted | Boolean | |
| is_active | Boolean | |

#### escalation_rules
`rule_code` (PK), `name`, `keywords` (JSONB), `categories` (JSONB), `customer_types` (JSONB), `min_repeat_count`, `escalation_level`, `force_urgency` (nullable), `reason`, `is_active`

#### sla_policies
`code`, `name`, `customer_type` (nullable = applies to all), `priority`, `first_response_minutes`, `resolution_hours`

#### priority_rules
Maps `urgency` → `priority`. A matched rule can only **raise** priority, never lower it.

#### products
`id`, `product_number` (e.g. NC-000001), `name`, `title`, `description`, `price`, `category`, `image` (URL), `specs` (JSONB), `is_active`

#### orders
`id`, `order_number` (e.g. NC-100001), `customer_id`, `items` (JSONB), `total_amount`, `quantity`, `order_summary`, `payment_status`, `payment_method`, `shipping_address`, `created_at`

#### complaint_feedback
`id`, `complaint_id` (FK, unique), `rating` (1-5), `comment`, `created_at`

#### prompt_templates
`id`, `name`, `version`, `template` (Text), `is_active`

#### audit_log
`id`, `complaint_id`, `actor_id`, `action`, `details` (JSONB), `created_at`

#### followups
`id`, `complaint_id`, `type` (e.g. customer_reopened), `message`, `scheduled_at`, `completed`

#### notifications
`id`, `user_id`, `complaint_id`, `title`, `text`, `kind`, `at`, `unread`

---

## 7. Role & Permission System

**Five roles** defined in `UserRole` enum, enforced via FastAPI dependency injection.

| Role | Capabilities |
|---|---|
| customer | Submit complaints, view own complaints, send messages, confirm/reopen resolutions, submit CSAT, view own orders and products |
| agent | All customer + view all complaints, trigger analysis, update status, assign to self, send internal and customer messages |
| reviewer | All agent + access review queue, approve/reject/override AI decisions |
| manager | All reviewer + full analytics, reports, knowledge base, evaluation framework |
| administrator | All manager + user management, settings, thresholds, rule CRUD, SLA editing, document upload/status |

### Backend role guards (confirmed in `security/auth.py`)

```python
StaffUser     = agent | reviewer | manager | administrator
ReviewerUser  = reviewer | manager | administrator
ManagerUser   = manager | administrator
AdminUser     = administrator only
CurrentUser   = any authenticated user
```

### Frontend route guards (confirmed in `frontend/src/SupportNovaApp.tsx`)

```tsx
// Review queue
{role && REVIEWER_ROLES.includes(role) && <Route path="review" ... />}
// Knowledge base — staff only
{role !== 'customer' && <Route path="knowledge" ... />}
// Reports and Evaluation — manager/administrator
{(role === 'manager' || role === 'administrator') && <Route path="reports" ... />}
{(role === 'manager' || role === 'administrator') && <Route path="evaluation" ... />}
// Settings — administrator only
{role === 'administrator' && <Route path="settings" ... />}
```

---

## 8. Authentication & Security

**File**: `security/auth.py`

### Authentication flow
1. `POST /api/v1/auth/login-json` — JSON body `{ email, password }`
2. Password verified against Argon2/bcrypt hash
3. JWT signed with `SECRET_KEY` using HS256, expires after `ACCESS_TOKEN_EXPIRE_MINUTES` (default: 480 = 8 hours)
4. JWT payload: `{ "sub": email, "role": role, "exp": expiry }`
5. All protected endpoints: `Authorization: Bearer <token>`
6. On 401: frontend clears localStorage and fires `supportnova:unauthorized` → auto-logout

### Password hashing
- Primary: **Argon2** (passlib with argon2-cffi)
- Fallback: **bcrypt** (for migrated accounts)

### PII Masking (`security/pii.py`)
Before sending to any LLM: emails → `[EMAIL]`, phones → `[PHONE]`, credit card numbers → `[CARD]`

### Prompt Injection Detection (`security/prompt_injection.py`)
- Detects patterns like "ignore previous instructions" in complaint text
- Stored as `python_output.prompt_injection.detected`, flagged in UI
- Complaint is wrapped as untrusted data in the prompt, never merged into instructions

### Rate Limiting (`security/throttle.py`)
Token-bucket implementation, applied per IP/user at middleware level.

### Audit Logging (`security/audit.py`)
Every status change, assignment, review, and analysis written to `audit_log`. Accessible via `GET /api/v1/complaints/{id}/history`.

---

## 9. Configuration System

**File**: `config/settings.py`

Loaded from environment variables or `.env` file via pydantic-settings `BaseSettings`. Singleton via `@lru_cache` on `get_settings()`.

### Application settings
| Setting | Default | Description |
|---|---|---|
| APP_NAME | SupportNova | |
| APP_ENV | development | |
| SECRET_KEY | dev-only-change-me | JWT secret — must change in production |
| ACCESS_TOKEN_EXPIRE_MINUTES | 480 | 8-hour sessions |
| ALGORITHM | HS256 | |
| DATABASE_URL | postgresql+psycopg://supportnova:supportnova@localhost:5432/supportnova | |
| CORS_ORIGINS | http://localhost:5173,http://localhost:3000 | Comma-separated |

### GenAI Pipeline 1 settings
| Setting | Default | Description |
|---|---|---|
| GENAI_PROVIDER | openai | Primary provider |
| GENAI_FALLBACK_PROVIDERS | grok,gemini,anthropic | Ordered fallback |
| GENAI_AUTO_FALLBACK | true | Appends any key-configured provider as last resort |
| OPENAI_API_KEY | (empty) | |
| OPENAI_MODEL | gpt-4o-mini | |
| GEMINI_API_KEY | (empty) | |
| GEMINI_MODEL | gemini-3.6-flash | |
| ANTHROPIC_API_KEY | (empty) | |
| ANTHROPIC_MODEL | claude-sonnet-4-20250514 | |
| GROK_API_KEY / XAI_API_KEY | (empty) | Either accepted |
| GROK_MODEL | grok-4-fast | |
| GROQ_API_KEY | (empty) | Free tier at console.groq.com/keys |
| GROQ_MODEL | llama-3.3-70b-versatile | |
| OLLAMA_ENABLED | false | Local fallback |
| OLLAMA_BASE_URL | http://localhost:11434 | |
| OLLAMA_MODEL | qwen2.5:3b | |
| OLLAMA_TIMEOUT_SECONDS | 90 | Longer for local CPU |
| GENAI_MAX_RETRIES | 3 | Per-provider retries |
| GENAI_TIMEOUT_SECONDS | 18 | Per-call timeout |
| GENAI_TOTAL_BUDGET_SECONDS | 15 | Hard wall for full chain (SRS 20s target) |
| PROMPT_VERSION | v3 | Active prompt template version |

### Python Pipeline 2 Thresholds
| Setting | Default | Description |
|---|---|---|
| DEFAULT_DEPARTMENT_CODE | REL | Customer Relations — fallback for unmatched complaints |
| HIGH_VALUE_THRESHOLD | 200000 | Order value above which escalation is considered |
| REPEAT_SIMILARITY_THRESHOLD | 55 | % text similarity to flag as repeat |

### Uploads
| Setting | Default |
|---|---|
| MAX_UPLOAD_MB | 15 |
| UPLOAD_DIR | uploads |

### Bootstrap Admin
| Setting | Default |
|---|---|
| BOOTSTRAP_ADMIN_EMAIL | admin@supportnova.example |
| BOOTSTRAP_ADMIN_PASSWORD | ChangeMeNow!23 |

### Dynamic runtime thresholds
`config/runtime.py` provides `get_threshold(db, key)` — reads from DB `threshold_overrides`, falls back to settings values. Administrators can change thresholds in the Settings UI without touching code.

---

## 10. Complaint Lifecycle

### Status flow (confirmed in `database/models.py`)
`new` → `analyzed` → `assigned` → `in_progress` → `awaiting_customer` → `escalated` → `resolved` → `closed`

Additional: `reopened` (customer disputes resolution)

### Full lifecycle

```
1. Customer submits complaint (POST /api/v1/complaints)
   -> Duplicate detection runs automatically
   -> If near-duplicate: linked, warning shown to staff
   -> Status: new
   -> Attachments uploaded separately (POST .../attachments)

2. Agent triggers analysis (POST /api/v1/complaints/{id}/analyze)
   -> PII masking applied
   -> Policy chunks retrieved from knowledge base
   -> Pipeline 1 (GenAI) runs: structured JSON output
   -> Pipeline 2 (Python) runs: deterministic classification
   -> Comparison engine compares 7 fields
   -> SLA applied based on priority and customer type
   -> If disagreement/escalation/flags: requires_manual_review = True
   -> Status: analyzed

3. Agent assigns complaint
   -> POST /api/v1/complaints/{id}/assign
   -> Status: assigned or in_progress

4. Agent communicates (POST /api/v1/complaints/{id}/messages)
   -> direction: to_customer / internal
   -> First customer-visible message sets first_responded_at

5. Review queue (if requires_manual_review)
   -> Reviewer approves / rejects / overrides classification
   -> POST /api/v1/complaints/{id}/review
   -> If override: classification.overridden = True, UI shows alert

6. Resolution
   -> Agent sets status = resolved
   -> Customer sees "Did this resolve your issue?"
   -> Customer confirms: status = closed, CSAT prompt shown
   -> Customer reopens: followup type=customer_reopened, status=reopened

7. CSAT
   -> POST /api/v1/complaints/{id}/feedback
   -> Rating 1-5 + optional comment
   -> Low rating (<=2) shows warning banner to staff
```

### Customer-visible status messages (from `src/services/analysis.py`)

| Status | Message |
|---|---|
| new | We have received your complaint. |
| analyzed | Our team is reviewing your complaint. |
| assigned | Your complaint has been assigned to a support specialist. |
| in_progress | Our team is working on your complaint. |
| awaiting_customer | We need a little more information from you to continue. |
| escalated | Your complaint has been escalated for priority handling. |
| resolved | Your complaint has been resolved. |
| closed | Your complaint is closed. |
| reopened | Your complaint has been reopened and is being reviewed again. |

---

## 11. GenAI Pipeline (Pipeline 1)

**Files**: `genai_pipeline/client.py`, `genai_pipeline/pipeline.py`

### Provider chain construction
```python
CHAT_PROVIDERS = ("openai", "groq", "grok", "gemini", "anthropic", "ollama")
```

At runtime, the chain is built as:
1. Primary provider (`GENAI_PROVIDER`)
2. Explicit fallback list (`GENAI_FALLBACK_PROVIDERS`)
3. Auto-fallback: any provider with a configured key not already in chain
4. Ollama appended last (local, answers without cloud keys)

### Failover strategy
- Each provider: up to `GENAI_MAX_RETRIES` (3) attempts
- Per-call timeout: 18s (Ollama: 90s)
- Hard wall: 15s stops starting new attempts
- On permanent error (auth failure, quota): provider **paused** with cooldown timer
- Paused providers shown in Settings → Pipelines → Resume button
- If all providers fail: Python-only mode, case flagged for manual review

### GenAI output schema (from `frontend/src/types.ts` `ComplaintIntelligence`)
The structured JSON contains:
- `complaint_summary`, `primary_issue`, `secondary_issues[]`
- `issue_category`, `subcategory`
- `sentiment` — positive / neutral / negative / strongly_negative
- `emotion_indicators[]` — descriptive only, never affects urgency/priority
- `urgency`, `priority`, `department`, `supporting_departments[]`
- `policy_id`, `policy_section`, `policy_version`, `policy_applicability`
- `resolution_steps[]`, `required_actions[]`, `prohibited_actions[]`
- `escalation_required`, `escalation_level`, `escalation_reason`
- `customer_response` — draft reply in requested tone
- `follow_up_required`, `follow_up_communication`
- `clarification_questions[]`, `agent_guidance[]`, `missing_information[]`
- `refund_eligible`, `replacement_eligible`, `compensation_permitted`
- `eligibility.checks[]` — policy condition pass/fail list
- `evidence` — attachment evidence summary
- `related_complaints[]`
- `prompt_injection` — `{ detected: bool, patterns: [] }`
- `entities` — named entities dict

### Prompt versions
Three versions (v1, v2, v3) stored in `prompt_templates` table. `PROMPT_VERSION=v3` is the default. Loaded by `prompt_templates/loader.py`.

---

## 12. Python Validation Pipeline (Pipeline 2)

**File**: `python_validation/pipeline.py`

The Python pipeline is the **deterministic ground truth**. It runs on every complaint regardless of GenAI availability.

### Steps (confirmed execution order)

1. **Rule-based classification** (`complaint_rules/engine.py`)
   - Keyword scoring against all active `ResolutionRule` records
   - Escalation-mandating rules always win regardless of score
   - Secondary issues and supporting departments identified

2. **Escalation rule enforcement** (`escalation_rules` table)
   - Keyword/category/customer_type/repeat-count checks
   - Can force urgency upgrade
   - These escalations are mandatory and override any GenAI suggestion

3. **Input validation flags** (stored in `validation_results.flags`)
   - blank_title, blank_description, very_short_description
   - invalid_order_format, invalid_previous_ref_format
   - prompt_injection_detected, pii_detected
   - high_value_customer_alert, repeat_complaint

4. **Repeat complaint detection** (`complaint_processing/duplicates.py`)
   - difflib.SequenceMatcher text similarity
   - Threshold: REPEAT_SIMILARITY_THRESHOLD (55%)
   - Also matches on same order_reference

5. **Hallucination detection**
   - Category/department/policy_id claimed by GenAI validated against DB
   - Mismatches flagged as `genai_hallucination`

6. **Policy conflict detection** (`knowledge_base/precedence.py`)
   - Conflicting policy statements identified and resolved by precedence
   - Stored in `checks.policy.precedence`

7. **Sentiment estimation** (Python-side, when GenAI unavailable)
   - Lexicon-based estimate, labelled "(Python estimate)" in UI
   - Display only — does not affect routing or priority

8. **SLA application** (`complaint_processing/sla.py`)
   - Selects applicable SLA policy (priority + customer type)
   - Sets `sla_resolution_due` and `sla_first_response_due`
   - Computes `sla_risk` at >=75% of resolution window

### Review trigger conditions
Cases flagged `requires_manual_review = True` when:
- Comparison returns `manual_review` (>=2 mismatches or escalation_required disagreement)
- Rule engine returns `ambiguous = True` (tie between categories)
- No rule matched (`matched = False`)
- A validation flag is active
- GenAI pipeline failed entirely
- A mandatory escalation rule triggered

---

## 13. Comparison Engine

**File**: `comparison_engine/compare.py`

### 7 compared fields
```python
COMPARISON_FIELDS = [
    "issue_category", "subcategory", "department",
    "urgency", "priority", "escalation_required", "policy_id"
]
```

### Scoring logic
```python
score = round(100 * matches / total, 2)

status = "verified"       # mismatches == 0
       = "manual_review"  # mismatches >= 2 OR escalation_required mismatch
       = "partial_match"  # otherwise
```

### Output stored in `comparison_results`
- `field_comparisons`: per-field `{ genai, python, match }` dict
- `verification_score`: 0-100%
- `verification_status`: verified / partial_match / manual_review
- `requires_manual_review`: bool

The Comparison tab on the complaint detail page visualizes this field-by-field (green = match, red = mismatch).

---

## 14. Complaint Classification Rules Engine

**File**: `complaint_rules/engine.py`

### Algorithm
1. Load all active `ResolutionRule` records from DB
2. Score each against complaint text using `keyword_score()` (whole-word matching)
3. Also score `ComplaintSubcategory.keywords` for categories without a rule
4. Filter to matched candidates (score > 0)
5. If any candidate mandates escalation: restrict pool to escalating candidates
6. Sort: best score → first mention position → higher urgency rank → rule_code
7. Primary = pool[0]; Secondary issues = up to 3 others; Supporting departments accumulated
8. `ambiguous = True` if runner-up has same score and primary is not escalating

### Fallback (no match)
Returns `{ issue_category: "Unclassified", department: DEFAULT_DEPARTMENT_CODE, ... }` with `matched = False`, `ambiguous = True` → triggers manual review.

### Seeded departments (from `database/seed.py`)
| Code | Name |
|---|---|
| BIL | Billing |
| TEC | Technical Support |
| LOG | Logistics |
| RET | Returns |
| WAR | Warranty |
| REL | Customer Relations |
| SEC | Account Security |
| CMP | Compliance |
| SAF | Safety |
| MGT | Management Escalations |

### Seeded categories
DEFECT, BILLING, DELIVERY, REFUND, ACCOUNT, TECH, SERVICE, WARRANTY, PRIVACY, SAFETY, STAFF, CANCEL

### Seeded subcategories (sample)
Damaged Product, Dead on Arrival, Duplicate Charge, Incorrect Charge, Delayed Delivery, Lost Shipment, Wrong Item, Overheating, Injury Risk, Unauthorized Access, Data Exposure, App Failure, Device Pairing, Long Wait, Warranty Denied, Rude Staff, Cancellation Blocked

---

## 15. Knowledge Base & Document Processing

**Files**: `knowledge_base/`, `document_processing/`

### Document upload flow
1. `POST /api/v1/knowledge-base/documents` (multipart: file + metadata)
2. `document_processing/parser.py` extracts text (PDF, DOCX, TXT, MD, CSV)
3. `document_processing/chunking.py` splits into section chunks
4. Chunks stored in `document_chunks`
5. If status=active: previous active version of same `document_code` → `superseded`
6. Complaints referencing superseded policy: `needs_reanalysis = True`
7. Impact analysis: sections added/changed/removed, affected rules

### Policy retrieval for GenAI
`knowledge_base/retrieval.py` retrieves chunks based on complaint category, department, and matched policy IDs to build `<policy_context>` in the prompt.

### Policy precedence
`knowledge_base/precedence.py` defines `PRECEDENCE` hierarchy. Higher-precedence policy governs; conflicts reported in "Validation controls" panel.

### Accepted formats
PDF, DOCX, TXT, MD, CSV (up to MAX_UPLOAD_MB = 15 MB)

### Document categories (confirmed from code)
policy, sop, faq, sla, routing, escalation, compliance, guideline, template

### Document statuses
active, draft, previous, superseded

---

## 16. SLA System

**File**: `complaint_processing/sla.py`

### Policy selection
Most specific matching `SlaPolicy` chosen:
1. Priority + customer_type match (most specific)
2. Priority + any customer_type
3. Default fallback

### Fields set on complaint
- `sla_resolution_due` = analyzed_at + resolution_hours
- `sla_first_response_due` = analyzed_at + first_response_minutes
- `sla_risk` = True when current_time >= 75% of resolution window
- `first_response` status: met / breached / pending / overdue / n/a

### SLA risk refresh
`refresh_sla_risk()` called on every complaint fetch from the analytics layer to keep `sla_risk` current without a scheduled job.

---

## 17. Multilingual & Translation System

**File**: `src/api/translation.py`

### Supported languages (confirmed from frontend code)
| Code | Name |
|---|---|
| en | English |
| ur_roman | Roman Urdu |
| ur | Urdu (اردو) |
| hi | Hindi (हिन्दी) |
| ms | Malay (Bahasa Melayu) |
| auto | Auto Detect |

### Features
- **Language detection**: `POST /api/v1/translation/detect` — language code, confidence, mixed flag
- **Translation**: `POST /api/v1/translation/translate`
- **Complaint auto-translation**: Non-English complaints get `source_language`, `translated_title`, `translated_description`, `translation_confidence`
- **Message translation**: Staff messages translated to customer's `preferred_language`
- **Customer preference**: `GET/PUT /api/v1/translation/preference` — stored on customer record
- **UI toggle**: `TranslatedTextToggle` component shows language chip with confidence and toggle
- **Languages endpoint**: `GET /api/v1/translation/languages`

---

## 18. Notification System

**File**: `src/api/notifications.py`

- `GET /api/v1/notifications` → `{ unread: number, items: NotificationItem[] }`
- `POST /api/v1/notifications/seen` → marks all as read
- Frontend: `NotificationBell` component in `Engagement.tsx` shows unread count badge

---

## 19. AI Assistant

**Files**: `src/api/assistant.py`, `frontend/src/Assistant.tsx`

- Floating chat widget on all authenticated pages
- `POST /api/v1/assistant/chat` — `{ message, session_id, complaint_id }`
- Response (`AssistantReply`):
  - `session_id` — conversation continuity
  - `reply` — text response
  - `intent` — detected intent
  - `source` — genai / knowledge_base / system
  - `citations[]` — knowledge base documents referenced
  - `actions[]` — open_complaint, use_draft, link, suggest
  - `complaints[]` — related complaints
  - `flags[]` — validation flags
- The assistant can pre-fill the complaint form via `use_draft` actions

---

## 20. Evaluation Framework

**Files**: `src/api/evaluation.py`, `frontend/src/Engagement.tsx` (`EvaluationPage`)

### Purpose
Import labeled CSV/XLSX with ground truth, run both pipelines, measure accuracy.

### API
- `GET /api/v1/evaluation/runs` — list all runs
- `POST /api/v1/evaluation/import` — upload CSV/XLSX, creates a run
- `GET /api/v1/evaluation/runs/{id}` — detailed results
- `GET /api/v1/evaluation/runs/{id}/report?fmt=csv|xlsx` — download comparison report

### Result fields (`EvaluationResult`)
- `accuracy.python` / `accuracy.genai` — per-field accuracy percentages
- `agreement` — Python vs GenAI agreement rates per field
- `mismatches[]` — row-level mismatches with expected/actual values
- `by_case_type` — breakdown by complaint type
- `import_errors` — malformed row count

---

## 21. Analytics & Reporting

**File**: `src/api/analytics.py`

### Dashboard endpoints
| Endpoint | Role | Returns |
|---|---|---|
| GET /api/v1/dashboards/admin | administrator | Full metrics + extras |
| GET /api/v1/dashboards/agent | staff | assigned, queue, escalation_warnings, sla_risks |
| GET /api/v1/dashboards/customer | any | Own complaints with status and department |
| GET /api/v1/analytics | any authenticated | Full Metrics object |
| GET /api/v1/analytics/trends?days=N | any authenticated | Trends object |

### Metrics fields
`total`, `analyzed`, `statuses`, `categories`, `departments`, `priorities`, `urgencies`, `sentiments`, `products`, `escalations`, `sla_risks`, `genai_python_mismatches`, `genai_compared`, `verified_matches`, `agreement_rate`, `average_verification_score`, `sla_compliance`, `average_resolution_hours`, `manual_review_cases`, `pending_reviews`, `repeat_complaints`, `csat` (average, responses, distribution, by_department, by_category, by_agent), `first_response` (met/breached/pending/overdue/compliance), `daily_volume[]`

### Trends fields
`window_days`, `daily`, `rising_categories[]`, `recurring_product_issues[]`, `escalation_spikes[]`, `repeated_service_failures`

### Report export
`GET /api/v1/reports/export?fmt={csv|xlsx|pdf}&report={key}`

| Key | Description |
|---|---|
| complaints | Complaint analysis |
| comparison | GenAI / Python comparison |
| escalations | Escalations |
| sla | SLA status |
| manual_review | Manual reviews |
| departments | Department performance |
| policy_usage | Policy usage |
| resolution_compliance | Resolution compliance |

---

## 22. Backend API Reference

All endpoints under `/api/v1/`. Auth: `Authorization: Bearer <JWT>` required except `/health` and `/api/v1/auth/login`.

### Authentication
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | /auth/login | None | OAuth2 form login |
| POST | /auth/login-json | None | JSON login (used by frontend) |
| GET | /auth/me | Any | Current user info |
| POST | /auth/register | None | Customer self-registration |

### Complaints
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | /complaints | Any | List/search with filters + pagination |
| POST | /complaints | Any | Submit new complaint |
| GET | /complaints/{id} | Any | Get complaint detail |
| POST | /complaints/{id}/analyze | Staff | Trigger dual-pipeline analysis |
| PATCH | /complaints/{id}/status | Staff | Update status + note |
| POST | /complaints/{id}/assign | Staff | Assign agent or department |
| POST | /complaints/{id}/review | Reviewer | Approve / reject / override |
| POST | /complaints/{id}/attachments | Any | Upload attachment |
| GET | /complaints/{id}/attachments/{att_id} | Any | Download attachment |
| GET | /complaints/{id}/messages | Any | List messages |
| POST | /complaints/{id}/messages | Any | Send message |
| POST | /complaints/{id}/messages/check | Any | Pre-check message for flags |
| POST | /complaints/{id}/customer-decision | Customer | Confirm resolution or reopen |
| POST | /complaints/{id}/feedback | Customer | Submit CSAT rating |
| GET | /complaints/{id}/history | Any | Full audit + review + run history |
| GET | /complaints/queue/manual-review | Reviewer | Manual review queue |
| POST | /complaints/reanalyze-flagged | Staff | Batch re-analyze needs_reanalysis |

### Config
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | /config/departments | Any | List departments |
| POST | /config/departments | Admin | Create department |
| GET | /config/categories | Any | List categories with subcategories |
| POST | /config/categories | Admin | Create category |
| POST | /config/categories/{code}/subcategories | Admin | Add subcategory |
| GET | /config/rules | Any | List resolution rules |
| POST | /config/rules | Admin | Create resolution rule |
| PATCH | /config/rules/{code} | Admin | Update rule |
| PATCH | /config/rules/{code}/active | Admin | Toggle rule active |
| GET | /config/escalation-rules | Any | List escalation rules |
| POST | /config/escalation-rules | Admin | Create escalation rule |
| PATCH | /config/escalation-rules/{code} | Admin | Update escalation rule |
| GET | /config/sla-policies | Any | List SLA policies |
| PUT | /config/sla-policies/{code} | Admin | Update SLA timing |
| GET | /config/priority-rules | Any | List priority rules |
| PUT | /config/priority-rules/{urgency} | Admin | Update urgency->priority mapping |
| GET | /config/genai | Admin | GenAI pipeline status |
| POST | /config/genai/reset | Admin | Resume paused providers |
| GET | /config/thresholds | Any | List editable thresholds |
| PUT | /config/thresholds/{key} | Admin | Update a threshold |

### Users
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | /users | Admin | List all users |
| POST | /users | Admin | Create user (any role) |
| GET | /users/staff | Staff | List staff members |
| PATCH | /users/{id}/active | Admin | Activate / deactivate user |

### Products & Orders
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | /products | Any | List all products |
| GET | /products/{id} | Any | Get single product |
| GET | /orders | Customer | Customer's order history |
| GET | /orders/{id} | Customer | Single order |
| GET | /orders/{id}/invoice | Customer | Invoice data (JSON) |
| GET | /orders/{id}/invoice/pdf | Customer | PDF invoice download |
| GET | /orders/{id}/invoice/image | Customer | PNG invoice download |

### Translation
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | /translation/languages | Any | Supported languages list |
| GET | /translation/preference | Customer | Get preferred language |
| PUT | /translation/preference | Customer | Set preferred language |
| POST | /translation/detect | Any | Detect text language |
| POST | /translation/translate | Any | Translate text |

---

## 23. Frontend Application

**Primary file**: `frontend/src/SupportNovaApp.tsx` (2,209 lines)

### Entry point structure
```
SupportNovaApp
  Routes
    /login  --> LoginPage (unauthenticated)
    /team   --> TeamPage (public)
    /*      --> AppShell (authenticated) or redirect to /login
  Toaster (Sonner)
```

### AppShell layout
- **Sidebar**: collapsible, role-filtered navigation, health indicator, user menu, sign-out
- **Topbar**: breadcrumb, global search, language selector (customer only), notification bell, Role Guide button, theme toggle, New Complaint button
- **Workspace**: `<main>` with role-filtered routes
- **Assistant**: floating chat widget (always rendered)
- **SystemTourModal**: role-specific guide, opens from Role Guide button

### Key UI behaviors
- Sidebar collapse state: persisted in `localStorage` as `supportnova_sidebar_collapsed`
- Health check: pings `/health` every 60 seconds
- Auto-logout on `supportnova:unauthorized` event
- Theme toggle (light/dark): persisted in Zustand store

---

## 24. Frontend Page Inventory

| Route | Component | Roles | Description |
|---|---|---|---|
| /login | LoginPage | Unauthenticated | Login form, demo profiles, Project Tour button, Team button |
| /team | TeamPage | Public | Team credits (3 mentors, 4 members) |
| / (customer) | CustomerDashboard | customer | My complaints: total, open, resolved metrics |
| / (staff) | DashboardPage | agent/reviewer/manager/administrator | Intelligence overview: KPIs, charts, assigned queue, escalation warnings |
| /products | ProductsPage | customer | Product catalog, search, category filter, file complaint |
| /orders | OrderHistoryPage | customer | Order history, PDF/PNG invoice download, file complaint |
| /complaints | ComplaintsPage | Any | Searchable, filterable list with pagination |
| /complaints/new | NewComplaintPage | Any | 3-step complaint submission form |
| /complaints/:id | ComplaintDetailPage | Any | Routes to CustomerComplaintView or StaffComplaintView |
| /complaints/:id (customer) | CustomerComplaintView | customer | Status, messages, resolution confirm/reopen, CSAT |
| /complaints/:id (staff) | StaffComplaintView | staff | Analysis controls, 6-tab detail view, action bar |
| /review | ReviewQueuePage | reviewer/manager/administrator | Manual review queue |
| /knowledge | KnowledgePage | staff | Document list, chunk viewer, upload (admin only) |
| /reports | ReportsPage | manager/administrator | Analytics with charts and report export library |
| /evaluation | EvaluationPage | manager/administrator | Import CSV evaluation datasets, view accuracy |
| /settings | SettingsPage | administrator | 6-tab settings panel |

### Staff Complaint Detail tabs (confirmed from `SupportNovaApp.tsx`)
1. **Overview** — Python-verified intelligence, SLA, complaint text, attachments, validation controls, evidence, CSAT
2. **Conversation** — message thread, send with internal toggle, language selector
3. **Comparison** — field-by-field GenAI vs Python visualization
4. **Response** — AI-drafted customer response with tone selector
5. **Structured JSON** — raw JSON of both pipeline outputs
6. **History** — audit trail, review history, GenAI run log, follow-up history

### Settings page tabs
1. **Pipelines** — GenAI provider chain status, threshold editor, security notes
2. **Resolution Rules** — full rule matrix table + create/edit form
3. **Escalation Rules** — mandatory escalation rules + create form
4. **Categories & Departments** — taxonomy table + add forms
5. **SLA & Priority** — SLA policy editor + priority mapping editor
6. **Users** — user table + add user form

---

## 25. Frontend State Management

**File**: `frontend/src/store.ts` | **Library**: Zustand

### Global store shape (confirmed from SupportNovaApp.tsx usage)
```typescript
{
  // Auth
  authenticated: boolean
  user: User | null
  role: Role | null
  loading: boolean
  login(email, password): Promise<void>
  logout(): void
  restore(): void  // Re-fetches /auth/me on page load

  // UI
  theme: 'light' | 'dark'
  toggleTheme(): void
  sidebarOpen: boolean
  setSidebarOpen(v: boolean): void

  // Data
  complaints: Complaint[]
  metrics: Metrics | null
  loadComplaints(): Promise<void>
  loadMetrics(): Promise<void>
}
```

Token persisted in `localStorage` as `supportnova_token`.

---

## 26. Frontend Design System

**File**: `frontend/src/supportnova.css` (6,239 lines)

### CSS custom properties (design tokens)
```css
:root {
  --ink: #191724;        /* Primary text */
  --muted: #777486;      /* Secondary text */
  --border: #e7e5ec;     /* Borders */
  --surface: #fff;       /* Card backgrounds */
  --canvas: #f7f7fa;     /* Page background */
  --purple: #6558f5;     /* Primary accent */
  --purple-dark: #5145db;
  --purple-soft: #efedff;
  --nav: #171424;        /* Sidebar background */
  --danger: #e94f63;
  --warning: #e89736;
  --teal: #1ca891;
}
```

### Typography
- **Body**: DM Sans (400, 500, 600, 700) — Google Fonts
- **Headings / Brand**: Manrope (500, 600, 700, 800) — Google Fonts
- Custom scrollbar: teal (#0D7A75), 6px width

### Button variants
- `.button.primary` — purple fill, box-shadow, hover lift + darkens
- `.button.secondary` — white with border
- `.button.ghost` — transparent, muted text
- `.button.danger-outline` — outlined danger style

### Shared UI components (`frontend/src/ui.tsx`)
- `Page` — content wrapper with optional `narrow` prop
- `PageHeader` — eyebrow + title + description + optional action slot
- `Panel` — card with title, subtitle, optional action
- `Metric` — KPI card with icon, value, tone color (violet/orange/teal/red)
- `StatusBadge` — colored badge for complaint status
- `Priority` — colored priority chip (P0-P3)
- `Field` — labeled form field wrapper
- `EmptyState` — icon + title + description placeholder
- `Skeleton` — loading placeholder
- `Verification` — score ring showing pipeline agreement %
- `labelize()` — snake_case to Title Case
- `date()` / `dateTime()` — locale-formatted date display
- `messageOf()` — extracts error string from any error type
- `entries()` — converts Record to `{ name, value }[]` array for charts

---

## 27. Products & Orders Subsystem

**Backend**: `src/api/products.py`, `src/api/orders.py`

### Products
- Seeded from `database/seed.py` with consumer electronics catalog
- Product number format: `NC-000001`
- Images at `/products/` static path
- Clicking a product in the catalog prefills complaint form with product name and reference

### Orders
- Each customer has seeded orders
- Order number format: `NC-100001`
- Multiple items per order (JSONB)
- Invoice generation:
  - JSON: `GET /orders/{id}/invoice`
  - PDF: `GET /orders/{id}/invoice/pdf` (generated with reportlab)
  - PNG: `GET /orders/{id}/invoice/image` (generated with Pillow)
- Frontend: `InvoiceModal` with print, download PDF, download image actions
- "Get help with this order" button prefills complaint form

---

## 28. Test Suite

**Directory**: `tests/`

| File | Size | Coverage area |
|---|---|---|
| test_api_integration.py | 34 KB | End-to-end API flows: submit, analyze, review, status transitions, assignment, messages, CSAT, history |
| test_attachments.py | 10 KB | File upload, evidence extraction, attachment download |
| test_core_rules.py | 3 KB | Rule engine: keyword matching, escalation priority, unclassified fallback |
| test_dataset.py | 9 KB | Evaluation dataset import and accuracy measurement |
| test_genai_fallback.py | 2 KB | GenAI provider failover and pause behavior |
| test_live_config.py | 9 KB | Config API: rule CRUD, SLA editing, threshold updates, department creation |
| test_local_providers.py | 3 KB | Ollama local provider integration |
| test_matching_and_checks.py | 8 KB | Keyword scoring, repeat detection, hallucination detection |
| test_multilingual.py | 3 KB | Language detection, translation, preferred language preference |
| test_priority_traps.py | 0.4 KB | Priority can only be raised by rule, never lowered |
| test_rule_matrix_and_docs.py | 5 KB | Rule matrix CSV, knowledge document chunking and retrieval |
| test_security_adversarial.py | 37 KB | Prompt injection, PII masking, adversarial inputs, input validation, role enforcement |

**Test framework**: pytest with httpx TestClient against an in-memory test database (confirmed from `tests/conftest.py`).

---

## 29. Seed Data

**File**: `database/seed.py` (805 lines)

The seed is **idempotent** — safe to run on an existing database. It creates:

1. **10 Departments**: BIL, TEC, LOG, RET, WAR, REL, SEC, CMP, SAF, MGT
2. **12 Categories**: DEFECT, BILLING, DELIVERY, REFUND, ACCOUNT, TECH, SERVICE, WARRANTY, PRIVACY, SAFETY, STAFF, CANCEL
3. **21 Subcategories** with keyword lists
4. **Resolution rules** loaded from `complaint_rules/rule_matrix.csv` (34 KB)
5. **Escalation rules**: Safety/Overheating, Privacy/Data Exposure, Account Takeover, etc.
6. **SLA policies**: per priority and customer type
7. **Priority rules**: urgency to priority mapping
8. **Knowledge documents**: policies, SOPs, FAQs, parsed and chunked
9. **Prompt templates**: v1, v2, v3
10. **5 Demo users**: one per role
11. **Products**: consumer electronics catalog
12. **Orders**: sample orders for demo customer

---

## 30. Deployment & Environment Variables

### Single-service deployment
FastAPI serves the built React `frontend/dist/` at the root path. Set `FRONTEND_DIST` to the dist path. Configure all env vars from `.env.example`.

### Required environment variables for production
```bash
SECRET_KEY=<long-random-string>          # MUST change from default
DATABASE_URL=postgresql+psycopg://...    # Production PostgreSQL URL
CORS_ORIGINS=https://your-domain.com
BOOTSTRAP_ADMIN_EMAIL=...               # First admin account
BOOTSTRAP_ADMIN_PASSWORD=...            # Change after first login

# At least one GenAI key for full dual-pipeline operation:
OPENAI_API_KEY=sk-...
# OR
GEMINI_API_KEY=...
# OR
GROQ_API_KEY=...   # Free tier at console.groq.com/keys
# OR
OLLAMA_ENABLED=true   # For fully local/offline operation
```

### Python-only mode
If no GenAI key is configured, the system operates in Python-only mode. All complaints are classified deterministically. Manual review is triggered for every case (no GenAI output to compare against). This is a supported and documented operational mode.

### Development server commands
```bash
# Backend
pip install -r requirements.txt
python -m uvicorn src.main:app --reload --port 8000

# Frontend
cd frontend && npm install && npm run dev
```

---

## 31. Demo Accounts

All demo accounts are seeded at first startup. Credentials displayed in the login page "Use a demo profile" dropdown.

| Role | Email | Password |
|---|---|---|
| Administrator | admin@supportnova.example | ChangeMeNow!23 |
| Agent | agent@supportnova.example | AgentPass!23 |
| Reviewer | reviewer@supportnova.example | ReviewPass!23 |
| Manager | manager@supportnova.example | ManagerPass!23 |
| Customer | customer@supportnova.example | CustomerPass!23 |

> **Note**: These credentials are for demonstration/development only. Remove or change them before any production deployment.

---

*Documentation generated from a full source code audit of the SupportNova project. All data confirmed from actual files in the repository. Sections marked "Not confirmed" or "Not found" indicate features that could not be verified at audit time.*
