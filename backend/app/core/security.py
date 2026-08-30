from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Annotated, Literal
from uuid import UUID

import jwt
from fastapi import Depends, Header, HTTPException, status
from jwt import InvalidTokenError

from app.core.config import Settings, get_settings

Role = Literal["learner", "admin"]


@dataclass(frozen=True)
class CurrentUser:
    id: UUID
    role: Role


def get_auth_jwt_secret(settings: Settings) -> str:
    if settings.auth_jwt_secret is None:
        secret = ""
    else:
        secret = settings.auth_jwt_secret.get_secret_value().strip()
    if len(secret) < 32:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Authentication is not configured.",
        )
    return secret


def create_access_token(settings: Settings, current_user: CurrentUser) -> str:
    """Create a short-lived first-party token after Google identity verification."""
    now = datetime.now(UTC)
    payload = {
        "sub": str(current_user.id),
        "role": current_user.role,
        "iss": settings.auth_jwt_issuer,
        "aud": settings.auth_jwt_audience,
        "iat": now,
        "exp": now + timedelta(seconds=settings.auth_access_token_ttl_seconds),
    }
    return jwt.encode(
        payload,
        get_auth_jwt_secret(settings),
        algorithm="HS256",
    )


def get_access_token_user(settings: Settings, token: str) -> CurrentUser:
    try:
        payload = jwt.decode(
            token,
            get_auth_jwt_secret(settings),
            algorithms=["HS256"],
            audience=settings.auth_jwt_audience,
            issuer=settings.auth_jwt_issuer,
            options={"require": ["sub", "role", "iat", "exp"]},
        )
        role = payload["role"]
        if role not in {"learner", "admin"}:
            raise ValueError("Unsupported role.")
        return CurrentUser(id=UUID(payload["sub"]), role=role)
    except (InvalidTokenError, KeyError, TypeError, ValueError) as error:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Your sign-in has expired. Please sign in again.",
        ) from error


def get_development_user(
    settings: Settings,
    dev_user_id: str | None,
    dev_role: str | None,
) -> CurrentUser:
    """Allow explicit development identities without enabling them in production."""
    if settings.app_env not in {"development", "test"}:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Sign in is required.",
        )

    role = dev_role or "learner"
    if role not in {"learner", "admin"}:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="X-Dev-Role must be learner or admin.",
        )

    try:
        user_id = UUID(dev_user_id) if dev_user_id else settings.dev_admin_id
    except ValueError as error:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="X-Dev-User-Id must be a UUID.",
        ) from error

    return CurrentUser(id=user_id, role=role)


def extract_bearer_token(authorization: str | None) -> str | None:
    if authorization is None:
        return None
    scheme, _, token = authorization.partition(" ")
    if scheme.casefold() != "bearer" or not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authorization must use a Bearer token.",
        )
    return token


async def get_current_user(
    settings: Annotated[Settings, Depends(get_settings)],
    authorization: Annotated[str | None, Header()] = None,
    dev_user_id: Annotated[str | None, Header(alias="X-Dev-User-Id")] = None,
    dev_role: Annotated[str | None, Header(alias="X-Dev-Role")] = None,
) -> CurrentUser:
    token = extract_bearer_token(authorization)
    if token:
        return get_access_token_user(settings, token)
    return get_development_user(settings, dev_user_id, dev_role)


async def get_optional_current_user(
    settings: Annotated[Settings, Depends(get_settings)],
    authorization: Annotated[str | None, Header()] = None,
    dev_user_id: Annotated[str | None, Header(alias="X-Dev-User-Id")] = None,
    dev_role: Annotated[str | None, Header(alias="X-Dev-Role")] = None,
) -> CurrentUser | None:
    """Return a public visitor only when neither a bearer token nor dev identity exists."""
    token = extract_bearer_token(authorization)
    if token:
        return get_access_token_user(settings, token)
    if dev_user_id is None and dev_role is None:
        return None
    return get_development_user(settings, dev_user_id, dev_role)


async def require_admin(
    user: Annotated[CurrentUser, Depends(get_current_user)],
) -> CurrentUser:
    if user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Administrator access is required.",
        )
    return user
