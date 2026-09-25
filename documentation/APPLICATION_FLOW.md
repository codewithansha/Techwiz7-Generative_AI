# SupportNova — How the application works

This document follows one complaint from the moment a customer submits it until it is
closed. It names every step, who performs it, what the system does automatically, and
which file implements it. Read it top to bottom once; afterwards the section headings
work as a reference.

- **Organization (fictional):** NimbusCarta, a consumer-electronics e-commerce company
- **Backend:** FastAPI + PostgreSQL (`src/`, plus the pipeline folders at the repo root)
- **Frontend:** React + Vite (`frontend/src/SupportNovaApp.tsx`)

---

## 1. The big picture

SupportNova answers one question for every complaint: *what is this, how urgent is it,
who must handle it, and what may we say to the customer?* Two independent pipelines
answer it, and they check each other.

| | Pipeline 1 — GenAI | Pipeline 2 — Python ground truth |
|---|---|---|
| What it is | A GenAI model (OpenAI / Gemini / Anthropic / Grok) | Plain Python rules, no AI |
| What it produces | A structured JSON draft: classification, sentiment, customer reply, resolution steps, escalation notes, follow-up message | The authoritative classification, routing, urgency, priority, escalation and eligibility, from the rule matrix |
| Can it be wrong? | Yes, so it is always checked | It follows the configured rules exactly |
| Where | `genai_pipeline/` | `python_validation/`, `complaint_rules/`, `routing_rules/`, `escalation_rules/` |

Python always has the final word on routing, urgency and escalation. GenAI contributes
the language (the reply, notes and summary) and a second opinion that Python compares
field by field. When they disagree, or anything risky is detected, a human reviewer decides.

```mermaid
flowchart LR
    C[Customer submits complaint] --> V[Validate & pre-process]
    V --> A[Agent assigns & analyzes]
    A --> P1[Pipeline 1: GenAI draft]
    A --> P2[Pipeline 2: Python rules]
    P1 --> CMP[Compare + checks]
    P2 --> CMP
    CMP -->|agree, nothing risky| W[Agent works the case]
    CMP -->|disagree / risky| R[Reviewer decides]
    R --> W
    W --> RES[Resolved]
    RES -->|customer confirms| CL[Closed]
    RES -->|customer reopens| RO[Reopened] --> W
```

### Who does what

| Role | Can do |
|---|---|
| **Customer** | Submit complaints, attach evidence, track status, confirm or reopen a resolution. Never sees internal analysis. |
| **Agent** | Work the unassigned queue and their own cases: assign to self, analyze, change status, reassign department. Cannot open cases assigned to another agent. |
| **Reviewer** | Everything an agent can do, plus the manual-review queue (approve, reject, escalate, reassign, reclassify, regenerate, comment). |
| **Manager** | Reviewer rights, plus analytics, trends and report exports. |
| **Administrator** | Everything, plus knowledge-base uploads, rule and threshold configuration, and user management. |

Access is enforced by the API (`security/auth.py`, role guards on every endpoint). The
UI only renders menus for the role the server confirmed at login (`/auth/me`).

---

## 2. The complaint lifecycle (statuses)

```mermaid
stateDiagram-v2
    [*] --> new: customer submits
    new --> assigned: agent takes ownership
    new --> analyzed: analysis, no escalation
    new --> escalated: analysis, mandatory escalation
    assigned --> analyzed: analysis
    assigned --> escalated: analysis finds escalation trigger
    analyzed --> in_progress: reviewer approves
    escalated --> in_progress: reviewer approves
    analyzed --> analyzed: reviewer rejects (re-work)
    in_progress --> awaiting_customer: agent needs info
    awaiting_customer --> in_progress
    in_progress --> resolved: agent resolves
    resolved --> closed: customer confirms
    resolved --> reopened: customer reopens (fix failed)
    reopened --> resolved: agent resolves again
    closed --> [*]
```

| Status | Meaning | Customer sees |
|---|---|---|
| `new` | Submitted, not analyzed | "We have received your complaint." |
| `assigned` | An agent owns it | "…assigned to a support specialist." |
| `analyzed` | Both pipelines ran; routed | "Our team is reviewing your complaint…" |
| `escalated` | A mandatory escalation rule fired, or a reviewer escalated | "…escalated for priority handling by our Safety team." |
| `in_progress` | A reviewer approved; work under way | "Our team is working on your complaint…" |
| `awaiting_customer` | Staff need more information | "We need a little more information…" |
| `resolved` | Staff believe it is fixed | The agent's resolution note |
| `closed` | The customer confirmed | "Thank you for confirming…" |
| `reopened` | The customer says the fix failed | "…reopened and is being reviewed again." |

The customer-facing text lives in `latest_update`. It is written only from
customer-safe wording (`customer_update()` in `src/services/analysis.py`) or from a note
the agent explicitly types for the customer. Reviewer comments, rule names and internal
reasons never go there; they are kept in the audit log.

---

## 3. Step by step

### Step 1 — Customer submits the complaint

**Who:** Customer (or staff on a customer's behalf). **Screen:** *New complaint*, a 3-step wizard.
**API:** `POST /api/v1/complaints` → `src/api/complaints.py::submit_complaint`.

The customer enters:

1. **Details:** title, description (20+ characters), product/service, order reference (`NC-000000`).
2. **Context:** preferred contact channel, previous complaint reference (`CMP-00000`, for
   repeats), requested resolution, supporting files (PDF / DOCX / PNG / JPG / TXT, ≤ 15 MB each).
3. **Review:** confirms everything and submits.

What the system does, in order:

| # | Check / action | Result if it fails | Code |
|---|---|---|---|
| 1 | Title and description present; description ≥ 20 characters | 422 with the reason | `complaint_processing/preprocess.py::validate_complaint_payload` |
| 2 | Order reference matches `NC-000000`; previous reference matches `CMP-00000` | 422 "Invalid … reference" | same |
| 3 | **Sanitize:** Unicode normalization, control characters removed, whitespace collapsed, `<` `>` stripped | — | `sanitize_input`, `normalize_text` |
| 4 | Previous complaint reference must exist and belong to the same customer | 422 | `submit_complaint` |
| 5 | **Customer type comes from the customer's profile.** A customer cannot claim to be VIP. | — | `submit_complaint` |
| 6 | **Exact duplicate:** SHA-256 of the normalized text already exists *for the same customer* (another customer using the same words is not blocked, and is never shown someone else's code) | 409 "Exact duplicate of CMP-…" | `complaint_processing/duplicates.py::find_duplicates` |
| 7 | **Near duplicate:** fuzzy similarity ≥ 88 % with one of the customer's last 50 complaints | Accepted, but linked (`duplicate_of`) and the user is warned | same |
| 8 | Save with status `new`; the code is `CMP-<id>` | — | `complaint_code_for()` |
| 9 | Attachments are checked (extension, size, file signature, so a renamed `.exe` is rejected) and stored under `uploads/complaints/<id>/` with a safe filename | 400 per bad file | `document_processing/validate.py` |
| 10 | **Attachments are read** as evidence: PDF text (PyMuPDF), DOCX text and tables (python-docx), TXT; order numbers, amounts, dates, the purchase date and instruction-like text are extracted. Photos get size and camera date, but their content is not machine-read. Adding a file to an already analyzed case sets `needs_reanalysis`. | a broken file is kept, with a note | `document_processing/attachments.py` |
| 11 | Audit entries `submit` and `attachment` are written | — | `security/audit.py` |

The customer lands on the complaint page, which shows status **New**, department
"Being assigned", and nothing internal. **Supporting documents** lists the files. Clicking
one opens a preview (image, PDF, text) or downloads it (`GET /api/v1/complaints/{id}/attachments/{attachment_id}`).
Files are served only to the owner and staff, with `nosniff` and a sandbox CSP.

#### How attachments are used in analysis

| Where | Effect |
|---|---|
| Missing information | *evidence*, *order number* and *purchase date* are not asked for when a file provides them |
| Eligibility | the invoice date stands in for a missing purchase date (replacement window, return window, warranty) |
| Mandatory rule steps | "Request photos / proof of purchase" counts as done when that evidence is attached |
| Escalation | amounts on invoices or statements count toward the high-value threshold |
| Consistency | a file for a different order raises `attachment_order_mismatch` |
| Security | instruction-like text in a file raises `prompt_injection_in_attachment` → review |
| GenAI prompt | file facts plus a 1,500-character PII-masked excerpt, wrapped as untrusted data (prompt v3 asks the reply to acknowledge the files) |
| Hallucination check | IDs and amounts that appear in an attachment are grounded, not invented |
| Staff view | **Attachment evidence** panel on the Overview tab |

A screenshot-by-screenshot run of the whole flow is in [walkthrough/WALKTHROUGH.md](walkthrough/WALKTHROUGH.md).

### Step 2 — An agent picks it up

**Who:** Agent. **Screens:** *Overview* (panels "Assigned to me" and "Unassigned queue"),
*Complaints* (search and filters).
**API:** `GET /api/v1/dashboards/agent`, `GET /api/v1/complaints?...`, `POST /api/v1/complaints/{id}/assign`.

- The agent sees only unassigned complaints and complaints assigned to them.
- They can filter by status, category, department, priority, sentiment, escalation,
  SLA risk, awaiting review, and date range, or search by code, title, order, product or
  customer reference.
- **Assign to me** sets the owner. If the case is `new` or `analyzed` it becomes
  `assigned`; an escalated case keeps its escalated status.

### Step 3 — Analysis: both pipelines run

**Who:** Agent (or any staff role) clicks **Analyze complaint**. They can pick the
response tone (professional / empathetic / concise / formal) or tick **Python only**.
**API:** `POST /api/v1/complaints/{id}/analyze` → `src/services/analysis.py::analyze_complaint`.

```mermaid
flowchart TD
    S[Analyze clicked] --> RP[Repeat detection]
    RP --> KB[Retrieve policy chunks]
    KB --> G{GenAI key working?}
    G -->|yes| P1[Pipeline 1: prompt v2 → structured JSON]
    G -->|no / Python only| SKIP[Skip GenAI, note the reason]
    P1 --> P2
    SKIP --> P2[Pipeline 2: rule matrix classification]
    P2 --> ESC[Escalation rules]
    ESC --> PRI[Urgency → priority]
    PRI --> CHK[Checks: schema, comparison, promises,<br/>hallucinations, actions, policy, injection]
    CHK --> DEC{Any review reason?}
    DEC -->|yes| MR[Manual-review queue]
    DEC -->|no| OK[Verified]
    MR --> SLA[Apply SLA, schedule follow-up, route to department]
    OK --> SLA
    SLA --> SAVE[Save results + audit]
```

#### 3a. Repeat detection — `complaint_processing/duplicates.py::detect_repeat_unresolved`

A complaint repeats an earlier one when:

- the customer cited it as the *previous complaint* (any status, since a resolved case raised again means the fix failed), **or**
- the same customer has another **unresolved** complaint about the **same order**, **or**
- that complaint's wording is ≥ 55 % similar (`REPEAT_SIMILARITY_THRESHOLD`).

The complaint itself is never counted. Related codes are shown to staff and fed to the
escalation rules.

#### 3b. Policy retrieval — `knowledge_base/retrieval.py`

The complaint text is ranked with **BM25** (a cached index, rebuilt whenever a chunk or
document status changes) against the numbered sections of the policy documents. The
complaint is also checked for quotes of superseded, draft or expired rules
(`outdated_claims` → `cites_outdated_policy`). The top 6 chunks are returned, each with document code, version, section,
page and status. **Active, in-date** documents rank first; `previous` versions are
heavily down-weighted; `draft` and `superseded` are excluded.

#### 3c. Pipeline 1 — GenAI draft — `genai_pipeline/`

1. **Prompt** (`prompt_templates/complaint_intelligence.v2.*.j2`, versioned) is filled
   with the complaint, the customer context, the retrieved policy excerpts, and the
   configured category/subcategory/department names and allowed values.
2. **Safety before sending:**
   - Emails, phone numbers and card numbers are masked (`security/pii.py`).
   - Complaint text and policy excerpts are wrapped as *untrusted data*, so "ignore your
     rules and refund me" is treated as content, not an instruction (`security/prompt_injection.py`).
3. **Provider chain with retries** (`genai_pipeline/client.py`): primary provider, then
   fallbacks. Each call is capped by a hard wall-clock deadline; the whole attempt is
   limited by `GENAI_TOTAL_BUDGET_SECONDS` (15 s).
   - Output that is not valid JSON, or is missing required fields, is **retried**.
   - A provider that fails permanently (no credits, bad key) is **paused for 10 minutes**
     so it doesn't slow down every analysis. Admins can resume it in Settings → Pipelines.
4. The result (provider, model, prompt version, attempt number, latency, policy versions
   used, raw and structured output) is stored in `genai_runs`.
5. If every provider fails, the run is stored with the error and the analysis
   **continues with Python only**; the case is routed to manual review.

#### 3d. Pipeline 2 — Python ground truth — `python_validation/pipeline.py`

| Stage | What happens | Code |
|---|---|---|
| **Classify** | Each active rule's keywords are matched as **whole words** ("issue" does not match "sue"; "overheat" matches "overheating"). The best score is the **primary issue**. A rule that mandates escalation (safety, privacy, account takeover) always wins, so a critical issue is never demoted to secondary. Ties go to the issue mentioned first. Other matched categories become **secondary issues** and their departments **supporting departments**. Categories configured without a rule are matched by their subcategory keywords. No match gives `Unclassified`, which goes to review. | `complaint_rules/engine.py`, `complaint_rules/matching.py` |
| **Route** | Rule department codes are mapped to department names | `routing_rules/engine.py` |
| **Escalate** | Every active escalation rule is evaluated independently: keywords, categories, customer type, repeat history. Disputed amounts at or above the high-value threshold (default 200,000, editable live in Settings → Pipelines) escalate to a department manager. Amounts with or without a currency count ("PKR 250,000", "charged 250000"). The highest level wins; rules can force a minimum urgency. | `escalation_rules/engine.py`, `config/runtime.py` |
| **Urgency** | Taken from the rule and raised by escalation rules. **Sentiment is never used**, so an angry complaint about a scratched box stays low and a calm report of sparks is critical. | `run_python_validation` |
| **Priority** | Urgency is mapped through the configurable priority table (low → P3 … critical → P0), never lower than the rule's own priority. VIP / enterprise customers get at least P2, but a minor VIP issue is not inflated. | `_priority()` |
| **Eligibility** | The rule says whether a remedy can apply. The policy conditions are then checked from facts on the complaint: 30-day replacement window and original condition (RPL-POL-01 §1), no earlier replacement on the order (§2), 14-day return window or 12-month warranty (REF-POL-01 §2, WAR-POL-03), damage after delivery (WAR-POL-03 §4). A failed condition makes the remedy *not eligible*. A condition that can't be checked (for example no purchase date) is listed as *needs check* for the agent. Shown as **Policy conditions** on the complaint. | `python_validation/eligibility.py` |
| **Policy status** | The cited policy is checked: is there an **active, in-date** version (`applicable`), only old versions (`outdated`), or none (`not_applicable`)? The active version number is recorded. | `knowledge_base/precedence.py::policy_status` |
| **Precedence** | Among the retrieved documents, the governing one is the rule's policy (or the best-ranked usable document). A related lower-ranked document (FAQ, guideline, template, older SOP) that states a different timeline, rate or automatic entitlement is recorded as a conflict. If the complaint or the draft reply *relies* on that statement (for example "your FAQ says card refunds are instant" against REF-POL-01's 7–10 business days), the flag `lower_precedence_conflict` is raised and the case goes to review. Shown as **Policy precedence** under Validation controls. | `knowledge_base/precedence.py::resolve_precedence` |
| **Missing info** | Order number, product, a substantial description, evidence for defect or warranty claims, and the purchase date where the policy depends on it. Each gap maps to a configured clarification question. | `detect_missing_information` |

#### 3e. Cross-checks — GenAI against Python

Run only when GenAI produced output:

| Check | Flag raised | Code |
|---|---|---|
| JSON schema and allowed values (category, department, policy ID, enums) | review reason "failed schema validation" | `python_validation/schema.py` |
| **Field comparison** of category, subcategory, department, urgency, priority, escalation, policy. Department codes and case differences are normalized first. | `verified` (all match), `partial_match` (1 minor), `manual_review` (≥ 2 mismatches or an escalation mismatch) | `comparison_engine/compare.py` |
| GenAI missed a mandatory escalation | `missed_mandatory_escalation` | pipeline |
| Reply promises a refund, replacement, compensation, delivery date or policy exception the rules don't allow | `approved_refund_promise`, `replacement_promise`, `payment_promise`, `unsupported_deadline`, `unauthorized_exception`… | `hallucination_checks/detector.py` |
| Facts not traceable to the complaint, a policy or the rule matrix: invented order IDs or amounts, unknown policy references | `invented_identifier`, `ungrounded_amount`, `ungrounded_policy_reference` | same |
| Mandatory action from the rule missing from the steps (paraphrases accepted), or a prohibited action offered | `missing_mandatory_action`, `prohibited_action` | `_resolution_flags` |
| Refund / replacement / compensation claimed where the rule says no | `refund_not_eligible`, `replacement_not_eligible`, `unsupported_compensation` | pipeline |
| Cited policy unknown or outdated; excerpts mix active and outdated versions | `invalid_policy_id`, `outdated_policy`, `policy_conflict` | pipeline |

These checks run whether or not GenAI answered:

- prompt-injection patterns in the complaint (`prompt_injection`)
- no matching rule (`no_rule_match`)
- GenAI failure (`genai_failure`)

**Verification score** = percentage of the 7 compared fields that match, minus 5 points
per flag. It is only shown when GenAI actually produced output; it is never invented.

#### 3f. Decide, route and save — `analyze_complaint`

1. **Manual review is required** when there is any review reason:
   - GenAI and Python disagree significantly
   - GenAI failed or produced invalid output
   - the complaint is ambiguous or unclassified
   - the category has no rule yet
   - policy support is missing, or policies contradict each other
   - an escalation is mandatory
   - the complaint is sensitive (Safety / Privacy / Account)
   - information is missing
   - adversarial content was detected
   - any validation flag was raised

   The reasons are stored and shown to reviewers.
2. **Department:** the complaint is routed to Python's department.
3. **Status:** `escalated` if escalation is required, otherwise `analyzed`. Cases that a
   human has already moved on (in progress, awaiting customer, resolved, closed) keep
   their status.
4. **SLA:** targets come from the SLA policy for the priority and customer type (VIP gets
   half the time):

   | Priority | First response | Resolution |
   |---|---|---|
   | P0 | 30 minutes | 4 hours |
   | P1 | 2 hours | 24 hours |
   | P2 | 8 hours | 72 hours |
   | P3 | 24 hours | 168 hours (7 days) |

   A case is flagged **SLA at risk** once 75 % of its resolution window has passed.
5. **Follow-up:** one is scheduled, with a type that matches the situation:
   - information request, when details are missing
   - escalation acknowledgement
   - refund or replacement status update
   - general status update

   The message is GenAI's `follow_up_communication` when available.
6. `validation_results`, `comparisons` and an `analyze` audit entry (provider, prompt
   version, rule, score, review reasons) are saved.

**What the agent sees afterwards** (complaint page tabs):

| Tab | Contents |
|---|---|
| Overview | Verified classification, priority, SLA and follow-up, flags, missing information, eligibility chips, secondary issues |
| Comparison | GenAI and Python side by side, field by field |
| Response | Draft customer reply, follow-up message, clarification questions, escalation notes, and the rule's mandatory and prohibited actions |
| Structured JSON | Both pipelines' raw structured output, with provider, model and prompt version |
| History | The audit trail |

Alerts at the top call out manual review, mandatory escalation, contained prompt
injection, related complaints, and GenAI unavailability.

### Step 4 — Human review (when required)

**Who:** Reviewer, Manager or Admin. **Screen:** *Review queue*.
**API:** `GET /api/v1/complaints/queue/manual-review`, `POST /api/v1/complaints/{id}/review`.

A case stays in the queue until a reviewer decides on its latest analysis. The reviewer
sees the review reasons and flags, the GenAI recommendation next to the Python ground
truth, and can:

| Action | Effect |
|---|---|
| **Approve** | Status → `in_progress` |
| **Reject** | Status → `analyzed`, for re-work |
| **Escalate** | Status → `escalated` |
| **Reassign** | Moves the case to another department → `assigned` |
| **Reclassify** | Records the corrected category (and optional department) → `in_progress` |
| **Modify** | Records a corrected decision → `in_progress` |
| **Regenerate** | Re-runs the analysis (a new GenAI draft) |
| **Comment** | Adds a note without deciding (the case stays in the queue) |

Every decision stores the **original recommendation** (both pipelines' output) next to
the **final decision** and the reviewer's comment, in `review_actions` and the audit log.
Reviewer comments are internal. The customer only sees a neutral status message.

### Step 5 — The agent works and resolves the case

**Who:** The owning agent. **Screen:** complaint page, action bar.
**API:** `PATCH /api/v1/complaints/{id}/status`, `POST /api/v1/complaints/{id}/assign`.

- The agent follows the guidance: mandatory actions, prohibited actions, the policy
  source, and the draft reply (or the reviewer-approved version if a reviewer used **Modify**).
- **Conversation tab** (`GET/POST /api/v1/complaints/{id}/messages`):
  - **Internal note:** staff only, never shown to the customer.
  - **Reply to customer:** before sending, `reply_flags` (`src/services/messaging.py`) checks the text for:
    - refund, compensation or replacement promises the rule does not allow;
    - timelines that are not in the governing policy text (for example "within 24 hours");
    - invented order or transaction IDs and amounts.

    A flagged reply is **blocked** (422) and the flags are shown. Only a reviewer or above can send it anyway, and that override is audited.
  - **Request information:** sends the question and sets the status to `awaiting_customer`. When the customer replies, the status returns to `in_progress`.
  - The first staff reply records `first_responded_at` against the first-response SLA.
  - Customers see replies from "NimbusCarta Support", and staff names are hidden.
- **Nova** (the chat button) can draft a policy-safe reply, summarize the case, explain its
  flags, find similar complaints and show the SLA. **Use draft** places the text in the reply box.
- They can set **Awaiting customer** when information is missing, or reassign the
  department.
- They set **Resolved** with an *update note*. That note is written for the customer and
  becomes the customer's latest update.
- On resolve, pending follow-ups are completed and a **resolution confirmation**
  follow-up is scheduled for 2 days later.

### Step 6 — The customer confirms or reopens

**Who:** Customer. **Screen:** their complaint page shows *"Did this resolve your issue?"*.
**API:** `POST /api/v1/complaints/{id}/customer-decision`.

| Choice | Effect |
|---|---|
| **Yes, close it** | The customer can rate the resolution 1–5 stars with a comment (CSAT, stored in `complaint_feedback`). Status → `closed`; all follow-ups complete; nothing scheduled. CSAT shows on the Reports page. |
| **Not resolved — reopen** (a reason is required) | Status → `reopened`; the case is marked as a repeat; the reason is added as an open item, and the owning agent sees it as a red alert: *"Reopened by the customer: …"*. The agent then works it again (Step 5). |

Only the customer who raised the complaint can do this, and only while it is `resolved`.

### Step 7 — Reporting and oversight

**Who:** Manager / Admin. **Screen:** *Reports*.
**API:** `GET /api/v1/analytics`, `/analytics/trends`, `/reports/export?report=…&fmt=csv|xlsx|pdf`.

- **Metrics (all computed from stored data, never invented):**
  - volume, and splits by category, department, priority, urgency, sentiment and product
  - escalations, SLA risk and SLA compliance
  - GenAI/Python full-agreement rate and average verification score
  - average resolution time, repeat complaints, pending reviews
- **Trends:** rising categories (this week against last), recurring product issues,
  escalation spikes.
- **Reports** (CSV / Excel / PDF): complaint analysis, GenAI/Python comparison,
  escalations, SLA status, manual reviews, department performance, policy usage, and
  resolution compliance.

### Step 8 — The audit trail

Every step above writes an append-only `audit_log` entry: submit, attachment, assign,
analyze, `review_*`, status, `customer_confirm` / `customer_reopen`, `policy_changed`,
and configuration changes. Staff see it in the complaint's **History** tab together with
the GenAI runs (including retries and errors), the reviewer decisions with their original
recommendations, and the follow-ups.

---

## 4. Worked example

A calm but critical complaint, as run end to end during testing (complaint `CMP-00002`):

| # | Actor | Action | System result |
|---|---|---|---|
| 1 | Customer | "My NovaCharge 65W charger… started giving off a burning smell and got very hot", order NC-104512, photo attached | Validated, sanitized, saved as `new` |
| 2 | Agent | Assign to me | `assigned`, owner set |
| 3 | Agent | Analyze (empathetic tone) | Rule RR-008 → **Safety / Overheating → Safety dept, critical, P0**; escalation rule ESC-SAF-01 → **Critical Management**; policy SAF-POL-01 v1.0 applicable; status `escalated`; P0 SLA (resolve within 4 h); escalation-acknowledgement follow-up; GenAI failed (no credits), so a `genai_failure` flag was raised and the case went to review |
| 4 | Reviewer | Approve, with an internal note | `in_progress`; the note stays internal |
| 5 | Agent | Resolved: "A replacement has shipped…" | Customer sees that note; resolution-confirmation follow-up scheduled |
| 6 | Customer | Reopen: "Wrong model delivered" | `reopened`; the agent sees the red alert with the reason |
| 7 | Agent | Resolved again with the correct model | `resolved` |
| 8 | Customer | Yes, close it | `closed`; follow-ups cleared; the audit trail holds all 8+ events |

The sentiment was calm, yet urgency was critical: urgency comes from the rules, never
from tone. Had GenAI been available and missed the escalation, Python would still have
escalated it and flagged `missed_mandatory_escalation`.

---

## 5. Side flows

### Knowledge-base upload (Administrator)

*Knowledge base → Upload document.* API: `POST /api/v1/knowledge-base/documents` (`src/api/knowledge.py`).

1. **Validate:**
   - document ID format and version format
   - category and status
   - effective and expiry dates (expiry must be after effective)
   - file type: PDF / DOCX, optionally TXT / MD / CSV
   - file signature, size ≤ 15 MB, not empty
   - exact duplicate content (checksum)
   - document ID + version already exists
2. **Parse:** PDF (PyMuPDF) and DOCX (python-docx) are split on numbered headings
   (`5.2 Delayed shipments`), running headers and footers are removed, and page numbers
   are kept, so a rule citing DEL-POL-04 §5.2 points at real text.
3. **Chunk:** ≤ 1,200 characters per chunk. Each chunk keeps its chunk ID, document ID,
   section, heading, page and version.
4. **Version control:** uploading an *active* version marks the previous active version
   `previous` (superseded by the new one).
5. **Impact check (hidden policy update)** (`knowledge_base/impact.py`):
   - A **Policy change impact** panel lists:
     - the previous versions that are now obsolete;
     - sections added, removed and reworded;
     - timelines and rates that changed (for example `day: 5 → 2`);
     - the resolution rules that cite the document, highlighting any that point to a section that no longer exists;
     - the escalation rules that name the document.
   - Open complaints that cited this policy, or were grounded on an older version, get a
     `policy_changed` audit entry and `needs_reanalysis = true`. They show a
     *"A policy this case relies on changed"* banner and can be filtered with `reanalysis=true`.
   - **Re-analyze affected complaints** (reviewer and above, `POST /api/v1/complaints/reanalyze-flagged`)
     re-runs both pipelines for them and clears the flag.
   - Instruction-like text inside a document triggers a warning; documents are only ever
     passed to GenAI as reference data.
6. **Precedence:** Policy > Compliance > SLA > SOP > Escalation > Routing > Guideline >
   Template > FAQ. Among versions, the newest in-date active one wins. Outdated policies
   are never the primary basis for a resolution.

### Configuration without code (Administrator)

*Settings* tabs call `/api/v1/config/...` (`src/api/config_routes.py`). Changes apply on
the next analysis:

- **Resolution rules:** add a rule (keywords, department, urgency, priority, policy,
  escalation, mandatory and prohibited actions, refund / replacement / compensation
  eligibility), **edit** an existing rule in place (`PATCH /config/rules/{code}`), or
  enable or disable one. An escalating rule must be high or critical.
- **Escalation rules:** add a condition, or change the level, the forced urgency, the
  repeat threshold, or whether it is active.
- **Categories & departments:** add a department, a category with subcategory
  keywords, or a **new subcategory** under an existing category. It is classified immediately, even before a rule exists (the case then goes
  to review).
- **SLA & priority:** change SLA hours and the urgency → priority mapping.
- **Users:** create staff or customer accounts; activate or deactivate them.
- **Pipelines:** see the provider chain and prompt version, resume paused providers, and
  edit the **high-value threshold** and **repeat similarity threshold**. They are stored in
  `app_settings`, apply to the next analysis, and are audited.

### Nova, the assistant (every role)

The **Ask Nova** button opens a chat panel (`frontend/src/Assistant.tsx` → `POST /api/v1/assistant/chat` → `chatbot/assistant.py`). A deterministic intent router handles each message:

| Intent | Customer | Staff |
|---|---|---|
| File a complaint | Detects the issue, order number and product, then opens the complaint form **prefilled** | — |
| Track / list | Status of *their* complaints only | Any complaint they may see |
| Policy question | Answer quoted from the active policy with the document and section cited; staff-only sentences and internal documents are filtered out | Full policy text |
| Summarize / explain / similar / SLA | — | Summary, why it was flagged, similar cases, SLA state |
| Queue | — | Review queue (reviewer and above) |
| Draft reply | — | Policy-grounded draft that passes the promise guard; **Use draft** puts it in the Conversation tab |
| Handoff | Connects to a human | — |

Safety rules:

- Prompt-injection attempts are refused (`blocked`).
- Customers get at most 30 messages every 5 minutes.
- PII is masked before any GenAI call.
- GenAI only rephrases the grounded answer. The promise and hallucination guards run on its wording, and if they object the extractive answer is used instead.
- Conversations are stored per user, and nobody can open another user's session.

### Hidden complaint pack (Manager / Administrator)

*Evaluation* page → drop a CSV or JSON file (`POST /api/v1/evaluation/import`, `src/services/evaluation.py`).

1. Columns are checked. `title` and `description` are required; `expected_*` labels are optional. See `hidden_test_ready/README.md`.
2. Every row goes through the normal intake path. Rows sharing a `customer_ref` share a customer, so repeats are detected. A previous-complaint reference that is not in this system is kept and flagged (`unknown_previous_reference`) instead of rejecting the row.
3. Analysis runs in file order in the background. It is Python-only unless *Also run GenAI* is ticked (up to 150 rows).
4. The page shows:
   - Python (and GenAI) accuracy per field against the labels;
   - accuracy by case type;
   - every mismatch.
5. **Download report** gives the SRS comparison columns (CSV / XLSX). `scripts/run_evaluation.py` does the same from the command line into `reports/`.

### Notifications

The bell in the header (`GET /api/v1/notifications`) is built from the audit log, plus live SLA-risk and review-queue items, and is scoped by role:

- **Customers** see status changes and messages on their complaints.
- **Agents** see customer replies, reopens and SLA risk on their cases.
- **Reviewers** see new review items.

Opening the bell marks items seen (`POST /seen`).

### When GenAI is unavailable

Nothing blocks. Python validation still classifies, routes, escalates and sets the SLA.
The case goes to manual review with the reason "GenAI analysis failed", and the reviewer
sees why. The GenAI error is kept on the run (with credentials redacted) and shown on the
History tab.

---

## 6. Where the data lives

| Table | Holds |
|---|---|
| `complaints` | The complaint, status, customer-facing latest update, owner, department, SLA dates, repeat / duplicate links |
| `complaint_attachments` | Uploaded evidence (file stored under `uploads/`) |
| `genai_runs` | Every GenAI attempt: provider, model, prompt version, policy versions, latency, raw and structured output, error |
| `validation_results` | Python ground truth, checks, flags, verification score, manual-review decision |
| `comparisons` | Field-by-field GenAI against Python result |
| `review_actions` | Reviewer decisions with the original recommendation and final decision |
| `followups` | Scheduled follow-ups (type, message, completed) |
| `audit_log` | Append-only history of every action |
| `knowledge_documents`, `document_chunks` | Policies, SOPs and FAQs, their versions and traceable chunks |
| `resolution_rules`, `escalation_rules`, `complaint_categories`, `complaint_subcategories`, `departments`, `priority_rules`, `sla_policies` | The configurable Complaint Resolution Rule Matrix |
| `prompt_templates` | Registered prompt versions (the files live in `prompt_templates/`) |
| `users`, `customers` | Accounts, roles, customer profiles (type, VIP) |
