from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import GenerationJob, User


async def make_user(
    session: AsyncSession,
    *,
    role: str = "learner",
    user_id: UUID | None = None,
) -> User:
    user = User(id=user_id or uuid4(), role=role)
    session.add(user)
    await session.flush()
    return user


async def make_generation_job(
    session: AsyncSession,
    *,
    requested_by: UUID,
    status: str = "generating",
    job_id: UUID | None = None,
    current_node: str | None = None,
    started_at: datetime | None = None,
    heartbeat_at: datetime | None = None,
) -> GenerationJob:
    job_id = job_id or uuid4()
    job = GenerationJob(
        id=job_id,
        requested_by=requested_by,
        graph_thread_id=str(job_id),
        status=status,
        current_node=current_node or status,
        language="ja",
        official_level="N2",
        length_type="short",
        topic="교육",
        keywords=[],
        generator_model="claude-fable-5-1",
        answer_validator_model="claude-fable-5-1",
        quality_validator_model="claude-fable-5-1",
        prompt_version="v5",
        started_at=started_at,
        heartbeat_at=heartbeat_at,
    )
    session.add(job)
    await session.flush()
    return job
