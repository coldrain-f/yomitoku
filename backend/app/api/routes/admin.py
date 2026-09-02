import math
from datetime import UTC, datetime
from typing import Annotated, Literal
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import get_settings
from app.core.security import CurrentUser, require_admin
from app.db.models import (
    GenerationJob,
    ReadingChoice,
    ReadingItem,
)
from app.db.session import get_session
from app.schemas import (
    AdminReadingItemCreate,
    AdminReadingItemDetail,
    AdminReadingItemUpdate,
    GenerationConditions,
    GenerationJobResponse,
    GenerationJobCreateRequest,
    GenerationModelOptionsResponse,
    LengthType,
    ReadingLanguage,
    ReadingLevel,
    ReadingChoiceInput,
    ReadingItemPage,
    ReadingItemSummary,
)
from app.services.generation_topics import resolve_generation_topic
from app.services.item_metrics import ItemMetrics, collect_item_metrics
from app.services.reading_policy import (
    MINIMUM_PERCEIVED_LEVEL_VOTES,
    is_level_for_language,
    level_sort_key,
)
from app.services.users import ensure_user

router = APIRouter(prefix="/admin", tags=["admin"])

ItemStatus = Literal["review", "held", "published"]
PREFERRED_GENERATION_MODEL = "claude-fable-5"


def serialize_generation_job(job: GenerationJob) -> GenerationJobResponse:
    return GenerationJobResponse(
        id=job.id,
        status=job.status,
        current_node=job.current_node,
        conditions=GenerationConditions(
            language=job.language,
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


async def get_admin_item(session: AsyncSession, item_id: UUID) -> ReadingItem:
    item = await session.scalar(
        select(ReadingItem)
        .where(ReadingItem.id == item_id)
        .options(selectinload(ReadingItem.choices))
    )
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Item not found."
        )
    return item


def serialize_summary(
    item: ReadingItem,
    metrics: ItemMetrics,
) -> ReadingItemSummary:
    perceived_level = metrics["perceived_level"]
    vote_count = int(metrics["perceived_vote_count"] or 0)
    return ReadingItemSummary(
        id=item.id,
        title=item.title,
        language=item.language,
        official_level=item.official_level,
        length_type=item.length_type,
        topic=item.topic,
        recommended_seconds=item.recommended_seconds,
        status=item.status,
        published_at=item.published_at,
        created_at=item.created_at,
        updated_at=item.updated_at,
        perceived_level=perceived_level if isinstance(perceived_level, str) else None,
        perceived_level_visible=vote_count >= MINIMUM_PERCEIVED_LEVEL_VOTES,
        perceived_vote_count=vote_count,
    )


def serialize_detail(
    item: ReadingItem,
    metrics: ItemMetrics,
) -> AdminReadingItemDetail:
    summary = serialize_summary(item, metrics)
    return AdminReadingItemDetail(
        **summary.model_dump(),
        passage=item.passage,
        question=item.question,
        explanation=item.explanation,
        choices=[
            ReadingChoiceInput(
                id=choice.id,
                text=choice.text,
                is_correct=choice.is_correct,
                wrong_explanation=choice.wrong_explanation,
            )
            for choice in item.choices
        ],
        quality_average=(
            float(metrics["quality_average"])
            if metrics["quality_average"] is not None
            else None
        ),
        report_count=int(metrics["report_count"] or 0),
        challenger_count=int(metrics["challenger_count"] or 0),
        item_accuracy=(
            float(metrics["item_accuracy"])
            if metrics["item_accuracy"] is not None
            else None
        ),
    )


def sort_items(
    items: list[ReadingItem],
    metrics_by_item: dict[UUID, ItemMetrics],
    sort: str,
) -> list[ReadingItem]:
    reverse = sort.endswith("_desc")
    if sort.startswith("perceived_level"):

        def perceived_rank(item: ReadingItem) -> tuple[bool, tuple[int, int]]:
            level = metrics_by_item[item.id]["perceived_level"]
            return level is None, level_sort_key(item.language, str(level))

        if reverse:
            return sorted(
                items,
                key=lambda item: (
                    perceived_rank(item)[0],
                    -perceived_rank(item)[1][0],
                    -perceived_rank(item)[1][1],
                ),
            )
        return sorted(
            items,
            key=perceived_rank,
        )
    if sort.startswith("level"):
        return sorted(
            items,
            key=lambda item: level_sort_key(item.language, item.official_level),
            reverse=reverse,
        )
    if sort.startswith("created"):
        return sorted(items, key=lambda item: item.created_at, reverse=reverse)
    if sort.startswith("title"):
        return sorted(items, key=lambda item: item.title, reverse=reverse)
    if sort.startswith("status"):
        return sorted(items, key=lambda item: item.status, reverse=reverse)
    return sorted(items, key=lambda item: item.updated_at, reverse=reverse)


@router.post(
    "/generation-jobs",
    response_model=GenerationJobResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def create_generation_job(
    request: GenerationJobCreateRequest,
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
    generator_model = request.generator_model or settings.generator_model
    validator_model = request.validator_model or settings.answer_validator_model
    available_models = settings.available_generation_models
    for model in (generator_model, validator_model):
        if model not in available_models:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="Selected model is not available.",
            )
    job_id = uuid4()
    topic = resolve_generation_topic(request.topic)
    job = GenerationJob(
        id=job_id,
        requested_by=current_user.id,
        idempotency_key=idempotency_key,
        graph_thread_id=str(job_id),
        status="queued",
        current_node="queued",
        language=request.language,
        official_level=request.official_level,
        length_type=request.length_type,
        topic=topic,
        generator_model=generator_model,
        answer_validator_model=validator_model,
        quality_validator_model=validator_model,
        prompt_version="v4",
    )
    session.add(job)
    await session.commit()
    await session.refresh(job)
    return serialize_generation_job(job)


@router.get("/generation-model-options", response_model=GenerationModelOptionsResponse)
async def get_generation_model_options(
    current_user: Annotated[CurrentUser, Depends(require_admin)],
) -> GenerationModelOptionsResponse:
    settings = get_settings()
    available_models = settings.available_generation_models
    preferred_model = (
        PREFERRED_GENERATION_MODEL
        if PREFERRED_GENERATION_MODEL in available_models
        else None
    )
    return GenerationModelOptionsResponse(
        models=list(available_models),
        default_generator_model=preferred_model or settings.generator_model,
        default_validator_model=preferred_model or settings.answer_validator_model,
    )


@router.get("/generation-jobs/{job_id}", response_model=GenerationJobResponse)
async def get_generation_job(
    job_id: UUID,
    session: Annotated[AsyncSession, Depends(get_session)],
    current_user: Annotated[CurrentUser, Depends(require_admin)],
) -> GenerationJobResponse:
    job = await session.get(GenerationJob, job_id)
    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Job not found."
        )
    return serialize_generation_job(job)


@router.get("/reading-items", response_model=ReadingItemPage)
async def list_admin_reading_items(
    session: Annotated[AsyncSession, Depends(get_session)],
    current_user: Annotated[CurrentUser, Depends(require_admin)],
    q: Annotated[str | None, Query(max_length=100)] = None,
    language: ReadingLanguage | None = None,
    level: ReadingLevel | None = None,
    length: LengthType | None = None,
    topic: Annotated[str | None, Query(max_length=32)] = None,
    item_status: Annotated[ItemStatus | None, Query(alias="status")] = None,
    sort: Annotated[
        Literal[
            "updated_desc",
            "updated_asc",
            "created_desc",
            "created_asc",
            "title_asc",
            "level_asc",
            "level_desc",
            "perceived_level_asc",
            "perceived_level_desc",
            "status_asc",
        ],
        Query(),
    ] = "updated_desc",
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=50)] = 10,
) -> ReadingItemPage:
    if language and level and not is_level_for_language(language, level):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="The selected level does not belong to the content language.",
        )
    filters = []
    if q:
        filters.append(ReadingItem.title.ilike(f"%{q.strip()}%"))
    if level:
        filters.append(ReadingItem.official_level == level)
    if language:
        filters.append(ReadingItem.language == language)
    if length:
        filters.append(ReadingItem.length_type == length)
    if topic:
        filters.append(ReadingItem.topic == topic)
    if item_status:
        filters.append(ReadingItem.status == item_status)
    items = list(
        await session.scalars(
            select(ReadingItem)
            .where(*filters)
            .options(selectinload(ReadingItem.choices))
        )
    )
    metrics_by_item = await collect_item_metrics(session, [item.id for item in items])
    items = sort_items(items, metrics_by_item, sort)
    total_items = len(items)
    page_items = items[(page - 1) * page_size : page * page_size]
    return ReadingItemPage(
        items=[
            serialize_summary(item, metrics_by_item[item.id]) for item in page_items
        ],
        page=page,
        page_size=page_size,
        total_items=total_items,
        total_pages=max(1, math.ceil(total_items / page_size)),
    )


@router.post("/reading-items", response_model=AdminReadingItemDetail, status_code=201)
async def create_admin_reading_item(
    request: AdminReadingItemCreate,
    session: Annotated[AsyncSession, Depends(get_session)],
    current_user: Annotated[CurrentUser, Depends(require_admin)],
) -> AdminReadingItemDetail:
    item = ReadingItem(
        title=request.title.strip(),
        passage=request.passage.strip(),
        question=request.question.strip(),
        explanation=request.explanation.strip(),
        language=request.language,
        official_level=request.official_level,
        length_type=request.length_type,
        topic=request.topic.strip(),
        recommended_seconds=request.recommended_seconds,
        status="review",
    )
    item.choices = [
        ReadingChoice(
            text=choice.text.strip(),
            canonical_order=index,
            is_correct=choice.is_correct,
            wrong_explanation=(
                choice.wrong_explanation.strip() if choice.wrong_explanation else None
            ),
        )
        for index, choice in enumerate(request.choices, start=1)
    ]
    session.add(item)
    await session.commit()
    item = await get_admin_item(session, item.id)
    metrics = await collect_item_metrics(session, [item.id])
    return serialize_detail(item, metrics[item.id])


@router.get("/reading-items/{item_id}", response_model=AdminReadingItemDetail)
async def get_admin_reading_item(
    item_id: UUID,
    session: Annotated[AsyncSession, Depends(get_session)],
    current_user: Annotated[CurrentUser, Depends(require_admin)],
) -> AdminReadingItemDetail:
    item = await get_admin_item(session, item_id)
    metrics = await collect_item_metrics(session, [item.id])
    return serialize_detail(item, metrics[item.id])


@router.patch("/reading-items/{item_id}", response_model=AdminReadingItemDetail)
async def update_admin_reading_item(
    item_id: UUID,
    request: AdminReadingItemUpdate,
    session: Annotated[AsyncSession, Depends(get_session)],
    current_user: Annotated[CurrentUser, Depends(require_admin)],
) -> AdminReadingItemDetail:
    item = await get_admin_item(session, item_id)
    values = request.model_dump(exclude_none=True, exclude={"choices"})
    for key, value in values.items():
        setattr(item, key, value.strip() if isinstance(value, str) else value)

    if not is_level_for_language(item.language, item.official_level):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="The selected level does not belong to the content language.",
        )

    if request.choices is not None:
        existing_choices = {choice.id: choice for choice in item.choices}
        next_choices: list[ReadingChoice] = []
        for index, choice in enumerate(request.choices, start=1):
            existing = existing_choices.get(choice.id) if choice.id else None
            target = existing or ReadingChoice(reading_item_id=item.id)
            target.text = choice.text.strip()
            target.canonical_order = index
            target.is_correct = choice.is_correct
            target.wrong_explanation = (
                choice.wrong_explanation.strip() if choice.wrong_explanation else None
            )
            next_choices.append(target)
        item.choices[:] = next_choices

    await session.commit()
    item = await get_admin_item(session, item.id)
    metrics = await collect_item_metrics(session, [item.id])
    return serialize_detail(item, metrics[item.id])


async def update_item_status(
    session: AsyncSession, item_id: UUID, target_status: ItemStatus
) -> AdminReadingItemDetail:
    item = await get_admin_item(session, item_id)
    if target_status == "review" and item.status != "held":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Only held items can be returned to review.",
        )
    item.status = target_status
    if target_status == "published" and item.published_at is None:
        item.published_at = datetime.now(UTC)
    await session.commit()
    item = await get_admin_item(session, item.id)
    metrics = await collect_item_metrics(session, [item.id])
    return serialize_detail(item, metrics[item.id])


@router.post("/reading-items/{item_id}/publish", response_model=AdminReadingItemDetail)
async def publish_reading_item(
    item_id: UUID,
    session: Annotated[AsyncSession, Depends(get_session)],
    current_user: Annotated[CurrentUser, Depends(require_admin)],
) -> AdminReadingItemDetail:
    return await update_item_status(session, item_id, "published")


@router.post("/reading-items/{item_id}/hold", response_model=AdminReadingItemDetail)
async def hold_reading_item(
    item_id: UUID,
    session: Annotated[AsyncSession, Depends(get_session)],
    current_user: Annotated[CurrentUser, Depends(require_admin)],
) -> AdminReadingItemDetail:
    return await update_item_status(session, item_id, "held")


@router.post("/reading-items/{item_id}/unhold", response_model=AdminReadingItemDetail)
async def unhold_reading_item(
    item_id: UUID,
    session: Annotated[AsyncSession, Depends(get_session)],
    current_user: Annotated[CurrentUser, Depends(require_admin)],
) -> AdminReadingItemDetail:
    return await update_item_status(session, item_id, "review")


@router.delete("/reading-items/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_reading_item(
    item_id: UUID,
    session: Annotated[AsyncSession, Depends(get_session)],
    current_user: Annotated[CurrentUser, Depends(require_admin)],
) -> Response:
    item = await get_admin_item(session, item_id)
    await session.delete(item)
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
