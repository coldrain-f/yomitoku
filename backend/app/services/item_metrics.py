from collections import defaultdict
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Attempt, ItemFeedback, ItemReport
from app.services.reading_policy import LEVEL_ORDER

ItemMetrics = dict[str, float | int | str | None]


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
    for item_id, entries in feedback_by_item.items():
        levels = sorted(LEVEL_ORDER[entry.perceived_level] for entry in entries)
        metrics[item_id]["perceived_level"] = next(
            level
            for level, rank in LEVEL_ORDER.items()
            if rank == levels[len(levels) // 2]
        )
        metrics[item_id]["perceived_vote_count"] = len(entries)
        metrics[item_id]["quality_average"] = round(
            sum(entry.quality_rating for entry in entries) / len(entries), 1
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
            .order_by(Attempt.submitted_at.desc())
        )
    )
    latest_by_user_item: dict[tuple[UUID, UUID], Attempt] = {}
    for attempt in attempts:
        latest_by_user_item.setdefault(
            (attempt.user_id, attempt.reading_item_id), attempt
        )
    outcomes_by_item: dict[UUID, list[Attempt]] = defaultdict(list)
    for attempt in latest_by_user_item.values():
        outcomes_by_item[attempt.reading_item_id].append(attempt)
    for item_id, outcomes in outcomes_by_item.items():
        metrics[item_id]["challenger_count"] = len(outcomes)
        metrics[item_id]["item_accuracy"] = round(
            sum(bool(outcome.is_correct) for outcome in outcomes) / len(outcomes) * 100,
            1,
        )
    return metrics
