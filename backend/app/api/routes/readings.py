import math
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.security import (
    CurrentUser,
    get_current_user,
    get_optional_current_user,
)
from app.db.models import (
    Attempt,
    ItemBookmark,
    ItemFeedback,
    ItemReport,
    PassageHighlight,
    ReadingItem,
    ReadingQuestion,
)
from app.db.session import get_session
from app.schemas import (
    AttemptResult,
    AttemptStarted,
    AttemptState,
    AttemptSubmitRequest,
    FeedbackRequest,
    LengthType,
    PassageHighlightCollectionPage,
    PassageHighlightCreateRequest,
    PassageHighlightResponse,
    ReadingBookmarkResponse,
    ReadingItemDetail,
    ReadingItemPage,
    ReadingLanguage,
    ReadingLevel,
    ReadingQuestionPublic,
    ReadingTranslationResponse,
    ReportRequest,
    StatisticGroup,
    StatisticsResponse,
)
from app.services.attempts import (
    abandon_attempt as abandon_attempt_for_user,
)
from app.services.attempts import (
    ensure_item_questions,
    learner_progress_for_submissions,
    learner_progress_query,
    learner_score_expression,
    public_choices,
)
from app.services.attempts import (
    get_attempt_state as get_attempt_state_for_user,
)
from app.services.attempts import (
    start_attempt as start_attempt_for_item,
)
from app.services.attempts import (
    submit_attempt as submit_attempt_for_user,
)
from app.services.item_metrics import (
    collect_item_metrics,
    first_submissions_by_user_item,
    perceived_feedback_summary_query,
    serialize_public_summary,
)
from app.services.reading_engagement import (
    HighlightNotFoundError,
    HighlightOverlapError,
    HighlightRangeMismatchError,
    add_item_bookmark,
    create_user_highlight,
    delete_user_highlight,
    list_highlight_collection,
    list_user_highlights,
    normalized_passage_text,
    remove_item_bookmark,
    selected_text_for_offsets,
)
from app.services.reading_policy import (
    LENGTH_TYPES,
    LEVELS_BY_LANGUAGE,
    MINIMUM_PERCEIVED_LEVEL_VOTES,
    is_level_for_language,
)
from app.services.translation import TranslationError, translate_texts
from app.services.users import ensure_user

router = APIRouter(prefix="/reading-items", tags=["reading items"])
statistics_router = APIRouter(tags=["statistics"])


async def get_published_item(session: AsyncSession, item_id: UUID) -> ReadingItem:
    item = await session.scalar(
        select(ReadingItem)
        .where(ReadingItem.id == item_id, ReadingItem.status == "published")
        .options(
            selectinload(ReadingItem.choices),
            selectinload(ReadingItem.questions).selectinload(ReadingQuestion.choices),
        )
    )
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Item not found."
        )
    return item


def serialize_passage_highlight(highlight: PassageHighlight) -> PassageHighlightResponse:
    return PassageHighlightResponse(
        id=highlight.id,
        start_offset=highlight.start_offset,
        end_offset=highlight.end_offset,
        selected_text=highlight.selected_text,
    )


def public_level_order_expression():
    ranks = {
        level: rank
        for levels in LEVELS_BY_LANGUAGE.values()
        for rank, level in enumerate(levels, start=1)
    }
    return case(ranks, value=ReadingItem.official_level, else_=0)


def public_sort_clauses(sort: str, feedback_summary, progress):
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


@router.get("", response_model=ReadingItemPage)
async def list_published_reading_items(
    session: Annotated[AsyncSession, Depends(get_session)],
    q: Annotated[str | None, Query(max_length=100)] = None,
    language: ReadingLanguage | None = None,
    level: ReadingLevel | None = None,
    length: LengthType | None = None,
    attempt_status: Annotated[
        Literal[
            "correct",
            "wrong",
            "unstarted",
            "score-100",
            "score-90",
            "score-80",
        ]
        | None,
        Query(alias="status"),
    ] = None,
    first_submission_time: Annotated[
        Literal["on-time", "timed-out"] | None,
        Query(alias="time"),
    ] = None,
    bookmarked: bool = False,
    sort: Annotated[
        Literal[
            "published_desc",
            "published_asc",
            "level_asc",
            "level_desc",
            "perceived_level_asc",
            "perceived_level_desc",
            "score_asc",
            "score_desc",
        ],
        Query(),
    ] = "published_desc",
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=50)] = 10,
    current_user: Annotated[CurrentUser | None, Depends(get_optional_current_user)] = None,
) -> ReadingItemPage:
    if (attempt_status or first_submission_time or bookmarked) and current_user is None:
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
            latest_status, timed_out, score, score_reason = (
                learner_progress_for_submissions(
                    submissions_by_item.get(item.id, []), item.recommended_seconds
                )
            )
            if latest_status:
                latest_statuses[item.id] = latest_status
            if timed_out:
                first_submission_timed_out[item.id] = True
            if score is not None and score_reason is not None:
                scores[item.id] = score
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


@router.get("/highlights", response_model=PassageHighlightCollectionPage)
async def list_user_passage_highlights(
    session: Annotated[AsyncSession, Depends(get_session)],
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
    language: Annotated[ReadingLanguage | None, Query()] = None,
    query: Annotated[str | None, Query(max_length=100)] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=20)] = 20,
) -> PassageHighlightCollectionPage:
    return await list_highlight_collection(
        session,
        user_id=current_user.id,
        language=language,
        query=query,
        page=page,
        page_size=page_size,
    )


@router.get("/{item_id}", response_model=ReadingItemDetail)
async def get_reading_item(
    item_id: UUID,
    session: Annotated[AsyncSession, Depends(get_session)],
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
) -> ReadingItemDetail:
    item = await get_published_item(session, item_id)
    questions = await ensure_item_questions(session, item)
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
        questions=[
            ReadingQuestionPublic(
                id=question.id,
                question=question.question,
                choices=public_choices(question.choices),
            )
            for question in questions
        ],
    )


@router.put("/{item_id}/bookmark", response_model=ReadingBookmarkResponse)
async def bookmark_reading_item(
    item_id: UUID,
    session: Annotated[AsyncSession, Depends(get_session)],
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
) -> ReadingBookmarkResponse:
    await get_published_item(session, item_id)
    await ensure_user(session, current_user)
    await add_item_bookmark(session, current_user.id, item_id)
    return ReadingBookmarkResponse(reading_item_id=item_id, is_bookmarked=True)


@router.delete("/{item_id}/bookmark", response_model=ReadingBookmarkResponse)
async def delete_reading_bookmark(
    item_id: UUID,
    session: Annotated[AsyncSession, Depends(get_session)],
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
) -> ReadingBookmarkResponse:
    await get_published_item(session, item_id)
    await remove_item_bookmark(session, current_user.id, item_id)
    return ReadingBookmarkResponse(reading_item_id=item_id, is_bookmarked=False)


@router.post(
    "/{item_id}/translation",
    response_model=ReadingTranslationResponse,
)
async def translate_reading_item(
    item_id: UUID,
    session: Annotated[AsyncSession, Depends(get_session)],
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
) -> ReadingTranslationResponse:
    item = await get_published_item(session, item_id)
    questions = await ensure_item_questions(session, item)
    translation_source_texts = [
        item.title,
        item.passage,
        *(question.question for question in questions),
        *(choice.text for question in questions for choice in question.choices),
    ]
    try:
        translations = await translate_texts(
            translation_source_texts,
            item.language,
        )
    except TranslationError as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(error),
        ) from error
    target_language: ReadingLanguage = "ko" if item.language == "ja" else "ja"
    question_translations = translations[2 : 2 + len(questions)]
    choice_translations = iter(translations[2 + len(questions) :])
    return ReadingTranslationResponse(
        source_language=item.language,
        target_language=target_language,
        source_text=item.passage,
        translated_text=translations[1],
        title={
            "source_text": item.title,
            "translated_text": translations[0],
        },
        passage={
            "source_text": item.passage,
            "translated_text": translations[1],
        },
        question={
            "source_text": questions[0].question,
            "translated_text": translations[2],
        },
        questions=[
            {
                "source_text": question.question,
                "translated_text": question_translations[index],
            }
            for index, question in enumerate(questions)
        ],
        question_choices=[
            [
                {
                    "source_text": choice.text,
                    "translated_text": next(choice_translations),
                }
                for choice in question.choices
            ]
            for question in questions
        ],
    )


@router.get("/{item_id}/highlights", response_model=list[PassageHighlightResponse])
async def list_passage_highlights(
    item_id: UUID,
    session: Annotated[AsyncSession, Depends(get_session)],
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
) -> list[PassageHighlightResponse]:
    item = await get_published_item(session, item_id)
    passage = normalized_passage_text(item.passage)
    highlights = await list_user_highlights(session, current_user.id, item_id)
    return [
        serialize_passage_highlight(highlight)
        for highlight in highlights
        if selected_text_for_offsets(
            passage, highlight.start_offset, highlight.end_offset
        )
        == highlight.selected_text
    ]


@router.post(
    "/{item_id}/highlights",
    response_model=PassageHighlightResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_passage_highlight(
    item_id: UUID,
    request: PassageHighlightCreateRequest,
    session: Annotated[AsyncSession, Depends(get_session)],
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
) -> PassageHighlightResponse:
    item = await get_published_item(session, item_id)
    await ensure_user(session, current_user)
    try:
        highlight = await create_user_highlight(
            session,
            user_id=current_user.id,
            reading_item_id=item_id,
            passage=item.passage,
            start_offset=request.start_offset,
            end_offset=request.end_offset,
            selected_text=request.selected_text,
        )
    except HighlightRangeMismatchError as error:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="The selected passage range no longer matches the source text.",
        ) from error
    except HighlightOverlapError as error:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="The selected range overlaps an existing highlight.",
        ) from error
    return serialize_passage_highlight(highlight)


@router.delete("/{item_id}/highlights/{highlight_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_passage_highlight(
    item_id: UUID,
    highlight_id: UUID,
    session: Annotated[AsyncSession, Depends(get_session)],
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
) -> Response:
    await get_published_item(session, item_id)
    try:
        await delete_user_highlight(
            session,
            user_id=current_user.id,
            reading_item_id=item_id,
            highlight_id=highlight_id,
        )
    except HighlightNotFoundError as error:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Highlight not found."
        ) from error
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{item_id}/attempts", response_model=AttemptStarted, status_code=201)
async def start_attempt(
    item_id: UUID,
    session: Annotated[AsyncSession, Depends(get_session)],
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
) -> AttemptStarted:
    item = await get_published_item(session, item_id)
    await ensure_user(session, current_user)
    return await start_attempt_for_item(session, item, current_user)


@router.get("/attempts/{attempt_id}", response_model=AttemptState)
async def get_attempt_state(
    attempt_id: UUID,
    session: Annotated[AsyncSession, Depends(get_session)],
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
) -> AttemptState:
    return await get_attempt_state_for_user(session, attempt_id, current_user)


@router.post("/attempts/{attempt_id}/submit", response_model=AttemptResult)
async def submit_attempt(
    attempt_id: UUID,
    request: AttemptSubmitRequest,
    session: Annotated[AsyncSession, Depends(get_session)],
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
) -> AttemptResult:
    return await submit_attempt_for_user(session, attempt_id, request, current_user)


@router.post("/attempts/{attempt_id}/abandon", status_code=status.HTTP_204_NO_CONTENT)
async def abandon_attempt(
    attempt_id: UUID,
    session: Annotated[AsyncSession, Depends(get_session)],
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
) -> Response:
    await abandon_attempt_for_user(session, attempt_id, current_user)
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
