import math
from datetime import UTC, datetime
from typing import Literal
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import case, delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.models import (
    ItemReport,
    ItemValidation,
    PassageHighlight,
    ReadingChoice,
    ReadingItem,
    ReadingQuestion,
)
from app.schemas import (
    AdminReadingItemCreate,
    AdminReadingItemDetail,
    AdminReadingItemUpdate,
    LengthType,
    ReadingChoiceInput,
    ReadingItemPage,
    ReadingLanguage,
    ReadingLevel,
    ReadingQuestionInput,
)
from app.services.item_metrics import (
    ItemMetrics,
    collect_item_metrics,
    perceived_feedback_summary_query,
    serialize_public_summary,
)
from app.services.reading_policy import (
    LEVELS_BY_LANGUAGE,
    MINIMUM_PERCEIVED_LEVEL_VOTES,
    is_level_for_language,
)
from app.services.validation import has_choice_position_reference

AdminItemStatus = Literal["review", "held", "published"]
AdminItemSort = Literal[
    "updated_desc",
    "updated_asc",
    "created_desc",
    "created_asc",
    "title_asc",
    "level_asc",
    "level_desc",
    "perceived_level_asc",
    "perceived_level_desc",
    "status_asc",
]
MAX_QUESTIONS_BY_LENGTH: dict[LengthType, int] = {
    "short": 1,
    "medium": 3,
    "long": 4,
}


def validate_question_count(
    questions: list[ReadingQuestionInput], length_type: LengthType, content_source: str
) -> None:
    if content_source == "ai" and len(questions) != 1:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="AI 생성 문항은 문제를 하나만 가질 수 있습니다.",
        )
    maximum = MAX_QUESTIONS_BY_LENGTH[length_type]
    if not 1 <= len(questions) <= maximum:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=f"{length_type} 유형은 문제를 1~{maximum}개 등록할 수 있습니다.",
        )


def validate_explanation_choice_references(
    questions: list[ReadingQuestionInput],
) -> None:
    explanations = (
        explanation
        for question in questions
        for explanation in (
            question.explanation,
            *(choice.wrong_explanation for choice in question.choices),
        )
    )
    if any(has_choice_position_reference(explanation) for explanation in explanations):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=(
                "해설에는 선택지 번호를 쓸 수 없습니다. 정답 문장과 지문의 근거를 "
                "직접 설명해 주세요."
            ),
        )


def legacy_question(
    question: str | None,
    explanation: str | None,
    choices: list[ReadingChoiceInput] | None,
) -> ReadingQuestionInput:
    return ReadingQuestionInput(
        question=question or "",
        explanation=explanation or "",
        choices=choices or [],
    )


async def get_admin_item(session: AsyncSession, item_id: UUID) -> ReadingItem:
    item = await session.scalar(
        select(ReadingItem)
        .where(ReadingItem.id == item_id)
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


async def serialize_detail(
    session: AsyncSession,
    item: ReadingItem,
    metrics: ItemMetrics,
) -> AdminReadingItemDetail:
    summary = serialize_public_summary(item, metrics, None)
    reports = list(
        await session.scalars(
            select(ItemReport)
            .where(ItemReport.reading_item_id == item.id)
            .order_by(ItemReport.created_at.desc(), ItemReport.id.desc())
        )
    )
    validations = list(
        await session.scalars(
            select(ItemValidation)
            .where(ItemValidation.reading_item_id == item.id)
            .order_by(ItemValidation.created_at.asc(), ItemValidation.id.asc())
        )
    )
    highlight_count = int(
        await session.scalar(
            select(func.count())
            .select_from(PassageHighlight)
            .where(PassageHighlight.reading_item_id == item.id)
        )
        or 0
    )
    return AdminReadingItemDetail(
        **summary.model_dump(),
        passage=item.passage,
        question=item.question,
        explanation=item.explanation,
        choices=[
            ReadingChoiceInput(
                id=choice.id,
                text=choice.text,
                is_correct=choice.is_correct,
                wrong_explanation=choice.wrong_explanation,
            )
            for choice in item.choices
        ],
        questions=[
            ReadingQuestionInput(
                id=question.id,
                question=question.question,
                explanation=question.explanation,
                choices=[
                    ReadingChoiceInput(
                        id=choice.id,
                        text=choice.text,
                        is_correct=choice.is_correct,
                        wrong_explanation=choice.wrong_explanation,
                    )
                    for choice in question.choices
                ],
            )
            for question in item.questions
        ],
        quality_average=(
            float(metrics["quality_average"])
            if metrics["quality_average"] is not None
            else None
        ),
        report_count=int(metrics["report_count"] or 0),
        challenger_count=int(metrics["challenger_count"] or 0),
        highlight_count=highlight_count,
        reports=[
            {
                "id": report.id,
                "content": report.content,
                "status": report.status,
                "created_at": report.created_at,
            }
            for report in reports
        ],
        validations=[
            {
                "validator_role": validation.validator_role,
                "model_id": validation.model_id,
                "status": validation.status,
                "score": validation.score,
                "issue_codes": validation.issue_codes,
                "evidence": validation.evidence,
                "created_at": validation.created_at,
            }
            for validation in validations
        ],
    )


def admin_level_order_expression():
    ranks = {
        level: rank
        for levels in LEVELS_BY_LANGUAGE.values()
        for rank, level in enumerate(levels, start=1)
    }
    return case(ranks, value=ReadingItem.official_level, else_=0)


def admin_sort_clauses(sort: AdminItemSort, feedback_summary):
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
        level_order = admin_level_order_expression()
        return (level_order.desc(),) if sort.endswith("desc") else (level_order.asc(),)
    if sort.startswith("created"):
        return (
            (ReadingItem.created_at.desc(),)
            if sort.endswith("desc")
            else (ReadingItem.created_at.asc(),)
        )
    if sort.startswith("title"):
        return (ReadingItem.title.asc(),)
    if sort.startswith("status"):
        return (ReadingItem.status.asc(),)
    return (
        (ReadingItem.updated_at.desc(),)
        if sort.endswith("desc")
        else (ReadingItem.updated_at.asc(),)
    )


async def list_admin_items(
    session: AsyncSession,
    *,
    q: str | None = None,
    language: ReadingLanguage | None = None,
    level: ReadingLevel | None = None,
    length: LengthType | None = None,
    topic: str | None = None,
    item_status: AdminItemStatus | None = None,
    sort: AdminItemSort = "updated_desc",
    page: int = 1,
    page_size: int = 10,
) -> ReadingItemPage:
    if language and level and not is_level_for_language(language, level):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="The selected level does not belong to the content language.",
        )
    filters = []
    if q:
        filters.append(ReadingItem.title.ilike(f"%{q.strip()}%"))
    if level:
        filters.append(ReadingItem.official_level == level)
    if language:
        filters.append(ReadingItem.language == language)
    if length:
        filters.append(ReadingItem.length_type == length)
    if topic:
        filters.append(ReadingItem.topic == topic)
    if item_status:
        filters.append(ReadingItem.status == item_status)
    feedback_summary = (
        perceived_feedback_summary_query()
        if sort.startswith("perceived_level")
        else None
    )
    total_items = int(
        await session.scalar(
            select(func.count()).select_from(ReadingItem).where(*filters)
        )
        or 0
    )
    total_pages = max(1, math.ceil(total_items / page_size))
    page = min(page, total_pages)
    statement = select(ReadingItem).where(*filters)
    if feedback_summary is not None:
        statement = statement.outerjoin(
            feedback_summary,
            feedback_summary.c.reading_item_id == ReadingItem.id,
        )
    items = list(
        await session.scalars(
            statement.options(selectinload(ReadingItem.choices))
            .order_by(*admin_sort_clauses(sort, feedback_summary))
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
    )
    metrics_by_item = await collect_item_metrics(session, [item.id for item in items])
    return ReadingItemPage(
        items=[
            serialize_public_summary(item, metrics_by_item[item.id], None)
            for item in items
        ],
        page=page,
        page_size=page_size,
        total_items=total_items,
        total_pages=total_pages,
    )


async def get_admin_item_detail(
    session: AsyncSession, item_id: UUID
) -> AdminReadingItemDetail:
    item = await get_admin_item(session, item_id)
    metrics = await collect_item_metrics(session, [item.id])
    return await serialize_detail(session, item, metrics[item.id])


async def create_admin_item(
    session: AsyncSession, request: AdminReadingItemCreate
) -> AdminReadingItemDetail:
    questions = request.questions or [
        legacy_question(request.question, request.explanation, request.choices)
    ]
    validate_question_count(questions, request.length_type, "manual")
    validate_explanation_choice_references(questions)
    first_question = questions[0]
    item = ReadingItem(
        title=request.title.strip(),
        passage=request.passage.strip(),
        question=first_question.question.strip(),
        explanation=first_question.explanation.strip(),
        language=request.language,
        official_level=request.official_level,
        length_type=request.length_type,
        topic=request.topic.strip(),
        recommended_seconds=request.recommended_seconds,
        content_source="manual",
        status="review",
    )
    for question_index, question in enumerate(questions, start=1):
        target_question = ReadingQuestion(
            question=question.question.strip(),
            explanation=question.explanation.strip(),
            canonical_order=question_index,
        )
        target_question.choices = [
            ReadingChoice(
                reading_item=item,
                text=choice.text.strip(),
                canonical_order=choice_index,
                is_correct=choice.is_correct,
                wrong_explanation=(
                    choice.wrong_explanation.strip()
                    if choice.wrong_explanation
                    else None
                ),
            )
            for choice_index, choice in enumerate(question.choices, start=1)
        ]
        item.questions.append(target_question)
    session.add(item)
    await session.commit()
    return await get_admin_item_detail(session, item.id)


async def update_admin_item(
    session: AsyncSession,
    item_id: UUID,
    request: AdminReadingItemUpdate,
) -> AdminReadingItemDetail:
    item = await get_admin_item(session, item_id)
    passage_changed = request.passage is not None and request.passage != item.passage
    if passage_changed:
        highlight_count = int(
            await session.scalar(
                select(func.count())
                .select_from(PassageHighlight)
                .where(PassageHighlight.reading_item_id == item.id)
            )
            or 0
        )
        if highlight_count:
            if not request.clear_passage_highlights:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail={"code": "HIGHLIGHTS_REQUIRE_CONFIRMATION"},
                )
            await session.execute(
                delete(PassageHighlight).where(PassageHighlight.reading_item_id == item.id)
            )

    values = request.model_dump(
        exclude_none=True,
        exclude={"choices", "questions", "clear_passage_highlights"},
    )
    for key, value in values.items():
        setattr(
            item,
            key,
            value if key == "passage" else value.strip() if isinstance(value, str) else value,
        )

    if not is_level_for_language(item.language, item.official_level):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="The selected level does not belong to the content language.",
        )

    if request.questions is not None:
        validate_question_count(request.questions, item.length_type, item.content_source)
        validate_explanation_choice_references(request.questions)
        existing_questions = {question.id: question for question in item.questions}
        next_questions: list[ReadingQuestion] = []
        for question_index, question in enumerate(request.questions, start=1):
            target_question = (
                existing_questions.get(question.id) if question.id else None
            ) or ReadingQuestion()
            target_question.question = question.question.strip()
            target_question.explanation = question.explanation.strip()
            target_question.canonical_order = question_index
            existing_choices = {choice.id: choice for choice in target_question.choices}
            next_choices: list[ReadingChoice] = []
            for choice_index, choice in enumerate(question.choices, start=1):
                target_choice = (
                    existing_choices.get(choice.id) if choice.id else None
                ) or ReadingChoice(reading_item=item)
                target_choice.text = choice.text.strip()
                target_choice.canonical_order = choice_index
                target_choice.is_correct = choice.is_correct
                target_choice.wrong_explanation = (
                    choice.wrong_explanation.strip()
                    if choice.wrong_explanation
                    else None
                )
                next_choices.append(target_choice)
            target_question.choices[:] = next_choices
            next_questions.append(target_question)
        item.questions[:] = next_questions
        item.question = next_questions[0].question
        item.explanation = next_questions[0].explanation
    elif request.choices is not None:
        validate_explanation_choice_references(
            [
                ReadingQuestionInput(
                    question=item.question,
                    explanation=(
                        request.explanation
                        if request.explanation is not None
                        else item.explanation
                    ),
                    choices=request.choices,
                )
            ]
        )
        existing_choices = {choice.id: choice for choice in item.choices}
        next_choices: list[ReadingChoice] = []
        for index, choice in enumerate(request.choices, start=1):
            existing = existing_choices.get(choice.id) if choice.id else None
            target = existing or ReadingChoice(reading_item_id=item.id)
            target.text = choice.text.strip()
            target.canonical_order = index
            target.is_correct = choice.is_correct
            target.wrong_explanation = (
                choice.wrong_explanation.strip() if choice.wrong_explanation else None
            )
            next_choices.append(target)
        item.choices[:] = next_choices
    elif request.explanation is not None:
        validate_explanation_choice_references(
            [
                ReadingQuestionInput(
                    question=item.question,
                    explanation=request.explanation,
                    choices=[
                        ReadingChoiceInput(
                            text=choice.text,
                            is_correct=choice.is_correct,
                            wrong_explanation=choice.wrong_explanation,
                        )
                        for choice in item.choices
                    ],
                )
            ]
        )

    await session.commit()
    return await get_admin_item_detail(session, item.id)


async def update_admin_item_status(
    session: AsyncSession, item_id: UUID, target_status: AdminItemStatus
) -> AdminReadingItemDetail:
    item = await get_admin_item(session, item_id)
    if target_status == "review" and item.status != "held":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Only held items can be returned to review.",
        )
    item.status = target_status
    if target_status == "published" and item.published_at is None:
        item.published_at = datetime.now(UTC)
    await session.commit()
    return await get_admin_item_detail(session, item.id)


async def delete_admin_item(session: AsyncSession, item_id: UUID) -> None:
    item = await get_admin_item(session, item_id)
    await session.delete(item)
    await session.commit()
