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
