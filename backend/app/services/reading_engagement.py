import math
from uuid import UUID

from sqlalchemy import case, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Attempt, ItemBookmark, PassageHighlight, ReadingItem
from app.schemas import (
    PassageHighlightCollectionItem,
    PassageHighlightCollectionPage,
    PassageHighlightCollectionSnippet,
    ReadingLanguage,
)


class HighlightRangeMismatchError(ValueError):
    """The supplied browser selection no longer maps to the passage text."""


class HighlightOverlapError(ValueError):
    """The supplied selection overlaps an existing highlight."""


class HighlightNotFoundError(LookupError):
    """A learner attempted to remove a highlight they do not own."""


def normalized_passage_text(value: str) -> str:
    return value.replace("\r\n", "\n").replace("\r", "\n")


def python_index_for_utf16_offset(text: str, offset: int) -> int | None:
    """Map browser DOM offsets to Python indices without splitting a surrogate pair."""
    consumed = 0
    for index, character in enumerate(text):
        if consumed == offset:
            return index
        consumed += 2 if ord(character) > 0xFFFF else 1
    return len(text) if consumed == offset else None


def selected_text_for_offsets(
    passage: str, start_offset: int, end_offset: int
) -> str | None:
    start_index = python_index_for_utf16_offset(passage, start_offset)
    end_index = python_index_for_utf16_offset(passage, end_offset)
    if start_index is None or end_index is None or end_index <= start_index:
        return None
    return passage[start_index:end_index]


async def add_item_bookmark(
    session: AsyncSession, user_id: UUID, reading_item_id: UUID
) -> None:
    bookmark = await session.scalar(
        select(ItemBookmark).where(
            ItemBookmark.user_id == user_id,
            ItemBookmark.reading_item_id == reading_item_id,
        )
    )
    if bookmark is None:
        session.add(ItemBookmark(user_id=user_id, reading_item_id=reading_item_id))
        await session.commit()


async def remove_item_bookmark(
    session: AsyncSession, user_id: UUID, reading_item_id: UUID
) -> None:
    bookmark = await session.scalar(
        select(ItemBookmark).where(
            ItemBookmark.user_id == user_id,
            ItemBookmark.reading_item_id == reading_item_id,
        )
    )
    if bookmark is not None:
        await session.delete(bookmark)
        await session.commit()


async def list_user_highlights(
    session: AsyncSession, user_id: UUID, reading_item_id: UUID
) -> list[PassageHighlight]:
    return list(
        await session.scalars(
            select(PassageHighlight)
            .where(
                PassageHighlight.user_id == user_id,
                PassageHighlight.reading_item_id == reading_item_id,
            )
            .order_by(PassageHighlight.start_offset.asc(), PassageHighlight.end_offset.asc())
        )
    )


async def create_user_highlight(
    session: AsyncSession,
    *,
    user_id: UUID,
    reading_item_id: UUID,
    passage: str,
    start_offset: int,
    end_offset: int,
    selected_text: str,
) -> PassageHighlight:
    normalized_passage = normalized_passage_text(passage)
    source_text = selected_text_for_offsets(
        normalized_passage, start_offset, end_offset
    )
    if source_text != selected_text:
        raise HighlightRangeMismatchError

    highlights = await list_user_highlights(session, user_id, reading_item_id)
    for highlight in highlights:
        if (
            highlight.start_offset == start_offset
            and highlight.end_offset == end_offset
        ):
            return highlight
        if start_offset < highlight.end_offset and highlight.start_offset < end_offset:
            raise HighlightOverlapError

    highlight = PassageHighlight(
        user_id=user_id,
        reading_item_id=reading_item_id,
        start_offset=start_offset,
        end_offset=end_offset,
        selected_text=selected_text,
    )
    session.add(highlight)
    await session.commit()
    await session.refresh(highlight)
    return highlight


async def delete_user_highlight(
    session: AsyncSession,
    *,
    user_id: UUID,
    reading_item_id: UUID,
    highlight_id: UUID,
) -> None:
    highlight = await session.scalar(
        select(PassageHighlight).where(
            PassageHighlight.id == highlight_id,
            PassageHighlight.user_id == user_id,
            PassageHighlight.reading_item_id == reading_item_id,
        )
    )
    if not highlight:
        raise HighlightNotFoundError
    await session.delete(highlight)
    await session.commit()


async def list_highlight_collection(
    session: AsyncSession,
    *,
    user_id: UUID,
    language: ReadingLanguage | None = None,
    query: str | None = None,
    page: int = 1,
    page_size: int = 20,
) -> PassageHighlightCollectionPage:
    """Return reviewable highlight groups, ordered by the learner's latest submission."""
    filters = [
        PassageHighlight.user_id == user_id,
        ReadingItem.status == "published",
    ]
    if language is not None:
        filters.append(ReadingItem.language == language)
    normalized_query = query.strip() if query else ""
    if normalized_query:
        keyword = f"%{normalized_query}%"
        filters.append(
            or_(
                ReadingItem.title.ilike(keyword),
                PassageHighlight.selected_text.ilike(keyword),
            )
        )

    # One item can have many highlights. Page by item so a review card never splits
    # across pages, then load just that page's highlights below.
    latest_submissions = (
        select(
            Attempt.reading_item_id.label("reading_item_id"),
            func.max(Attempt.submitted_at).label("last_submitted_at"),
        )
        .where(
            Attempt.user_id == user_id,
            Attempt.submitted_at.is_not(None),
        )
        .group_by(Attempt.reading_item_id)
        .subquery()
    )
    highlight_groups = (
        select(
            ReadingItem.id.label("reading_item_id"),
            func.max(PassageHighlight.created_at).label("last_highlighted_at"),
        )
        .join(PassageHighlight, PassageHighlight.reading_item_id == ReadingItem.id)
        .where(*filters)
        .group_by(ReadingItem.id)
        .subquery()
    )
    total_items = await session.scalar(
        select(func.count()).select_from(highlight_groups)
    )
    total_items = total_items or 0
    total_pages = max(1, math.ceil(total_items / page_size))
    page = min(page, total_pages)

    group_rows = (
        await session.execute(
            select(
                ReadingItem,
                latest_submissions.c.last_submitted_at,
                highlight_groups.c.last_highlighted_at,
            )
            .join(highlight_groups, highlight_groups.c.reading_item_id == ReadingItem.id)
            .outerjoin(
                latest_submissions,
                latest_submissions.c.reading_item_id == ReadingItem.id,
            )
            .order_by(
                case(
                    (latest_submissions.c.last_submitted_at.is_(None), 1), else_=0
                ).asc(),
                latest_submissions.c.last_submitted_at.desc(),
                highlight_groups.c.last_highlighted_at.desc(),
                ReadingItem.id.asc(),
            )
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
    ).all()
    if not group_rows:
        return PassageHighlightCollectionPage(
            page=page,
            page_size=page_size,
            total_items=total_items,
            total_pages=total_pages,
        )

    item_ids = [item.id for item, _, _ in group_rows]
    highlights_by_item: dict[UUID, list[PassageHighlightCollectionSnippet]] = {
        item_id: [] for item_id in item_ids
    }
    passages_by_item = {
        item.id: normalized_passage_text(item.passage) for item, _, _ in group_rows
    }
    highlights = await session.scalars(
        select(PassageHighlight)
        .where(
            PassageHighlight.user_id == user_id,
            PassageHighlight.reading_item_id.in_(item_ids),
        )
        .order_by(PassageHighlight.created_at.desc(), PassageHighlight.id.asc())
    )
    for highlight in highlights:
        if (
            selected_text_for_offsets(
                passages_by_item[highlight.reading_item_id],
                highlight.start_offset,
                highlight.end_offset,
            )
            == highlight.selected_text
        ):
            highlights_by_item[highlight.reading_item_id].append(
                PassageHighlightCollectionSnippet(
                    id=highlight.id,
                    selected_text=highlight.selected_text,
                    created_at=highlight.created_at,
                )
            )

    return PassageHighlightCollectionPage(
        items=[
            PassageHighlightCollectionItem(
                reading_item_id=item.id,
                title=item.title,
                language=item.language,
                official_level=item.official_level,
                length_type=item.length_type,
                topic=item.topic,
                last_submitted_at=last_submitted_at,
                last_highlighted_at=last_highlighted_at,
                highlights=highlights_by_item[item.id],
            )
            for item, last_submitted_at, last_highlighted_at in group_rows
            if highlights_by_item[item.id]
        ],
        page=page,
        page_size=page_size,
        total_items=total_items,
        total_pages=total_pages,
    )
