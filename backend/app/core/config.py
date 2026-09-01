from functools import lru_cache
from typing import Literal
from uuid import UUID

from pydantic import SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_env: Literal["development", "test", "production"] = "development"
    database_url: str = (
        "postgresql+asyncpg://yomitoku:yomitoku@localhost:5432/yomitoku"
    )
    langgraph_database_url: str = (
        "postgresql://yomitoku:yomitoku@localhost:5432/yomitoku?sslmode=disable"
    )
    cors_allowed_origins: str = "http://localhost:5173,http://localhost:5174"
    generation_provider: Literal["stub", "anthropic"] = "stub"
    generator_model: str = "claude-fable-5"
    answer_validator_model: str = "claude-fable-5"
    quality_validator_model: str = "claude-fable-5"
    generation_model_options: str = ""
    anthropic_api_key: SecretStr | None = None
    max_generation_revisions: int = 2
    worker_poll_interval_seconds: float = 1.5
    dev_admin_id: UUID = UUID("00000000-0000-0000-0000-000000000001")
    google_oauth_client_id: str | None = None
    auth_jwt_secret: SecretStr | None = None
    auth_jwt_issuer: str = "yomitoku-api"
    auth_jwt_audience: str = "yomitoku-web"
    auth_access_token_ttl_seconds: int = 28_800
    admin_google_emails: str = ""

    @property
    def allowed_origins(self) -> list[str]:
        return [
            origin.strip()
            for origin in self.cors_allowed_origins.split(",")
            if origin.strip()
        ]

    @property
    def admin_emails(self) -> frozenset[str]:
        return frozenset(
            email.strip().casefold()
            for email in self.admin_google_emails.split(",")
            if email.strip()
        )

    @property
    def available_generation_models(self) -> tuple[str, ...]:
        configured_models = [
            model.strip()
            for model in self.generation_model_options.split(",")
            if model.strip()
        ]
        defaults = [
            self.generator_model,
            self.answer_validator_model,
            self.quality_validator_model,
        ]
        return tuple(dict.fromkeys(configured_models or defaults))

    @model_validator(mode="after")
    def validate_generation_model_options(self) -> "Settings":
        if not self.generation_model_options.strip():
            return self
        configured_models = set(self.available_generation_models)
        defaults = {
            self.generator_model,
            self.answer_validator_model,
            self.quality_validator_model,
        }
        if missing_models := defaults - configured_models:
            raise ValueError(
                "GENERATION_MODEL_OPTIONS must include every configured default model."
            )
        return self

    @model_validator(mode="after")
    def validate_production_settings(self) -> "Settings":
        if self.app_env != "production":
            return self

        if not self.allowed_origins or any(
            not origin.startswith("https://") for origin in self.allowed_origins
        ):
            raise ValueError(
                "CORS_ALLOWED_ORIGINS must contain only HTTPS origins in production."
            )
        if not (self.google_oauth_client_id or "").strip():
            raise ValueError("GOOGLE_OAUTH_CLIENT_ID is required in production.")
        secret = (
            self.auth_jwt_secret.get_secret_value().strip()
            if self.auth_jwt_secret is not None
            else ""
        )
        if len(secret) < 32:
            raise ValueError(
                "AUTH_JWT_SECRET must be at least 32 characters in production."
            )
        if not self.admin_emails:
            raise ValueError("ADMIN_GOOGLE_EMAILS is required in production.")
        anthropic_key = (
            self.anthropic_api_key.get_secret_value().strip()
            if self.anthropic_api_key is not None
            else ""
        )
        if self.generation_provider == "anthropic" and not anthropic_key:
            raise ValueError(
                "ANTHROPIC_API_KEY is required when GENERATION_PROVIDER=anthropic."
            )
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
