from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID, uuid4

import pytest
from fastapi import HTTPException
from sqlalchemy.dialects import postgresql
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.api.routes.readings import (
    elapsed_seconds_since,
    get_owned_attempt_for_update,
    submit_attempt,
)
from app.core.security import CurrentUser
from app.db.base import Base
from app.db.models import Attempt, ReadingChoice, ReadingItem, User
from app.schemas import AttemptSubmitRequest


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


async def make_open_attempt(
    sessions: async_sessionmaker[AsyncSession],
) -> tuple[CurrentUser, UUID, UUID]:
    user_id = uuid4()
    item_id = uuid4()
    attempt_id = uuid4()
    correct_choice_id = uuid4()
    async with sessions() as session:
        session.add(User(id=user_id, role="learner"))
        item = ReadingItem(
            id=item_id,
            title="근거를 확인하기",
            passage="결과만 보지 않고 근거를 확인해야 한다.",
            question="글의 중심 내용은 무엇인가?",
            explanation="근거를 확인해야 한다.",
            language="ja",
            official_level="N2",
            length_type="short",
            topic="교육",
            recommended_seconds=180,
            status="published",
            published_at=datetime.now(UTC),
        )
        item.choices = [
            ReadingChoice(
                id=choice_id,
                text=f"선택지 {index}",
                canonical_order=index,
                is_correct=choice_id == correct_choice_id,
                wrong_explanation=None if choice_id == correct_choice_id else "본문과 다릅니다.",
            )
            for index, choice_id in enumerate(
                [uuid4(), correct_choice_id, uuid4(), uuid4()], start=1
            )
        ]
        session.add(item)
        session.add(
            Attempt(
                id=attempt_id,
                user_id=user_id,
                reading_item_id=item_id,
                started_at=datetime.now(UTC),
            )
        )
        await session.commit()
    return CurrentUser(id=user_id, role="learner"), attempt_id, correct_choice_id


@pytest.mark.asyncio
async def test_submission_closes_an_attempt_before_a_second_submission(
    sessions: async_sessionmaker[AsyncSession],
) -> None:
    user, attempt_id, correct_choice_id = await make_open_attempt(sessions)

    async with sessions() as session:
        first = await submit_attempt(
            attempt_id,
            AttemptSubmitRequest(
                selected_choice_id=correct_choice_id, client_elapsed_seconds=45
            ),
            session,
            user,
        )
        assert first.is_correct is True

    async with sessions() as session:
        with pytest.raises(HTTPException) as error:
            await submit_attempt(
                attempt_id,
                AttemptSubmitRequest(
                    selected_choice_id=correct_choice_id, client_elapsed_seconds=45
                ),
                session,
                user,
            )

    assert error.value.status_code == 409


@pytest.mark.asyncio
async def test_terminal_attempt_lookup_uses_a_postgres_row_lock() -> None:
    attempt = Attempt(id=uuid4(), user_id=uuid4(), reading_item_id=uuid4(), started_at=datetime.now(UTC))

    class RecordingSession:
        statement = None

        async def scalar(self, statement):
            self.statement = statement
            return attempt

    session = RecordingSession()
    await get_owned_attempt_for_update(session, attempt.id, CurrentUser(id=attempt.user_id, role="learner"))  # type: ignore[arg-type]

    assert session.statement is not None
    assert "FOR UPDATE" in str(session.statement.compile(dialect=postgresql.dialect()))


def test_elapsed_seconds_accepts_timezone_naive_database_values() -> None:
    assert elapsed_seconds_since(
        datetime(2026, 9, 5, 9, 0), datetime(2026, 9, 5, 9, 1, tzinfo=UTC)
    ) == 60
