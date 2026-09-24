from sqlalchemy.orm import Session

from database.models import Complaint, GenAIRun
from genai_pipeline.client import GenAIError, generate_structured
from knowledge_base.retrieval import retrieve_policy_chunks
from prompt_templates.loader import PROMPT_NAME, PROMPT_VERSION, render_prompts
from security.prompt_injection import wrap_untrusted_complaint


def run_genai_pipeline(
    db: Session,
    complaint: Complaint,
    *,
    categories: list[str],
    departments: list[str],
    tone: str = "professional",
    repeat_context: str = "",
) -> tuple[GenAIRun, list[dict]]:
    policy_chunks = retrieve_policy_chunks(db, f"{complaint.title} {complaint.description} {complaint.product_or_service}")
    system_prompt, user_prompt = render_prompts(
        {
            "complaint_id": complaint.complaint_code,
            "customer_type": complaint.customer_type.value,
            "channel": complaint.channel.value,
            "product_or_service": complaint.product_or_service,
            "order_reference": complaint.order_reference,
            "requested_resolution": complaint.requested_resolution,
            "previous_complaint_reference": complaint.previous_complaint_reference,
            "repeat_context": repeat_context,
            "wrapped_complaint": wrap_untrusted_complaint(f"{complaint.title}\n{complaint.description}"),
            "policy_chunks": policy_chunks,
            "categories": ", ".join(categories),
            "departments": ", ".join(departments),
            "tone": tone,
        }
    )
    try:
        result = generate_structured(system_prompt, user_prompt)
        run = GenAIRun(
            complaint_id=complaint.id,
            provider=result["provider"],
            model=result["model"],
            prompt_name=PROMPT_NAME,
            prompt_version=PROMPT_VERSION,
            policy_versions=[{"document_code": c["document_code"], "version": c["version"]} for c in policy_chunks],
            attempt=result["attempt"],
            latency_ms=result["latency_ms"],
            raw_response=result["raw"],
            structured_output=result["structured"],
            is_valid_schema=True,
            error_message="",
        )
    except GenAIError as exc:
        run = GenAIRun(
            complaint_id=complaint.id,
            provider="none",
            model="",
            prompt_name=PROMPT_NAME,
            prompt_version=PROMPT_VERSION,
            policy_versions=[{"document_code": c["document_code"], "version": c["version"]} for c in policy_chunks],
            attempt=3,
            latency_ms=0,
            raw_response="",
            structured_output={},
            is_valid_schema=False,
            error_message=str(exc),
            routed_to_manual_review=True,
        )
    db.add(run)
    db.flush()
    return run, policy_chunks
