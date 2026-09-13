import random
from collections.abc import Iterable
from datetime import UTC, datetime
from typing import Literal
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.security import CurrentUser
from app.db.models import (
    Attempt,
    AttemptAnswer,
    ReadingChoice,
    ReadingItem,
    ReadingQuestion,
)
from app.schemas import (
    AttemptItemDetail,
    AttemptQuestion,
    AttemptQuestionAnswer,
    AttemptQuestionResult,
    AttemptResult,
    AttemptStarted,
    AttemptState,
    AttemptSubmitRequest,
    ReadingChoicePublic,
)
from app.services.item_metrics import (
    collect_item_metrics,
    first_submissions_by_user_item,
    serialize_public_summary,
)


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
                return latest_status, first_submission_timed_out, 90, "first_submission_timed_out"
            return latest_status, first_submission_timed_out, 100, "first_submission_on_time"
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


async def start_attempt(
    session: AsyncSession, item: ReadingItem, current_user: CurrentUser
) -> AttemptStarted:
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
        choices = random.SystemRandom().sample(question.choices, k=len(question.choices))
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
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attempt not found.")
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
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attempt not found.")
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


async def get_attempt_state(
    session: AsyncSession, attempt_id: UUID, current_user: CurrentUser
) -> AttemptState:
    attempt = await get_owned_attempt(session, attempt_id, current_user)
    if attempt.abandoned_at:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attempt not found.")
    item = await session.scalar(
        select(ReadingItem)
        .where(ReadingItem.id == attempt.reading_item_id)
        .options(
            selectinload(ReadingItem.choices),
            selectinload(ReadingItem.questions).selectinload(ReadingQuestion.choices),
        )
    )
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item not found.")

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
    latest_status, timed_out, score, score_reason = learner_progress_for_submissions(
        submissions, item.recommended_seconds
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
            await serialize_attempt_result(session, attempt, item) if submitted else None
        ),
    )


async def get_published_item_for_attempt(
    session: AsyncSession, item_id: UUID
) -> ReadingItem:
    item = await session.scalar(
        select(ReadingItem)
        .where(ReadingItem.id == item_id, ReadingItem.status == "published")
        .options(
            selectinload(ReadingItem.choices),
            selectinload(ReadingItem.questions).selectinload(ReadingQuestion.choices),
        )
    )
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item not found.")
    return item


async def submit_attempt(
    session: AsyncSession,
    attempt_id: UUID,
    request: AttemptSubmitRequest,
    current_user: CurrentUser,
) -> AttemptResult:
    attempt = await get_owned_attempt_for_update(session, attempt_id, current_user)
    if attempt.submitted_at or attempt.abandoned_at:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This attempt is already closed.",
        )

    item = await get_published_item_for_attempt(session, attempt.reading_item_id)
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
    submitted_by_question = {
        answer.question_id: answer.selected_choice_id for answer in submitted_answers
    }
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


async def abandon_attempt(
    session: AsyncSession, attempt_id: UUID, current_user: CurrentUser
) -> None:
    attempt = await get_owned_attempt_for_update(session, attempt_id, current_user)
    if not attempt.submitted_at and not attempt.abandoned_at:
        attempt.abandoned_at = datetime.now(UTC)
        await session.commit()
