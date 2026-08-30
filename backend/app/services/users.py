from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import CurrentUser
from app.db.models import User


async def ensure_user(session: AsyncSession, current_user: CurrentUser) -> User:
    """Create the local user record on first authenticated server interaction."""
    user = await session.get(User, current_user.id)
    if not user:
        user = User(id=current_user.id, role=current_user.role)
        session.add(user)
        await session.flush()
        return user
    if user.role != current_user.role:
        user.role = current_user.role
        await session.flush()
    return user


async def upsert_google_user(
    session: AsyncSession,
    google_subject: str,
    email: str,
    admin_emails: frozenset[str],
) -> CurrentUser:
    """Resolve a Google identity to one local account using its stable subject."""
    normalized_email = email.casefold()
    user = await session.scalar(
        select(User).where(User.google_subject == google_subject)
    )
    if user is None:
        user = await session.scalar(select(User).where(User.email == normalized_email))
        if user is not None and user.google_subject not in {None, google_subject}:
            raise ValueError("This email is already associated with another account.")
    if user is None:
        user = User(google_subject=google_subject, email=normalized_email)
        session.add(user)

    user.google_subject = google_subject
    user.email = normalized_email
    user.role = "admin" if normalized_email in admin_emails else "learner"
    await session.flush()
    return CurrentUser(id=user.id, role=user.role)
