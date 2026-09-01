"""Add a content language to reading items and generation jobs.

Revision ID: 0003_add_reading_language
Revises: 0002_cascade_item_delete
Create Date: 2026-09-01
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0003_add_reading_language"
down_revision: str | None = "0002_cascade_item_delete"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "reading_items",
        sa.Column("language", sa.String(length=8), server_default="ja", nullable=False),
    )
    op.create_index("ix_reading_items_language", "reading_items", ["language"])
    op.add_column(
        "generation_jobs",
        sa.Column("language", sa.String(length=8), server_default="ja", nullable=False),
    )
    op.alter_column(
        "reading_items",
        "official_level",
        existing_type=sa.String(length=2),
        type_=sa.String(length=16),
        existing_nullable=False,
    )
    op.alter_column(
        "generation_jobs",
        "official_level",
        existing_type=sa.String(length=2),
        type_=sa.String(length=16),
        existing_nullable=False,
    )
    op.alter_column(
        "item_feedback",
        "perceived_level",
        existing_type=sa.String(length=2),
        type_=sa.String(length=16),
        existing_nullable=False,
    )


def downgrade() -> None:
    op.alter_column(
        "item_feedback",
        "perceived_level",
        existing_type=sa.String(length=16),
        type_=sa.String(length=2),
        existing_nullable=False,
    )
    op.alter_column(
        "generation_jobs",
        "official_level",
        existing_type=sa.String(length=16),
        type_=sa.String(length=2),
        existing_nullable=False,
    )
    op.alter_column(
        "reading_items",
        "official_level",
        existing_type=sa.String(length=16),
        type_=sa.String(length=2),
        existing_nullable=False,
    )
    op.drop_column("generation_jobs", "language")
    op.drop_index("ix_reading_items_language", table_name="reading_items")
    op.drop_column("reading_items", "language")
