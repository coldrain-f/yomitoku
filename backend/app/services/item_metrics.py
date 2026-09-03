from collections import defaultdict
from collections.abc import Iterable
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Attempt, ItemFeedback, ItemReport, ReadingItem
from app.services.reading_policy import (
    LEVELS_BY_LANGUAGE,
    is_level_for_language,
    level_rank,
)

ItemMetrics = dict[str, float | int | str | None]


def first_submissions_by_user_item(
    attempts: Iterable[Attempt],
) -> dict[tuple[UUID, UUID], Attempt]:
    first_attempts: dict[tuple[UUID, UUID], Attempt] = {}
    for attempt in attempts:
        key = (attempt.user_id, attempt.reading_item_id)
        existing = first_attempts.get(key)
        if existing is None or attempt.submitted_at < existing.submitted_at:
            first_attempts[key] = attempt
    return first_attempts


async def collect_item_metrics(
    session: AsyncSession, item_ids: list[UUID]
) -> dict[UUID, ItemMetrics]:
    metrics: dict[UUID, ItemMetrics] = {
        item_id: {
            "perceived_level": None,
            "perceived_vote_count": 0,
            "quality_average": None,
            "report_count": 0,
            "challenger_count": 0,
            "item_accuracy": None,
        }
        for item_id in item_ids
    }
    if not item_ids:
        return metrics

    feedbacks = list(
        await session.scalars(
            select(ItemFeedback).where(ItemFeedback.reading_item_id.in_(item_ids))
        )
    )
    feedback_by_item: dict[UUID, list[ItemFeedback]] = defaultdict(list)
    for feedback in feedbacks:
        feedback_by_item[feedback.reading_item_id].append(feedback)
    language_rows = await session.execute(
        select(ReadingItem.id, ReadingItem.language).where(ReadingItem.id.in_(item_ids))
    )
    language_by_item = {
        item_id: language for item_id, language in language_rows.tuples().all()
    }
    for item_id, entries in feedback_by_item.items():
        language = language_by_item[item_id]
        valid_entries = [
            entry
            for entry in entries
            if is_level_for_language(language, entry.perceived_level)
        ]
        if not valid_entries:
            continue
        levels = sorted(level_rank(language, entry.perceived_level) for entry in valid_entries)
        metrics[item_id]["perceived_level"] = LEVELS_BY_LANGUAGE[language][
            levels[len(levels) // 2] - 1
        ]
        metrics[item_id]["perceived_vote_count"] = len(valid_entries)
        metrics[item_id]["quality_average"] = round(
            sum(entry.quality_rating for entry in valid_entries) / len(valid_entries), 1
        )

    report_rows = await session.execute(
        select(ItemReport.reading_item_id, func.count())
        .where(ItemReport.reading_item_id.in_(item_ids))
        .group_by(ItemReport.reading_item_id)
    )
    for item_id, count in report_rows:
        metrics[item_id]["report_count"] = count

    attempts = list(
        await session.scalars(
            select(Attempt)
            .where(
                Attempt.reading_item_id.in_(item_ids),
                Attempt.submitted_at.is_not(None),
            )
            .order_by(Attempt.submitted_at.asc(), Attempt.id.asc())
        )
    )
    first_by_user_item = first_submissions_by_user_item(attempts)
    outcomes_by_item: dict[UUID, list[Attempt]] = defaultdict(list)
    for attempt in first_by_user_item.values():
        outcomes_by_item[attempt.reading_item_id].append(attempt)
    for item_id, outcomes in outcomes_by_item.items():
        metrics[item_id]["challenger_count"] = len(outcomes)
        metrics[item_id]["item_accuracy"] = round(
            sum(bool(outcome.is_correct) for outcome in outcomes) / len(outcomes) * 100,
            1,
        )
    return metrics
