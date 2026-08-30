from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.core.config import Settings
from app.core.security import CurrentUser, create_access_token, get_access_token_user


def test_google_admin_emails_are_normalized() -> None:
    settings = Settings(admin_google_emails=" Admin@example.com,owner@example.com ")

    assert settings.admin_emails == {"admin@example.com", "owner@example.com"}


def test_access_token_round_trip_preserves_server_role() -> None:
    settings = Settings(auth_jwt_secret="test-secret-value-that-is-long-enough-for-hs256")
    current_user = CurrentUser(id=uuid4(), role="admin")

    token = create_access_token(settings, current_user)

    assert get_access_token_user(settings, token) == current_user


def test_access_token_rejects_a_token_signed_with_another_secret() -> None:
    token = create_access_token(
        Settings(auth_jwt_secret="issuer-secret-value-that-is-long-enough-for-hs256"),
        CurrentUser(id=uuid4(), role="learner"),
    )

    with pytest.raises(HTTPException, match="sign-in has expired"):
        get_access_token_user(
            Settings(auth_jwt_secret="other-secret-value-that-is-long-enough-for-hs256"),
            token,
        )


def test_access_token_requires_a_long_server_secret() -> None:
    with pytest.raises(HTTPException, match="not configured"):
        create_access_token(
            Settings(auth_jwt_secret="too-short"),
            CurrentUser(id=uuid4(), role="learner"),
        )
