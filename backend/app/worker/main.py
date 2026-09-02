from __future__ import annotations

import asyncio
import logging
from datetime import UTC, datetime
from uuid import UUID

from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
from sqlalchemy import select

from app.core.config import get_settings
from app.db.models import GenerationJob
from app.db.session import SessionLocal
from app.graphs.generation import build_generation_graph
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
        await session.commit()
        return job.id


async def mark_job_failed(job_id: UUID, error: Exception) -> None:
    async with SessionLocal() as session:
        job = await session.get(GenerationJob, job_id)
        if not job:
            return
        job.status = "failed"
        job.current_node = "failed"
        job.error_code = type(error).__name__
        job.error_detail = str(error)[:4_000]
        job.completed_at = datetime.now(UTC)
        await session.commit()


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
        while True:
            job_id = await claim_next_job()
            if not job_id:
                await asyncio.sleep(settings.worker_poll_interval_seconds)
                continue

            try:
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
                        },
                        "models": {
                            "generator_model": job.generator_model,
                            "answer_validator_model": job.answer_validator_model,
                            "quality_validator_model": job.quality_validator_model,
                        },
                        "revision_count": job.revision_count,
                        "revision_feedback": [],
                        "usage_events": [],
                    }
                await graph.ainvoke(
                    initial_state,
                    {"configurable": {"thread_id": job.graph_thread_id}},
                )
                logger.info("Generation job completed: %s", job_id)
            except asyncio.CancelledError:
                raise
            except Exception as error:
                logger.exception("Generation job failed: %s", job_id)
                await mark_job_failed(job_id, error)


def main() -> None:
    asyncio.run(run_worker())


if __name__ == "__main__":
    main()
