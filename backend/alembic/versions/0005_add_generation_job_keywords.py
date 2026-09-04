"""Store generation keywords with each job.

Revision ID: 0005_add_generation_job_keywords
Revises: 0004_add_generation_usage_events
Create Date: 2026-09-04
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0005_add_generation_job_keywords"
down_revision: str | None = "0004_add_generation_usage_events"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "generation_jobs",
        sa.Column(
            "keywords",
            sa.JSON(),
            server_default=sa.text("'[]'::json"),
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_column("generation_jobs", "keywords")
