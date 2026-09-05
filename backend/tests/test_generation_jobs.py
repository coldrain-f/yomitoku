from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import pytest
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.db.base import Base
from app.db.models import GenerationJob, User
from app.schemas import GeneratedTitle
from app.services.generation_jobs import (
    begin_call,
    mark_failed,
    reap_stale_jobs,
    tracked_call,
)
from app.services.generation_provider import (
    GenerationOutputTruncatedError,
    ModelUsage,
    ProviderResult,
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


async def make_job(sessions: async_sessionmaker[AsyncSession], *, status: str = "generating") -> UUID:
    user_id = uuid4()
    job_id = uuid4()
    async with sessions() as session:
        session.add(User(id=user_id, role="admin"))
        session.add(
            GenerationJob(
                id=job_id,
                requested_by=user_id,
                graph_thread_id=str(job_id),
                status=status,
                current_node=status,
                language="ja",
                official_level="N2",
                length_type="short",
                topic="교육",
                keywords=[],
                generator_model="claude-fable-5-1",
                answer_validator_model="claude-fable-5-1",
                quality_validator_model="claude-fable-5-1",
                prompt_version="v5",
                started_at=datetime.now(UTC),
                heartbeat_at=datetime.now(UTC),
            )
        )
        await session.commit()
    return job_id


@pytest.mark.asyncio
async def test_tracked_call_records_usage_before_returning(sessions: async_sessionmaker[AsyncSession]) -> None:
    job_id = await make_job(sessions)

    async def call() -> ProviderResult[GeneratedTitle]:
        return ProviderResult(
            GeneratedTitle(title="테스트"),
            ModelUsage(
                model="claude-fable-5-1", input_tokens=12, output_tokens=7,
                cache_creation_input_tokens=3, cache_read_input_tokens=8,
            ),
        )

    result = await tracked_call(sessions, str(job_id), "generate", "claude-fable-5-1", call)

    assert result.value.title == "테스트"
    async with sessions() as session:
        job = await session.get(GenerationJob, job_id)
        assert job is not None
        assert job.input_tokens == 23
        assert job.output_tokens == 7
        assert job.actual_cost_usd is not None
        assert [(event.stage, event.usage_status) for event in job.usage_events] == [
            ("generate", "recorded")
        ]


@pytest.mark.asyncio
async def test_tracked_call_records_truncated_response_usage(sessions: async_sessionmaker[AsyncSession]) -> None:
    job_id = await make_job(sessions)

    async def call() -> ProviderResult[GeneratedTitle]:
        raise GenerationOutputTruncatedError(
            "truncated", ModelUsage(model="claude-fable-5-1", input_tokens=10, output_tokens=99)
        )

    with pytest.raises(GenerationOutputTruncatedError):
        await tracked_call(sessions, str(job_id), "generate", "claude-fable-5-1", call)

    async with sessions() as session:
        job = await session.get(GenerationJob, job_id)
        assert job is not None
        assert job.output_tokens == 99
        assert job.usage_events[0].usage_status == "recorded"


@pytest.mark.asyncio
async def test_stale_job_is_failed_without_retrying(
    sessions: async_sessionmaker[AsyncSession],
) -> None:
    job_id = await make_job(sessions)
    async with sessions() as session:
        job = await session.get(GenerationJob, job_id)
        assert job is not None
        job.heartbeat_at = datetime.now(UTC) - timedelta(minutes=5)
        await session.commit()
    await begin_call(sessions, job_id, "generate", "claude-fable-5-1")

    assert await reap_stale_jobs(sessions, lease_seconds=30, timeout_seconds=900) == 1
    await mark_failed(sessions, job_id, "other", "should not overwrite terminal state")

    async with sessions() as session:
        job = await session.get(GenerationJob, job_id)
        assert job is not None
        assert job.status == "failed"
        assert job.error_code == "generation_interrupted"
        assert job.actual_cost_usd is None
        assert job.usage_events[0].usage_status == "unknown"
