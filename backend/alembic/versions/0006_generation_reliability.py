"""Track worker liveness and incomplete provider usage."""

import sqlalchemy as sa

from alembic import op

revision = "0006_generation_reliability"
down_revision = "0005_add_generation_job_keywords"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("generation_jobs", sa.Column("heartbeat_at", sa.DateTime(timezone=True)))
    op.add_column(
        "generation_usage_events",
        sa.Column("usage_status", sa.String(16), nullable=False, server_default="recorded"),
    )


def downgrade() -> None:
    op.drop_column("generation_usage_events", "usage_status")
    op.drop_column("generation_jobs", "heartbeat_at")
