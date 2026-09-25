from functools import lru_cache
from pathlib import Path

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT_DIR = Path(__file__).resolve().parent.parent

# Providers that expose a synchronous text-completion API usable by Pipeline 1.
# Ollama is last: it runs locally, so it answers even when every paid provider is out of credit.
CHAT_PROVIDERS = ("openai", "groq", "grok", "gemini", "anthropic", "ollama")


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(ROOT_DIR / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "SupportNova"
    app_env: str = "development"
    secret_key: str = "dev-only-change-me"
    access_token_expire_minutes: int = 480
    algorithm: str = "HS256"
    database_url: str = "postgresql+psycopg://supportnova:supportnova@localhost:5432/supportnova"
    cors_origins: str = "http://localhost:5173,http://localhost:3000"
    # Built React app served by FastAPI in single-service deployments (empty = don't serve).
    frontend_dist: str = str(ROOT_DIR / "frontend" / "dist")

    @field_validator("database_url")
    @classmethod
    def _psycopg_driver(cls, value: str) -> str:
        """Hosted Postgres (Render, Railway, Neon) hands out postgres:// URLs; use psycopg 3."""
        for prefix in ("postgres://", "postgresql://"):
            if value.startswith(prefix):
                return "postgresql+psycopg://" + value[len(prefix):]
        return value

    genai_provider: str = "openai"
    # Cursor is intentionally absent: api.cursor.com serves the Cloud Agents API and has no
    # chat-completions endpoint, so it cannot answer complaint-analysis prompts.
    genai_fallback_providers: str = "grok,gemini,anthropic"
    # When true, any provider holding a key is appended to the chain as a last resort.
    genai_auto_fallback: bool = True
    openai_api_key: str = ""
    openai_model: str = "gpt-4o-mini"
    gemini_api_key: str = ""
    gemini_model: str = "gemini-3.6-flash"
    anthropic_api_key: str = ""
    anthropic_model: str = "claude-sonnet-4-20250514"
    grok_api_key: str = ""
    xai_api_key: str = ""
    grok_model: str = "grok-4-fast"
    # Groq (groq.com, OpenAI-compatible; not the same service as xAI Grok)
    groq_api_key: str = ""
    groq_model: str = "llama-3.3-70b-versatile"
    # Ollama: local model server, e.g. the ollama/ollama Docker container on port 11434
    ollama_enabled: bool = False
    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "qwen2.5:3b"
    # A local CPU model is slower than a hosted API; it gets its own time allowance.
    ollama_timeout_seconds: int = 90
    genai_max_retries: int = 3
    genai_timeout_seconds: int = 18

    # Pipeline 1 stops starting new attempts once this much time has passed, so a failing
    # provider chain cannot blow the SRS 20-second analysis target by minutes.
    genai_total_budget_seconds: int = 15
    prompt_version: str = "v3"

    # Pipeline 2 thresholds that evaluators may change without touching code.
    default_department_code: str = "REL"
    high_value_threshold: float = 200000
    repeat_similarity_threshold: int = 55

    max_upload_mb: int = 15
    upload_dir: str = "uploads"

    bootstrap_admin_email: str = "admin@nimbuscarta.example"
    bootstrap_admin_password: str = "ChangeMeNow!23"

    organization_name: str = "NimbusCarta"
    organization_domain: str = "Consumer electronics e-commerce"

    @property
    def grok_key(self) -> str:
        return self.grok_api_key or self.xai_api_key

    @property
    def genai_fallback_list(self) -> list[str]:
        return [item.strip().lower() for item in self.genai_fallback_providers.split(",") if item.strip()]

    def provider_has_key(self, provider: str) -> bool:
        name = provider.lower()
        if name == "openai":
            return bool(self.openai_api_key)
        if name == "gemini":
            return bool(self.gemini_api_key)
        if name == "anthropic":
            return bool(self.anthropic_api_key)
        if name in {"grok", "xai"}:
            return bool(self.grok_key)
        if name == "groq":
            return bool(self.groq_api_key)
        if name == "ollama":
            return bool(self.ollama_enabled and self.ollama_base_url and self.ollama_model)
        return False

    def has_any_genai_key(self) -> bool:
        return any(self.provider_has_key(name) for name in CHAT_PROVIDERS)

    @property
    def cors_origin_list(self) -> list[str]:
        return [item.strip() for item in self.cors_origins.split(",") if item.strip()]

    @property
    def upload_path(self) -> Path:
        path = ROOT_DIR / self.upload_dir
        path.mkdir(parents=True, exist_ok=True)
        return path


@lru_cache
def get_settings() -> Settings:
    return Settings()
