import math
import random
from collections.abc import Iterable
from datetime import UTC, datetime
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.security import (
    CurrentUser,
    get_current_user,
    get_optional_current_user,
)
from app.db.models import Attempt, ItemFeedback, ItemReport, ReadingChoice, ReadingItem
from app.db.session import get_session
from app.schemas import (
    AttemptResult,
    AttemptStarted,
    AttemptSubmitRequest,
    FeedbackRequest,
    ReadingChoicePublic,
    ReadingItemDetail,
    ReadingItemPage,
    ReadingItemSummary,
    ReportRequest,
    StatisticGroup,
    StatisticsResponse,
)
from app.services.item_metrics import LEVEL_ORDER, ItemMetrics, collect_item_metrics
from app.services.users import ensure_user

router = APIRouter(prefix="/reading-items", tags=["reading items"])
statistics_router = APIRouter(tags=["statistics"])


async def get_published_item(session: AsyncSession, item_id: UUID) -> ReadingItem:
    item = await session.scalar(
        select(ReadingItem)
        .where(ReadingItem.id == item_id, ReadingItem.status == "published")
        .options(selectinload(ReadingItem.choices))
    )
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Item not found."
        )
    return item


def public_choices(choices: Iterable[ReadingChoice]) -> list[ReadingChoicePublic]:
    return [ReadingChoicePublic(id=choice.id, text=choice.text) for choice in choices]


def serialize_public_summary(
    item: ReadingItem,
    metrics: ItemMetrics,
    my_latest_status: Literal["correct", "wrong"] | None,
) -> ReadingItemSummary:
    perceived_level = metrics["perceived_level"]
    perceived_vote_count = int(metrics["perceived_vote_count"] or 0)
    return ReadingItemSummary(
        id=item.id,
        title=item.title,
        official_level=item.official_level,
        length_type=item.length_type,
        topic=item.topic,
        recommended_seconds=item.recommended_seconds,
        status=item.status,
        published_at=item.published_at,
        created_at=item.created_at,
        updated_at=item.updated_at,
        perceived_level=perceived_level if isinstance(perceived_level, str) else None,
        perceived_level_visible=perceived_vote_count >= 10,
        my_latest_status=my_latest_status,
    )


def sort_public_items(
    items: list[ReadingItem],
    metrics_by_item: dict[UUID, ItemMetrics],
    sort: str,
) -> list[ReadingItem]:
    if sort.startswith("perceived_level"):
        def perceived_rank(item: ReadingItem) -> tuple[bool, int]:
            level = metrics_by_item[item.id]["perceived_level"]
            rank = LEVEL_ORDER.get(str(level), 0)
            return level is None, rank if sort.endswith("asc") else -rank

        return sorted(items, key=perceived_rank)
    if sort.startswith("level"):
        return sorted(
            items,
            key=lambda item: LEVEL_ORDER[item.official_level],
            reverse=sort.endswith("desc"),
        )
    return sorted(
        items,
        key=lambda item: item.published_at or item.created_at,
        reverse=sort.endswith("desc"),
    )


@router.get("", response_model=ReadingItemPage)
async def list_published_reading_items(
    session: Annotated[AsyncSession, Depends(get_session)],
    q: Annotated[str | None, Query(max_length=100)] = None,
    level: Annotated[str | None, Query(pattern="^N[1-5]$")] = None,
    length: Annotated[str | None, Query(pattern="^(short|medium|long)$")] = None,
    attempt_status: Annotated[
        Literal["correct", "wrong", "unstarted"] | None,
        Query(alias="status"),
    ] = None,
    sort: Annotated[
        Literal[
            "published_desc",
            "published_asc",
            "level_asc",
            "level_desc",
            "perceived_level_asc",
            "perceived_level_desc",
        ],
        Query(),
    ] = "published_desc",
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=50)] = 10,
    current_user: Annotated[CurrentUser | None, Depends(get_optional_current_user)] = None,
) -> ReadingItemPage:
    if attempt_status and current_user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Sign in to filter by learning status.",
        )
    filters = [ReadingItem.status == "published"]
    if q:
        filters.append(ReadingItem.title.ilike(f"%{q.strip()}%"))
    if level:
        filters.append(ReadingItem.official_level == level)
    if length:
        filters.append(ReadingItem.length_type == length)

    items = list(
        await session.scalars(
            select(ReadingItem)
            .where(*filters)
            .options(selectinload(ReadingItem.choices))
        )
    )
    metrics_by_item = await collect_item_metrics(session, [item.id for item in items])
    latest_statuses: dict[UUID, Literal["correct", "wrong"]] = {}
    if current_user:
        submissions = list(
            await session.scalars(
                select(Attempt)
                .where(
                    Attempt.user_id == current_user.id,
                    Attempt.reading_item_id.in_([item.id for item in items]),
                    Attempt.submitted_at.is_not(None),
                )
                .order_by(Attempt.submitted_at.desc())
            )
        )
        for attempt in submissions:
            latest_statuses.setdefault(
                attempt.reading_item_id, "correct" if attempt.is_correct else "wrong"
            )
    if attempt_status == "unstarted":
        items = [item for item in items if item.id not in latest_statuses]
    elif attempt_status:
        items = [
            item for item in items if latest_statuses.get(item.id) == attempt_status
        ]
    items = sort_public_items(items, metrics_by_item, sort)
    total_items = len(items)
    page_items = items[(page - 1) * page_size : page * page_size]
    return ReadingItemPage(
        items=[
            serialize_public_summary(
                item, metrics_by_item[item.id], latest_statuses.get(item.id)
            )
            for item in page_items
        ],
        page=page,
        page_size=page_size,
        total_items=total_items,
        total_pages=max(1, math.ceil(total_items / page_size)),
    )


@router.get("/{item_id}", response_model=ReadingItemDetail)
async def get_reading_item(
    item_id: UUID,
    session: Annotated[AsyncSession, Depends(get_session)],
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
) -> ReadingItemDetail:
    item = await get_published_item(session, item_id)
    return ReadingItemDetail(
        id=item.id,
        title=item.title,
        official_level=item.official_level,
        length_type=item.length_type,
        topic=item.topic,
        recommended_seconds=item.recommended_seconds,
        passage=item.passage,
        question=item.question,
        choices=public_choices(item.choices),
    )


@router.post("/{item_id}/attempts", response_model=AttemptStarted, status_code=201)
async def start_attempt(
    item_id: UUID,
    session: Annotated[AsyncSession, Depends(get_session)],
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
) -> AttemptStarted:
    item = await get_published_item(session, item_id)
    await ensure_user(session, current_user)
    attempt = Attempt(
        user_id=current_user.id,
        reading_item_id=item.id,
        started_at=datetime.now(UTC),
    )
    session.add(attempt)
    await session.commit()
    await session.refresh(attempt)
    choices = random.SystemRandom().sample(item.choices, k=len(item.choices))
    return AttemptStarted(
        id=attempt.id,
        item_id=item.id,
        started_at=attempt.started_at,
        choices=public_choices(choices),
    )


async def item_outcomes(
    session: AsyncSession, item_id: UUID
) -> tuple[float | None, int]:
    attempts = list(
        await session.scalars(
            select(Attempt)
            .where(
                Attempt.reading_item_id == item_id, Attempt.submitted_at.is_not(None)
            )
            .order_by(Attempt.submitted_at.desc())
        )
    )
    latest_by_user: dict[UUID, Attempt] = {}
    for attempt in attempts:
        latest_by_user.setdefault(attempt.user_id, attempt)
    latest = list(latest_by_user.values())
    if not latest:
        return None, 0
    correct = sum(bool(attempt.is_correct) for attempt in latest)
    return round(correct / len(latest) * 100, 1), len(latest)


@router.post("/attempts/{attempt_id}/submit", response_model=AttemptResult)
async def submit_attempt(
    attempt_id: UUID,
    request: AttemptSubmitRequest,
    session: Annotated[AsyncSession, Depends(get_session)],
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
) -> AttemptResult:
    attempt = await session.get(Attempt, attempt_id)
    if not attempt or attempt.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Attempt not found."
        )
    if attempt.submitted_at or attempt.abandoned_at:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This attempt is already closed.",
        )

    item = await get_published_item(session, attempt.reading_item_id)
    selected = next(
        (choice for choice in item.choices if choice.id == request.selected_choice_id),
        None,
    )
    correct = next(choice for choice in item.choices if choice.is_correct)
    if not selected:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The selected choice does not belong to this item.",
        )

    submitted_at = datetime.now(UTC)
    attempt.selected_choice_id = selected.id
    attempt.is_correct = selected.id == correct.id
    attempt.submitted_at = submitted_at
    attempt.elapsed_seconds = max(
        0, int((submitted_at - attempt.started_at).total_seconds())
    )
    await session.commit()
    accuracy, challenger_count = await item_outcomes(session, item.id)
    return AttemptResult(
        attempt_id=attempt.id,
        item_id=item.id,
        is_correct=bool(attempt.is_correct),
        selected_choice_id=selected.id,
        correct_choice_id=correct.id,
        explanation=item.explanation,
        selected_choice_wrong_explanation=selected.wrong_explanation,
        elapsed_seconds=attempt.elapsed_seconds,
        recommended_seconds=item.recommended_seconds,
        item_accuracy=accuracy,
        challenger_count=challenger_count,
    )


@router.post("/attempts/{attempt_id}/abandon", status_code=status.HTTP_204_NO_CONTENT)
async def abandon_attempt(
    attempt_id: UUID,
    session: Annotated[AsyncSession, Depends(get_session)],
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
) -> Response:
    attempt = await session.get(Attempt, attempt_id)
    if not attempt or attempt.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Attempt not found."
        )
    if not attempt.submitted_at and not attempt.abandoned_at:
        attempt.abandoned_at = datetime.now(UTC)
        await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.put("/{item_id}/feedback", status_code=status.HTTP_204_NO_CONTENT)
async def upsert_feedback(
    item_id: UUID,
    request: FeedbackRequest,
    session: Annotated[AsyncSession, Depends(get_session)],
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
) -> Response:
    await get_published_item(session, item_id)
    await ensure_user(session, current_user)
    feedback = await session.scalar(
        select(ItemFeedback).where(
            ItemFeedback.user_id == current_user.id,
            ItemFeedback.reading_item_id == item_id,
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
                reading_item_id=item_id,
                quality_rating=request.quality_rating,
                perceived_level=request.perceived_level,
                comment=request.comment,
            )
        )
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{item_id}/reports", status_code=status.HTTP_201_CREATED)
async def create_report(
    item_id: UUID,
    request: ReportRequest,
    session: Annotated[AsyncSession, Depends(get_session)],
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
) -> dict[str, bool]:
    await get_published_item(session, item_id)
    await ensure_user(session, current_user)
    session.add(
        ItemReport(
            user_id=current_user.id,
            reading_item_id=item_id,
            content=request.content.strip(),
        )
    )
    await session.commit()
    return {"created": True}


def group_statistics(
    items: list[ReadingItem], latest_attempts: dict[UUID, Attempt], key: str
) -> list[StatisticGroup]:
    order = (
        ["short", "medium", "long"]
        if key == "length_type"
        else ["N5", "N4", "N3", "N2", "N1"]
    )
    groups: list[StatisticGroup] = []
    for value in order:
        group_items = [item for item in items if getattr(item, key) == value]
        group_attempts = [
            latest_attempts[item.id]
            for item in group_items
            if item.id in latest_attempts
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


@statistics_router.get("/me/statistics", response_model=StatisticsResponse)
async def get_statistics(
    session: Annotated[AsyncSession, Depends(get_session)],
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
) -> StatisticsResponse:
    items = list(await session.scalars(select(ReadingItem)))
    submissions = list(
        await session.scalars(
            select(Attempt)
            .where(
                Attempt.user_id == current_user.id,
                Attempt.submitted_at.is_not(None),
            )
            .order_by(Attempt.submitted_at.desc())
        )
    )
    latest_attempts: dict[UUID, Attempt] = {}
    for attempt in submissions:
        latest_attempts.setdefault(attempt.reading_item_id, attempt)
    recent = list(latest_attempts.values())
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
        by_length=group_statistics(items, latest_attempts, "length_type"),
        by_level=group_statistics(items, latest_attempts, "official_level"),
    )
