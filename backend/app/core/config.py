from functools import lru_cache
from typing import Literal
from uuid import UUID

from pydantic import SecretStr
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
    anthropic_api_key: SecretStr | None = None
    max_generation_revisions: int = 2
    worker_poll_interval_seconds: float = 1.5
    dev_admin_id: UUID = UUID("00000000-0000-0000-0000-000000000001")

    @property
    def allowed_origins(self) -> list[str]:
        return [
            origin.strip()
            for origin in self.cors_allowed_origins.split(",")
            if origin.strip()
        ]


@lru_cache
def get_settings() -> Settings:
    return Settings()
