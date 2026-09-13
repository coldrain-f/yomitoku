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
from app.db.models import (
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
    StatisticsResponse,
)
from app.services.attempts import (
    abandon_attempt as abandon_attempt_for_user,
)
from app.services.attempts import (
    ensure_item_questions,
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
from app.services.learning_statistics import get_user_statistics
from app.services.reading_catalog import list_published_items
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
from app.services.reading_policy import is_level_for_language
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
    return await list_published_items(
        session,
        q=q,
        language=language,
        level=level,
        length=length,
        attempt_status=attempt_status,
        first_submission_time=first_submission_time,
        bookmarked=bookmarked,
        sort=sort,
        page=page,
        page_size=page_size,
        current_user=current_user,
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


@statistics_router.get("/me/statistics", response_model=StatisticsResponse)
async def get_statistics(
    session: Annotated[AsyncSession, Depends(get_session)],
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
) -> StatisticsResponse:
    return await get_user_statistics(session, current_user.id)
