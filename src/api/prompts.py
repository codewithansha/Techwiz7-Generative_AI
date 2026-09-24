from fastapi import APIRouter

from prompt_templates.loader import PROMPT_NAME, PROMPT_VERSION, list_prompt_files
from security.auth import StaffUser

router = APIRouter(prefix="/api/v1/prompts", tags=["prompts"])


@router.get("")
def list_prompts(user: StaffUser):
    return {
        "active": {"name": PROMPT_NAME, "version": PROMPT_VERSION},
        "files": list_prompt_files(),
    }
