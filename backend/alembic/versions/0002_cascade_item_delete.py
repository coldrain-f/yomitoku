"""Cascade generation jobs when their generated item is deleted.

Revision ID: 0002_cascade_item_delete
Revises: 0001_initial_schema
Create Date: 2026-08-30
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0002_cascade_item_delete"
down_revision: str | None = "0001_initial_schema"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_constraint(
        "generation_jobs_generated_item_id_fkey",
        "generation_jobs",
        type_="foreignkey",
    )
    op.create_foreign_key(
        "generation_jobs_generated_item_id_fkey",
        "generation_jobs",
        "reading_items",
        ["generated_item_id"],
        ["id"],
        ondelete="CASCADE",
    )


def downgrade() -> None:
    op.drop_constraint(
        "generation_jobs_generated_item_id_fkey",
        "generation_jobs",
        type_="foreignkey",
    )
    op.create_foreign_key(
        "generation_jobs_generated_item_id_fkey",
        "generation_jobs",
        "reading_items",
        ["generated_item_id"],
        ["id"],
        ondelete="SET NULL",
    )
