"""Index user highlight groups for the paginated review collection.

Revision ID: 0012_highlight_collection
Revises: 0011_item_bookmarks
Create Date: 2026-09-10
"""

from collections.abc import Sequence

from alembic import op


revision: str = "0012_highlight_collection"
down_revision: str | None = "0011_item_bookmarks"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_index(
        "ix_passage_highlights_user_item_created",
        "passage_highlights",
        ["user_id", "reading_item_id", "created_at"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_passage_highlights_user_item_created", table_name="passage_highlights"
    )
