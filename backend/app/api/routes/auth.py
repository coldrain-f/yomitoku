import asyncio
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response, status
from google.auth.exceptions import GoogleAuthError
from google.auth.transport import requests
from google.oauth2 import id_token
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.core.security import (
    CurrentUser,
    create_access_token,
    get_auth_jwt_secret,
    get_current_user,
)
from app.db.session import get_session
from app.schemas import (
    AuthenticationResponse,
    CurrentUserResponse,
    GoogleCredentialRequest,
)
from app.services.users import upsert_google_user

router = APIRouter(tags=["auth"])


@router.get("/me", response_model=CurrentUserResponse)
async def read_current_user(
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
) -> CurrentUserResponse:
    return CurrentUserResponse(id=current_user.id, role=current_user.role)


@router.post("/auth/google", response_model=AuthenticationResponse)
async def sign_in_with_google(
    payload: GoogleCredentialRequest,
    session: Annotated[AsyncSession, Depends(get_session)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> AuthenticationResponse:
    """Exchange a verified Google Identity Services token for a Yomitoku token."""
    client_id = (settings.google_oauth_client_id or "").strip()
    if (
        not client_id
        or settings.auth_jwt_secret is None
        or not settings.auth_jwt_secret.get_secret_value().strip()
    ):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Google sign-in is not configured.",
        )
    get_auth_jwt_secret(settings)
    try:
        claims = await asyncio.to_thread(
            id_token.verify_oauth2_token,
            payload.credential,
            requests.Request(),
            client_id,
        )
    except ValueError as error:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Google sign-in could not be verified.",
        ) from error
    except GoogleAuthError as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Google sign-in verification is temporarily unavailable.",
        ) from error

    if claims.get("iss") not in {"accounts.google.com", "https://accounts.google.com"}:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Google sign-in could not be verified.",
        )
    subject = claims.get("sub")
    email = claims.get("email")
    if not isinstance(subject, str) or not isinstance(email, str):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Google account information is incomplete.",
        )
    if claims.get("email_verified") not in {True, "true"}:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Please verify your Google account email before signing in.",
        )

    try:
        current_user = await upsert_google_user(
            session,
            google_subject=subject,
            email=email,
            admin_emails=settings.admin_emails,
        )
        await session.commit()
    except (IntegrityError, ValueError) as error:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This Google account cannot be linked.",
        ) from error

    return AuthenticationResponse(
        access_token=create_access_token(settings, current_user),
        expires_in=settings.auth_access_token_ttl_seconds,
        user=CurrentUserResponse(id=current_user.id, role=current_user.role),
    )


@router.post("/auth/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout() -> Response:
    """Bearer tokens are removed by the client and expire after their short lifetime."""
    return Response(status_code=status.HTTP_204_NO_CONTENT)
