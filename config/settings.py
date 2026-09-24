from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT_DIR = Path(__file__).resolve().parent.parent


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

    genai_provider: str = "openai"
    genai_fallback_providers: str = "grok,cursor"
    openai_api_key: str = ""
    openai_model: str = "gpt-4o-mini"
    gemini_api_key: str = ""
    gemini_model: str = "gemini-2.0-flash"
    anthropic_api_key: str = ""
    anthropic_model: str = "claude-sonnet-4-20250514"
    grok_api_key: str = ""
    xai_api_key: str = ""
    grok_model: str = "grok-4-fast"
    cursor_api_key: str = ""
    cursor_api_base_url: str = "https://api.cursor.com/v1"
    cursor_model: str = "composer-2.5"
    genai_max_retries: int = 3
    genai_timeout_seconds: int = 18

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
        if name in {"openai"}:
            return bool(self.openai_api_key)
        if name == "gemini":
            return bool(self.gemini_api_key)
        if name == "anthropic":
            return bool(self.anthropic_api_key)
        if name in {"grok", "xai"}:
            return bool(self.grok_key)
        if name == "cursor":
            return bool(self.cursor_api_key)
        return False

    def has_any_genai_key(self) -> bool:
        return any(
            self.provider_has_key(name)
            for name in {self.genai_provider, *self.genai_fallback_list}
        )

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
