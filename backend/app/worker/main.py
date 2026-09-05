from __future__ import annotations

import asyncio
import logging
from contextlib import suppress
from datetime import UTC, datetime
from uuid import UUID

from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
from sqlalchemy import select, update

from app.core.config import get_settings
from app.db.models import GenerationJob
from app.db.session import SessionLocal
from app.graphs.generation import build_generation_graph
from app.services.generation_jobs import RUNNING_STATUSES, mark_failed, reap_stale_jobs
from app.services.generation_provider import build_generation_provider

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


async def claim_next_job() -> UUID | None:
    async with SessionLocal() as session:
        result = await session.execute(
            select(GenerationJob)
            .where(GenerationJob.status == "queued")
            .order_by(GenerationJob.created_at)
            .with_for_update(skip_locked=True)
            .limit(1)
        )
        job = result.scalar_one_or_none()
        if not job:
            return None
        job.status = "generating"
        job.current_node = "claimed"
        job.started_at = datetime.now(UTC)
        job.heartbeat_at = job.started_at
        await session.commit()
        return job.id


async def maintain_jobs(job_id: UUID | None = None) -> None:
    settings = get_settings()
    while True:
        try:
            if job_id is not None:
                async with SessionLocal() as session:
                    await session.execute(
                        update(GenerationJob).where(
                            GenerationJob.id == job_id,
                            GenerationJob.status.in_(RUNNING_STATUSES),
                        ).values(heartbeat_at=datetime.now(UTC))
                    )
                    await session.commit()
            else:
                count = await reap_stale_jobs(
                    SessionLocal, settings.worker_lease_seconds,
                    settings.generation_job_timeout_seconds,
                )
                if count:
                    logger.warning("Marked %s interrupted generation jobs as failed", count)
        except Exception:
            logger.exception("Generation worker maintenance failed")
        await asyncio.sleep(settings.worker_lease_seconds / 3)


async def run_worker() -> None:
    settings = get_settings()
    provider = build_generation_provider(settings)
    async with AsyncPostgresSaver.from_conn_string(
        settings.langgraph_database_url
    ) as checkpointer:
        await checkpointer.setup()
        graph = build_generation_graph(SessionLocal, provider).compile(
            checkpointer=checkpointer
        )
        logger.info("Generation worker started with provider=%s", settings.generation_provider)
        maintenance = asyncio.create_task(maintain_jobs())
        try:
            await process_jobs(graph)
        finally:
            maintenance.cancel()
            with suppress(asyncio.CancelledError):
                await maintenance
            if hasattr(provider, "client"):
                await provider.client.close()


async def process_jobs(graph) -> None:
    settings = get_settings()
    while True:
        heartbeat = None
        job_id = None
        try:
            job_id = await claim_next_job()
            if not job_id:
                await asyncio.sleep(settings.worker_poll_interval_seconds)
                continue
            heartbeat = asyncio.create_task(maintain_jobs(job_id))
            async with asyncio.timeout(settings.generation_job_timeout_seconds):
                async with SessionLocal() as session:
                    job = await session.get(GenerationJob, job_id)
                    if not job:
                        continue
                    initial_state = {
                        "job_id": str(job.id),
                        "conditions": {
                            "language": job.language,
                            "official_level": job.official_level,
                            "length_type": job.length_type,
                            "topic": job.topic,
                            "keywords": job.keywords,
                        },
                        "models": {
                            "generator_model": job.generator_model,
                            "answer_validator_model": job.answer_validator_model,
                            "quality_validator_model": job.quality_validator_model,
                        },
                        "revision_count": job.revision_count,
                        "output_retry_count": 0,
                        "revision_feedback": [],
                        "usage_events": [],
                    }
                await graph.ainvoke(
                    initial_state,
                    {"configurable": {"thread_id": job.graph_thread_id}},
                )
                logger.info("Generation job completed: %s", job_id)
        except asyncio.CancelledError:
            if job_id:
                await mark_failed(
                    SessionLocal, job_id, "generation_interrupted",
                    "워커가 종료되어 생성 작업이 중단되었습니다. 자동 재생성은 하지 않았습니다.",
                )
            raise
        except Exception as error:
            logger.exception("Generation job failed: %s", job_id)
            if job_id:
                try:
                    await mark_failed(
                        SessionLocal, job_id,
                        "generation_timeout" if isinstance(error, TimeoutError) else type(error).__name__,
                        "생성 작업이 제한 시간을 초과했습니다. 자동 재생성은 하지 않았습니다."
                        if isinstance(error, TimeoutError)
                        else "생성 작업 처리 중 오류가 발생했습니다. 생성 이력에서 사용량을 확인해 주세요.",
                    )
                except Exception:
                    logger.exception("Could not mark failed job; lease expiry will recover it")
            await asyncio.sleep(settings.worker_poll_interval_seconds)
        finally:
            if heartbeat:
                heartbeat.cancel()
                with suppress(asyncio.CancelledError):
                    await heartbeat


def main() -> None:
    asyncio.run(run_worker())


if __name__ == "__main__":
    main()
