import math
from typing import Literal
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.security import CurrentUser
from app.db.models import Attempt, ItemBookmark, ReadingItem
from app.schemas import LengthType, ReadingItemPage, ReadingLanguage, ReadingLevel
from app.services.attempt_progress import (
    learner_progress_for_submissions,
    learner_progress_query,
    learner_score_expression,
)
from app.services.item_metrics import (
    collect_item_metrics,
    perceived_feedback_summary_query,
    serialize_public_summary,
)
from app.services.reading_policy import (
    LEVELS_BY_LANGUAGE,
    MINIMUM_PERCEIVED_LEVEL_VOTES,
    is_level_for_language,
)

ReadingListAttemptStatus = Literal[
    "correct",
    "wrong",
    "unstarted",
    "score-100",
    "score-90",
    "score-80",
]
ReadingListFirstSubmissionTime = Literal["on-time", "timed-out"]
ReadingListSort = Literal[
    "published_desc",
    "published_asc",
    "level_asc",
    "level_desc",
    "perceived_level_asc",
    "perceived_level_desc",
    "score_asc",
    "score_desc",
]


def public_level_order_expression():
    ranks = {
        level: rank
        for levels in LEVELS_BY_LANGUAGE.values()
        for rank, level in enumerate(levels, start=1)
    }
    return case(ranks, value=ReadingItem.official_level, else_=0)


def public_sort_clauses(sort: ReadingListSort, feedback_summary, progress):
    if sort.startswith("perceived_level"):
        visible_rank = case(
            (
                feedback_summary.c.perceived_vote_count
                >= MINIMUM_PERCEIVED_LEVEL_VOTES,
                feedback_summary.c.perceived_rank,
            ),
            else_=None,
        )
        return (
            (visible_rank.is_(None), visible_rank.desc())
            if sort.endswith("desc")
            else (visible_rank.is_(None), visible_rank.asc())
        )
    if sort.startswith("level"):
        level_order = public_level_order_expression()
        return (level_order.desc(),) if sort.endswith("desc") else (level_order.asc(),)
    if sort.startswith("score") and progress is not None:
        score = learner_score_expression(progress, ReadingItem)
        unscored_rank = case(
            (progress.c.reading_item_id.is_not(None), 0), else_=1
        )
        return (
            score.is_(None),
            score.desc() if sort.endswith("desc") else score.asc(),
            unscored_rank.asc(),
        )
    publication = func.coalesce(ReadingItem.published_at, ReadingItem.created_at)
    return (publication.asc(),) if sort.endswith("asc") else (publication.desc(),)


async def list_published_items(
    session: AsyncSession,
    *,
    q: str | None = None,
    language: ReadingLanguage | None = None,
    level: ReadingLevel | None = None,
    length: LengthType | None = None,
    attempt_status: ReadingListAttemptStatus | None = None,
    first_submission_time: ReadingListFirstSubmissionTime | None = None,
    bookmarked: bool = False,
    sort: ReadingListSort = "published_desc",
    page: int = 1,
    page_size: int = 10,
    current_user: CurrentUser | None = None,
) -> ReadingItemPage:
    """Return one learner-aware page of published reading items."""
    if (attempt_status or first_submission_time or bookmarked) and current_user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Sign in to filter by learning status.",
        )
    if language and level and not is_level_for_language(language, level):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="The selected level does not belong to the content language.",
        )

    filters = [ReadingItem.status == "published"]
    if q:
        filters.append(ReadingItem.title.ilike(f"%{q.strip()}%"))
    if level:
        filters.append(ReadingItem.official_level == level)
    if language:
        filters.append(ReadingItem.language == language)
    if length:
        filters.append(ReadingItem.length_type == length)
    if bookmarked and current_user is not None:
        filters.append(
            select(ItemBookmark.id)
            .where(
                ItemBookmark.user_id == current_user.id,
                ItemBookmark.reading_item_id == ReadingItem.id,
            )
            .exists()
        )

    progress = learner_progress_query(current_user.id) if current_user else None
    feedback_summary = (
        perceived_feedback_summary_query()
        if sort.startswith("perceived_level")
        else None
    )
    score = learner_score_expression(progress, ReadingItem) if progress is not None else None
    if progress is not None:
        if attempt_status == "unstarted":
            filters.append(progress.c.reading_item_id.is_(None))
        elif attempt_status == "wrong":
            filters.extend(
                [progress.c.reading_item_id.is_not(None), progress.c.has_correct == 0]
            )
        elif attempt_status == "correct":
            filters.append(score.is_not(None))
        elif attempt_status and attempt_status.startswith("score-"):
            filters.append(score == int(attempt_status.removeprefix("score-")))
        if first_submission_time == "on-time":
            filters.append(progress.c.first_elapsed_seconds <= ReadingItem.recommended_seconds)
        elif first_submission_time == "timed-out":
            filters.append(progress.c.first_elapsed_seconds > ReadingItem.recommended_seconds)

    count_statement = select(func.count()).select_from(ReadingItem)
    item_statement = select(ReadingItem).where(*filters)
    if progress is not None:
        count_statement = count_statement.outerjoin(
            progress, progress.c.reading_item_id == ReadingItem.id
        )
        item_statement = item_statement.outerjoin(
            progress, progress.c.reading_item_id == ReadingItem.id
        )
    if feedback_summary is not None:
        item_statement = item_statement.outerjoin(
            feedback_summary,
            feedback_summary.c.reading_item_id == ReadingItem.id,
        )
    total_items = int(await session.scalar(count_statement.where(*filters)) or 0)
    total_pages = max(1, math.ceil(total_items / page_size))
    page = min(page, total_pages)
    items = list(
        await session.scalars(
            item_statement.options(selectinload(ReadingItem.choices))
            .order_by(*public_sort_clauses(sort, feedback_summary, progress))
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
    )
    metrics_by_item = await collect_item_metrics(session, [item.id for item in items])
    latest_statuses: dict[UUID, Literal["correct", "wrong"]] = {}
    first_submission_timed_out: dict[UUID, bool] = {}
    scores: dict[UUID, Literal[80, 90, 100]] = {}
    score_reasons: dict[
        UUID,
        Literal[
            "first_submission_on_time",
            "first_submission_timed_out",
            "retry_passed",
        ],
    ] = {}
    submissions_by_item: dict[UUID, list[Attempt]] = {}
    bookmarked_item_ids: set[UUID] = set()
    if current_user and items:
        bookmark_item_ids = await session.scalars(
            select(ItemBookmark.reading_item_id).where(
                ItemBookmark.user_id == current_user.id,
                ItemBookmark.reading_item_id.in_([item.id for item in items]),
            )
        )
        bookmarked_item_ids = set(bookmark_item_ids.all())
        submissions = list(
            await session.scalars(
                select(Attempt)
                .where(
                    Attempt.user_id == current_user.id,
                    Attempt.reading_item_id.in_([item.id for item in items]),
                    Attempt.submitted_at.is_not(None),
                )
                .order_by(Attempt.submitted_at.asc(), Attempt.id.asc())
            )
        )
        for attempt in submissions:
            submissions_by_item.setdefault(attempt.reading_item_id, []).append(attempt)
        for item in items:
            latest_status, timed_out, item_score, score_reason = (
                learner_progress_for_submissions(
                    submissions_by_item.get(item.id, []), item.recommended_seconds
                )
            )
            if latest_status:
                latest_statuses[item.id] = latest_status
            if timed_out:
                first_submission_timed_out[item.id] = True
            if item_score is not None and score_reason is not None:
                scores[item.id] = item_score
                score_reasons[item.id] = score_reason
    return ReadingItemPage(
        items=[
            serialize_public_summary(
                item,
                metrics_by_item[item.id],
                latest_statuses.get(item.id),
                first_submission_timed_out.get(item.id, False),
                scores.get(item.id),
                score_reasons.get(item.id),
                item.id in bookmarked_item_ids,
            )
            for item in items
        ],
        page=page,
        page_size=page_size,
        total_items=total_items,
        total_pages=total_pages,
    )
