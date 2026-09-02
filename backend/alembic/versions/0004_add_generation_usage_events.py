"""Store per-call generation model usage.

Revision ID: 0004_add_generation_usage_events
Revises: 0003_add_reading_language
Create Date: 2026-09-02
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0004_add_generation_usage_events"
down_revision: str | None = "0003_add_reading_language"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "generation_usage_events",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("generation_job_id", sa.Uuid(), nullable=False),
        sa.Column("event_index", sa.Integer(), nullable=False),
        sa.Column("stage", sa.String(length=32), nullable=False),
        sa.Column("model_id", sa.String(length=128), nullable=False),
        sa.Column("input_tokens", sa.Integer(), nullable=False),
        sa.Column("cache_creation_input_tokens", sa.Integer(), nullable=False),
        sa.Column("cache_read_input_tokens", sa.Integer(), nullable=False),
        sa.Column("output_tokens", sa.Integer(), nullable=False),
        sa.Column("actual_cost_usd", sa.Numeric(precision=12, scale=6), nullable=True),
        sa.Column("stop_reason", sa.String(length=32), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["generation_job_id"], ["generation_jobs.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "generation_job_id",
            "event_index",
            name="uq_generation_usage_event_position",
        ),
    )
    op.create_index(
        "ix_generation_usage_events_generation_job_id",
        "generation_usage_events",
        ["generation_job_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_generation_usage_events_generation_job_id",
        table_name="generation_usage_events",
    )
    op.drop_table("generation_usage_events")
