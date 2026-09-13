from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import pytest
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.dialects import postgresql
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import selectinload

from app.api.routes.readings import (
    bookmark_reading_item,
    create_passage_highlight,
    delete_passage_highlight,
    delete_reading_bookmark,
    get_attempt_state,
    list_passage_highlights,
    list_published_reading_items,
    list_user_passage_highlights,
    selected_text_for_offsets,
    start_attempt,
    submit_attempt,
)
from app.core.security import CurrentUser
from app.db.base import Base
from app.db.models import Attempt, ItemBookmark, ReadingChoice, ReadingItem, User
from app.schemas import AttemptSubmitRequest, PassageHighlightCreateRequest
from app.services.attempts import elapsed_seconds_since, get_owned_attempt_for_update
from app.services.learning_statistics import get_user_statistics


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
async def test_started_attempt_persists_the_issued_choice_order(
    sessions: async_sessionmaker[AsyncSession],
) -> None:
    user, _, _ = await make_open_attempt(sessions)
    async with sessions() as session:
        item_id = await session.scalar(select(ReadingItem.id))
        assert item_id is not None
        started = await start_attempt(item_id, session, user)
        attempt = await session.get(Attempt, started.id)

    assert attempt is not None
    assert attempt.choice_order == [str(choice.id) for choice in started.choices]


@pytest.mark.asyncio
async def test_attempt_state_restores_issued_order_and_submitted_result(
    sessions: async_sessionmaker[AsyncSession],
) -> None:
    user, attempt_id, correct_choice_id = await make_open_attempt(sessions)
    async with sessions() as session:
        attempt = await session.get(Attempt, attempt_id)
        assert attempt is not None
        item = await session.scalar(
            select(ReadingItem).options(selectinload(ReadingItem.choices))
        )
        assert item is not None
        ordered_ids = [str(choice.id) for choice in reversed(item.choices)]
        attempt.choice_order = ordered_ids
        await session.commit()

        active = await get_attempt_state(attempt_id, session, user)
        assert [str(choice.id) for choice in active.item.choices] == ordered_ids
        assert active.submitted is False
        assert active.result is None

        await submit_attempt(
            attempt_id,
            AttemptSubmitRequest(
                selected_choice_id=correct_choice_id, client_elapsed_seconds=30
            ),
            session,
            user,
        )
        restored = await get_attempt_state(attempt_id, session, user)

    assert restored.submitted is True
    assert restored.result is not None
    assert restored.result.selected_choice_id == correct_choice_id
    assert [str(choice.id) for choice in restored.item.choices] == ordered_ids


@pytest.mark.asyncio
async def test_list_keeps_first_submission_timeout_after_a_retry(
    sessions: async_sessionmaker[AsyncSession],
) -> None:
    user, attempt_id, correct_choice_id = await make_open_attempt(sessions)

    async with sessions() as session:
        first = await session.get(Attempt, attempt_id)
        assert first is not None
        first.is_correct = False
        first.elapsed_seconds = 181
        first.submitted_at = first.started_at + timedelta(seconds=181)
        session.add(
            Attempt(
                user_id=user.id,
                reading_item_id=first.reading_item_id,
                selected_choice_id=correct_choice_id,
                is_correct=True,
                started_at=first.submitted_at + timedelta(seconds=1),
                submitted_at=first.submitted_at + timedelta(seconds=46),
                elapsed_seconds=45,
            )
        )
        await session.commit()

        page = await list_published_reading_items(session=session, current_user=user)

    assert page.items[0].my_first_submission_timed_out is True
    assert page.items[0].my_latest_status == "correct"
    assert page.items[0].my_score == 80
    assert page.items[0].my_score_reason == "retry_passed"


@pytest.mark.asyncio
async def test_list_keeps_a_first_submission_score_after_later_attempts(
    sessions: async_sessionmaker[AsyncSession],
) -> None:
    user, attempt_id, _ = await make_open_attempt(sessions)

    async with sessions() as session:
        first = await session.get(Attempt, attempt_id)
        assert first is not None
        first.is_correct = True
        first.elapsed_seconds = 45
        first.submitted_at = first.started_at + timedelta(seconds=45)
        session.add(
            Attempt(
                user_id=user.id,
                reading_item_id=first.reading_item_id,
                is_correct=False,
                started_at=first.submitted_at + timedelta(seconds=1),
                submitted_at=first.submitted_at + timedelta(seconds=46),
                elapsed_seconds=45,
            )
        )
        await session.commit()

        page = await list_published_reading_items(session=session, current_user=user)
        passed_page = await list_published_reading_items(
            session=session, current_user=user, attempt_status="correct"
        )
        wrong_page = await list_published_reading_items(
            session=session, current_user=user, attempt_status="wrong"
        )

    assert page.items[0].my_latest_status == "wrong"
    assert page.items[0].my_score == 100
    assert page.items[0].my_score_reason == "first_submission_on_time"
    assert passed_page.total_items == 1
    assert wrong_page.total_items == 0


@pytest.mark.asyncio
async def test_list_scores_a_timed_out_first_submission_as_90(
    sessions: async_sessionmaker[AsyncSession],
) -> None:
    user, attempt_id, _ = await make_open_attempt(sessions)

    async with sessions() as session:
        first = await session.get(Attempt, attempt_id)
        assert first is not None
        first.is_correct = True
        first.elapsed_seconds = 181
        first.submitted_at = first.started_at + timedelta(seconds=181)
        await session.commit()

        page = await list_published_reading_items(session=session, current_user=user)

    assert page.items[0].my_score == 90
    assert page.items[0].my_score_reason == "first_submission_timed_out"


@pytest.mark.asyncio
async def test_passage_highlights_persist_per_user_and_can_be_removed(
    sessions: async_sessionmaker[AsyncSession],
) -> None:
    user, _, _ = await make_open_attempt(sessions)

    async with sessions() as session:
        item = await session.scalar(select(ReadingItem))
        assert item is not None
        start_offset = item.passage.index("근거")
        created = await create_passage_highlight(
            item.id,
            PassageHighlightCreateRequest(
                start_offset=start_offset,
                end_offset=start_offset + len("근거"),
                selected_text="근거",
            ),
            session,
            user,
        )
        saved = await list_passage_highlights(item.id, session, user)

        await delete_passage_highlight(item.id, created.id, session, user)
        remaining = await list_passage_highlights(item.id, session, user)

    assert [(highlight.start_offset, highlight.selected_text) for highlight in saved] == [
        (start_offset, "근거")
    ]
    assert remaining == []


@pytest.mark.asyncio
async def test_highlight_collection_includes_item_context(
    sessions: async_sessionmaker[AsyncSession],
) -> None:
    user, _, _ = await make_open_attempt(sessions)

    async with sessions() as session:
        item = await session.scalar(select(ReadingItem))
        assert item is not None
        start_offset = item.passage.index("근거")
        await create_passage_highlight(
            item.id,
            PassageHighlightCreateRequest(
                start_offset=start_offset,
                end_offset=start_offset + len("근거"),
                selected_text="근거",
            ),
            session,
            user,
        )
        collection = await list_user_passage_highlights(session, user)

    assert collection.total_items == 1
    assert collection.items[0].reading_item_id == item.id
    assert collection.items[0].title == item.title
    assert collection.items[0].highlights[0].selected_text == "근거"


@pytest.mark.asyncio
async def test_highlight_collection_groups_by_item_and_prioritizes_recent_submission(
    sessions: async_sessionmaker[AsyncSession],
) -> None:
    user, _, _ = await make_open_attempt(sessions)
    submitted_item_id = uuid4()

    async with sessions() as session:
        first_item = await session.scalar(select(ReadingItem))
        assert first_item is not None
        first_start = first_item.passage.index("근거")
        await create_passage_highlight(
            first_item.id,
            PassageHighlightCreateRequest(
                start_offset=first_start,
                end_offset=first_start + len("근거"),
                selected_text="근거",
            ),
            session,
            user,
        )
        submitted_item = ReadingItem(
            id=submitted_item_id,
            title="최근에 제출한 문항",
            passage="중요한 문장을 다시 확인한다.",
            question="질문입니다.",
            explanation="해설입니다.",
            language="ko",
            official_level="TOPIK 3급",
            length_type="medium",
            topic="교육",
            recommended_seconds=300,
            status="published",
            published_at=datetime.now(UTC),
        )
        session.add(submitted_item)
        session.add(
            Attempt(
                id=uuid4(),
                user_id=user.id,
                reading_item_id=submitted_item_id,
                started_at=datetime.now(UTC) - timedelta(minutes=5),
                submitted_at=datetime.now(UTC),
                elapsed_seconds=300,
                is_correct=True,
            )
        )
        await session.commit()
        submitted_start = submitted_item.passage.index("중요한")
        await create_passage_highlight(
            submitted_item.id,
            PassageHighlightCreateRequest(
                start_offset=submitted_start,
                end_offset=submitted_start + len("중요한"),
                selected_text="중요한",
            ),
            session,
            user,
        )

        collection = await list_user_passage_highlights(
            session,
            user,
            page=1,
            page_size=20,
        )
        filtered = await list_user_passage_highlights(
            session,
            user,
            language="ko",
            query="최근에 제출",
            page=1,
            page_size=1,
        )

    assert collection.total_items == 2
    assert collection.items[0].reading_item_id == submitted_item_id
    assert collection.items[0].last_submitted_at is not None
    assert filtered.total_items == 1
    assert filtered.items[0].reading_item_id == submitted_item_id
    assert [highlight.selected_text for highlight in filtered.items[0].highlights] == [
        "중요한"
    ]


@pytest.mark.asyncio
async def test_bookmarks_are_per_user_and_combine_with_language_filters(
    sessions: async_sessionmaker[AsyncSession],
) -> None:
    user, _, _ = await make_open_attempt(sessions)
    other_user = CurrentUser(id=uuid4(), role="learner")
    korean_item_id = uuid4()

    async with sessions() as session:
        session.add(User(id=other_user.id, role="learner"))
        session.add(
            ReadingItem(
                id=korean_item_id,
                title="한국어 북마크",
                passage="한국어 지문입니다.",
                question="질문입니다.",
                explanation="해설입니다.",
                language="ko",
                official_level="TOPIK 3급",
                length_type="short",
                topic="교육",
                recommended_seconds=180,
                status="published",
                published_at=datetime.now(UTC),
            )
        )
        await session.commit()
        japanese_item_id = await session.scalar(
            select(ReadingItem.id).where(ReadingItem.language == "ja")
        )
        assert japanese_item_id is not None

        assert (await bookmark_reading_item(japanese_item_id, session, user)).is_bookmarked
        assert (await bookmark_reading_item(korean_item_id, session, user)).is_bookmarked

        japanese = await list_published_reading_items(
            session=session,
            current_user=user,
            language="ja",
            bookmarked=True,
        )
        korean = await list_published_reading_items(
            session=session,
            current_user=user,
            language="ko",
            bookmarked=True,
        )
        other_user_page = await list_published_reading_items(
            session=session,
            current_user=other_user,
        )

        assert [item.id for item in japanese.items] == [japanese_item_id]
        assert [item.id for item in korean.items] == [korean_item_id]
        assert japanese.items[0].is_bookmarked is True
        assert all(item.is_bookmarked is False for item in other_user_page.items)
        assert await session.scalar(select(ItemBookmark.id)) is not None

        removed = await delete_reading_bookmark(japanese_item_id, session, user)
        after_removal = await list_published_reading_items(
            session=session,
            current_user=user,
            language="ja",
            bookmarked=True,
        )

    assert removed.is_bookmarked is False
    assert after_removal.items == []


def test_highlight_offsets_do_not_split_utf16_surrogate_pairs() -> None:
    passage = "가😀나"

    assert selected_text_for_offsets(passage, 1, 4) == "😀나"
    assert selected_text_for_offsets(passage, 2, 4) is None


@pytest.mark.asyncio
async def test_statistics_use_only_a_learner_first_submitted_attempt(
    sessions: async_sessionmaker[AsyncSession],
) -> None:
    user, attempt_id, _ = await make_open_attempt(sessions)

    async with sessions() as session:
        first = await session.get(Attempt, attempt_id)
        assert first is not None
        first.is_correct = True
        first.elapsed_seconds = 42
        first.submitted_at = first.started_at + timedelta(seconds=42)
        session.add(
            Attempt(
                user_id=user.id,
                reading_item_id=first.reading_item_id,
                is_correct=False,
                started_at=first.submitted_at + timedelta(seconds=1),
                submitted_at=first.submitted_at + timedelta(seconds=70),
                elapsed_seconds=69,
            )
        )
        await session.commit()

        statistics = await get_user_statistics(session, user.id)

    assert statistics.completed_count == 1
    assert statistics.total_generated_count == 1
    assert statistics.accuracy == 100
    assert statistics.average_elapsed_seconds == 42
    assert next(group for group in statistics.by_language if group.key == "ja").accuracy == 100


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
