import math
from typing import Annotated, Literal
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Response, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import get_settings
from app.core.security import CurrentUser, require_admin
from app.db.models import (
    GenerationJob,
    GenerationUsageEvent,
    User,
)
from app.db.session import get_session
from app.schemas import (
    AdminExplanationSuggestionRequest,
    AdminExplanationSuggestionResponse,
    AdminReadingItemCreate,
    AdminReadingItemDetail,
    AdminReadingItemUpdate,
    AdminTitleSuggestionRequest,
    AdminTitleSuggestionResponse,
    AdminTopicSuggestionRequest,
    AdminTopicSuggestionResponse,
    GenerationConditions,
    GenerationJobCreateRequest,
    GenerationJobHistoryItem,
    GenerationJobHistoryPage,
    GenerationJobResponse,
    GenerationModelOptionsResponse,
    GenerationUsageEventResponse,
    LengthType,
    ReadingItemPage,
    ReadingLanguage,
    ReadingLevel,
)
from app.services.admin_reading_items import (
    AdminItemStatus,
    create_admin_item,
    delete_admin_item,
    get_admin_item_detail,
    list_admin_items,
    update_admin_item,
    update_admin_item_status,
)
from app.services.generation_jobs import ACTIVE_STATUSES
from app.services.generation_provider import build_generation_provider
from app.services.generation_topics import resolve_generation_topic
from app.services.reading_policy import GENERATION_TOPICS
from app.services.users import ensure_user
from app.services.validation import has_choice_position_reference

router = APIRouter(prefix="/admin", tags=["admin"])

PREFERRED_GENERATION_MODEL = "claude-fable-5-1"


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
            keywords=job.keywords,
        ),
        revision_count=job.revision_count,
        generated_item_id=job.generated_item_id,
        error_code=job.error_code,
        error_detail=job.error_detail,
        created_at=job.created_at,
        started_at=job.started_at,
        completed_at=job.completed_at,
    )


def serialize_generation_usage_event(
    event: GenerationUsageEvent,
) -> GenerationUsageEventResponse:
    return GenerationUsageEventResponse(
        event_index=event.event_index,
        usage_status=event.usage_status,
        stage=event.stage,
        model_id=event.model_id,
        input_tokens=event.input_tokens,
        cache_creation_input_tokens=event.cache_creation_input_tokens,
        cache_read_input_tokens=event.cache_read_input_tokens,
        output_tokens=event.output_tokens,
        actual_cost_usd=event.actual_cost_usd,
        stop_reason=event.stop_reason,
        created_at=event.created_at,
    )


def serialize_generation_job_history(
    job: GenerationJob,
) -> GenerationJobHistoryItem:
    usage_events = [
        serialize_generation_usage_event(event) for event in job.usage_events
    ]
    return GenerationJobHistoryItem(
        **serialize_generation_job(job).model_dump(),
        generator_model=job.generator_model,
        answer_validator_model=job.answer_validator_model,
        quality_validator_model=job.quality_validator_model,
        prompt_version=job.prompt_version,
        input_tokens=job.input_tokens,
        output_tokens=job.output_tokens,
        cache_creation_input_tokens=sum(
            event.cache_creation_input_tokens for event in usage_events
        ),
        cache_read_input_tokens=sum(
            event.cache_read_input_tokens for event in usage_events
        ),
        actual_cost_usd=job.actual_cost_usd,
        usage_events=usage_events,
        usage_complete=all(
            event.usage_status == "recorded" for event in usage_events
        ),
    )


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
    # Serialize requests from the same administrator, including different tabs.
    await session.scalar(select(User).where(User.id == current_user.id).with_for_update())
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

    active = await session.scalar(
        select(GenerationJob).where(
            GenerationJob.requested_by == current_user.id,
            GenerationJob.status.in_(ACTIVE_STATUSES),
        ).order_by(GenerationJob.created_at.desc()).limit(1)
    )
    if active:
        response.status_code = status.HTTP_200_OK
        return serialize_generation_job(active)

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
        keywords=request.keywords,
        generator_model=generator_model,
        answer_validator_model=validator_model,
        quality_validator_model=validator_model,
        prompt_version="v7",
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


@router.post(
    "/reading-items/title-suggestion",
    response_model=AdminTitleSuggestionResponse,
)
async def suggest_admin_reading_title(
    request: AdminTitleSuggestionRequest,
    current_user: Annotated[CurrentUser, Depends(require_admin)],
) -> AdminTitleSuggestionResponse:
    settings = get_settings()
    provider = build_generation_provider(settings)
    try:
        result = await provider.suggest_title(
            request.passage.strip(),
            request.language,
            settings.generator_model,
        )
    except RuntimeError as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI 제목 제안에 실패했습니다. 잠시 후 다시 시도해 주세요.",
        ) from error
    return AdminTitleSuggestionResponse(title=result.value.title.strip())


@router.post(
    "/reading-items/topic-suggestion",
    response_model=AdminTopicSuggestionResponse,
)
async def suggest_admin_reading_topic(
    request: AdminTopicSuggestionRequest,
    current_user: Annotated[CurrentUser, Depends(require_admin)],
) -> AdminTopicSuggestionResponse:
    settings = get_settings()
    provider = build_generation_provider(settings)
    try:
        result = await provider.suggest_topic(
            request.passage.strip(),
            request.language,
            settings.generator_model,
        )
    except RuntimeError as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI 주제 제안에 실패했습니다. 잠시 후 다시 시도해 주세요.",
        ) from error

    topic = result.value.topic.strip()
    if topic not in GENERATION_TOPICS:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI가 선택할 수 없는 주제를 반환했습니다. 다시 시도해 주세요.",
        )
    return AdminTopicSuggestionResponse(topic=topic)


@router.post(
    "/reading-items/explanation-suggestion",
    response_model=AdminExplanationSuggestionResponse,
)
async def suggest_admin_reading_explanation(
    request: AdminExplanationSuggestionRequest,
    current_user: Annotated[CurrentUser, Depends(require_admin)],
) -> AdminExplanationSuggestionResponse:
    settings = get_settings()
    provider = build_generation_provider(settings)
    try:
        result = await provider.suggest_explanation(request, settings.generator_model)
    except RuntimeError as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI 해설 생성에 실패했습니다. 잠시 후 다시 시도해 주세요.",
        ) from error

    explanation = result.value.explanation.strip()
    if not explanation:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI가 해설을 만들지 못했습니다. 다시 시도해 주세요.",
        )
    if has_choice_position_reference(explanation):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI 해설에 선택지 번호가 포함되어 다시 생성해 주세요.",
        )
    return AdminExplanationSuggestionResponse(explanation=explanation)


@router.get("/generation-jobs", response_model=GenerationJobHistoryPage)
async def list_generation_jobs(
    session: Annotated[AsyncSession, Depends(get_session)],
    current_user: Annotated[CurrentUser, Depends(require_admin)],
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=50)] = 25,
) -> GenerationJobHistoryPage:
    total_items = int(
        await session.scalar(select(func.count()).select_from(GenerationJob)) or 0
    )
    jobs = list(
        await session.scalars(
            select(GenerationJob)
            .options(selectinload(GenerationJob.usage_events))
            .order_by(GenerationJob.created_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
    )
    return GenerationJobHistoryPage(
        items=[serialize_generation_job_history(job) for job in jobs],
        page=page,
        page_size=page_size,
        total_items=total_items,
        total_pages=max(1, math.ceil(total_items / page_size)),
    )


@router.get("/generation-jobs/active", response_model=GenerationJobResponse | None)
async def get_active_generation_job(
    session: Annotated[AsyncSession, Depends(get_session)],
    current_user: Annotated[CurrentUser, Depends(require_admin)],
) -> GenerationJobResponse | None:
    job = await session.scalar(
        select(GenerationJob).where(
            GenerationJob.requested_by == current_user.id,
            GenerationJob.status.in_(ACTIVE_STATUSES),
        ).order_by(GenerationJob.created_at.desc()).limit(1)
    )
    return serialize_generation_job(job) if job else None


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
    item_status: Annotated[AdminItemStatus | None, Query(alias="status")] = None,
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
    return await list_admin_items(
        session,
        q=q,
        language=language,
        level=level,
        length=length,
        topic=topic,
        item_status=item_status,
        sort=sort,
        page=page,
        page_size=page_size,
    )


@router.post("/reading-items", response_model=AdminReadingItemDetail, status_code=201)
async def create_admin_reading_item(
    request: AdminReadingItemCreate,
    session: Annotated[AsyncSession, Depends(get_session)],
    current_user: Annotated[CurrentUser, Depends(require_admin)],
) -> AdminReadingItemDetail:
    return await create_admin_item(session, request)


@router.get("/reading-items/{item_id}", response_model=AdminReadingItemDetail)
async def get_admin_reading_item(
    item_id: UUID,
    session: Annotated[AsyncSession, Depends(get_session)],
    current_user: Annotated[CurrentUser, Depends(require_admin)],
) -> AdminReadingItemDetail:
    return await get_admin_item_detail(session, item_id)


@router.patch("/reading-items/{item_id}", response_model=AdminReadingItemDetail)
async def update_admin_reading_item(
    item_id: UUID,
    request: AdminReadingItemUpdate,
    session: Annotated[AsyncSession, Depends(get_session)],
    current_user: Annotated[CurrentUser, Depends(require_admin)],
) -> AdminReadingItemDetail:
    return await update_admin_item(session, item_id, request)


@router.post("/reading-items/{item_id}/publish", response_model=AdminReadingItemDetail)
async def publish_reading_item(
    item_id: UUID,
    session: Annotated[AsyncSession, Depends(get_session)],
    current_user: Annotated[CurrentUser, Depends(require_admin)],
) -> AdminReadingItemDetail:
    return await update_admin_item_status(session, item_id, "published")


@router.post("/reading-items/{item_id}/hold", response_model=AdminReadingItemDetail)
async def hold_reading_item(
    item_id: UUID,
    session: Annotated[AsyncSession, Depends(get_session)],
    current_user: Annotated[CurrentUser, Depends(require_admin)],
) -> AdminReadingItemDetail:
    return await update_admin_item_status(session, item_id, "held")


@router.post("/reading-items/{item_id}/unhold", response_model=AdminReadingItemDetail)
async def unhold_reading_item(
    item_id: UUID,
    session: Annotated[AsyncSession, Depends(get_session)],
    current_user: Annotated[CurrentUser, Depends(require_admin)],
) -> AdminReadingItemDetail:
    return await update_admin_item_status(session, item_id, "review")


@router.delete("/reading-items/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_reading_item(
    item_id: UUID,
    session: Annotated[AsyncSession, Depends(get_session)],
    current_user: Annotated[CurrentUser, Depends(require_admin)],
) -> Response:
    await delete_admin_item(session, item_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
