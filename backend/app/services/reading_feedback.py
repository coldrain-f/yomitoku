from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import CurrentUser
from app.db.models import ItemFeedback, ItemReport, ReadingItem
from app.schemas import FeedbackRequest, ReportRequest
from app.services.reading_policy import is_level_for_language
from app.services.users import ensure_user


class PerceivedLevelLanguageMismatchError(ValueError):
    """The supplied perceived level does not belong to the item's language."""


async def upsert_user_feedback(
    session: AsyncSession,
    *,
    item: ReadingItem,
    current_user: CurrentUser,
    request: FeedbackRequest,
) -> None:
    """Create or replace one learner's quality and perceived-level feedback."""
    if not is_level_for_language(item.language, request.perceived_level):
        raise PerceivedLevelLanguageMismatchError
    await ensure_user(session, current_user)
    feedback = await session.scalar(
        select(ItemFeedback).where(
            ItemFeedback.user_id == current_user.id,
            ItemFeedback.reading_item_id == item.id,
        )
    )
    if feedback:
        feedback.quality_rating = request.quality_rating
        feedback.perceived_level = request.perceived_level
        feedback.comment = request.comment
    else:
        session.add(
            ItemFeedback(
                user_id=current_user.id,
                reading_item_id=item.id,
                quality_rating=request.quality_rating,
                perceived_level=request.perceived_level,
                comment=request.comment,
            )
        )
    await session.commit()


async def create_user_report(
    session: AsyncSession,
    *,
    item_id: UUID,
    current_user: CurrentUser,
    request: ReportRequest,
) -> None:
    """Persist a learner's report for one published item."""
    await ensure_user(session, current_user)
    session.add(
        ItemReport(
            user_id=current_user.id,
            reading_item_id=item_id,
            content=request.content.strip(),
        )
    )
    await session.commit()
