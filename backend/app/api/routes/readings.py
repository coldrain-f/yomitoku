import math
import random
from collections.abc import Iterable
from datetime import UTC, datetime
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import case, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.security import (
    CurrentUser,
    get_current_user,
    get_optional_current_user,
)
from app.db.models import (
    Attempt,
    AttemptAnswer,
    ItemBookmark,
    ItemFeedback,
    ItemReport,
    PassageHighlight,
    ReadingChoice,
    ReadingItem,
    ReadingQuestion,
)
from app.db.session import get_session
from app.schemas import (
    AttemptItemDetail,
    AttemptQuestion,
    AttemptQuestionAnswer,
    AttemptQuestionResult,
    AttemptResult,
    AttemptStarted,
    AttemptState,
    AttemptSubmitRequest,
    FeedbackRequest,
    LengthType,
    PassageHighlightCollectionItem,
    PassageHighlightCollectionPage,
    PassageHighlightCollectionSnippet,
    PassageHighlightCreateRequest,
    PassageHighlightResponse,
    ReadingBookmarkResponse,
    ReadingChoicePublic,
    ReadingItemDetail,
    ReadingItemPage,
    ReadingItemSummary,
    ReadingLanguage,
    ReadingLevel,
    ReadingQuestionPublic,
    ReadingTranslationResponse,
    ReportRequest,
    StatisticGroup,
    StatisticsResponse,
)
from app.services.item_metrics import (
    ItemMetrics,
    collect_item_metrics,
    first_submissions_by_user_item,
    perceived_feedback_summary_query,
    perceived_level_rank,
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


def public_choices(choices: Iterable[ReadingChoice]) -> list[ReadingChoicePublic]:
    return [ReadingChoicePublic(id=choice.id, text=choice.text) for choice in choices]


async def ensure_item_questions(
    session: AsyncSession, item: ReadingItem
) -> list[ReadingQuestion]:
    """Materialize a single legacy question for pre-migration test fixtures."""
    if item.questions:
        return list(item.questions)
    question = ReadingQuestion(
        reading_item=item,
        question=item.question,
        explanation=item.explanation,
        canonical_order=1,
    )
    for choice in item.choices:
        choice.reading_question = question
    session.add(question)
    await session.flush()
    return [question]


async def ensure_attempt_answers(
    session: AsyncSession, attempt: Attempt, questions: list[ReadingQuestion]
) -> list[AttemptAnswer]:
    await session.refresh(attempt, attribute_names=["answers"])
    existing = {answer.reading_question_id: answer for answer in attempt.answers}
    missing = [question for question in questions if question.id not in existing]
    if not missing:
        return list(attempt.answers)
    fallback_order = attempt.choice_order
    answers = [
        AttemptAnswer(
            attempt_id=attempt.id,
            reading_question_id=question.id,
            choice_order=(
                fallback_order
                if question is questions[0] and fallback_order
                else [str(choice.id) for choice in question.choices]
            ),
        )
        for question in missing
    ]
    session.add_all(answers)
    await session.flush()
    await session.refresh(attempt, attribute_names=["answers"])
    return list(attempt.answers)


def question_choices_for_attempt(
    question: ReadingQuestion, answer: AttemptAnswer | None
) -> list[ReadingChoice]:
    by_id = {str(choice.id): choice for choice in question.choices}
    ordered: list[ReadingChoice] = []
    for choice_id in answer.choice_order if answer else []:
        choice = by_id.pop(choice_id, None)
        if choice:
            ordered.append(choice)
    return [*ordered, *by_id.values()]


def public_questions(
    questions: Iterable[ReadingQuestion], answers: dict[UUID, AttemptAnswer] | None = None
) -> list[AttemptQuestion]:
    answers = answers or {}
    return [
        AttemptQuestion(
            id=question.id,
            question=question.question,
            choices=public_choices(
                question_choices_for_attempt(question, answers.get(question.id))
            ),
        )
        for question in questions
    ]


def choices_for_attempt(item: ReadingItem, attempt: Attempt) -> list[ReadingChoice]:
    """Return the issued order, with a stable fallback for attempts created before it."""
    first_question = item.questions[0] if item.questions else None
    first_answer = next(iter(attempt.answers), None)
    if first_question:
        return question_choices_for_attempt(
            first_question,
            AttemptAnswer(choice_order=attempt.choice_order)
            if attempt.choice_order
            else first_answer,
        )
    by_id = {str(choice.id): choice for choice in item.choices}
    return [
        *[by_id.pop(choice_id) for choice_id in attempt.choice_order if choice_id in by_id],
        *by_id.values(),
    ]


def normalized_passage_text(value: str) -> str:
    return value.replace("\r\n", "\n").replace("\r", "\n")


def python_index_for_utf16_offset(text: str, offset: int) -> int | None:
    """Map browser DOM offsets to Python indices without splitting a surrogate pair."""
    consumed = 0
    for index, character in enumerate(text):
        if consumed == offset:
            return index
        consumed += 2 if ord(character) > 0xFFFF else 1
    return len(text) if consumed == offset else None


def selected_text_for_offsets(
    passage: str, start_offset: int, end_offset: int
) -> str | None:
    start_index = python_index_for_utf16_offset(passage, start_offset)
    end_index = python_index_for_utf16_offset(passage, end_offset)
    if start_index is None or end_index is None or end_index <= start_index:
        return None
    return passage[start_index:end_index]


def serialize_passage_highlight(highlight: PassageHighlight) -> PassageHighlightResponse:
    return PassageHighlightResponse(
        id=highlight.id,
        start_offset=highlight.start_offset,
        end_offset=highlight.end_offset,
        selected_text=highlight.selected_text,
    )


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
    ] | None = None,
    is_bookmarked: bool = False,
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


def learner_progress_for_submissions(
    submissions: list[Attempt], recommended_seconds: int
) -> tuple[
    Literal["correct", "wrong"] | None,
    bool,
    Literal[80, 90, 100] | None,
    Literal[
        "first_submission_on_time",
        "first_submission_timed_out",
        "retry_passed",
    ]
    | None,
]:
    """Derive the permanent list score from a learner's submitted attempts."""
    if not submissions:
        return None, False, None, None

    first = submissions[0]
    first_submission_timed_out = bool(
        first.elapsed_seconds is not None
        and first.elapsed_seconds > recommended_seconds
    )
    latest_status: Literal["correct", "wrong"] = (
        "correct" if first.is_correct else "wrong"
    )
    for attempt in submissions[1:]:
        latest_status = "correct" if attempt.is_correct else "wrong"

    for index, attempt in enumerate(submissions):
        if not attempt.is_correct:
            continue
        if index == 0:
            if first_submission_timed_out:
                return (
                    latest_status,
                    first_submission_timed_out,
                    90,
                    "first_submission_timed_out",
                )
            return (
                latest_status,
                first_submission_timed_out,
                100,
                "first_submission_on_time",
            )
        return latest_status, first_submission_timed_out, 80, "retry_passed"

    return latest_status, first_submission_timed_out, None, None


def learner_progress_query(user_id: UUID):
    """Return first/latest submission facts for one learner, grouped by item."""
    ranked = (
        select(
            Attempt.reading_item_id.label("reading_item_id"),
            Attempt.is_correct.label("is_correct"),
            Attempt.elapsed_seconds.label("elapsed_seconds"),
            func.row_number()
            .over(
                partition_by=Attempt.reading_item_id,
                order_by=(Attempt.submitted_at.asc(), Attempt.id.asc()),
            )
            .label("first_position"),
        )
        .where(
            Attempt.user_id == user_id,
            Attempt.submitted_at.is_not(None),
        )
        .subquery()
    )
    return (
        select(
            ranked.c.reading_item_id,
            func.max(
                case(
                    (
                        ranked.c.first_position == 1,
                        case((ranked.c.is_correct.is_(True), 1), else_=0),
                    ),
                    else_=0,
                )
            ).label("first_correct"),
            func.max(
                case(
                    (ranked.c.first_position == 1, ranked.c.elapsed_seconds),
                    else_=None,
                )
            ).label("first_elapsed_seconds"),
            func.max(
                case((ranked.c.is_correct.is_(True), 1), else_=0)
            ).label("has_correct"),
        )
        .group_by(ranked.c.reading_item_id)
        .subquery()
    )


def learner_score_expression(progress, item: ReadingItem):
    return case(
        (
            progress.c.first_correct == 1,
            case(
                (progress.c.first_elapsed_seconds > item.recommended_seconds, 90),
                else_=100,
            ),
        ),
        (progress.c.has_correct == 1, 80),
        else_=None,
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
    """Return reviewable highlight groups, ordered by the learner's latest submission."""
    filters = [
        PassageHighlight.user_id == current_user.id,
        ReadingItem.status == "published",
    ]
    if language is not None:
        filters.append(ReadingItem.language == language)
    normalized_query = query.strip() if query else ""
    if normalized_query:
        keyword = f"%{normalized_query}%"
        filters.append(
            or_(
                ReadingItem.title.ilike(keyword),
                PassageHighlight.selected_text.ilike(keyword),
            )
        )

    # One item can have many highlights. Page by item so a review card never splits
    # across pages, then load just that page's highlights below.
    latest_submissions = (
        select(
            Attempt.reading_item_id.label("reading_item_id"),
            func.max(Attempt.submitted_at).label("last_submitted_at"),
        )
        .where(
            Attempt.user_id == current_user.id,
            Attempt.submitted_at.is_not(None),
        )
        .group_by(Attempt.reading_item_id)
        .subquery()
    )
    highlight_groups = (
        select(
            ReadingItem.id.label("reading_item_id"),
            func.max(PassageHighlight.created_at).label("last_highlighted_at"),
        )
        .join(PassageHighlight, PassageHighlight.reading_item_id == ReadingItem.id)
        .where(*filters)
        .group_by(ReadingItem.id)
        .subquery()
    )
    total_items = await session.scalar(
        select(func.count()).select_from(highlight_groups)
    )
    total_items = total_items or 0
    total_pages = max(1, math.ceil(total_items / page_size))
    page = min(page, total_pages)

    group_rows = (
        await session.execute(
            select(
                ReadingItem,
                latest_submissions.c.last_submitted_at,
                highlight_groups.c.last_highlighted_at,
            )
            .join(highlight_groups, highlight_groups.c.reading_item_id == ReadingItem.id)
            .outerjoin(
                latest_submissions,
                latest_submissions.c.reading_item_id == ReadingItem.id,
            )
            .order_by(
                case(
                    (latest_submissions.c.last_submitted_at.is_(None), 1), else_=0
                ).asc(),
                latest_submissions.c.last_submitted_at.desc(),
                highlight_groups.c.last_highlighted_at.desc(),
                ReadingItem.id.asc(),
            )
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
    ).all()
    if not group_rows:
        return PassageHighlightCollectionPage(
            page=page,
            page_size=page_size,
            total_items=total_items,
            total_pages=total_pages,
        )

    item_ids = [item.id for item, _, _ in group_rows]
    highlights_by_item: dict[UUID, list[PassageHighlightCollectionSnippet]] = {
        item_id: [] for item_id in item_ids
    }
    passages_by_item = {
        item.id: normalized_passage_text(item.passage) for item, _, _ in group_rows
    }
    highlights = await session.scalars(
        select(PassageHighlight)
        .where(
            PassageHighlight.user_id == current_user.id,
            PassageHighlight.reading_item_id.in_(item_ids),
        )
        .order_by(PassageHighlight.created_at.desc(), PassageHighlight.id.asc())
    )
    for highlight in highlights:
        if (
            selected_text_for_offsets(
                passages_by_item[highlight.reading_item_id],
                highlight.start_offset,
                highlight.end_offset,
            )
            == highlight.selected_text
        ):
            highlights_by_item[highlight.reading_item_id].append(
                PassageHighlightCollectionSnippet(
                    id=highlight.id,
                    selected_text=highlight.selected_text,
                    created_at=highlight.created_at,
                )
            )

    return PassageHighlightCollectionPage(
        items=[
            PassageHighlightCollectionItem(
                reading_item_id=item.id,
                title=item.title,
                language=item.language,
                official_level=item.official_level,
                length_type=item.length_type,
                topic=item.topic,
                last_submitted_at=last_submitted_at,
                last_highlighted_at=last_highlighted_at,
                highlights=highlights_by_item[item.id],
            )
            for item, last_submitted_at, last_highlighted_at in group_rows
            if highlights_by_item[item.id]
        ],
        page=page,
        page_size=page_size,
        total_items=total_items,
        total_pages=total_pages,
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
    bookmark = await session.scalar(
        select(ItemBookmark).where(
            ItemBookmark.user_id == current_user.id,
            ItemBookmark.reading_item_id == item_id,
        )
    )
    if bookmark is None:
        session.add(ItemBookmark(user_id=current_user.id, reading_item_id=item_id))
        await session.commit()
    return ReadingBookmarkResponse(reading_item_id=item_id, is_bookmarked=True)


@router.delete("/{item_id}/bookmark", response_model=ReadingBookmarkResponse)
async def delete_reading_bookmark(
    item_id: UUID,
    session: Annotated[AsyncSession, Depends(get_session)],
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
) -> ReadingBookmarkResponse:
    await get_published_item(session, item_id)
    bookmark = await session.scalar(
        select(ItemBookmark).where(
            ItemBookmark.user_id == current_user.id,
            ItemBookmark.reading_item_id == item_id,
        )
    )
    if bookmark is not None:
        await session.delete(bookmark)
        await session.commit()
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


async def get_user_highlights(
    session: AsyncSession, item_id: UUID, current_user: CurrentUser
) -> list[PassageHighlight]:
    return list(
        await session.scalars(
            select(PassageHighlight)
            .where(
                PassageHighlight.user_id == current_user.id,
                PassageHighlight.reading_item_id == item_id,
            )
            .order_by(PassageHighlight.start_offset.asc(), PassageHighlight.end_offset.asc())
        )
    )


@router.get("/{item_id}/highlights", response_model=list[PassageHighlightResponse])
async def list_passage_highlights(
    item_id: UUID,
    session: Annotated[AsyncSession, Depends(get_session)],
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
) -> list[PassageHighlightResponse]:
    item = await get_published_item(session, item_id)
    passage = normalized_passage_text(item.passage)
    highlights = await get_user_highlights(session, item_id, current_user)
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
    passage = normalized_passage_text(item.passage)
    selected_text = selected_text_for_offsets(
        passage, request.start_offset, request.end_offset
    )
    if selected_text != request.selected_text:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="The selected passage range no longer matches the source text.",
        )

    await ensure_user(session, current_user)
    highlights = await get_user_highlights(session, item_id, current_user)
    for highlight in highlights:
        if (
            highlight.start_offset == request.start_offset
            and highlight.end_offset == request.end_offset
        ):
            return serialize_passage_highlight(highlight)
        if (
            request.start_offset < highlight.end_offset
            and highlight.start_offset < request.end_offset
        ):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="The selected range overlaps an existing highlight.",
            )

    highlight = PassageHighlight(
        user_id=current_user.id,
        reading_item_id=item_id,
        start_offset=request.start_offset,
        end_offset=request.end_offset,
        selected_text=request.selected_text,
    )
    session.add(highlight)
    await session.commit()
    await session.refresh(highlight)
    return serialize_passage_highlight(highlight)


@router.delete("/{item_id}/highlights/{highlight_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_passage_highlight(
    item_id: UUID,
    highlight_id: UUID,
    session: Annotated[AsyncSession, Depends(get_session)],
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
) -> Response:
    await get_published_item(session, item_id)
    highlight = await session.scalar(
        select(PassageHighlight).where(
            PassageHighlight.id == highlight_id,
            PassageHighlight.user_id == current_user.id,
            PassageHighlight.reading_item_id == item_id,
        )
    )
    if not highlight:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Highlight not found."
        )
    await session.delete(highlight)
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{item_id}/attempts", response_model=AttemptStarted, status_code=201)
async def start_attempt(
    item_id: UUID,
    session: Annotated[AsyncSession, Depends(get_session)],
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
) -> AttemptStarted:
    item = await get_published_item(session, item_id)
    await ensure_user(session, current_user)
    questions = await ensure_item_questions(session, item)
    attempt = Attempt(
        user_id=current_user.id,
        reading_item_id=item.id,
        started_at=datetime.now(UTC),
    )
    session.add(attempt)
    await session.flush()
    answers: list[AttemptAnswer] = []
    for question in questions:
        choices = random.SystemRandom().sample(
            question.choices, k=len(question.choices)
        )
        answers.append(
            AttemptAnswer(
                attempt_id=attempt.id,
                reading_question_id=question.id,
                choice_order=[str(choice.id) for choice in choices],
            )
        )
    session.add_all(answers)
    attempt.choice_order = answers[0].choice_order
    await session.flush()
    await session.commit()
    await session.refresh(attempt, attribute_names=["answers"])
    answer_by_question = {answer.reading_question_id: answer for answer in answers}
    started_questions = public_questions(questions, answer_by_question)
    return AttemptStarted(
        id=attempt.id,
        item_id=item.id,
        started_at=attempt.started_at,
        choices=started_questions[0].choices,
        questions=started_questions,
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
    questions = await ensure_item_questions(session, item)
    attempt_answers = await ensure_attempt_answers(session, attempt, questions)
    answer_by_question = {answer.reading_question_id: answer for answer in attempt_answers}
    question_results: list[AttemptQuestionResult] = []
    for question in questions:
        answer = answer_by_question.get(question.id)
        selected = next(
            (
                choice
                for choice in question.choices
                if answer and choice.id == answer.selected_choice_id
            ),
            None,
        )
        correct = next((choice for choice in question.choices if choice.is_correct), None)
        if not selected or not correct or answer is None or answer.is_correct is None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="This submitted attempt is incomplete.",
            )
        question_results.append(
            AttemptQuestionResult(
                question_id=question.id,
                is_correct=answer.is_correct,
                selected_choice_id=selected.id,
                correct_choice_id=correct.id,
                explanation=question.explanation,
                selected_choice_wrong_explanation=selected.wrong_explanation,
            )
        )
    if not question_results or attempt.is_correct is None or attempt.elapsed_seconds is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This submitted attempt is incomplete.",
        )
    first_result = question_results[0]
    accuracy, challenger_count = await item_outcomes(session, item.id)
    return AttemptResult(
        attempt_id=attempt.id,
        item_id=item.id,
        is_correct=attempt.is_correct,
        selected_choice_id=first_result.selected_choice_id,
        correct_choice_id=first_result.correct_choice_id,
        explanation=first_result.explanation,
        selected_choice_wrong_explanation=first_result.selected_choice_wrong_explanation,
        elapsed_seconds=attempt.elapsed_seconds,
        recommended_seconds=item.recommended_seconds,
        item_accuracy=accuracy,
        challenger_count=challenger_count,
        question_results=question_results,
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
        .options(
            selectinload(ReadingItem.choices),
            selectinload(ReadingItem.questions).selectinload(ReadingQuestion.choices),
        )
    )
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Item not found."
        )

    questions = await ensure_item_questions(session, item)
    attempt_answers = await ensure_attempt_answers(session, attempt, questions)
    answer_by_question = {answer.reading_question_id: answer for answer in attempt_answers}
    metrics = await collect_item_metrics(session, [item.id])
    submissions = list(
        await session.scalars(
            select(Attempt)
            .where(
                Attempt.user_id == current_user.id,
                Attempt.reading_item_id == item.id,
                Attempt.submitted_at.is_not(None),
            )
            .order_by(Attempt.submitted_at.asc(), Attempt.id.asc())
        )
    )
    latest_status, timed_out, score, score_reason = (
        learner_progress_for_submissions(submissions, item.recommended_seconds)
    )
    item_summary = serialize_public_summary(
        item,
        metrics[item.id],
        latest_status,
        timed_out,
        score,
        score_reason,
    )
    submitted = attempt.submitted_at is not None
    return AttemptState(
        id=attempt.id,
        item_id=item.id,
        item=AttemptItemDetail(
            **item_summary.model_dump(),
            passage=item.passage,
            question=item.question,
            choices=public_choices(choices_for_attempt(item, attempt)),
            questions=public_questions(questions, answer_by_question),
        ),
        started_at=attempt.started_at,
        elapsed_seconds=(
            attempt.elapsed_seconds
            if submitted and attempt.elapsed_seconds is not None
            else elapsed_seconds_since(attempt.started_at, datetime.now(UTC))
        ),
        selected_choice_id=attempt.selected_choice_id,
        answers=[
            AttemptQuestionAnswer(
                question_id=answer.reading_question_id,
                selected_choice_id=answer.selected_choice_id,
            )
            for answer in attempt_answers
        ],
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
    questions = await ensure_item_questions(session, item)
    attempt_answers = await ensure_attempt_answers(session, attempt, questions)
    answer_by_question = {answer.reading_question_id: answer for answer in attempt_answers}
    submitted_answers = (
        request.answers
        if request.answers is not None
        else [
            AttemptQuestionAnswer(
                question_id=questions[0].id,
                selected_choice_id=request.selected_choice_id,
            )
        ]
    )
    submitted_by_question = {answer.question_id: answer.selected_choice_id for answer in submitted_answers}
    expected_question_ids = {question.id for question in questions}
    if (
        len(submitted_by_question) != len(submitted_answers)
        or set(submitted_by_question) != expected_question_ids
        or any(choice_id is None for choice_id in submitted_by_question.values())
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Answer every question before submitting.",
        )

    all_correct = True
    first_selected_choice_id: UUID | None = None
    for question in questions:
        answer = answer_by_question.get(question.id)
        selected_choice_id = submitted_by_question[question.id]
        selected = next(
            (choice for choice in question.choices if choice.id == selected_choice_id),
            None,
        )
        correct = next((choice for choice in question.choices if choice.is_correct), None)
        if not answer or not selected or not correct:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="The selected choice does not belong to this question.",
            )
        answer.selected_choice_id = selected.id
        answer.is_correct = selected.id == correct.id
        all_correct = all_correct and answer.is_correct
        if first_selected_choice_id is None:
            first_selected_choice_id = selected.id

    submitted_at = datetime.now(UTC)
    attempt.selected_choice_id = first_selected_choice_id
    attempt.is_correct = all_correct
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
