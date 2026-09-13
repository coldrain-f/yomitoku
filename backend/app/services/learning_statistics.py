from typing import Literal
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Attempt, ReadingItem
from app.schemas import StatisticGroup, StatisticsResponse
from app.services.item_metrics import first_submissions_by_user_item
from app.services.reading_policy import LENGTH_TYPES, LEVELS_BY_LANGUAGE

StatisticKey = Literal["language", "length_type", "official_level"]


def group_statistics(
    items: list[ReadingItem], attempts_by_item: dict[UUID, Attempt], key: StatisticKey
) -> list[StatisticGroup]:
    """Aggregate a learner's first submitted result across one item dimension."""
    values: tuple[str, ...]
    if key == "length_type":
        values = LENGTH_TYPES
    elif key == "language":
        values = tuple(LEVELS_BY_LANGUAGE)
    else:
        values = tuple(
            level for levels in LEVELS_BY_LANGUAGE.values() for level in levels
        )

    groups: list[StatisticGroup] = []
    for value in values:
        group_items = [item for item in items if getattr(item, key) == value]
        group_attempts = [
            attempts_by_item[item.id]
            for item in group_items
            if item.id in attempts_by_item
        ]
        groups.append(
            StatisticGroup(
                key=value,
                completed_count=len(group_attempts),
                total_count=len(group_items),
                accuracy=(
                    round(
                        sum(bool(attempt.is_correct) for attempt in group_attempts)
                        / len(group_attempts)
                        * 100,
                        1,
                    )
                    if group_attempts
                    else None
                ),
                average_elapsed_seconds=(
                    round(
                        sum(attempt.elapsed_seconds or 0 for attempt in group_attempts)
                        / len(group_attempts)
                    )
                    if group_attempts
                    else None
                ),
            )
        )
    return groups


async def get_user_statistics(
    session: AsyncSession, user_id: UUID
) -> StatisticsResponse:
    """Return statistics based on each learner's first result for published items."""
    items = list(
        await session.scalars(
            select(ReadingItem).where(ReadingItem.status == "published")
        )
    )
    submissions = list(
        await session.scalars(
            select(Attempt)
            .where(
                Attempt.user_id == user_id,
                Attempt.submitted_at.is_not(None),
            )
            .order_by(Attempt.submitted_at.asc(), Attempt.id.asc())
        )
    )
    published_item_ids = {item.id for item in items}
    first_attempts = {
        item_id: attempt
        for (_, item_id), attempt in first_submissions_by_user_item(submissions).items()
        if item_id in published_item_ids
    }
    recent = list(first_attempts.values())
    return StatisticsResponse(
        completed_count=len(recent),
        total_generated_count=len(items),
        accuracy=(
            round(
                sum(bool(attempt.is_correct) for attempt in recent) / len(recent) * 100,
                1,
            )
            if recent
            else None
        ),
        average_elapsed_seconds=(
            round(sum(attempt.elapsed_seconds or 0 for attempt in recent) / len(recent))
            if recent
            else None
        ),
        by_language=group_statistics(items, first_attempts, "language"),
        by_length=group_statistics(items, first_attempts, "length_type"),
        by_level=group_statistics(items, first_attempts, "official_level"),
    )
