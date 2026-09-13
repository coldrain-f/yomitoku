from collections.abc import Iterable
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import (
    Attempt,
    AttemptAnswer,
    ReadingChoice,
    ReadingItem,
    ReadingQuestion,
)
from app.schemas import (
    AttemptQuestion,
    AttemptQuestionResult,
    AttemptResult,
    ReadingChoicePublic,
)
from app.services.item_metrics import first_submissions_by_user_item


def public_choices(choices: Iterable[ReadingChoice]) -> list[ReadingChoicePublic]:
    return [ReadingChoicePublic(id=choice.id, text=choice.text) for choice in choices]


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


async def serialize_attempt_result(
    session: AsyncSession,
    attempt: Attempt,
    item: ReadingItem,
    *,
    questions: list[ReadingQuestion],
    attempt_answers: list[AttemptAnswer],
) -> AttemptResult:
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
    accuracy, challenger_count = await item_outcomes(session, item.id)
    first_result = question_results[0]
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
