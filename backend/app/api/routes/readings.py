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
    AttemptItemDetail,
    AttemptResult,
    AttemptStarted,
    AttemptState,
    AttemptSubmitRequest,
    FeedbackRequest,
    LengthType,
    PassageTranslationResponse,
    ReadingChoicePublic,
    ReadingItemDetail,
    ReadingItemPage,
    ReadingItemSummary,
    ReadingLanguage,
    ReadingLevel,
    ReportRequest,
    StatisticGroup,
    StatisticsResponse,
)
from app.services.item_metrics import (
    ItemMetrics,
    collect_item_metrics,
    first_submissions_by_user_item,
)
from app.services.reading_policy import (
    LENGTH_TYPES,
    LEVELS_BY_LANGUAGE,
    MINIMUM_PERCEIVED_LEVEL_VOTES,
    is_level_for_language,
    level_sort_key,
)
from app.services.translation import TranslationError, translate_passage
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


def choices_for_attempt(item: ReadingItem, attempt: Attempt) -> list[ReadingChoice]:
    """Return the issued order, with a stable fallback for attempts created before it."""
    by_id = {str(choice.id): choice for choice in item.choices}
    choices: list[ReadingChoice] = []
    for choice_id in attempt.choice_order:
        choice = by_id.pop(choice_id, None)
        if choice:
            choices.append(choice)
    return [*choices, *by_id.values()]


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
        language=item.language,
        official_level=item.official_level,
        length_type=item.length_type,
        topic=item.topic,
        recommended_seconds=item.recommended_seconds,
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
    )


def sort_public_items(
    items: list[ReadingItem],
    metrics_by_item: dict[UUID, ItemMetrics],
    sort: str,
) -> list[ReadingItem]:
    if sort.startswith("perceived_level"):
        def perceived_rank(item: ReadingItem) -> tuple[bool, tuple[int, int]]:
            level = metrics_by_item[item.id]["perceived_level"]
            return level is None, level_sort_key(item.language, str(level))

        if sort.endswith("desc"):
            return sorted(
                items,
                key=lambda item: (
                    perceived_rank(item)[0],
                    -perceived_rank(item)[1][0],
                    -perceived_rank(item)[1][1],
                ),
            )
        return sorted(items, key=perceived_rank)
    if sort.startswith("level"):
        return sorted(
            items,
            key=lambda item: level_sort_key(item.language, item.official_level),
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
    language: ReadingLanguage | None = None,
    level: ReadingLevel | None = None,
    length: LengthType | None = None,
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
    if language and level and not is_level_for_language(language, level):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="The selected level does not belong to the content language.",
        )
    if q:
        filters.append(ReadingItem.title.ilike(f"%{q.strip()}%"))
    if level:
        filters.append(ReadingItem.official_level == level)
    if language:
        filters.append(ReadingItem.language == language)
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
        language=item.language,
        official_level=item.official_level,
        length_type=item.length_type,
        topic=item.topic,
        recommended_seconds=item.recommended_seconds,
        passage=item.passage,
        question=item.question,
        choices=public_choices(item.choices),
    )


@router.post(
    "/{item_id}/translation",
    response_model=PassageTranslationResponse,
)
async def translate_reading_item(
    item_id: UUID,
    session: Annotated[AsyncSession, Depends(get_session)],
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
) -> PassageTranslationResponse:
    item = await get_published_item(session, item_id)
    try:
        translated_text = await translate_passage(item.passage, item.language)
    except TranslationError as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(error),
        ) from error
    target_language: ReadingLanguage = "ko" if item.language == "ja" else "ja"
    return PassageTranslationResponse(
        source_language=item.language,
        target_language=target_language,
        source_text=item.passage,
        translated_text=translated_text,
    )


@router.post("/{item_id}/attempts", response_model=AttemptStarted, status_code=201)
async def start_attempt(
    item_id: UUID,
    session: Annotated[AsyncSession, Depends(get_session)],
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
) -> AttemptStarted:
    item = await get_published_item(session, item_id)
    await ensure_user(session, current_user)
    choices = random.SystemRandom().sample(item.choices, k=len(item.choices))
    attempt = Attempt(
        user_id=current_user.id,
        reading_item_id=item.id,
        started_at=datetime.now(UTC),
        choice_order=[str(choice.id) for choice in choices],
    )
    session.add(attempt)
    await session.commit()
    await session.refresh(attempt)
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
            .order_by(Attempt.submitted_at.asc(), Attempt.id.asc())
        )
    )
    first_attempts = list(first_submissions_by_user_item(attempts).values())
    if not first_attempts:
        return None, 0
    correct = sum(bool(attempt.is_correct) for attempt in first_attempts)
    return round(correct / len(first_attempts) * 100, 1), len(first_attempts)


async def get_owned_attempt_for_update(
    session: AsyncSession, attempt_id: UUID, current_user: CurrentUser
) -> Attempt:
    """Lock one learner's attempt before changing its terminal state."""
    attempt = await session.scalar(
        select(Attempt)
        .where(Attempt.id == attempt_id, Attempt.user_id == current_user.id)
        .with_for_update()
    )
    if not attempt:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Attempt not found."
        )
    return attempt


async def get_owned_attempt(
    session: AsyncSession, attempt_id: UUID, current_user: CurrentUser
) -> Attempt:
    attempt = await session.scalar(
        select(Attempt).where(
            Attempt.id == attempt_id, Attempt.user_id == current_user.id
        )
    )
    if not attempt:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Attempt not found."
        )
    return attempt


def elapsed_seconds_since(started_at: datetime, completed_at: datetime) -> int:
    """Accept timestamps from drivers that do not restore timezone metadata."""
    if started_at.tzinfo is None:
        started_at = started_at.replace(tzinfo=UTC)
    if completed_at.tzinfo is None:
        completed_at = completed_at.replace(tzinfo=UTC)
    return max(0, int((completed_at - started_at).total_seconds()))


async def serialize_attempt_result(
    session: AsyncSession, attempt: Attempt, item: ReadingItem
) -> AttemptResult:
    selected = next(
        (choice for choice in item.choices if choice.id == attempt.selected_choice_id),
        None,
    )
    correct = next(choice for choice in item.choices if choice.is_correct)
    if not selected or attempt.is_correct is None or attempt.elapsed_seconds is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This submitted attempt is incomplete.",
        )
    accuracy, challenger_count = await item_outcomes(session, item.id)
    return AttemptResult(
        attempt_id=attempt.id,
        item_id=item.id,
        is_correct=attempt.is_correct,
        selected_choice_id=selected.id,
        correct_choice_id=correct.id,
        explanation=item.explanation,
        selected_choice_wrong_explanation=selected.wrong_explanation,
        elapsed_seconds=attempt.elapsed_seconds,
        recommended_seconds=item.recommended_seconds,
        item_accuracy=accuracy,
        challenger_count=challenger_count,
    )


@router.get("/attempts/{attempt_id}", response_model=AttemptState)
async def get_attempt_state(
    attempt_id: UUID,
    session: Annotated[AsyncSession, Depends(get_session)],
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
) -> AttemptState:
    attempt = await get_owned_attempt(session, attempt_id, current_user)
    if attempt.abandoned_at:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Attempt not found."
        )
    item = await session.scalar(
        select(ReadingItem)
        .where(ReadingItem.id == attempt.reading_item_id)
        .options(selectinload(ReadingItem.choices))
    )
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Item not found."
        )

    metrics = await collect_item_metrics(session, [item.id])
    latest_status: Literal["correct", "wrong"] | None = None
    if attempt.submitted_at:
        latest_status = "correct" if attempt.is_correct else "wrong"
    item_summary = serialize_public_summary(item, metrics[item.id], latest_status)
    submitted = attempt.submitted_at is not None
    return AttemptState(
        id=attempt.id,
        item_id=item.id,
        item=AttemptItemDetail(
            **item_summary.model_dump(),
            passage=item.passage,
            question=item.question,
            choices=public_choices(choices_for_attempt(item, attempt)),
        ),
        started_at=attempt.started_at,
        elapsed_seconds=(
            attempt.elapsed_seconds
            if submitted and attempt.elapsed_seconds is not None
            else elapsed_seconds_since(attempt.started_at, datetime.now(UTC))
        ),
        selected_choice_id=attempt.selected_choice_id,
        submitted=submitted,
        result=(
            await serialize_attempt_result(session, attempt, item)
            if submitted
            else None
        ),
    )


@router.post("/attempts/{attempt_id}/submit", response_model=AttemptResult)
async def submit_attempt(
    attempt_id: UUID,
    request: AttemptSubmitRequest,
    session: Annotated[AsyncSession, Depends(get_session)],
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
) -> AttemptResult:
    attempt = await get_owned_attempt_for_update(session, attempt_id, current_user)
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
    attempt.elapsed_seconds = elapsed_seconds_since(attempt.started_at, submitted_at)
    await session.commit()
    return await serialize_attempt_result(session, attempt, item)


@router.post("/attempts/{attempt_id}/abandon", status_code=status.HTTP_204_NO_CONTENT)
async def abandon_attempt(
    attempt_id: UUID,
    session: Annotated[AsyncSession, Depends(get_session)],
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
) -> Response:
    attempt = await get_owned_attempt_for_update(session, attempt_id, current_user)
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
    item = await get_published_item(session, item_id)
    if not is_level_for_language(item.language, request.perceived_level):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="The selected level does not belong to the content language.",
        )
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
    items: list[ReadingItem], attempts_by_item: dict[UUID, Attempt], key: str
) -> list[StatisticGroup]:
    if key == "length_type":
        order = LENGTH_TYPES
    elif key == "language":
        order = tuple(LEVELS_BY_LANGUAGE)
    else:
        order = tuple(
            level for levels in LEVELS_BY_LANGUAGE.values() for level in levels
        )
    groups: list[StatisticGroup] = []
    for value in order:
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


@statistics_router.get("/me/statistics", response_model=StatisticsResponse)
async def get_statistics(
    session: Annotated[AsyncSession, Depends(get_session)],
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
) -> StatisticsResponse:
    items = list(
        await session.scalars(
            select(ReadingItem).where(ReadingItem.status == "published")
        )
    )
    submissions = list(
        await session.scalars(
            select(Attempt)
            .where(
                Attempt.user_id == current_user.id,
                Attempt.submitted_at.is_not(None),
            )
            .order_by(Attempt.submitted_at.asc(), Attempt.id.asc())
        )
    )
    published_item_ids = {item.id for item in items}
    first_attempts = {
        item_id: attempt
        for (_, item_id), attempt in first_submissions_by_user_item(
            submissions
        ).items()
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
