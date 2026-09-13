import math
from typing import Literal
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.models import (
    ItemReport,
    ItemValidation,
    PassageHighlight,
    ReadingItem,
    ReadingQuestion,
)
from app.schemas import (
    AdminReadingItemDetail,
    LengthType,
    ReadingChoiceInput,
    ReadingItemPage,
    ReadingLanguage,
    ReadingLevel,
    ReadingQuestionInput,
)
from app.services.item_metrics import (
    ItemMetrics,
    collect_item_metrics,
    perceived_feedback_summary_query,
    serialize_public_summary,
)
from app.services.reading_policy import (
    LEVELS_BY_LANGUAGE,
    MINIMUM_PERCEIVED_LEVEL_VOTES,
    is_level_for_language,
)

AdminItemStatus = Literal["review", "held", "published"]
AdminItemSort = Literal[
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
]


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


async def serialize_detail(
    session: AsyncSession,
    item: ReadingItem,
    metrics: ItemMetrics,
) -> AdminReadingItemDetail:
    summary = serialize_public_summary(item, metrics, None)
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
    highlight_count = int(
        await session.scalar(
            select(func.count())
            .select_from(PassageHighlight)
            .where(PassageHighlight.reading_item_id == item.id)
        )
        or 0
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
        highlight_count=highlight_count,
        reports=[
            {
                "id": report.id,
                "content": report.content,
                "status": report.status,
                "created_at": report.created_at,
            }
            for report in reports
        ],
        validations=[
            {
                "validator_role": validation.validator_role,
                "model_id": validation.model_id,
                "status": validation.status,
                "score": validation.score,
                "issue_codes": validation.issue_codes,
                "evidence": validation.evidence,
                "created_at": validation.created_at,
            }
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


def admin_sort_clauses(sort: AdminItemSort, feedback_summary):
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
        return (
            (ReadingItem.created_at.desc(),)
            if sort.endswith("desc")
            else (ReadingItem.created_at.asc(),)
        )
    if sort.startswith("title"):
        return (ReadingItem.title.asc(),)
    if sort.startswith("status"):
        return (ReadingItem.status.asc(),)
    return (
        (ReadingItem.updated_at.desc(),)
        if sort.endswith("desc")
        else (ReadingItem.updated_at.asc(),)
    )


async def list_admin_items(
    session: AsyncSession,
    *,
    q: str | None = None,
    language: ReadingLanguage | None = None,
    level: ReadingLevel | None = None,
    length: LengthType | None = None,
    topic: str | None = None,
    item_status: AdminItemStatus | None = None,
    sort: AdminItemSort = "updated_desc",
    page: int = 1,
    page_size: int = 10,
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
            serialize_public_summary(item, metrics_by_item[item.id], None)
            for item in items
        ],
        page=page,
        page_size=page_size,
        total_items=total_items,
        total_pages=total_pages,
    )


async def get_admin_item_detail(
    session: AsyncSession, item_id: UUID
) -> AdminReadingItemDetail:
    item = await get_admin_item(session, item_id)
    metrics = await collect_item_metrics(session, [item.id])
    return await serialize_detail(session, item, metrics[item.id])
