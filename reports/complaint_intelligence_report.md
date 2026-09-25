# Complaint intelligence report

Generated 2026-09-25 04:46 UTC by `python scripts/complaint_intelligence_report.py` from database `supportnova_reports`.

| | |
|---|---|
| Complaints in database | 532 |
| Analysed (Python rule matrix) | 532 |
| With GenAI output | 0 (GenAI not run: no provider credit) |
| Mandatory escalations | 172 (32.3%) |
| Sent to manual review | 228 (42.9%); pending 228 |
| Repeat complaints | 28 (5.3%) |
| Open with SLA at risk | 0 of 532 open |

All classification, routing, urgency, priority and escalation figures come from Pipeline 2 (Python rules), which
is the ground truth. If this database was filled by `scripts/run_evaluation.py`, it holds the labelled synthetic
NimbusCarta dataset. The distributions then describe that dataset's mix of SRS case types, not real
customer traffic.

## Category

| Category | Complaints | Share |
|---|---:|---:|
| Delivery | 82 | 15.4% |
| Billing | 76 | 14.3% |
| Product Defect | 61 | 11.5% |
| Refund | 60 | 11.3% |
| Safety | 46 | 8.6% |
| Account | 40 | 7.5% |
| Technical Support | 37 | 7.0% |
| Service Quality | 36 | 6.8% |
| Privacy | 31 | 5.8% |
| Warranty | 22 | 4.1% |
| Cancellation | 20 | 3.8% |
| Staff Behavior | 16 | 3.0% |
| Unclassified | 5 | 0.9% |

## Department

| Department | Total | Open | Resolved | Escalated (status) | SLA at risk | Avg resolution h |
|---|---:|---:|---:|---:|---:|---:|
| Account Security | 40 | 40 | 0 | 27 | 0 | - |
| Billing | 96 | 96 | 0 | 13 | 0 | - |
| Compliance | 31 | 31 | 0 | 31 | 0 | - |
| Customer Relations | 57 | 57 | 0 | 21 | 0 | - |
| Logistics | 82 | 82 | 0 | 8 | 0 | - |
| Returns | 60 | 60 | 0 | 7 | 0 | - |
| Safety | 46 | 46 | 0 | 46 | 0 | - |
| Technical Support | 37 | 37 | 0 | 5 | 0 | - |
| Warranty | 83 | 83 | 0 | 14 | 0 | - |

## Urgency

From the rule matrix, raised by escalation rules. Sentiment never sets urgency.

| Urgency | Complaints | Share |
|---|---:|---:|
| critical | 46 | 8.6% |
| high | 208 | 39.1% |
| medium | 202 | 38.0% |
| low | 76 | 14.3% |

## Priority

Urgency -> priority table. Never below the rule's own priority; VIP/enterprise at least P2.

| Priority | Complaints | Share |
|---|---:|---:|
| P0 | 50 | 9.4% |
| P1 | 204 | 38.3% |
| P2 | 219 | 41.2% |
| P3 | 59 | 11.1% |

## Sentiment (Python lexicon estimate)

`python_validation/sentiment.py` word-list estimate of tone, used because GenAI did not run. It describes tone only. Polite openers and sign-offs ("thank you for your help") count as positive words, so some complaints read as positive.

| Sentiment | Complaints | Share |
|---|---:|---:|
| strongly_negative | 51 | 9.6% |
| negative | 128 | 24.1% |
| neutral | 264 | 49.6% |
| positive | 89 | 16.7% |

### Sentiment by category

| Category | strongly_negative | negative | neutral | positive |
|---|---:|---:|---:|---:|
| Account | 0 | 4 | 26 | 10 |
| Billing | 7 | 28 | 33 | 8 |
| Cancellation | 0 | 3 | 13 | 4 |
| Delivery | 7 | 35 | 30 | 10 |
| Privacy | 3 | 5 | 17 | 6 |
| Product Defect | 14 | 19 | 21 | 7 |
| Refund | 7 | 1 | 38 | 14 |
| Safety | 0 | 4 | 31 | 11 |
| Service Quality | 4 | 8 | 16 | 8 |
| Staff Behavior | 3 | 13 | 0 | 0 |
| Technical Support | 6 | 5 | 21 | 5 |
| Unclassified | 0 | 3 | 2 | 0 |
| Warranty | 0 | 0 | 16 | 6 |

## Escalation level

172 complaints with mandatory escalation. Share is of escalated complaints.

| Level | Complaints | Share |
|---|---:|---:|
| critical_management | 46 | 26.7% |
| compliance_review | 42 | 24.4% |
| supervisor_review | 38 | 22.1% |
| specialist_team | 26 | 15.1% |
| department_manager | 20 | 11.6% |

## Escalation triggers (rules fired)

A complaint can fire several rules. Share is of escalated complaints.

| Rule | Complaints | Share |
|---|---:|---:|
| ESC-SAF-01: Overheating / fire risk | 34 | 19.8% |
| ESC-SEC-01: Account takeover | 26 | 15.1% |
| ESC-PRI-02: Customer data exposed | 22 | 12.8% |
| ESC-POL-01: Policy exception request | 15 | 8.7% |
| ESC-REP-01: Repeat unresolved | 13 | 7.6% |
| ESC-LEG-01: Legal threat | 12 | 7.0% |
| ESC-HIGH-VALUE: High-value dispute | 10 | 5.8% |
| ESC-SAF-02: Electric shock / injury | 9 | 5.2% |
| ESC-PRI-01: Privacy leak | 7 | 4.1% |
| ESC-HIGH-01: High value dispute | 6 | 3.5% |
| RR-123: rule-matrix mandated | 6 | 3.5% |
| ESC-FAIL-01: Severe service failure | 5 | 2.9% |
| ESC-SAF-05: Fire, melting or electrical fault | 5 | 2.9% |
| ESC-SEC-02: Account takeover signals | 5 | 2.9% |
| RR-021: rule-matrix mandated | 4 | 2.3% |
| ESC-HW-01: Repeated hardware failure | 3 | 1.7% |
| ESC-VIP-01: VIP exposure | 3 | 1.7% |
| ESC-X-09: Condition 9: phishing | 3 | 1.7% |
| RR-022: rule-matrix mandated | 3 | 1.7% |
| ESC-CRIT-01: Critical customer impact | 2 | 1.2% |
| ESC-X-11: Condition 11: defamation | 2 | 1.2% |
| ESC-X-23: Condition 23: loud pop | 2 | 1.2% |
| RR-165: rule-matrix mandated | 2 | 1.2% |
| ESC-SAF-03: Battery swelling | 1 | 0.6% |
| ESC-X-08: Condition 8: otp shared | 1 | 0.6% |
| ESC-X-14: Condition 14: consumer court | 1 | 0.6% |

## Escalation reasons

| Reason | Complaints | Share |
|---|---:|---:|
| Safety hazard requires critical escalation. | 34 | 19.8% |
| Account security incident. | 26 | 15.1% |
| Customer data reached the wrong person or the public. | 22 | 12.8% |
| Policy exception must be reviewed. | 15 | 8.7% |
| Repeated unresolved complaint. | 13 | 7.6% |
| Legal language present. | 12 | 7.0% |
| Disputed amount meets the high-value threshold (amount rule). | 10 | 5.8% |
| Injury or shock risk. | 9 | 5.2% |
| Privacy incident. | 7 | 4.1% |
| High-value dispute. | 6 | 3.5% |
| Rule RR-123 mandates escalation. | 6 | 3.5% |
| Account takeover indicators. | 5 | 2.9% |
| Fire or electrical hazard. | 5 | 2.9% |
| Severe service failure. | 5 | 2.9% |
| Rule RR-021 mandates escalation. | 4 | 2.3% |
| A second failure on the same order needs supervisor approval (RPL-POL-01 2). | 3 | 1.7% |
| Mandatory escalation condition for 'phishing'. | 3 | 1.7% |
| Rule RR-022 mandates escalation. | 3 | 1.7% |
| VIP handling. | 3 | 1.7% |
| Complaint affects health care or stops a customer's business. | 2 | 1.2% |
| Mandatory escalation condition for 'defamation'. | 2 | 1.2% |
| Mandatory escalation condition for 'loud pop'. | 2 | 1.2% |
| Rule RR-165 mandates escalation. | 2 | 1.2% |
| Mandatory escalation condition for 'consumer court'. | 1 | 0.6% |
| Mandatory escalation condition for 'otp shared'. | 1 | 0.6% |
| Swollen lithium battery is a fire hazard (SAF-POL-01 1.2). | 1 | 0.6% |

## SLA risk and breach

Resolution SLA: 532 complaints have a resolution due date. 0 are at risk and 0 are breached. SLA compliance on open complaints: 100.0%. First response: met 0, breached 0, pending 532, overdue 0.

| Priority | With SLA | At risk | Breached |
|---|---:|---:|---:|
| P0 | 50 | 0 | 0 |
| P1 | 204 | 0 | 0 |
| P2 | 219 | 0 | 0 |
| P3 | 59 | 0 | 0 |

SLA clocks start when a complaint is created. Complaints loaded by a batch import all start at import time, so
risk and breach counts reflect how long ago the import ran. They say nothing about real handling times.

## Policy citations used

| Policy | Rule-matrix citations | GenAI citations |
|---|---:|---:|
| DEL-POL-04 | 82 | 0 |
| WAR-POL-03 | 80 | 0 |
| BIL-POL-02 | 69 | 0 |
| REF-POL-01 | 67 | 0 |
| SAF-POL-01 | 46 | 0 |
| SEC-POL-01 | 40 | 0 |
| TEC-SOP-02 | 37 | 0 |
| PRI-POL-01 | 31 | 0 |
| CAN-POL-01 | 20 | 0 |
| CMP-POL-01 | 18 | 0 |
| SLA-POL-01 | 18 | 0 |
| REL-SOP-01 | 16 | 0 |
| RPL-POL-01 | 3 | 0 |

5 analysed complaints cite no policy (no rule matched, or the category has no rule yet).

## Manual review reasons

228 complaints need a human. A complaint can have several reasons; share is of manual-review complaints.

| Reason | Complaints | Share |
|---|---:|---:|
| Mandatory escalation | 172 | 75.4% |
| Sensitive complaint | 117 | 51.3% |
| Complaint is ambiguous | 22 | 9.6% |
| Adversarial or manipulative content | 16 | 7.0% |
| Policy contradiction exists | 11 | 4.8% |

## Validation flags

Complaints with at least one flag of each kind.

| Flag | Complaints | Share |
|---|---:|---:|
| prompt_injection | 16 | 3.0% |
| cites_outdated_policy | 6 | 1.1% |
| lower_precedence_conflict | 5 | 0.9% |
| no_rule_match | 5 | 0.9% |
| unknown_previous_reference | 5 | 0.9% |

## Repeat complaints

28 complaints are linked to an earlier or concurrent open complaint of the same customer.

## Repeat complaints by category

| Category | Complaints | Share |
|---|---:|---:|
| Service Quality | 14 | 50.0% |
| Billing | 5 | 17.9% |
| Delivery | 2 | 7.1% |
| Technical Support | 2 | 7.1% |
| Product Defect | 1 | 3.6% |
| Refund | 1 | 3.6% |
| Safety | 1 | 3.6% |
| Staff Behavior | 1 | 3.6% |
| Warranty | 1 | 3.6% |

## Top products

Ten most frequent products or services.

| Product or service | Complaints | Share |
|---|---:|---:|
| NimbusTab 11 | 87 | 16.4% |
| AuraBuds Pro | 86 | 16.2% |
| NovaCharge 65W | 83 | 15.6% |
| PulseWatch S | 61 | 11.5% |
| NimbusCarta customer account | 51 | 9.6% |
| CartDock Mini | 42 | 7.9% |
| ForgePad | 32 | 6.0% |
| LumenLamp | 29 | 5.5% |
| NimbusCare+ Protection Plan | 29 | 5.5% |
| NimbusCarta mobile app | 14 | 2.6% |

## Customer type

| Customer type | Complaints | Share |
|---|---:|---:|
| standard | 406 | 76.3% |
| wholesale | 52 | 9.8% |
| vip | 45 | 8.5% |
| enterprise | 29 | 5.5% |

## Channel

| Channel | Complaints | Share |
|---|---:|---:|
| web | 180 | 33.8% |
| email | 99 | 18.6% |
| messaging | 89 | 16.7% |
| portal | 87 | 16.4% |
| chat | 77 | 14.5% |

## Status

| Status | Complaints | Share |
|---|---:|---:|
| analyzed | 360 | 67.7% |
| escalated | 172 | 32.3% |

