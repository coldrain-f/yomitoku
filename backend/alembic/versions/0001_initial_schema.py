"""Create the initial Yomitoku application schema.

Revision ID: 0001_initial_schema
Revises:
Create Date: 2026-08-30
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0001_initial_schema"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def timestamp_columns() -> list[sa.Column[object]]:
    return [
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
    ]


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("google_subject", sa.String(length=255), nullable=True),
        sa.Column("email", sa.String(length=320), nullable=True),
        sa.Column("role", sa.String(length=16), nullable=False),
        *timestamp_columns(),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("email"),
        sa.UniqueConstraint("google_subject"),
    )
    op.create_table(
        "reading_items",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("passage", sa.Text(), nullable=False),
        sa.Column("question", sa.Text(), nullable=False),
        sa.Column("explanation", sa.Text(), nullable=False),
        sa.Column("official_level", sa.String(length=2), nullable=False),
        sa.Column("length_type", sa.String(length=16), nullable=False),
        sa.Column("topic", sa.String(length=32), nullable=False),
        sa.Column("recommended_seconds", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        *timestamp_columns(),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_reading_items_official_level", "reading_items", ["official_level"])
    op.create_index("ix_reading_items_length_type", "reading_items", ["length_type"])
    op.create_index("ix_reading_items_topic", "reading_items", ["topic"])
    op.create_index("ix_reading_items_status", "reading_items", ["status"])
    op.create_table(
        "reading_choices",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("reading_item_id", sa.Uuid(), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("canonical_order", sa.Integer(), nullable=False),
        sa.Column("is_correct", sa.Boolean(), nullable=False),
        sa.Column("wrong_explanation", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["reading_item_id"], ["reading_items.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "attempts",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("reading_item_id", sa.Uuid(), nullable=False),
        sa.Column("selected_choice_id", sa.Uuid(), nullable=True),
        sa.Column("is_correct", sa.Boolean(), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("abandoned_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("elapsed_seconds", sa.Integer(), nullable=True),
        *timestamp_columns(),
        sa.ForeignKeyConstraint(["reading_item_id"], ["reading_items.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_attempts_user_id", "attempts", ["user_id"])
    op.create_index("ix_attempts_reading_item_id", "attempts", ["reading_item_id"])
    op.create_table(
        "item_feedback",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("reading_item_id", sa.Uuid(), nullable=False),
        sa.Column("quality_rating", sa.Integer(), nullable=False),
        sa.Column("perceived_level", sa.String(length=2), nullable=False),
        sa.Column("comment", sa.Text(), nullable=True),
        *timestamp_columns(),
        sa.ForeignKeyConstraint(["reading_item_id"], ["reading_items.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "reading_item_id", name="uq_feedback_user_item"),
    )
    op.create_table(
        "item_reports",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("reading_item_id", sa.Uuid(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        *timestamp_columns(),
        sa.ForeignKeyConstraint(["reading_item_id"], ["reading_items.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "generation_jobs",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("requested_by", sa.Uuid(), nullable=False),
        sa.Column("idempotency_key", sa.String(length=255), nullable=True),
        sa.Column("graph_thread_id", sa.String(length=255), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("current_node", sa.String(length=64), nullable=False),
        sa.Column("official_level", sa.String(length=2), nullable=False),
        sa.Column("length_type", sa.String(length=16), nullable=False),
        sa.Column("topic", sa.String(length=32), nullable=False),
        sa.Column("revision_count", sa.Integer(), nullable=False),
        sa.Column("generator_model", sa.String(length=128), nullable=False),
        sa.Column("answer_validator_model", sa.String(length=128), nullable=False),
        sa.Column("quality_validator_model", sa.String(length=128), nullable=False),
        sa.Column("prompt_version", sa.String(length=64), nullable=False),
        sa.Column("input_tokens", sa.Integer(), nullable=True),
        sa.Column("output_tokens", sa.Integer(), nullable=True),
        sa.Column("estimated_cost_usd", sa.Numeric(precision=12, scale=6), nullable=True),
        sa.Column("actual_cost_usd", sa.Numeric(precision=12, scale=6), nullable=True),
        sa.Column("error_code", sa.String(length=64), nullable=True),
        sa.Column("error_detail", sa.Text(), nullable=True),
        sa.Column("generated_item_id", sa.Uuid(), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        *timestamp_columns(),
        sa.ForeignKeyConstraint(["generated_item_id"], ["reading_items.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["requested_by"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("graph_thread_id"),
        sa.UniqueConstraint("requested_by", "idempotency_key", name="uq_generation_job_idempotency"),
    )
    op.create_index("ix_generation_jobs_requested_by", "generation_jobs", ["requested_by"])
    op.create_index("ix_generation_jobs_idempotency_key", "generation_jobs", ["idempotency_key"])
    op.create_index("ix_generation_jobs_status", "generation_jobs", ["status"])
    op.create_table(
        "item_validations",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("generation_job_id", sa.Uuid(), nullable=False),
        sa.Column("reading_item_id", sa.Uuid(), nullable=True),
        sa.Column("validator_role", sa.String(length=16), nullable=False),
        sa.Column("model_id", sa.String(length=128), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("score", sa.Integer(), nullable=True),
        sa.Column("issue_codes", sa.JSON(), nullable=False),
        sa.Column("evidence", sa.JSON(), nullable=False),
        sa.Column("raw_response", sa.JSON(), nullable=False),
        *timestamp_columns(),
        sa.ForeignKeyConstraint(["generation_job_id"], ["generation_jobs.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["reading_item_id"], ["reading_items.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    op.drop_table("item_validations")
    op.drop_index("ix_generation_jobs_status", table_name="generation_jobs")
    op.drop_index("ix_generation_jobs_idempotency_key", table_name="generation_jobs")
    op.drop_index("ix_generation_jobs_requested_by", table_name="generation_jobs")
    op.drop_table("generation_jobs")
    op.drop_table("item_reports")
    op.drop_table("item_feedback")
    op.drop_index("ix_attempts_reading_item_id", table_name="attempts")
    op.drop_index("ix_attempts_user_id", table_name="attempts")
    op.drop_table("attempts")
    op.drop_table("reading_choices")
    op.drop_index("ix_reading_items_status", table_name="reading_items")
    op.drop_index("ix_reading_items_topic", table_name="reading_items")
    op.drop_index("ix_reading_items_length_type", table_name="reading_items")
    op.drop_index("ix_reading_items_official_level", table_name="reading_items")
    op.drop_table("reading_items")
    op.drop_table("users")
