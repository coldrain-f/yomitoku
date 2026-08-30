import math
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import ReadingItem
from app.db.session import get_session
from app.schemas import ReadingItemPage, ReadingItemSummary

router = APIRouter(prefix="/reading-items", tags=["reading items"])


@router.get("", response_model=ReadingItemPage)
async def list_published_reading_items(
    session: Annotated[AsyncSession, Depends(get_session)],
    q: Annotated[str | None, Query(max_length=100)] = None,
    level: Annotated[str | None, Query(pattern="^N[1-5]$")] = None,
    length: Annotated[str | None, Query(pattern="^(short|medium|long)$")] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=50)] = 10,
) -> ReadingItemPage:
    filters = [ReadingItem.status == "published"]
    if q:
        filters.append(ReadingItem.title.ilike(f"%{q.strip()}%"))
    if level:
        filters.append(ReadingItem.official_level == level)
    if length:
        filters.append(ReadingItem.length_type == length)

    total_items = await session.scalar(
        select(func.count()).select_from(ReadingItem).where(*filters)
    )
    rows = await session.scalars(
        select(ReadingItem)
        .where(*filters)
        .order_by(ReadingItem.published_at.desc(), ReadingItem.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    count = total_items or 0
    return ReadingItemPage(
        items=[ReadingItemSummary.model_validate(item) for item in rows],
        page=page,
        page_size=page_size,
        total_items=count,
        total_pages=max(1, math.ceil(count / page_size)),
    )
