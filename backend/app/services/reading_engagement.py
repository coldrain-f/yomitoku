from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import ItemBookmark, PassageHighlight


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
