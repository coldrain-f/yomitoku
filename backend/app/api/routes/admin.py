import math
from datetime import UTC, datetime
from typing import Annotated, Literal
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Response, status
from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import get_settings
from app.core.security import CurrentUser, require_admin
from app.db.models import (
    GenerationJob,
    GenerationUsageEvent,
    ItemReport,
    ItemValidation,
    ReadingChoice,
    ReadingItem,
    ReadingQuestion,
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
    ItemReportDetail,
    ItemValidationDetail,
    LengthType,
    ReadingChoiceInput,
    ReadingItemPage,
    ReadingItemSummary,
    ReadingLanguage,
    ReadingLevel,
    ReadingQuestionInput,
)
from app.services.generation_jobs import ACTIVE_STATUSES
from app.services.generation_provider import build_generation_provider
from app.services.generation_topics import resolve_generation_topic
from app.services.item_metrics import (
    ItemMetrics,
    collect_item_metrics,
    perceived_feedback_summary_query,
)
from app.services.reading_policy import (
    GENERATION_TOPICS,
    LEVELS_BY_LANGUAGE,
    MINIMUM_PERCEIVED_LEVEL_VOTES,
    is_level_for_language,
)
from app.services.users import ensure_user

router = APIRouter(prefix="/admin", tags=["admin"])

ItemStatus = Literal["review", "held", "published"]
PREFERRED_GENERATION_MODEL = "claude-fable-5-1"
MAX_QUESTIONS_BY_LENGTH: dict[LengthType, int] = {
    "short": 1,
    "medium": 3,
    "long": 4,
}


def validate_question_count(
    questions: list[ReadingQuestionInput], length_type: LengthType, content_source: str
) -> None:
    if content_source == "ai" and len(questions) != 1:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="AI 생성 문항은 문제를 하나만 가질 수 있습니다.",
        )
    maximum = MAX_QUESTIONS_BY_LENGTH[length_type]
    if not 1 <= len(questions) <= maximum:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=f"{length_type} 유형은 문제를 1~{maximum}개 등록할 수 있습니다.",
        )


def legacy_question(
    question: str | None,
    explanation: str | None,
    choices: list[ReadingChoiceInput] | None,
) -> ReadingQuestionInput:
    return ReadingQuestionInput(
        question=question or "",
        explanation=explanation or "",
        choices=choices or [],
    )


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


async def get_admin_item(session: AsyncSession, item_id: UUID) -> ReadingItem:
    item = await session.scalar(
        select(ReadingItem)
        .where(ReadingItem.id == item_id)
        .options(
            selectinload(ReadingItem.choices),
            selectinload(ReadingItem.questions).selectinload(ReadingQuestion.choices),
        )
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
        content_source=item.content_source,
        status=item.status,
        published_at=item.published_at,
        created_at=item.created_at,
        updated_at=item.updated_at,
        perceived_level=perceived_level if isinstance(perceived_level, str) else None,
        perceived_level_visible=vote_count >= MINIMUM_PERCEIVED_LEVEL_VOTES,
        perceived_vote_count=vote_count,
        item_accuracy=(
            float(metrics["item_accuracy"])
            if metrics["item_accuracy"] is not None
            else None
        ),
    )


async def serialize_detail(
    session: AsyncSession,
    item: ReadingItem,
    metrics: ItemMetrics,
) -> AdminReadingItemDetail:
    summary = serialize_summary(item, metrics)
    reports = list(
        await session.scalars(
            select(ItemReport)
            .where(ItemReport.reading_item_id == item.id)
            .order_by(ItemReport.created_at.desc(), ItemReport.id.desc())
        )
    )
    validations = list(
        await session.scalars(
            select(ItemValidation)
            .where(ItemValidation.reading_item_id == item.id)
            .order_by(ItemValidation.created_at.asc(), ItemValidation.id.asc())
        )
    )
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
        questions=[
            ReadingQuestionInput(
                id=question.id,
                question=question.question,
                explanation=question.explanation,
                choices=[
                    ReadingChoiceInput(
                        id=choice.id,
                        text=choice.text,
                        is_correct=choice.is_correct,
                        wrong_explanation=choice.wrong_explanation,
                    )
                    for choice in question.choices
                ],
            )
            for question in item.questions
        ],
        quality_average=(
            float(metrics["quality_average"])
            if metrics["quality_average"] is not None
            else None
        ),
        report_count=int(metrics["report_count"] or 0),
        challenger_count=int(metrics["challenger_count"] or 0),
        reports=[
            ItemReportDetail(
                id=report.id,
                content=report.content,
                status=report.status,
                created_at=report.created_at,
            )
            for report in reports
        ],
        validations=[
            ItemValidationDetail(
                validator_role=validation.validator_role,
                model_id=validation.model_id,
                status=validation.status,
                score=validation.score,
                issue_codes=validation.issue_codes,
                evidence=validation.evidence,
                created_at=validation.created_at,
            )
            for validation in validations
        ],
    )


def admin_level_order_expression():
    ranks = {
        level: rank
        for levels in LEVELS_BY_LANGUAGE.values()
        for rank, level in enumerate(levels, start=1)
    }
    return case(ranks, value=ReadingItem.official_level, else_=0)


def admin_sort_clauses(sort: str, feedback_summary):
    if sort.startswith("perceived_level"):
        visible_rank = case(
            (
                feedback_summary.c.perceived_vote_count
                >= MINIMUM_PERCEIVED_LEVEL_VOTES,
                feedback_summary.c.perceived_rank,
            ),
            else_=None,
        )
        return (
            (visible_rank.is_(None), visible_rank.desc())
            if sort.endswith("desc")
            else (visible_rank.is_(None), visible_rank.asc())
        )
    if sort.startswith("level"):
        level_order = admin_level_order_expression()
        return (level_order.desc(),) if sort.endswith("desc") else (level_order.asc(),)
    if sort.startswith("created"):
        return (ReadingItem.created_at.desc(),) if sort.endswith("desc") else (ReadingItem.created_at.asc(),)
    if sort.startswith("title"):
        return (ReadingItem.title.asc(),)
    if sort.startswith("status"):
        return (ReadingItem.status.asc(),)
    return (ReadingItem.updated_at.desc(),) if sort.endswith("desc") else (ReadingItem.updated_at.asc(),)


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
    feedback_summary = (
        perceived_feedback_summary_query()
        if sort.startswith("perceived_level")
        else None
    )
    total_items = int(
        await session.scalar(
            select(func.count()).select_from(ReadingItem).where(*filters)
        )
        or 0
    )
    total_pages = max(1, math.ceil(total_items / page_size))
    page = min(page, total_pages)
    statement = select(ReadingItem).where(*filters)
    if feedback_summary is not None:
        statement = statement.outerjoin(
            feedback_summary,
            feedback_summary.c.reading_item_id == ReadingItem.id,
        )
    items = list(
        await session.scalars(
            statement.options(selectinload(ReadingItem.choices))
            .order_by(*admin_sort_clauses(sort, feedback_summary))
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
    )
    metrics_by_item = await collect_item_metrics(session, [item.id for item in items])
    return ReadingItemPage(
        items=[
            serialize_summary(item, metrics_by_item[item.id]) for item in items
        ],
        page=page,
        page_size=page_size,
        total_items=total_items,
        total_pages=total_pages,
    )


@router.post("/reading-items", response_model=AdminReadingItemDetail, status_code=201)
async def create_admin_reading_item(
    request: AdminReadingItemCreate,
    session: Annotated[AsyncSession, Depends(get_session)],
    current_user: Annotated[CurrentUser, Depends(require_admin)],
) -> AdminReadingItemDetail:
    questions = request.questions or [
        legacy_question(request.question, request.explanation, request.choices)
    ]
    validate_question_count(questions, request.length_type, "manual")
    first_question = questions[0]
    item = ReadingItem(
        title=request.title.strip(),
        passage=request.passage.strip(),
        question=first_question.question.strip(),
        explanation=first_question.explanation.strip(),
        language=request.language,
        official_level=request.official_level,
        length_type=request.length_type,
        topic=request.topic.strip(),
        recommended_seconds=request.recommended_seconds,
        content_source="manual",
        status="review",
    )
    for question_index, question in enumerate(questions, start=1):
        target_question = ReadingQuestion(
            question=question.question.strip(),
            explanation=question.explanation.strip(),
            canonical_order=question_index,
        )
        target_question.choices = [
            ReadingChoice(
                reading_item=item,
                text=choice.text.strip(),
                canonical_order=choice_index,
                is_correct=choice.is_correct,
                wrong_explanation=(
                    choice.wrong_explanation.strip()
                    if choice.wrong_explanation
                    else None
                ),
            )
            for choice_index, choice in enumerate(question.choices, start=1)
        ]
        item.questions.append(target_question)
    session.add(item)
    await session.commit()
    item = await get_admin_item(session, item.id)
    metrics = await collect_item_metrics(session, [item.id])
    return await serialize_detail(session, item, metrics[item.id])


@router.get("/reading-items/{item_id}", response_model=AdminReadingItemDetail)
async def get_admin_reading_item(
    item_id: UUID,
    session: Annotated[AsyncSession, Depends(get_session)],
    current_user: Annotated[CurrentUser, Depends(require_admin)],
) -> AdminReadingItemDetail:
    item = await get_admin_item(session, item_id)
    metrics = await collect_item_metrics(session, [item.id])
    return await serialize_detail(session, item, metrics[item.id])


@router.patch("/reading-items/{item_id}", response_model=AdminReadingItemDetail)
async def update_admin_reading_item(
    item_id: UUID,
    request: AdminReadingItemUpdate,
    session: Annotated[AsyncSession, Depends(get_session)],
    current_user: Annotated[CurrentUser, Depends(require_admin)],
) -> AdminReadingItemDetail:
    item = await get_admin_item(session, item_id)
    values = request.model_dump(exclude_none=True, exclude={"choices", "questions"})
    for key, value in values.items():
        setattr(item, key, value.strip() if isinstance(value, str) else value)

    if not is_level_for_language(item.language, item.official_level):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="The selected level does not belong to the content language.",
        )

    if request.questions is not None:
        validate_question_count(request.questions, item.length_type, item.content_source)
        existing_questions = {question.id: question for question in item.questions}
        next_questions: list[ReadingQuestion] = []
        for question_index, question in enumerate(request.questions, start=1):
            target_question = (
                existing_questions.get(question.id) if question.id else None
            ) or ReadingQuestion()
            target_question.question = question.question.strip()
            target_question.explanation = question.explanation.strip()
            target_question.canonical_order = question_index
            existing_choices = {choice.id: choice for choice in target_question.choices}
            next_choices: list[ReadingChoice] = []
            for choice_index, choice in enumerate(question.choices, start=1):
                target_choice = (
                    existing_choices.get(choice.id) if choice.id else None
                ) or ReadingChoice(reading_item=item)
                target_choice.text = choice.text.strip()
                target_choice.canonical_order = choice_index
                target_choice.is_correct = choice.is_correct
                target_choice.wrong_explanation = (
                    choice.wrong_explanation.strip()
                    if choice.wrong_explanation
                    else None
                )
                next_choices.append(target_choice)
            target_question.choices[:] = next_choices
            next_questions.append(target_question)
        item.questions[:] = next_questions
        item.question = next_questions[0].question
        item.explanation = next_questions[0].explanation
    elif request.choices is not None:
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
    return await serialize_detail(session, item, metrics[item.id])


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
    return await serialize_detail(session, item, metrics[item.id])


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
