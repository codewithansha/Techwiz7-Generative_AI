# SRS traceability matrix

Every requirement in *SupportNova – Generative AI PowerPlay SRS v1.0* mapped to the code, data or document that satisfies it, and the test that proves it. File paths are relative to the repository root.

**Status legend**

| Status | Meaning |
|---|---|
| ✅ Met | Implemented and covered by a test or a committed artifact. |
| 🟡 Partial | Implemented, but something outside the code limits it. The reason is always given. |
| 📝 Team | Not code. The team has to produce it (video, blog, sign-off, commit history). |

**Summary.** 221 requirements: 206 met, 8 partial, 7 team items.

The partial items come down to two external limits:

- **GenAI provider credit.** Every Pipeline 1 feature is implemented and tested with recorded provider responses, but live output could not be captured while all keys were out of credit.
- **Hosting.** A one-click deployment blueprint ships in `render.yaml`, but no URL exists until the team deploys it.

Automated evidence: `pytest` runs 260 tests (all passing). Run them with `SUPPORTNOVA_TEST_DATABASE_URL` set so the database integration suites are included.

---

## 1. Proposed solution (SRS 1.2 introduction)

| Ref | Requirement | Status | Where | Proof |
|---|---|---|---|---|
| 1.2a | Complaint inputs: title, description, customer type, product/service, order reference, channel, date, supporting documents, previous history, requested resolution | ✅ | `src/api/schemas.py` `ComplaintCreate` (incl. `channel`, `incident_date`); `src/services/intake.py`; wizard in `frontend/src/SupportNovaApp.tsx` (step 2 "Received via" and incident date); attachments `POST /complaints/{id}/attachments` | `tests/test_api_integration.py` submission tests |
| 1.2b | Administrator uploads the 14 document types | ✅ | `DocumentCategory` enum in `database/models.py`; `src/api/knowledge.py` upload (admin only) | upload/versioning tests |
| 1.2c | Structured intelligence result | ✅ | `schemas/complaint_intelligence.schema.json`; Python fallback for sentiment (`python_validation/sentiment.py`) and clarification questions (`python_validation/pipeline.py`) so the result is never empty without GenAI | `tests/test_rule_matrix_and_docs.py::test_sentiment_estimate` |
| 1.2d | Pipeline 1 capabilities (analyze, classify, extract, sentiment, urgency, route, retrieve, resolve, respond, escalate, follow-up, clarify) | 🟡 | `prompt_templates/complaint_intelligence.v2.*.j2`, `genai_pipeline/` | Tested with recorded provider responses (`tests/test_genai_fallback.py`). Live output not captured: provider keys out of credit. |
| 1.2e | Predefined JSON, not free-form | ✅ | JSON Schema + `python_validation/schema.py`; invalid output retried in `genai_pipeline/client.py` | schema tests |
| 1.2f | Pipeline 2 independent; GenAI never approves itself | ✅ | `python_validation/pipeline.py` builds `python_output` before reading GenAI output and never modifies it | `test_python_enforces_escalation_genai_missed` |
| 1.2g | Pipeline 2 sources: matrix, routing, urgency thresholds, escalation, policy versions, category rules, customer eligibility, resolution, follow-up, source metadata | ✅ | `complaint_rules/`, `routing_rules/`, `escalation_rules/`, `knowledge_base/precedence.py`, `python_validation/eligibility.py` | `tests/test_core_rules.py`, `tests/test_live_config.py` |
| 1.2h | Pipeline 2 verifies the 17 listed items | ✅ | `python_validation/pipeline.py` checks (category, subcategory, department, urgency, priority, escalation, policy applicability/version, precedence, refund/replacement/compensation eligibility, required/prohibited actions, promises, hallucination, contradictions) | integration suite |

## 2. Workflow steps 1–68 (SRS 1.2)

| Step | Requirement | Status | Where | Proof |
|---|---|---|---|---|
| 1 | Fictional organization | ✅ | NimbusCarta: `config/settings.py`, seed, documents | — |
| 2 | Knowledge base: complaint, refund, replacement, cancellation, billing, delivery, warranty, privacy policies; escalation procedure; SOPs; routing; SLA; FAQs | ✅ | 26 PDF/DOCX files in `sample_documents/` (README lists each), loaded by `database/seed.py::_ensure_documents` | `test_every_rule_citation_resolves_to_a_real_document_section` |
| 3 | PDF and DOCX mandatory; TXT/MD/CSV optional | ✅ | `document_processing/validate.py`, `document_processing/parser.py` | `test_pdf_sections_follow_numbered_headings…`, `test_docx_sections_use_heading_numbers` |
| 4 | Validate type, size, empty, duplicate, ID, version, effective/expiry date, category | ✅ | `validate.py` (magic bytes, size, empty); `knowledge.py` (ID/version regex, dates, checksum, ID+version duplicate) | `test_document_upload_validation_and_versioning` |
| 5 | Parsing keeps document ID, title, section, heading, page, version, effective date | ✅ | `parser.py` splits on numbered headings (`5.2`, `6.1`), removes running headers, keeps page numbers | parser tests |
| 6 | Chunks keep chunk ID, document ID, section, heading, page, version | ✅ | `DocumentChunk` model; `document_processing/chunking.py` | chunk list endpoint test |
| 7 | Active / previous / superseded / draft; outdated never primary | ✅ | `DocumentStatus`; `precedence.is_usable_policy`; retrieval down-weights non-usable chunks; `outdated_policy` and `cites_outdated_policy` flags | `test_customer_quoting_outdated_policy_is_flagged` |
| 8 | Structured rule matrix, not generated by GenAI | ✅ | `complaint_rules/rule_matrix.csv` (113 rules, every subcategory ≥3 rules) → `ResolutionRule` table; exported by `scripts/export_rule_matrix.py` → `documentation/RULE_MATRIX.md` | `test_matrix_meets_srs_minimums_and_has_no_filler` |
| 9 | Submission fields | ✅ | Complaint wizard; `ComplaintCreate` | submission tests |
| 10 | Detect empty, short, duplicate, invalid references, missing fields, unsupported attachments | ✅ | `complaint_processing/preprocess.py`, `src/services/intake.py`, `validate_complaint_attachment` | validation tests |
| 11 | Normalization, sanitization, metadata, duplicates | ✅ | `preprocess.py` (`normalize_text`, `sanitize_input`, `extract_metadata`), `complaint_processing/duplicates.py` | duplicate tests |
| 12 | Primary issue | ✅ | `complaint_rules/engine.py` (first-mentioned issue wins ties; escalating rule wins) | `test_core_rules.py` |
| 13 | Primary vs secondary issues | ✅ | `engine.py` secondary issues (up to 3) | multi-issue tests |
| 14 | Configurable categories | ✅ | `ComplaintCategory` table; Settings → Categories | `test_config_changes_take_effect_without_code` |
| 15 | Subcategories | ✅ | 22 subcategories; **Add a subcategory** form (Settings → Categories & departments) | config tests |
| 16 | Entities: product, service, order, transaction, date, amount, location, department, complaint reference | ✅ | GenAI `entities{}`; Python `extract_metadata` (amounts with or without a currency, dates, order IDs, emails) | `test_amounts_without_currency_prefix_are_detected` |
| 17 | Sentiment (positive / neutral / negative / strongly negative) | ✅ | GenAI `sentiment`, with Python lexicon estimate as fallback (`python_validation/sentiment.py`); sentiment filter and analytics read the stored column | `test_sentiment_estimate` |
| 18 | Emotion indicators that do not replace priority rules | ✅ | GenAI `emotion_indicators` + Python estimate; UI marks them "(do not affect urgency)" | `test_emotion_indicators_do_not_imply_urgency` |
| 19 | Urgency never based on emotion alone | ✅ | Urgency from rule + escalation only; `urgency_basis` recorded in checks | `tests/test_priority_traps.py` |
| 20 | Configurable P0–P3 | ✅ | `PriorityRule` table; Settings → SLA & priority | priority tests |
| 21 | Tricky cases: angry/low, calm safety, VIP minor, low-value privacy, legal threat, repeat after failed resolution | ✅ | Rule matrix + escalation rules; reopen keeps `is_repeat` (`analysis.py`) | `test_priority_traps.py`, reopen tests |
| 22 | Department routing (10 departments) | ✅ | `DEPARTMENTS` in seed | — |
| 23 | Python verifies routing via the matrix | ✅ | `routing_rules/engine.py`; `comparison_engine/compare.py` | comparison tests |
| 24 | Primary and supporting departments | ✅ | `supporting_departments` | — |
| 25 | Policy retrieval with traceability | ✅ | BM25 over numbered sections (`knowledge_base/retrieval.py`); every citation carries document code, version, section, page, chunk ID | retrieval tests |
| 26 | Applicable / conditionally applicable / not applicable / outdated | ✅ | `precedence.policy_status` + GenAI-vs-rule citation check in `pipeline.py` | policy tests |
| 27 | Resolution steps grounded in rules | 🟡 | Prompt v2 + `resolution_steps`; checked by `_resolution_flags` | Tested with recorded responses; live GenAI output not captured (no credit). |
| 28 | Mandatory steps present, prohibited actions detected | ✅ | `_resolution_flags` (fuzzy match + negation) | resolution flag tests |
| 29 | Refund eligibility from rules | ✅ | Rule `refund_eligible` + policy conditions (return window, warranty, damage) in `python_validation/eligibility.py` | `test_replacement_eligibility_checks_policy_conditions` |
| 30 | Replacement vs condition, purchase period, policy, previous replacement | ✅ | `eligibility.py`: 30-day window (RPL-POL-01 §1), condition (§1, WAR-POL-03 §4), prior replacement on the order (§2); shown as "Policy conditions" on the complaint | same |
| 31 | Compensation only when permitted | ✅ | `compensation_permitted`; `hallucination_checks/detector.py` | promise tests |
| 32 | Professional response (acknowledge, empathize, summarize, next steps, realistic timeline, no false promises) | ✅ | Prompt v2; timelines must appear in the governing policy text (`detector.py` `grounding`); the reply reaches the customer through the Conversation thread | `test_timeline_must_come_from_policy`, message tests |
| 33 | Tone: professional, empathetic, concise, formal | ✅ | Tone selector → `analyze_complaint(tone=…)` | — |
| 34 | Flag guaranteed refund, compensation, deadline, exception | ✅ | `detector.py`: contractions, passive voice, numeric timelines | `test_contracted_and_passive_promises_are_flagged` |
| 35 | Hallucination: facts not traceable | ✅ | Unknown policy IDs, sections, order/transaction IDs, amounts, ungrounded timelines | detector tests |
| 36 | Escalation triggers (safety, security, privacy, repeat, legal, high value, critical impact, severe failure, policy exception) | ✅ | 45 active escalation rules incl. `ESC-CRIT-01`; high-value threshold editable live | `test_high_value_threshold_is_editable_without_restart` |
| 37 | Six escalation levels | ✅ | `EscalationLevel` | — |
| 38 | Escalation notes | 🟡 | GenAI `escalation_notes`; Python escalation reasons are always recorded | Live GenAI notes not captured (no credit). |
| 39 | Python enforces mandatory escalation | ✅ | `escalation_rules/engine.py`; `missed_mandatory_escalation` flag | `test_python_enforces_escalation_genai_missed` |
| 40 | Follow-up communication types | ✅ | GenAI follow-up + `_follow_up` fallback; messages to customer; resolution confirmation with CSAT | message and CSAT tests |
| 41 | Follow-up requirement and time | ✅ | `FollowUp` rows, `follow_up_at` | — |
| 42 | Missing order, date, product, description, evidence | ✅ | `detect_missing_information` incl. `purchase_date` | missing-info tests |
| 43 | Clarification instead of inventing | ✅ | Configured questions per missing field; **Request information** sets `awaiting_customer` | `test_message_thread_guards_promises…` |
| 44 | Agent complaint summary | ✅ | GenAI summary; Nova assistant "summarize CMP-…" (extractive fallback) | assistant tests |
| 45 | Agent guidance | ✅ | GenAI guidance + rule required/prohibited lists; Nova "draft a reply" | — |
| 46 | Schema validation (required, types, category, urgency, department, policy IDs, escalation) | ✅ | `python_validation/schema.py` | schema tests |
| 47 | Invalid output: retry, log, no infinite loop, manual review | ✅ | `client.py` retries, provider chain, cooldown, hard deadline; failure run routed to review | `tests/test_genai_fallback.py` |
| 48 | Central, versioned prompts | ✅ | `prompt_templates/*.v1/v2.*.j2`, `loader.py`, `PromptTemplate` table | — |
| 49 | Prompt version, provider, model, timestamp, policy version stored | ✅ | `GenAIRun` | — |
| 50 | Complaints and documents are untrusted | ✅ | `security/prompt_injection.py` wrapping; upload injection scan | `tests/test_security_adversarial.py` |
| 51 | Injection, fake admin, manipulation, embedded policy claims, unauthorized compensation | ✅ | 23 prompt-injection cases in the dataset; adversarial test suite | `reports/security_testing_report.md` |
| 52 | Exact, near-duplicate, repeated submissions | ✅ | Hash 409, fuzzy near-duplicate, order-reference repeats | duplicate tests |
| 53 | Previous complaints kept per customer | ✅ | `customer_id` link; repeat detection by customer or order reference | repeat tests |
| 54 | Repeat unresolved raises priority | ✅ | `detect_repeat_unresolved` + ESC-REP-01; repeat threshold editable live | — |
| 55 | Configurable response and resolution targets | ✅ | `SlaPolicy` (Settings); deadlines anchored to `created_at`; first-response tracking | `test_reclassification_drives_filters_and_sla_does_not_slide` |
| 56 | Flag complaints nearing deadline | ✅ | Configurable `sla_risk_percent`; SLA-risk filter in SQL | SLA tests |
| 57 | Manual review triggers | ✅ | Ambiguous, disagreement, policy contradiction (outdated or lower-precedence document), missing support, adversarial, sensitive | `test_faq_contradicting_the_policy_is_overridden_and_flagged` |
| 58 | Reviewer: approve, reject, modify, reclassify, reassign, escalate, regenerate, comment | ✅ | All 8 in the review queue UI; **Modify** edits category, subcategory, urgency, priority, department, escalation and the customer response | `test_reviewer_modify_edits_fields_and_the_customer_response` |
| 59 | Original and reviewer decisions both audited | ✅ | `ReviewAction.original_recommendation` / `final_decision`; History tab | — |
| 60 | Nine statuses | ✅ | `ComplaintStatus` | — |
| 61 | Customer dashboard | ✅ | `CustomerDashboard`; messages, CSAT, Nova tracking | — |
| 62 | Agent dashboard (assigned, category, priority, sentiment, GenAI recommendation, validation, suggested response, escalation warnings) | ✅ | Agent brief + complaint detail; sentiment always present via the Python estimate | — |
| 63 | Admin dashboard | ✅ | Overview + Reports | analytics tests |
| 64 | Analytics: volume, category, product, department, urgency, sentiment, escalation, resolution time, repeats | ✅ | Reports page: 14-day volume chart, products, CSAT, first response, resolution time | `test_csat_is_recorded_on_confirmation_and_reported` |
| 65 | Trend detection | ✅ | `/analytics/trends` | — |
| 66 | Search/filter: ID, customer, category, department, priority, sentiment, status, date, escalation | ✅ | SQL filters + pagination (`X-Total-Count`); also urgency, SLA risk, review, re-analysis needed | filter tests |
| 67 | Eight reports | ✅ | `REPORTS` in `src/api/analytics.py` | export tests |
| 68 | CSV, PDF, Excel export | ✅ | `analytics.py` exports | all 24 combinations tested |

## 3. Dataset and hidden evaluation (SRS "Hint")

| Ref | Requirement | Status | Where |
|---|---|---|---|
| H1 | ≥500 unique complaints | ✅ | `sample_complaints/nimbuscarta_500.json` / `.csv`: 532 labelled records (`tests/test_dataset.py` checks uniqueness and labels) |
| H2 | ≥10 categories | ✅ | 12 |
| H3 | ≥20 subcategories | ✅ | 22 |
| H4 | ≥8 departments | ✅ | 10 |
| H5 | ≥20 policy/SOP documents | ✅ | 26 PDF/DOCX files in `sample_documents/`, incl. superseded, draft and a malicious FAQ fixture |
| H6 | ≥100 resolution rules | ✅ | 113 (no filler rules; every citation resolves to a real section) |
| H7 | ≥30 escalation rules | ✅ | 45 active |
| H8 | ≥25 ambiguous or multi-issue | ✅ | 30 multi-issue + 12 ambiguous |
| H9 | ≥20 contradictory/difficult policy cases | ✅ | 29 contradictory-policy + 15 policy-exception |
| H10 | ≥20 prompt-injection/adversarial | ✅ | 23 |
| H11 | ≥25 repeated or near-duplicate | ✅ | 15 repeated + 13 near-duplicate |
| H12 | Mixture of case types | ✅ | 21 case types (see `sample_complaints/README.md`) |
| H13 | Process a hidden pack without code change | ✅ | **Evaluation** page / `POST /api/v1/evaluation/import` (CSV or JSON; optional expected labels); `scripts/run_evaluation.py`; format in `hidden_test_ready/README.md` |
| H14 | Hidden PDF/DOCX documents | ✅ | Knowledge base upload + change-impact report + "Re-analyze affected" |

## 4. Functional requirements (SRS 1.6 i–lxxv)

| # | Requirement | Status | Where |
|---|---|---|---|
| i | Authentication | ✅ | JWT + Argon2 (`security/auth.py`) |
| ii | RBAC (5 roles) | ✅ | `require_roles`; UI hides out-of-role navigation; public registration always creates a standard customer |
| iii–v | Submission, validation, pre-processing | ✅ | `src/services/intake.py`, `complaint_processing/` |
| vi–x | KB upload, validation, parsing, chunking, version control | ✅ | `src/api/knowledge.py`, `document_processing/` |
| xi | Rule matrix maintained | ✅ | Create, **edit** (`PATCH /config/rules/{code}`) and toggle rules in Settings, incl. refund/replacement/compensation eligibility |
| xii | GenAI API integration | 🟡 | OpenAI, Gemini, Anthropic, xAI with fallback chain (`genai_pipeline/client.py`). Live calls blocked by exhausted credit; add a key and click **Resume** in Settings. |
| xiii–xxi | Issue, category, entities, sentiment, urgency, priority, routing | ✅ | See steps 12–24 |
| xxii–xxiii | Policy retrieval and applicability | ✅ | BM25 retrieval + precedence resolver (`knowledge_base/precedence.py::resolve_precedence`) |
| xxiv | Resolution generation | ✅ | GenAI + rule required actions |
| xxv–xxviii | Resolution, refund, replacement, compensation validation | ✅ | `python_validation/pipeline.py`, `eligibility.py` |
| xxix | Customer-facing response | ✅ | Response tab → reviewer-approved version → Conversation thread (promise guard before sending) |
| xxx–xxxii | Tone, promise and hallucination detection | ✅ | `hallucination_checks/detector.py`, `src/services/messaging.py` |
| xxxiii–xxxvi | Escalation detection, level, notes, validation | ✅ | `escalation_rules/engine.py` |
| xxxvii–xli | Follow-up, missing info, clarification, summary | ✅ | See steps 40–44 |
| xlii | Agent guidance | ✅ | GenAI + Nova assistant |
| xliii–xlv | Structured JSON, schema validation, Python ground truth | ✅ | `schemas/`, `python_validation/` |
| xlvi–xlix | Classification, routing, urgency, escalation comparison | ✅ | `comparison_engine/compare.py`; Evaluation page per-field accuracy |
| l | Policy traceability | ✅ | Every rule cites a section that exists in its document (tested) |
| li | Verification score | ✅ | Field agreement minus flags; never fabricated (null without GenAI) |
| lii–liii | Prompt management and version tracking | ✅ | `prompt_templates/`, `GenAIRun` |
| liv–lv | Injection protection, adversarial handling | ✅ | `security/`; security test suite and report |
| lvi–lviii | Duplicates, history, repeats | ✅ | `complaint_processing/duplicates.py` |
| lix–lx | SLA tracking and risk | ✅ | `complaint_processing/sla.py` |
| lxi–lxiii | Review queue, reviewer decisions, overrides stored | ✅ | Review queue UI with all 8 actions |
| lxiv–lxv | Audit trail, status tracking | ✅ | `AuditLog` on every change; notifications feed built from it |
| lxvi–lxviii | Customer, agent, admin dashboards | ✅ | Role dashboards |
| lxix–lxx | Analytics, trends | ✅ | Reports page |
| lxxi | Search and filtering | ✅ | SQL filtering + pagination |
| lxxii–lxxiii | Reports and export | ✅ | 8 reports × CSV/XLSX/PDF |
| lxxiv | Error handling | ✅ | `src/main.py` handlers (DB unavailable → 503, GenAI failure → manual review) |
| lxxv | Responsive UI | ✅ | Mobile menu, responsive grids, 16px gutters |

**Beyond the SRS:**

- **Nova**, a grounded, role-scoped chatbot: `chatbot/assistant.py`, `POST /api/v1/assistant/chat`.
- A customer/staff conversation thread with a promise guard.
- CSAT ratings.
- A live notifications bell.
- A hidden-pack evaluation workbench.
- A policy change-impact report.
- Live-editable thresholds.

## 5. Non-functional requirements (SRS 1.7)

| # | Requirement | Status | Where |
|---|---|---|---|
| 1 | Analysis ≤ 20 s | ✅ | 15 s GenAI budget with a hard deadline, then Python-only result (`genai_pipeline/client.py`); Python pipeline runs in well under 1 s |
| 2 | Scale: 10k complaints, 100 categories, 1000 documents | 🟡 | Filtering and pagination run in SQL on indexed columns; BM25 index is cached. Not load-tested at 10k. |
| 3 | Usable UI for all roles | ✅ | Role navigation; RBAC checked in the browser |
| 4 | Mandatory escalation enforced; valid source references | ✅ | Escalation tests; citation-resolution test |
| 5 | 99% uptime during evaluation | 🟡 | `Dockerfile` + `render.yaml` (health check `/health`). Needs the team to deploy. |

## 6. Competition integrity (SRS 1.8)

| # | Challenge | Status | How it is handled | Proof |
|---|---|---|---|---|
| 1 | Unique organization | ✅ | NimbusCarta, own products, policies, departments | — |
| 2 | Unique complaint dataset | ✅ | 532 generated, labelled records (`scripts/generate_complaints.py`) | `tests/test_dataset.py` |
| 3 | Hidden complaint pack | ✅ | Evaluation import, no code change | `test_evaluation_import_scores_against_labels`; `reports/comparison_report.csv` |
| 4 | Hidden policy update: resolutions affected, old policy obsolete, escalation rules changed, responses need revision | ✅ | Upload response `impact`: previous versions obsoleted, sections added/removed/changed, timeline changes, rules citing the document (and missing sections), escalation rules naming it, affected open complaints flagged `needs_reanalysis`; **Re-analyze affected** button | `test_new_policy_version_reports_impact_and_batch_reanalysis_clears_it` |
| 5 | Hidden category via configuration | ✅ | Add category/subcategory in Settings | `test_config_changes_take_effect_without_code` |
| 6 | Sentiment vs urgency trap | ✅ | Urgency from rules only | `tests/test_priority_traps.py` |
| 7 | Escalation trap | ✅ | Python enforcement | `test_python_enforces_escalation_genai_missed` |
| 8 | Prompt injection | ✅ | Untrusted wrapping, detection, review; Nova refuses | security suite |
| 9 | Unsupported promise | ✅ | Detector blocks agent replies; only reviewers may override (audited) | message tests |
| 10 | Contradictory policy / precedence | ✅ | `resolve_precedence`: active policy beats FAQ, guideline, template and older versions; a complaint or draft that relies on the lower-ranked statement gets `lower_precedence_conflict` and review | `test_faq_contradicting_the_policy_is_overridden_and_flagged` |
| 11 | Missing information → clarification | ✅ | Configured questions; `awaiting_customer` | message tests |
| 12 | Three or more issues | ✅ | Primary + up to 3 secondary + supporting departments | multi-issue tests |
| 13 | Repeat with different wording | ✅ | Fuzzy similarity per customer, or same order reference | repeat tests |
| 14 | Live modification: category, routing rule, priority logic, department, escalation threshold, SLA, validation rule, dashboard filter | ✅ | All in Settings: categories, subcategories, departments, rule create/edit, priority table, escalation rules, **high-value and repeat thresholds**, SLA; filters are query parameters | `tests/test_live_config.py` |
| 15 | Deliberate defect diagnosis | 📝 | Team skill; `documentation/APPLICATION_FLOW.md` maps every module | — |
| 16 | Meaningful commits across 5 days | 📝 | Team to commit per feature from each member | — |
| 17 | No hard-coded or fabricated values | ✅ | Verification values computed (`urgency_basis` replaced the old constant); GenAI columns say "not run" rather than inventing values | — |
| 18 | GenAI does not replace rules, validation, schema, precedence, escalation, audit, security | ✅ | All in Python | — |
| 19 | AI_USAGE.md | 📝 | Table complete; verifying members must sign | `AI_USAGE.md` |

## 7. Interface and technology (SRS 1.9)

| # | Item | Status | Where |
|---|---|---|---|
| 1–3 | Frontend, backend, Python | ✅ | React 19 + Vite + Zustand; FastAPI; Python 3.12 |
| 4 | IDE | 📝 | Team choice |
| 5 | GenAI APIs | ✅ | OpenAI, Gemini, Anthropic, xAI |
| 6 | Document processing | ✅ | PyMuPDF, python-docx |
| 7 | Pandas/NumPy | ✅ | Pandas (exports, evaluation) |
| 8 | Validation | ✅ | Pydantic, jsonschema, rule engine |
| 9 | Retrieval | ✅ | BM25 (a "suitable Python-based retrieval mechanism") with precedence weighting |
| 10 | Database | ✅ | PostgreSQL 16 |
| 11 | Visualization | ✅ | Recharts |
| 12 | Git/GitHub | ✅ | Repository remote |
| 13 | Deployment | ✅ | `Dockerfile` (API + UI in one container), `render.yaml` blueprint, `documentation/INSTALLATION.md` |

## 8. Deliverables (SRS 1.10)

| # | Deliverable | Status | Where |
|---|---|---|---|
| 1 | Project report (architecture, DFD, use case, activity, sequence) | ✅ | `documentation/architecture.md`, `documentation/APPLICATION_FLOW.md` (flows, sequence diagrams) |
| 2 | Repository structure | ✅ | All SRS folders present |
| 3 | Complaint dataset with expected labels and case types | ✅ | `sample_complaints/` |
| 4 | Knowledge-base dataset incl. versions and conflicts | ✅ | `sample_documents/` + `README.md` |
| 5 | Rule matrix | ✅ | `complaint_rules/rule_matrix.csv`, `reports/rule_matrix.xlsx`, `documentation/RULE_MATRIX.md` |
| 6 | GenAI evidence (provider, model, prompts, config, requests/responses, invalid responses, retries) | 🟡 | Prompts, versions, config and retry logic committed; `tests/test_genai_fallback.py` shows invalid-response retry and fallback. Live request/response samples need provider credit. |
| 7 | Python validation evidence | ✅ | Test suites; `reports/comparison_summary.md` |
| 8 | GenAI/Python comparison report (≥100 cases) | ✅ | `reports/comparison_report.csv/.xlsx` + summary (GenAI columns say "not run" until credit is added) |
| 9 | Complaint intelligence report | ✅ | `reports/complaint_intelligence_report.md` |
| 10 | Security and adversarial testing report | ✅ | `reports/security_testing_report.md` from `tests/test_security_adversarial.py` |
| 11 | Test categories | ✅ | Unit, integration, parsing, boundary, policy, adversarial, RBAC, dataset, hidden-pack readiness |
| 12 | Installation instructions | ✅ | `documentation/INSTALLATION.md` |
| 13 | Execution instructions | ✅ | `README.md`, `documentation/APPLICATION_FLOW.md` |
| 14 | GitHub contents incl. blog and video links | 📝 | README has placeholders for the blog and video links |
| 15 | Deployed app, URL, credentials | 🟡 | Blueprint ready; seeded credentials in README; URL after deploy |
| 16 | Demo video | 📝 | Team |
| 17 | Technical blog (≥2000 words) | 📝 | Team |
| 18 | AI_USAGE.md | ✅ | Updated for this phase; team sign-off pending |
| 19 | Final submission checklist | ✅ | `README.md` → Submission checklist |
