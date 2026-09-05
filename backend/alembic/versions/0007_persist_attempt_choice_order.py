"""Persist the shuffled choice order issued to each learner attempt."""

import sqlalchemy as sa

from alembic import op

revision = "0007_persist_attempt_choice_order"
down_revision = "0006_generation_reliability"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "attempts",
        sa.Column("choice_order", sa.JSON(), nullable=False, server_default=sa.text("'[]'")),
    )


def downgrade() -> None:
    op.drop_column("attempts", "choice_order")
