from typing import Annotated
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, Header, HTTPException, Response, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.security import CurrentUser, require_admin
from app.db.models import GenerationJob, ReadingItem, User
from app.db.session import get_session
from app.schemas import (
    GenerationConditions,
    GenerationJobResponse,
    ReadingItemPage,
    ReadingItemSummary,
)

router = APIRouter(prefix="/admin", tags=["admin"])


async def ensure_user(session: AsyncSession, current_user: CurrentUser) -> None:
    user = await session.get(User, current_user.id)
    if user:
        return
    session.add(User(id=current_user.id, role=current_user.role))
    await session.flush()


def serialize_generation_job(job: GenerationJob) -> GenerationJobResponse:
    return GenerationJobResponse(
        id=job.id,
        status=job.status,
        current_node=job.current_node,
        conditions=GenerationConditions(
            official_level=job.official_level,
            length_type=job.length_type,
            topic=job.topic,
        ),
        revision_count=job.revision_count,
        generated_item_id=job.generated_item_id,
        error_code=job.error_code,
        error_detail=job.error_detail,
        created_at=job.created_at,
        started_at=job.started_at,
        completed_at=job.completed_at,
    )


@router.post(
    "/generation-jobs",
    response_model=GenerationJobResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def create_generation_job(
    conditions: GenerationConditions,
    response: Response,
    session: Annotated[AsyncSession, Depends(get_session)],
    current_user: Annotated[CurrentUser, Depends(require_admin)],
    idempotency_key: Annotated[str | None, Header(alias="Idempotency-Key")] = None,
) -> GenerationJobResponse:
    if idempotency_key and len(idempotency_key) > 255:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Idempotency-Key must be 255 characters or fewer.",
        )

    await ensure_user(session, current_user)
    if idempotency_key:
        existing = await session.scalar(
            select(GenerationJob).where(
                GenerationJob.requested_by == current_user.id,
                GenerationJob.idempotency_key == idempotency_key,
            )
        )
        if existing:
            response.status_code = status.HTTP_200_OK
            return serialize_generation_job(existing)

    settings = get_settings()
    job_id = uuid4()
    job = GenerationJob(
        id=job_id,
        requested_by=current_user.id,
        idempotency_key=idempotency_key,
        graph_thread_id=str(job_id),
        status="queued",
        current_node="queued",
        official_level=conditions.official_level,
        length_type=conditions.length_type,
        topic=conditions.topic,
        generator_model=settings.generator_model,
        answer_validator_model=settings.answer_validator_model,
        quality_validator_model=settings.quality_validator_model,
        prompt_version="v1",
    )
    session.add(job)
    await session.commit()
    await session.refresh(job)
    return serialize_generation_job(job)


@router.get("/generation-jobs/{job_id}", response_model=GenerationJobResponse)
async def get_generation_job(
    job_id: UUID,
    session: Annotated[AsyncSession, Depends(get_session)],
    current_user: Annotated[CurrentUser, Depends(require_admin)],
) -> GenerationJobResponse:
    job = await session.get(GenerationJob, job_id)
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found.")
    return serialize_generation_job(job)


@router.get("/reading-items", response_model=ReadingItemPage)
async def list_admin_reading_items(
    session: Annotated[AsyncSession, Depends(get_session)],
    current_user: Annotated[CurrentUser, Depends(require_admin)],
    page: int = 1,
    page_size: int = 10,
) -> ReadingItemPage:
    page = max(page, 1)
    page_size = min(max(page_size, 1), 50)
    total_items = await session.scalar(select(func.count()).select_from(ReadingItem))
    rows = await session.scalars(
        select(ReadingItem)
        .order_by(ReadingItem.updated_at.desc(), ReadingItem.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    count = total_items or 0
    return ReadingItemPage(
        items=[ReadingItemSummary.model_validate(item) for item in rows],
        page=page,
        page_size=page_size,
        total_items=count,
        total_pages=max(1, (count + page_size - 1) // page_size),
    )
