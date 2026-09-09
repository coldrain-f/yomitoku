"""Add indexes used by paginated reading-list metrics.

Revision ID: 0010_list_query_indexes
Revises: 0009_multiple_questions
Create Date: 2026-09-09
"""

from collections.abc import Sequence

from alembic import op


revision: str = "0010_list_query_indexes"
down_revision: str | None = "0009_multiple_questions"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_index(
        "ix_attempts_user_item_submitted",
        "attempts",
        ["user_id", "reading_item_id", "submitted_at"],
    )
    op.create_index(
        "ix_attempts_item_submitted_user",
        "attempts",
        ["reading_item_id", "submitted_at", "user_id"],
    )
    op.create_index("ix_item_feedback_reading_item_id", "item_feedback", ["reading_item_id"])
    op.create_index("ix_item_reports_reading_item_id", "item_reports", ["reading_item_id"])


def downgrade() -> None:
    op.drop_index("ix_item_reports_reading_item_id", table_name="item_reports")
    op.drop_index("ix_item_feedback_reading_item_id", table_name="item_feedback")
    op.drop_index("ix_attempts_item_submitted_user", table_name="attempts")
    op.drop_index("ix_attempts_user_item_submitted", table_name="attempts")
