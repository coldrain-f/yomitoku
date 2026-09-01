import pytest
from pydantic import ValidationError

from app.core.config import Settings


def production_settings(**overrides: str) -> Settings:
    values = {
        "app_env": "production",
        "cors_allowed_origins": "https://coldrain-f.github.io",
        "google_oauth_client_id": "example.apps.googleusercontent.com",
        "auth_jwt_secret": "test-secret-value-that-is-long-enough-for-hs256",
        "admin_google_emails": "admin@example.com",
    }
    values.update(overrides)
    return Settings(**values)


def test_production_settings_accept_required_values() -> None:
    settings = production_settings()

    assert settings.app_env == "production"


def test_generation_model_options_default_to_configured_models() -> None:
    settings = Settings(
        generator_model="generator",
        answer_validator_model="validator",
        quality_validator_model="validator",
    )

    assert settings.available_generation_models == ("generator", "validator")


def test_generation_model_options_reject_missing_default_model() -> None:
    with pytest.raises(ValidationError, match="GENERATION_MODEL_OPTIONS"):
        Settings(
            generator_model="generator",
            answer_validator_model="validator",
            quality_validator_model="validator",
            generation_model_options="generator",
        )


@pytest.mark.parametrize(
    ("key", "value"),
    [
        ("cors_allowed_origins", "http://localhost:5173"),
        ("google_oauth_client_id", ""),
        ("auth_jwt_secret", "too-short"),
        ("admin_google_emails", ""),
    ],
)
def test_production_settings_reject_incomplete_authentication(
    key: str,
    value: str,
) -> None:
    with pytest.raises(ValidationError):
        production_settings(**{key: value})


def test_production_settings_require_anthropic_key_when_enabled() -> None:
    with pytest.raises(ValidationError):
        production_settings(generation_provider="anthropic", anthropic_api_key="")
