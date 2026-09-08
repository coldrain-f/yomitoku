"""Support several questions for one reading passage."""

from uuid import uuid4

import sqlalchemy as sa

from alembic import op

revision = "0009_multiple_questions"
down_revision = "0008_passage_highlights"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "reading_items",
        sa.Column(
            "content_source",
            sa.String(length=16),
            server_default="manual",
            nullable=False,
        ),
    )
    op.create_table(
        "reading_questions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("reading_item_id", sa.Uuid(), nullable=False),
        sa.Column("question", sa.Text(), nullable=False),
        sa.Column("explanation", sa.Text(), nullable=False),
        sa.Column("canonical_order", sa.Integer(), nullable=False),
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
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_reading_questions_reading_item_id", "reading_questions", ["reading_item_id"])
    op.add_column(
        "reading_choices",
        sa.Column("reading_question_id", sa.Uuid(), nullable=True),
    )
    op.create_foreign_key(
        "fk_reading_choices_reading_question_id",
        "reading_choices",
        "reading_questions",
        ["reading_question_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_table(
        "attempt_answers",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("attempt_id", sa.Uuid(), nullable=False),
        sa.Column("reading_question_id", sa.Uuid(), nullable=False),
        sa.Column("selected_choice_id", sa.Uuid(), nullable=True),
        sa.Column("choice_order", sa.JSON(), nullable=False),
        sa.Column("is_correct", sa.Boolean(), nullable=True),
        sa.ForeignKeyConstraint(["attempt_id"], ["attempts.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["reading_question_id"], ["reading_questions.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("attempt_id", "reading_question_id", name="uq_attempt_question"),
    )
    op.create_index("ix_attempt_answers_attempt_id", "attempt_answers", ["attempt_id"])

    bind = op.get_bind()
    question_rows = bind.execute(
        sa.text("SELECT id, question, explanation FROM reading_items")
    ).mappings()
    item_questions: dict[object, object] = {}
    for row in question_rows:
        question_id = uuid4()
        item_questions[row["id"]] = question_id
        bind.execute(
            sa.text(
                """
                INSERT INTO reading_questions
                    (id, reading_item_id, question, explanation, canonical_order)
                VALUES (:id, :reading_item_id, :question, :explanation, 1)
                """
            ),
            {
                "id": question_id,
                "reading_item_id": row["id"],
                "question": row["question"],
                "explanation": row["explanation"],
            },
        )
        bind.execute(
            sa.text(
                "UPDATE reading_choices SET reading_question_id = :question_id "
                "WHERE reading_item_id = :item_id"
            ),
            {"question_id": question_id, "item_id": row["id"]},
        )

    attempt_answers = sa.table(
        "attempt_answers",
        sa.column("id", sa.Uuid()),
        sa.column("attempt_id", sa.Uuid()),
        sa.column("reading_question_id", sa.Uuid()),
        sa.column("selected_choice_id", sa.Uuid()),
        sa.column("choice_order", sa.JSON()),
        sa.column("is_correct", sa.Boolean()),
    )
    attempt_rows = bind.execute(
        sa.text(
            """
            SELECT id, reading_item_id, selected_choice_id, choice_order, is_correct
            FROM attempts
            """
        )
    ).mappings()
    for row in attempt_rows:
        question_id = item_questions.get(row["reading_item_id"])
        if question_id is None:
            continue
        bind.execute(
            attempt_answers.insert().values(
                {
                    "id": uuid4(),
                    "attempt_id": row["id"],
                    "reading_question_id": question_id,
                    "selected_choice_id": row["selected_choice_id"],
                    "choice_order": row["choice_order"],
                    "is_correct": row["is_correct"],
                }
            )
        )

    bind.execute(
        sa.text(
            """
            UPDATE reading_items
            SET content_source = 'ai'
            WHERE id IN (
                SELECT generated_item_id
                FROM generation_jobs
                WHERE generated_item_id IS NOT NULL
            )
            """
        )
    )


def downgrade() -> None:
    op.drop_index("ix_attempt_answers_attempt_id", table_name="attempt_answers")
    op.drop_table("attempt_answers")
    op.drop_constraint(
        "fk_reading_choices_reading_question_id", "reading_choices", type_="foreignkey"
    )
    op.drop_column("reading_choices", "reading_question_id")
    op.drop_index("ix_reading_questions_reading_item_id", table_name="reading_questions")
    op.drop_table("reading_questions")
    op.drop_column("reading_items", "content_source")
