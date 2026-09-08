from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID, uuid4

import pytest
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.api.routes.admin import create_admin_reading_item
from app.api.routes.readings import start_attempt, submit_attempt
from app.core.security import CurrentUser
from app.db.base import Base
from app.db.models import ReadingChoice, ReadingItem, ReadingQuestion, User
from app.schemas import (
    AdminReadingItemCreate,
    AttemptQuestionAnswer,
    AttemptSubmitRequest,
    ReadingChoiceInput,
    ReadingQuestionInput,
)


@pytest.fixture
async def sessions() -> async_sessionmaker[AsyncSession]:
    engine = create_async_engine("sqlite+aiosqlite://")
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    try:
        yield factory
    finally:
        await engine.dispose()


async def make_multi_question_item(
    session: AsyncSession,
) -> tuple[CurrentUser, UUID, dict[UUID, UUID]]:
    user_id = uuid4()
    item = ReadingItem(
        title="긴 글을 읽기",
        passage="한 지문으로 여러 내용을 확인합니다.",
        question="첫 문제",
        explanation="첫 해설",
        language="ja",
        official_level="N2",
        length_type="medium",
        topic="교육",
        recommended_seconds=360,
        content_source="manual",
        status="published",
        published_at=datetime.now(UTC),
    )
    correct_by_question: dict[UUID, UUID] = {}
    for question_index in range(1, 4):
        question_id = uuid4()
        question = ReadingQuestion(
            id=question_id,
            question=f"문제 {question_index}",
            explanation=f"해설 {question_index}",
            canonical_order=question_index,
        )
        correct_choice_id = uuid4()
        correct_by_question[question_id] = correct_choice_id
        question.choices = [
            ReadingChoice(
                reading_item=item,
                id=choice_id,
                text=f"{question_index}-{choice_index}",
                canonical_order=choice_index,
                is_correct=choice_id == correct_choice_id,
            )
            for choice_index, choice_id in enumerate(
                [correct_choice_id, uuid4(), uuid4(), uuid4()], start=1
            )
        ]
        item.questions.append(question)
    session.add_all([User(id=user_id, role="learner"), item])
    await session.commit()
    return CurrentUser(id=user_id, role="learner"), item.id, correct_by_question


@pytest.mark.asyncio
async def test_any_wrong_answer_makes_a_multi_question_attempt_wrong(
    sessions: async_sessionmaker[AsyncSession],
) -> None:
    async with sessions() as session:
        user, item_id, correct_by_question = await make_multi_question_item(session)
        started = await start_attempt(item_id, session, user)
        assert len(started.questions) == 3
        answers = [
            AttemptQuestionAnswer(
                question_id=question.id,
                selected_choice_id=(
                    correct_by_question[question.id]
                    if index < 2
                    else next(
                        choice.id
                        for choice in question.choices
                        if choice.id != correct_by_question[question.id]
                    )
                ),
            )
            for index, question in enumerate(started.questions)
        ]

        result = await submit_attempt(
            started.id,
            AttemptSubmitRequest(answers=answers, client_elapsed_seconds=120),
            session,
            user,
        )

    assert result.is_correct is False
    assert [entry.is_correct for entry in result.question_results] == [True, True, False]


@pytest.mark.asyncio
async def test_manual_create_stores_up_to_three_medium_questions(
    sessions: async_sessionmaker[AsyncSession],
) -> None:
    user_id = uuid4()
    async with sessions() as session:
        session.add(User(id=user_id, role="admin"))
        await session.commit()
        result = await create_admin_reading_item(
            AdminReadingItemCreate(
                title="수동 중문",
                passage="중문 지문입니다.",
                language="ja",
                official_level="N2",
                length_type="medium",
                topic="교육",
                recommended_seconds=420,
                questions=[
                    ReadingQuestionInput(
                        question=f"문제 {index}",
                        explanation=f"해설 {index}",
                        choices=[
                            ReadingChoiceInput(
                                text=f"{index}-{choice}",
                                is_correct=choice == 1,
                            )
                            for choice in range(1, 5)
                        ],
                    )
                    for index in range(1, 4)
                ],
            ),
            session,
            CurrentUser(id=user_id, role="admin"),
        )

    assert result.content_source == "manual"
    assert [question.question for question in result.questions] == [
        "문제 1",
        "문제 2",
        "문제 3",
    ]
