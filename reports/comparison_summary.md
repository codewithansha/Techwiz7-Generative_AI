# GenAI vs Python comparison summary

Generated 2026-09-25 04:46 UTC by `python scripts/run_evaluation.py sample_complaints/nimbuscarta_500.json`.

| | |
|---|---|
| Pack | `sample_complaints/nimbuscarta_500.json`: rows 1-532 of 532 (the whole file) |
| Database | `supportnova_reports` (disposable; evaluation run #1, status done) |
| Complaints analysed | 532 (0 rejected at intake) in 90 s |
| Pipeline 1 (GenAI) | not run (no provider credit); GenAI rows scored: 0 |
| Pipeline 2 (Python rules) | run on every row; this is the ground truth the app acts on |
| Sent to manual review | 228 of 532 (42.9%) |

## Read this first: what the accuracy figures mean

The `expected_*` labels in `sample_complaints/nimbuscarta_500.json` (and the hidden-pack example) were
produced by `scripts/generate_complaints.py`. It runs **the same Python pipeline** against the seeded rule
matrix in memory (see `sample_complaints/README.md`). Python accuracy against these labels is therefore
**not an independent measure of classification quality**. It is a consistency and regression check. It
shows whether the live, database-backed pipeline (intake validation, repeat and near-duplicate detection
against earlier rows, policy retrieval, configurable priority table) reproduces what the rule matrix
predicts offline. A figure below 100% points to a real difference between those two paths, or to a
label that is stale since the rules changed. It does not point to a modelling error.

Independent accuracy needs labels written by a person who has not seen the rule output, for example the
judges' hidden pack. The same script runs such a pack unchanged.

GenAI accuracy and GenAI-Python agreement are **not reported**, because no GenAI provider had credit when
this report was generated. Every GenAI column in `comparison_report.csv` reads "not run (no provider credit)".
No GenAI output was simulated.

## Per-field accuracy (Python vs expected label)

| Field | Python accuracy | Labelled rows | GenAI accuracy | GenAI-Python agreement |
|---|---:|---:|---|---|
| category | 100.0% | 532 | not run (no provider credit) | not run (no provider credit) |
| subcategory | 100.0% | 532 | not run (no provider credit) | not run (no provider credit) |
| department | 100.0% | 532 | not run (no provider credit) | not run (no provider credit) |
| urgency | 100.0% | 532 | not run (no provider credit) | not run (no provider credit) |
| priority | 100.0% | 532 | not run (no provider credit) | not run (no provider credit) |
| escalation | 100.0% | 532 | not run (no provider credit) | not run (no provider credit) |

All six fields correct on **532 of 532** complaints (100.0%).

## Accuracy by case type

Cell = Python correct / labelled for that field. "All" = rows with every labelled field correct.

| Case type | Rows | category | subcategory | department | urgency | priority | escalation | All |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| ambiguous | 12 | 12/12 | 12/12 | 12/12 | 12/12 | 12/12 | 12/12 | 100.0% |
| calm_critical | 20 | 20/20 | 20/20 | 20/20 | 20/20 | 20/20 | 20/20 | 100.0% |
| contradictory_policy | 29 | 29/29 | 29/29 | 29/29 | 29/29 | 29/29 | 29/29 | 100.0% |
| emotional | 25 | 25/25 | 25/25 | 25/25 | 25/25 | 25/25 | 25/25 | 100.0% |
| high_priority | 20 | 20/20 | 20/20 | 20/20 | 20/20 | 20/20 | 20/20 | 100.0% |
| high_value | 10 | 10/10 | 10/10 | 10/10 | 10/10 | 10/10 | 10/10 | 100.0% |
| incomplete | 25 | 25/25 | 25/25 | 25/25 | 25/25 | 25/25 | 25/25 | 100.0% |
| legal_threat | 12 | 12/12 | 12/12 | 12/12 | 12/12 | 12/12 | 12/12 | 100.0% |
| low_priority | 24 | 24/24 | 24/24 | 24/24 | 24/24 | 24/24 | 24/24 | 100.0% |
| low_value_privacy | 8 | 8/8 | 8/8 | 8/8 | 8/8 | 8/8 | 8/8 | 100.0% |
| multi_issue | 30 | 30/30 | 30/30 | 30/30 | 30/30 | 30/30 | 30/30 | 100.0% |
| near_duplicate | 13 | 13/13 | 13/13 | 13/13 | 13/13 | 13/13 | 13/13 | 100.0% |
| policy_exception | 15 | 15/15 | 15/15 | 15/15 | 15/15 | 15/15 | 15/15 | 100.0% |
| privacy | 14 | 14/14 | 14/14 | 14/14 | 14/14 | 14/14 | 14/14 | 100.0% |
| prompt_injection | 23 | 23/23 | 23/23 | 23/23 | 23/23 | 23/23 | 23/23 | 100.0% |
| repeated | 15 | 15/15 | 15/15 | 15/15 | 15/15 | 15/15 | 15/15 | 100.0% |
| safety | 23 | 23/23 | 23/23 | 23/23 | 23/23 | 23/23 | 23/23 | 100.0% |
| security | 20 | 20/20 | 20/20 | 20/20 | 20/20 | 20/20 | 20/20 | 100.0% |
| simple | 168 | 168/168 | 168/168 | 168/168 | 168/168 | 168/168 | 168/168 | 100.0% |
| unsupported_refund | 15 | 15/15 | 15/15 | 15/15 | 15/15 | 15/15 | 15/15 | 100.0% |
| vip_minor | 11 | 11/11 | 11/11 | 11/11 | 11/11 | 11/11 | 11/11 | 100.0% |

## Validation flags raised (rows with at least one)

| Flag | Rows |
|---|---:|
| `prompt_injection` | 16 |
| `cites_outdated_policy` | 6 |
| `no_rule_match` | 5 |
| `unknown_previous_reference` | 5 |
| `lower_precedence_conflict` | 5 |

## Mismatches (0 field-level, on 0 complaints)

None: the live pipeline reproduced every expected label.
