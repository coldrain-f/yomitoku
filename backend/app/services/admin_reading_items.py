from datetime import UTC, datetime
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import PassageHighlight, ReadingChoice, ReadingItem, ReadingQuestion
from app.schemas import (
    AdminReadingItemCreate,
    AdminReadingItemDetail,
    AdminReadingItemUpdate,
    LengthType,
    ReadingChoiceInput,
    ReadingQuestionInput,
)
from app.services.admin_item_queries import (
    AdminItemStatus,
    get_admin_item,
    get_admin_item_detail,
)
from app.services.reading_policy import is_level_for_language
from app.services.validation import has_choice_position_reference

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
