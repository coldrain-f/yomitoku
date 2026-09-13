import random
from datetime import UTC, datetime
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.security import CurrentUser
from app.db.models import (
    Attempt,
    AttemptAnswer,
    ReadingItem,
    ReadingQuestion,
)
from app.schemas import (
    AttemptItemDetail,
    AttemptQuestionAnswer,
    AttemptResult,
    AttemptStarted,
    AttemptState,
    AttemptSubmitRequest,
)
from app.services.attempt_progress import learner_progress_for_submissions
from app.services.attempt_views import (
    choices_for_attempt,
    public_choices,
    public_questions,
    serialize_attempt_result,
)
from app.services.item_metrics import (
    collect_item_metrics,
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
            await serialize_attempt_result(
                session,
                attempt,
                item,
                questions=questions,
                attempt_answers=attempt_answers,
            )
            if submitted
            else None
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
    return await serialize_attempt_result(
        session,
        attempt,
        item,
        questions=questions,
        attempt_answers=attempt_answers,
    )


async def abandon_attempt(
    session: AsyncSession, attempt_id: UUID, current_user: CurrentUser
) -> None:
    attempt = await get_owned_attempt_for_update(session, attempt_id, current_user)
    if not attempt.submitted_at and not attempt.abandoned_at:
        attempt.abandoned_at = datetime.now(UTC)
        await session.commit()
