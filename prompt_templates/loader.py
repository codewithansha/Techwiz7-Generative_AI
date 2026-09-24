from pathlib import Path

from jinja2 import Environment, FileSystemLoader, select_autoescape

from config.settings import ROOT_DIR, get_settings

PROMPT_DIR = ROOT_DIR / "prompt_templates"
env = Environment(loader=FileSystemLoader(str(PROMPT_DIR)), autoescape=select_autoescape(enabled_extensions=()))
PROMPT_NAME = "complaint_intelligence"
PROMPT_VERSION = "v1"


def render_prompts(context: dict) -> tuple[str, str]:
    settings = get_settings()
    payload = {
        "organization_name": settings.organization_name,
        "organization_domain": settings.organization_domain,
        "tone": context.get("tone", "professional"),
        "prompt_version": PROMPT_VERSION,
        **context,
    }
    system = env.get_template(f"{PROMPT_NAME}.{PROMPT_VERSION}.system.j2").render(**payload)
    user = env.get_template(f"{PROMPT_NAME}.{PROMPT_VERSION}.user.j2").render(**payload)
    return system, user


def list_prompt_files() -> list[str]:
    return [p.name for p in Path(PROMPT_DIR).glob("*.j2")]
