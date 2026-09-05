"""Store learner-specific passage highlights."""

import sqlalchemy as sa

from alembic import op

revision = "0008_passage_highlights"
down_revision = "0007_attempt_choice_order"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "passage_highlights",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("reading_item_id", sa.Uuid(), nullable=False),
        sa.Column("start_offset", sa.Integer(), nullable=False),
        sa.Column("end_offset", sa.Integer(), nullable=False),
        sa.Column("selected_text", sa.Text(), nullable=False),
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
        sa.ForeignKeyConstraint(["reading_item_id"], ["reading_items.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "user_id",
            "reading_item_id",
            "start_offset",
            "end_offset",
            name="uq_passage_highlight_range",
        ),
    )
    op.create_index("ix_passage_highlights_user_id", "passage_highlights", ["user_id"])
    op.create_index(
        "ix_passage_highlights_reading_item_id",
        "passage_highlights",
        ["reading_item_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_passage_highlights_reading_item_id", table_name="passage_highlights")
    op.drop_index("ix_passage_highlights_user_id", table_name="passage_highlights")
    op.drop_table("passage_highlights")
