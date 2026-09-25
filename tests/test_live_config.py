"""Live configuration and policy-governance features (SRS 1.8 #4, #10, #14; step 58)."""

import io

from tests.test_api_integration import auth, client, submit  # noqa: F401  (pytest fixtures)
from tests.test_api_integration import pytestmark  # noqa: F401  (skip without a test DB)


def _analyze(client, headers, cid):
    response = client.post(f"/api/v1/complaints/{cid}/analyze", headers=headers, json={"skip_genai": True})
    assert response.status_code == 200, response.text
    return response.json()


def test_faq_contradicting_the_policy_is_overridden_and_flagged(client, auth):
    complaint = submit(client, auth["agent"], "I am still waiting for refund on my card. Your FAQ says card refunds are instant, so why is it taking so long?")
    result = _analyze(client, auth["agent"], complaint["id"])
    precedence = result["complaint"]["checks"]["policy"]["precedence"]
    assert precedence["governing"]["document_code"] == "REF-POL-01"
    assert any(o["document_code"] == "FAQ-REF-01" for o in precedence["overridden"])
    flag = next(f for f in result["flags"] if f["code"] == "lower_precedence_conflict")
    assert "FAQ-REF-01" in flag["value"] and "REF-POL-01 takes precedence" in flag["detail"]
    assert "Policy contradiction exists" in result["review_reasons"]


def test_plain_refund_complaint_does_not_raise_a_precedence_flag(client, auth):
    complaint = submit(client, auth["agent"], "I am still waiting for refund on my returned earbuds, it has been twelve business days")
    result = _analyze(client, auth["agent"], complaint["id"])
    assert "lower_precedence_conflict" not in {f["code"] for f in result["flags"]}


def test_high_value_threshold_is_editable_without_restart(client, auth):
    admin = auth["administrator"]
    assert client.put("/api/v1/config/thresholds/high_value_threshold", headers=auth["agent"], json={"value": 5000}).status_code == 403
    assert client.put("/api/v1/config/thresholds/high_value_threshold", headers=admin, json={"value": 0}).status_code == 422
    assert client.put("/api/v1/config/thresholds/unknown", headers=admin, json={"value": 1}).status_code == 404
    text = "I was charged 9000 twice for the same tablet order"
    before = _analyze(client, auth["agent"], submit(client, auth["agent"], text)["id"])
    assert not any(r["rule_code"] == "ESC-HIGH-VALUE" for r in before["complaint"]["checks"]["escalation"]["matched_rules"])
    assert client.put("/api/v1/config/thresholds/high_value_threshold", headers=admin, json={"value": 5000}).json()["value"] == 5000
    try:
        listed = {row["key"]: row["value"] for row in client.get("/api/v1/config/thresholds", headers=auth["agent"]).json()}
        assert listed["high_value_threshold"] == 5000
        after = _analyze(client, auth["agent"], submit(client, auth["agent"], text)["id"])
        assert any(r["rule_code"] == "ESC-HIGH-VALUE" for r in after["complaint"]["checks"]["escalation"]["matched_rules"])
        assert client.get("/api/v1/config/genai", headers=auth["agent"]).json()["thresholds"]["high_value_threshold"] == 5000
    finally:
        client.put("/api/v1/config/thresholds/high_value_threshold", headers=admin, json={"value": 200000})


def test_resolution_rule_can_be_edited_live(client, auth):
    admin = auth["administrator"]
    rule = next(r for r in client.get("/api/v1/config/rules", headers=admin).json() if not r["escalation_required"])
    code = rule["rule_code"]
    assert client.patch(f"/api/v1/config/rules/{code}", headers=auth["agent"], json={"priority": "P1"}).status_code == 403
    assert client.patch(f"/api/v1/config/rules/{code}", headers=admin, json={"keywords": [" "]}).status_code == 422
    bad = client.patch(f"/api/v1/config/rules/{code}", headers=admin, json={"escalation_required": True, "escalation_level": "supervisor_review", "urgency": "low"})
    assert bad.status_code == 422
    ok = client.patch(f"/api/v1/config/rules/{code}", headers=admin, json={"priority": "P1", "refund_eligible": False, "keywords": [*rule["conditions"]["keywords"], "zz-special phrase"]})
    assert ok.status_code == 200, ok.text
    updated = next(r for r in client.get("/api/v1/config/rules", headers=admin).json() if r["rule_code"] == code)
    assert updated["priority"] == "P1" and updated["refund_eligible"] is False and "zz-special phrase" in updated["conditions"]["keywords"]
    history = client.get("/api/v1/audit-logs", headers=admin)
    if history.status_code == 200:
        assert any(row.get("action") == "update_rule" for row in history.json())


def test_new_policy_version_reports_impact_and_batch_reanalysis_clears_it(client, auth):
    agent, admin = auth["agent"], auth["administrator"]
    complaint = submit(client, agent, "My parcel is late, the order has not arrived after eight days and tracking has not moved")
    first = _analyze(client, agent, complaint["id"])["complaint"]
    assert first["python"]["policy_id"] == "DEL-POL-04"
    policy = (
        "1. Purpose\nThis Delivery Policy applies to every NimbusCarta shipment.\n\n"
        "5.2 Delayed shipments\nDelayed shipments are verified in carrier tracking within 2 business days. Compensation is not automatic.\n\n"
        "6.1 Lost shipments\nA parcel is declared lost after a 10 day carrier investigation.\n"
    )
    upload = client.post(
        "/api/v1/knowledge-base/documents",
        headers=admin,
        files={"file": ("delivery-v3.txt", io.BytesIO(policy.encode()), "text/plain")},
        data={"document_code": "DEL-POL-04", "title": "Delivery Policy", "version": "3.0", "category": "policy", "status": "active"},
    )
    assert upload.status_code == 200, upload.text
    body = upload.json()
    impact = body["impact"]
    assert "1.0" in impact["previous_versions"] and impact["previous_obsolete"] is True
    assert impact["resolution_rules"], "rules citing DEL-POL-04 are listed"
    assert impact["responses_need_revision"] is True
    assert complaint["complaint_code"] in body["affected_complaint_codes"]

    flagged = client.get("/api/v1/complaints?reanalysis=true", headers=agent).json()
    assert complaint["id"] in {c["id"] for c in flagged}
    assert client.post("/api/v1/complaints/reanalyze-flagged", headers=agent, json={"skip_genai": True}).status_code == 403
    result = client.post("/api/v1/complaints/reanalyze-flagged", headers=auth["reviewer"], json={"skip_genai": True}).json()
    assert complaint["complaint_code"] in result["reanalyzed"] and result["remaining"] == 0
    assert client.get(f"/api/v1/complaints/{complaint['id']}", headers=agent).json()["needs_reanalysis"] is False


def test_reviewer_modify_edits_fields_and_the_customer_response(client, auth):
    complaint = submit(client, auth["agent"], "The courier was rude to me at the door and threw the parcel")
    _analyze(client, auth["agent"], complaint["id"])
    reply = "We are sorry about the courier's conduct. We have raised it with the delivery partner and will update you."
    modified = client.post(
        f"/api/v1/complaints/{complaint['id']}/review",
        headers=auth["reviewer"],
        json={"action": "modify", "comments": "Tone and priority adjusted", "final_decision": {"priority": "P1", "customer_response": reply}},
    )
    assert modified.status_code == 200, modified.text
    view = client.get(f"/api/v1/complaints/{complaint['id']}", headers=auth["reviewer"]).json()
    assert view["latest_review"]["final_decision"]["customer_response"] == reply
    assert view["classification"]["priority"] == "P1"


def test_amounts_without_currency_prefix_are_detected():
    from complaint_processing.preprocess import extract_metadata

    assert "250000" in extract_metadata("I was charged 250000 for one tablet")["amounts"]
    assert extract_metadata("Order NC-123456 of 12 laptops arrived")["amounts"] == []
    assert extract_metadata("I paid 2000 days ago")["amounts"] == []


def test_replacement_eligibility_checks_policy_conditions(client, auth):
    from datetime import date, timedelta

    agent = auth["agent"]
    old = (date.today() - timedelta(days=60)).isoformat()
    late = submit(client, agent, "The tablet screen stopped working and shows dead pixels, it is defective", incident_date=old)
    result = _analyze(client, agent, late["id"])["complaint"]["python"]
    window = next(c for c in result["eligibility"]["checks"] if c["check"] == "replacement_window")
    if result["eligibility"]["rule_replacement_eligible"] is not False:
        assert window["passed"] is False and result["replacement_eligible"] is False

    damaged = submit(client, agent, "The tablet stopped working after I dropped it in water, it is defective", incident_date=date.today().isoformat())
    python = _analyze(client, agent, damaged["id"])["complaint"]["python"]
    assert python["replacement_eligible"] is False or python["eligibility"]["rule_replacement_eligible"] is False
    assert any(c["passed"] is False for c in python["eligibility"]["checks"])

    unknown = submit(client, agent, "The tablet screen stopped working and shows dead pixels, it is defective")
    python = _analyze(client, agent, unknown["id"])["complaint"]["python"]
    assert "replacement_window" in python["eligibility"]["needs_check"] or python["eligibility"]["rule_replacement_eligible"] is False
