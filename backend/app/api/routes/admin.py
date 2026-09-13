from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Header, Query, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import CurrentUser, require_admin
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
    GenerationJobCreateRequest,
    GenerationJobHistoryPage,
    GenerationJobResponse,
    GenerationModelOptionsResponse,
    LengthType,
    ReadingItemPage,
    ReadingLanguage,
    ReadingLevel,
)
from app.services.admin_generation import (
    create_generation_job as create_generation_job_for_admin,
)
from app.services.admin_generation import (
    generation_model_options,
    list_generation_job_history,
)
from app.services.admin_generation import (
    get_active_generation_job as get_active_generation_job_for_admin,
)
from app.services.admin_generation import (
    get_generation_job as get_generation_job_for_admin,
)
from app.services.admin_generation import (
    suggest_explanation as suggest_explanation_for_admin,
)
from app.services.admin_generation import (
    suggest_title as suggest_title_for_admin,
)
from app.services.admin_generation import (
    suggest_topic as suggest_topic_for_admin,
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

router = APIRouter(prefix="/admin", tags=["admin"])

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
    job, reused = await create_generation_job_for_admin(
        session,
        request=request,
        current_user=current_user,
        idempotency_key=idempotency_key,
    )
    if reused:
        response.status_code = status.HTTP_200_OK
    return job


@router.get("/generation-model-options", response_model=GenerationModelOptionsResponse)
async def get_generation_model_options(
    current_user: Annotated[CurrentUser, Depends(require_admin)],
) -> GenerationModelOptionsResponse:
    return generation_model_options()


@router.post(
    "/reading-items/title-suggestion",
    response_model=AdminTitleSuggestionResponse,
)
async def suggest_admin_reading_title(
    request: AdminTitleSuggestionRequest,
    current_user: Annotated[CurrentUser, Depends(require_admin)],
) -> AdminTitleSuggestionResponse:
    return await suggest_title_for_admin(request)


@router.post(
    "/reading-items/topic-suggestion",
    response_model=AdminTopicSuggestionResponse,
)
async def suggest_admin_reading_topic(
    request: AdminTopicSuggestionRequest,
    current_user: Annotated[CurrentUser, Depends(require_admin)],
) -> AdminTopicSuggestionResponse:
    return await suggest_topic_for_admin(request)


@router.post(
    "/reading-items/explanation-suggestion",
    response_model=AdminExplanationSuggestionResponse,
)
async def suggest_admin_reading_explanation(
    request: AdminExplanationSuggestionRequest,
    current_user: Annotated[CurrentUser, Depends(require_admin)],
) -> AdminExplanationSuggestionResponse:
    return await suggest_explanation_for_admin(request)


@router.get("/generation-jobs", response_model=GenerationJobHistoryPage)
async def list_generation_jobs(
    session: Annotated[AsyncSession, Depends(get_session)],
    current_user: Annotated[CurrentUser, Depends(require_admin)],
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=50)] = 25,
) -> GenerationJobHistoryPage:
    return await list_generation_job_history(session, page=page, page_size=page_size)


@router.get("/generation-jobs/active", response_model=GenerationJobResponse | None)
async def get_active_generation_job(
    session: Annotated[AsyncSession, Depends(get_session)],
    current_user: Annotated[CurrentUser, Depends(require_admin)],
) -> GenerationJobResponse | None:
    return await get_active_generation_job_for_admin(session, current_user)


@router.get("/generation-jobs/{job_id}", response_model=GenerationJobResponse)
async def get_generation_job(
    job_id: UUID,
    session: Annotated[AsyncSession, Depends(get_session)],
    current_user: Annotated[CurrentUser, Depends(require_admin)],
) -> GenerationJobResponse:
    return await get_generation_job_for_admin(session, job_id)


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
