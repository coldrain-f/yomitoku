from dataclasses import dataclass
from typing import Annotated, Literal
from uuid import UUID

from fastapi import Depends, Header, HTTPException, status

from app.core.config import Settings, get_settings

Role = Literal["learner", "admin"]


@dataclass(frozen=True)
class CurrentUser:
    id: UUID
    role: Role


async def get_current_user(
    settings: Annotated[Settings, Depends(get_settings)],
    dev_user_id: Annotated[str | None, Header(alias="X-Dev-User-Id")] = None,
    dev_role: Annotated[str | None, Header(alias="X-Dev-Role")] = None,
) -> CurrentUser:
    """Temporary development auth, deliberately disabled outside local use."""
    if settings.app_env not in {"development", "test"}:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Authentication is not configured.",
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


async def require_admin(
    user: Annotated[CurrentUser, Depends(get_current_user)],
) -> CurrentUser:
    if user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Administrator access is required.",
        )
    return user
