from __future__ import annotations

from collections.abc import Awaitable, Callable
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from uuid import UUID, uuid4

from pydantic import BaseModel
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.db.models import GenerationJob, GenerationUsageEvent
from app.services.generation_provider import (
    GenerationStructuredOutputError,
    ModelUsage,
    ProviderResult,
    estimate_usage_cost,
)

RUNNING_STATUSES = ("generating", "validating", "revising", "retrying")
ACTIVE_STATUSES = ("queued", *RUNNING_STATUSES)


async def lock_job(session: AsyncSession, job_id: UUID) -> GenerationJob:
    job = await session.scalar(
        select(GenerationJob).where(GenerationJob.id == job_id).with_for_update()
    )
    if job is None:
        raise RuntimeError(f"Generation job {job_id} was not found.")
    return job


def require_active(job: GenerationJob) -> None:
    if job.status not in ACTIVE_STATUSES or job.completed_at is not None:
        raise RuntimeError("Generation job is no longer active.")


def refresh_usage_totals(job: GenerationJob) -> None:
    recorded = [event for event in job.usage_events if event.usage_status == "recorded"]
    job.input_tokens = sum(
        event.input_tokens + event.cache_creation_input_tokens + event.cache_read_input_tokens
        for event in recorded
    ) if recorded else None
    job.output_tokens = sum(event.output_tokens for event in recorded) if recorded else None
    complete = len(recorded) == len(job.usage_events)
    job.actual_cost_usd = (
        sum(event.actual_cost_usd for event in recorded)
        if complete and all(event.actual_cost_usd is not None for event in recorded)
        else None
    )


async def begin_call(
    sessions: async_sessionmaker[AsyncSession], job_id: UUID, stage: str, model: str
) -> UUID:
    async with sessions() as session:
        job = await lock_job(session, job_id)
        require_active(job)
        event = GenerationUsageEvent(
            id=uuid4(),
            event_index=max((entry.event_index for entry in job.usage_events), default=0) + 1,
            stage=stage, model_id=model, usage_status="pending",
        )
        job.usage_events.append(event)
        refresh_usage_totals(job)
        await session.commit()
        return event.id


async def finish_call(
    sessions: async_sessionmaker[AsyncSession], job_id: UUID, event_id: UUID,
    usage: ModelUsage | None,
) -> None:
    async with sessions() as session:
        job = await lock_job(session, job_id)
        event = next(entry for entry in job.usage_events if entry.id == event_id)
        if event.usage_status == "recorded":
            return
        event.usage_status = "recorded" if usage is not None else "unknown"
        if usage is not None:
            event.model_id = usage.model
            event.input_tokens = usage.input_tokens
            event.cache_creation_input_tokens = usage.cache_creation_input_tokens
            event.cache_read_input_tokens = usage.cache_read_input_tokens
            event.output_tokens = usage.output_tokens
            cost = estimate_usage_cost(usage)
            event.actual_cost_usd = Decimal(str(cost)) if cost is not None else None
            event.stop_reason = usage.stop_reason
        refresh_usage_totals(job)
        await session.commit()


async def tracked_call[T: BaseModel](
    sessions: async_sessionmaker[AsyncSession], job_id: str, stage: str, model: str,
    call: Callable[[], Awaitable[ProviderResult[T]]],
) -> ProviderResult[T]:
    identity = UUID(job_id)
    event_id = await begin_call(sessions, identity, stage, model)
    try:
        result = await call()
    except BaseException as error:
        usage = error.usage if isinstance(error, GenerationStructuredOutputError) else None
        await finish_call(sessions, identity, event_id, usage)
        raise
    await finish_call(sessions, identity, event_id, result.usage)
    return result


def fail_job(job: GenerationJob, code: str, detail: str) -> None:
    job.status = "failed"
    job.current_node = "failed"
    job.error_code = code
    job.error_detail = detail
    job.completed_at = datetime.now(UTC)
    for event in job.usage_events:
        if event.usage_status == "pending":
            event.usage_status = "unknown"
    refresh_usage_totals(job)


async def mark_failed(
    sessions: async_sessionmaker[AsyncSession], job_id: UUID, code: str, detail: str
) -> None:
    async with sessions() as session:
        job = await lock_job(session, job_id)
        if job.status in ACTIVE_STATUSES and job.completed_at is None:
            fail_job(job, code, detail)
            await session.commit()


async def reap_stale_jobs(
    sessions: async_sessionmaker[AsyncSession], lease_seconds: float, timeout_seconds: float
) -> int:
    now = datetime.now(UTC)
    async with sessions() as session:
        jobs = (await session.scalars(
            select(GenerationJob).where(
                GenerationJob.status.in_(RUNNING_STATUSES),
                or_(
                    func.coalesce(GenerationJob.heartbeat_at, GenerationJob.started_at,
                                  GenerationJob.updated_at) < now - timedelta(seconds=lease_seconds),
                    GenerationJob.started_at < now - timedelta(seconds=timeout_seconds),
                ),
            ).with_for_update(skip_locked=True)
        )).all()
        for job in jobs:
            fail_job(
                job, "generation_interrupted",
                "생성 작업이 중단되었거나 제한 시간을 초과했습니다. 자동 재생성은 하지 않았습니다.",
            )
        await session.commit()
        return len(jobs)
