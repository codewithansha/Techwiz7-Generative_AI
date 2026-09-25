# NimbusCarta labelled complaint dataset

`nimbuscarta_500.json` and `nimbuscarta_500.csv` hold the same 532 synthetic complaints for
the fictional consumer-electronics retailer **NimbusCarta** (AuraBuds Pro, NovaCharge 65W,
NimbusTab 11, PulseWatch S, CartDock Mini, LumenLamp, ForgePad, NimbusCare+ plan, the
NimbusCarta app and customer accounts). Amounts are in PKR.

Regenerate (deterministic, seed 20260925):

```
python scripts/generate_complaints.py
python -m pytest -q tests/test_dataset.py
```

## How the labels were produced

Each wording template is written for an intended category and subcategory, using the
whole-word keywords of the rule matrix in `database/seed.py`. The generator then runs
the application's own Pipeline 2 (`python_validation.pipeline.run_python_validation`,
which calls the rule, routing, escalation and priority engines) against the seeded rule
matrix held in memory, and refuses to write the dataset if:

- the rules would classify a record differently from its intended category/subcategory;
- a case-type invariant fails (safety not critical, angry-but-minor above P3, VIP minor
  not low/P2, legal threat or policy exception not escalated, ...);
- labels would change depending on repeat history (see below);
- a filler sentence (greeting, sign-off, context) contains any rule keyword;
- two descriptions outside a deliberate duplicate group are near-identical.

So the `expected_*` values are what the configured rule matrix should produce. If the
seeded rules change, `tests/test_dataset.py` fails until the dataset is regenerated.

## Fields

| Field | Meaning |
|---|---|
| `id` | Dataset id, `DS-0001` ... |
| `title`, `description` | Complaint text (both are classified) |
| `product_or_service` | Product or service name; empty for some incomplete cases |
| `order_reference` | `NC-` + 6 digits, or empty for incomplete cases |
| `customer_type` | `standard`, `vip`, `wholesale`, `enterprise` |
| `channel` | `web`, `email`, `chat`, `portal`, `messaging` |
| `previous_complaint_reference` | `CMP-xxxxx` on some repeat follow-ups, otherwise empty |
| `requested_resolution` | What the customer asks for (not classified; scanned for prompt injection) |
| `customer_ref` | Simulated customer (`SIM-CUST-0042`). Repeat groups share one customer and order; every other record has its own customer |
| `case_type` | SRS mixture type (table below) |
| `expected_category` / `expected_subcategory` | Display names from `database/seed.py`; `Unclassified` / `Unspecified` when no rule matches |
| `expected_department` | Department display name |
| `expected_urgency` | `low`, `medium`, `high`, `critical` (rule urgency raised by escalation rules; sentiment is never used) |
| `expected_priority` | `P0`-`P3` (urgency mapping, never below the rule's priority, VIP/enterprise at least P2) |
| `expected_escalation`, `expected_escalation_level` | Whether escalation is mandatory and at which level |
| `expected_policy`, `expected_policy_section` | Active policy code and section cited by the matched rule ("" when none) |
| `secondary_categories` | Other matched categories (multi-issue); `\|`-separated in the CSV |
| `tags` | Case type, category, customer type, fired escalation rules (`esc:ESC-LEG-01`), `injection_pattern`, `missing_order`, `repeat_group:RG-07`, `three_plus_issues` |
| `notes` | One sentence explaining the label (especially for traps) |

In the CSV, `expected_escalation` is `true`/`false` and list fields are `|`-separated.

## Repeat and duplicate groups

`repeat_group:RG-nn` tags link an original complaint to its `near_duplicate` (near-identical
or reworded resubmission, same labels as the original) and `repeated` follow-ups ("I
complained before", "still not resolved", "third time"). Follow-ups hit the escalating
repeat rule RR-123 (Service Quality / Long Wait, supervisor review, high), except RG-16
where the overheating rule still scores highest. Groups are designed so the labels are the
same whether or not the earlier complaints were imported first and are still open. Import
the file in `id` order to exercise repeat detection.

## Coverage against the SRS minimums

| Requirement | SRS minimum | Dataset |
|---|---|---:|
| Unique complaints | >= 500 | 532 |
| Categories represented | >= 10 | 12 |
| Subcategories represented | >= 20 | 22 |
| Departments represented | >= 8 | 9 |
| Ambiguous or multi-issue | >= 25 | 42 |
|   of which 3+ simultaneous issues | >= 8 | 18 |
| Contradictory / difficult policy | >= 20 | 29 |
| Prompt-injection / adversarial | >= 20 | 23 |
| Repeated or near-duplicate | >= 25 | 28 |

## Counts

Total complaints: 532

| Case type | Count |
|---|---:|
| ambiguous | 12 |
| calm_critical | 20 |
| contradictory_policy | 29 |
| emotional | 25 |
| high_priority | 20 |
| high_value | 10 |
| incomplete | 25 |
| legal_threat | 12 |
| low_priority | 24 |
| low_value_privacy | 8 |
| multi_issue | 30 |
| near_duplicate | 13 |
| policy_exception | 15 |
| privacy | 14 |
| prompt_injection | 23 |
| repeated | 15 |
| safety | 23 |
| security | 20 |
| simple | 168 |
| unsupported_refund | 15 |
| vip_minor | 11 |

| Expected category | Count |
|---|---:|
| Delivery | 82 |
| Billing | 76 |
| Product Defect | 61 |
| Refund | 60 |
| Safety | 46 |
| Account | 40 |
| Technical Support | 37 |
| Service Quality | 36 |
| Privacy | 31 |
| Warranty | 22 |
| Cancellation | 20 |
| Staff Behavior | 16 |
| Unclassified | 5 |

| Expected department | Count |
|---|---:|
| Billing | 96 |
| Warranty | 83 |
| Logistics | 82 |
| Returns | 60 |
| Customer Relations | 57 |
| Safety | 46 |
| Account Security | 40 |
| Technical Support | 37 |
| Compliance | 31 |

| Expected priority | Count |
|---|---:|
| P0 | 50 |
| P1 | 204 |
| P2 | 219 |
| P3 | 59 |

Distinct subcategories: 23; escalated: 172

## Importing

The CSV/JSON uses the bulk-import column names (`title, description, product_or_service,
order_reference, customer_type, channel, previous_complaint_reference,
requested_resolution, customer_ref`) plus the optional `expected_*` columns that are used
to score accuracy. Extra columns (`id`, `case_type`, `tags`, `notes`, ...) are ignored by
the importer. Use **Reports -> Evaluation / Import** or `POST /api/v1/evaluation/import`
(see `hidden_test_ready/README.md`), then run batch analysis and read the accuracy report.
