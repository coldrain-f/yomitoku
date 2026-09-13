from collections import defaultdict
from collections.abc import Iterable
from typing import Literal
from uuid import UUID

from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Attempt, ItemFeedback, ItemReport, ReadingItem
from app.schemas import ReadingItemSummary
from app.services.reading_policy import (
    LEVELS_BY_LANGUAGE,
    MINIMUM_PERCEIVED_LEVEL_VOTES,
    is_level_for_language,
    level_rank,
)

ItemMetrics = dict[str, float | int | str | None]


def serialize_public_summary(
    item: ReadingItem,
    metrics: ItemMetrics,
    my_latest_status: Literal["correct", "wrong"] | None,
    my_first_submission_timed_out: bool = False,
    my_score: Literal[80, 90, 100] | None = None,
    my_score_reason: Literal[
        "first_submission_on_time",
        "first_submission_timed_out",
        "retry_passed",
    ]
    | None = None,
    is_bookmarked: bool = False,
) -> ReadingItemSummary:
    """Build the shared learner-facing summary for a reading item."""
    perceived_level = metrics["perceived_level"]
    perceived_vote_count = int(metrics["perceived_vote_count"] or 0)
    return ReadingItemSummary(
        id=item.id,
        title=item.title,
        language=item.language,
        official_level=item.official_level,
        length_type=item.length_type,
        topic=item.topic,
        recommended_seconds=item.recommended_seconds,
        content_source=item.content_source,
        status=item.status,
        published_at=item.published_at,
        created_at=item.created_at,
        updated_at=item.updated_at,
        perceived_level=perceived_level if isinstance(perceived_level, str) else None,
        perceived_level_visible=(
            perceived_vote_count >= MINIMUM_PERCEIVED_LEVEL_VOTES
        ),
        perceived_vote_count=perceived_vote_count,
        item_accuracy=(
            float(metrics["item_accuracy"])
            if metrics["item_accuracy"] is not None
            else None
        ),
        my_latest_status=my_latest_status,
        my_first_submission_timed_out=my_first_submission_timed_out,
        my_score=my_score,
        my_score_reason=my_score_reason,
        is_bookmarked=is_bookmarked,
    )


def perceived_level_rank(value: object):
    """Return a database expression that orders every supported perceived level."""
    ranks = {
        level: rank
        for levels in LEVELS_BY_LANGUAGE.values()
        for rank, level in enumerate(levels, start=1)
    }
    return case(ranks, value=value, else_=0)


def perceived_feedback_summary_query():
    """Aggregate feedback once per item for database-side perceived-level sorting.

    The product defines the perceived level as the upper median: for an even
    number of votes, choose the higher of the two middle values.  Window
    functions preserve that rule without loading every item's feedback into
    application memory.
    """
    level_rank = perceived_level_rank(ItemFeedback.perceived_level)
    ranked = (
        select(
            ItemFeedback.reading_item_id.label("reading_item_id"),
            level_rank.label("perceived_rank"),
            func.row_number()
            .over(
                partition_by=ItemFeedback.reading_item_id,
                order_by=(level_rank.asc(), ItemFeedback.id.asc()),
            )
            .label("position"),
            func.count()
            .over(partition_by=ItemFeedback.reading_item_id)
            .label("vote_count"),
        )
        .where(level_rank > 0)
        .subquery()
    )
    median_position = (ranked.c.vote_count / 2) + 1
    return (
        select(
            ranked.c.reading_item_id,
            func.max(
                case(
                    (ranked.c.position == median_position, ranked.c.perceived_rank),
                    else_=0,
                )
            ).label("perceived_rank"),
            func.max(ranked.c.vote_count).label("perceived_vote_count"),
        )
        .group_by(ranked.c.reading_item_id)
        .subquery()
    )


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
