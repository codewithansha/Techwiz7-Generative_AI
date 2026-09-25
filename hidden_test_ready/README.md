# Hidden evaluation pack - how to run it

During the final evaluation the judges hand over unseen complaints and organisational
documents. SupportNova processes them **through configuration only**: no source code is
changed. This folder describes the expected format and the steps, and holds a 20-row example.

| File | Purpose |
|---|---|
| `example_hidden_pack.csv` | 20 unseen-style complaints in the exact import format, with expected labels |
| `example_hidden_pack.json` | The same 20 rows as a JSON array |

## What the evaluators provide

- **Documents** (PDF / DOCX / TXT): new, revised or outdated policies, SOPs, FAQs, routing or
  escalation rules. Each one needs a document ID, title, version, category, status and
  effective / expiry dates (ask for them if they are not printed in the file header).
- **Configuration changes** (described in words): a new category or subcategory, a new
  routing rule, a new escalation condition, a changed threshold.
- **Complaints** as CSV or JSON with the columns below.

### Complaint file format

Required columns (exact names):

| Column | Values |
|---|---|
| `title` | text (required) |
| `description` | text, at least 20 characters (required) |
| `product_or_service` | text, may be empty |
| `order_reference` | `NC-` followed by 6+ digits, or empty |
| `customer_type` | `standard` \| `vip` \| `wholesale` \| `enterprise` |
| `channel` | `web` \| `email` \| `chat` \| `portal` \| `messaging` |
| `previous_complaint_reference` | `CMP-` followed by 5+ digits, or empty |
| `requested_resolution` | text, may be empty |
| `customer_ref` | any stable customer key; rows with the same key are the same customer (repeat detection) |

Optional expected-label columns, used only to score accuracy:

| Column | Values |
|---|---|
| `expected_category` | category display name, e.g. `Safety`, `Product Defect`, or `Unclassified` |
| `expected_subcategory` | subcategory display name, e.g. `Overheating` |
| `expected_department` | department display name, e.g. `Account Security` |
| `expected_urgency` | `low` \| `medium` \| `high` \| `critical` |
| `expected_priority` | `P0` \| `P1` \| `P2` \| `P3` |
| `expected_escalation` | `true` \| `false` |

Any other columns (for example `id`, `case_type`, `notes`) are ignored. A JSON file is an
array of objects with the same keys; `expected_escalation` may be a boolean.

## Step 1 - upload the hidden documents

**UI:** sign in as administrator, open **Knowledge base -> Upload document**, pick the file and
fill in document ID, title, version, category (`policy`, `sop`, `faq`, `sla`, `routing`,
`escalation`, `compliance`, `guideline`, `template`), status (`active`, `draft`, `previous`,
`superseded`) and the effective / expiry dates.

**API:** `POST /api/v1/knowledge-base/documents` (multipart) with fields `file`,
`document_code`, `title`, `version`, `category`, `status`, `effective_date`, `expiry_date`.

What happens:

- DOCX files are split into sections by heading, PDFs by page; every chunk keeps its
  document ID, version, section and page for citations.
- Uploading an **active** version marks the older active version of the same document ID as
  `superseded`, and open complaints that cited it are flagged for re-analysis.
- `draft`, `superseded` and out-of-date documents are never used as grounding. When a FAQ and a
  policy disagree, the policy wins (precedence: policy > compliance > SLA > SOP > escalation >
  routing > guideline > template > FAQ).
- A document containing instruction-like text (e.g. "SYSTEM: ignore previous rules") is
  accepted with a warning and is only ever passed to GenAI as reference data.
- The same document ID + version cannot be uploaded twice (409); use the next version number.

## Step 2 - add a category, rule or escalation condition (Settings, no code)

Open **Settings** (administrator):

- **Categories & departments** - add a department, a category with its default department,
  and subcategories with keywords. A subcategory with keywords already classifies and routes
  complaints before any rule exists (those cases go to manual review because no mandatory
  actions are defined yet).
- **Resolution rules** - add a rule: category + subcategory, keywords, department and
  supporting departments, urgency, priority, policy ID and section, whether escalation is
  mandatory and at which level, required and prohibited actions, and refund / replacement /
  compensation eligibility. Rules can be switched off with a toggle.
- **Escalation rules** - add a condition: keywords and/or categories, customer types, a
  minimum repeat count, the level (`supervisor_review`, `department_manager`,
  `specialist_team`, `compliance_review`, `critical_management`) and an optional forced
  minimum urgency.
- **SLA & priority** - change the urgency -> priority mapping and SLA targets.

The same operations exist under `/api/v1/config`: `POST /departments`, `POST /categories`,
`POST /categories/{code}/subcategories`, `POST /rules`, `PATCH /rules/{rule_code}/active`,
`POST /escalation-rules`, `PATCH /escalation-rules/{rule_code}`, `PUT /priority-rules/{urgency}`.
Every change is written to the audit log.

Keywords match as whole words with simple inflections ("overheat" matches "overheating";
"sue" does not match "issue"), and multi-word phrases score higher than single words. For a
hidden **new category**, configure it here *before* importing; otherwise its complaints are
classified `Unclassified` or into the closest existing category.

## Step 3 - import the complaints and run the batch

**UI:** **Reports -> Evaluation / Import**: upload the CSV or JSON, then run the batch
analysis. **API:** `POST /api/v1/evaluation/import` (multipart `file`).

The import validates every row (required fields, order / complaint reference formats,
enumerations) and lists rejected rows with the reason. Rows are created in file order, so
repeat and near-duplicate detection sees earlier complaints from the same `customer_ref`.
Each complaint is analysed by both pipelines: GenAI (when a provider key is configured) and
the Python rule matrix, which is the ground truth.

## Step 4 - read the accuracy report

When rows carry `expected_*` columns, the evaluation report compares them with the Python
pipeline result: accuracy per field (category, subcategory, department, urgency, priority,
escalation), the list of mismatching rows, GenAI vs Python agreement, the manual-review count
and flags (prompt injection, outdated policy, unsupported promises). Export it as CSV / Excel
from the Reports page.

> Steps 3 and 4 use the Evaluation / Import page and `POST /api/v1/evaluation/import`, which
> are being built alongside this dataset. Until they land, complaints can be created one at a
> time with `POST /api/v1/complaints` and analysed with `POST /api/v1/complaints/{id}/analyze`.

## Rehearsing with our own data

- `example_hidden_pack.csv` / `.json` - 20 unseen-style rows: a calm safety report, prompt
  injection by a "VIP", an outdated-policy quote, a legal threat, a high-value enterprise
  overcharge, a repeat complaint, a vague unclassifiable complaint and more. Labels come from
  the seeded rule matrix; `python scripts/generate_complaints.py` regenerates and re-checks them.
- `sample_complaints/nimbuscarta_500.csv` - the full labelled dataset in the same format.
- `sample_documents/` - PDF / DOCX policies, including superseded, draft, conflicting-FAQ and
  adversarial test fixtures.
