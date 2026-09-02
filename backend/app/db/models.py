from __future__ import annotations

from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import (
    JSON,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    Uuid,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class TimestampedModel:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


class User(TimestampedModel, Base):
    __tablename__ = "users"

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    google_subject: Mapped[str | None] = mapped_column(String(255), unique=True)
    email: Mapped[str | None] = mapped_column(String(320), unique=True)
    role: Mapped[str] = mapped_column(String(16), default="learner", nullable=False)


class ReadingItem(TimestampedModel, Base):
    __tablename__ = "reading_items"

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    passage: Mapped[str] = mapped_column(Text, nullable=False)
    question: Mapped[str] = mapped_column(Text, nullable=False)
    explanation: Mapped[str] = mapped_column(Text, nullable=False)
    language: Mapped[str] = mapped_column(
        String(8), default="ja", server_default="ja", nullable=False, index=True
    )
    official_level: Mapped[str] = mapped_column(String(16), nullable=False, index=True)
    length_type: Mapped[str] = mapped_column(String(16), nullable=False, index=True)
    topic: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    recommended_seconds: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(16), default="review", nullable=False, index=True)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    choices: Mapped[list[ReadingChoice]] = relationship(
        back_populates="reading_item",
        cascade="all, delete-orphan",
        order_by="ReadingChoice.canonical_order",
        lazy="selectin",
    )


class ReadingChoice(Base):
    __tablename__ = "reading_choices"

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    reading_item_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("reading_items.id", ondelete="CASCADE"), nullable=False
    )
    text: Mapped[str] = mapped_column(Text, nullable=False)
    canonical_order: Mapped[int] = mapped_column(Integer, nullable=False)
    is_correct: Mapped[bool] = mapped_column(nullable=False)
    wrong_explanation: Mapped[str | None] = mapped_column(Text)

    reading_item: Mapped[ReadingItem] = relationship(back_populates="choices")


class Attempt(TimestampedModel, Base):
    __tablename__ = "attempts"

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    reading_item_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("reading_items.id", ondelete="CASCADE"), nullable=False, index=True
    )
    selected_choice_id: Mapped[UUID | None] = mapped_column(Uuid)
    is_correct: Mapped[bool | None] = mapped_column()
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    abandoned_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    elapsed_seconds: Mapped[int | None] = mapped_column(Integer)


class ItemFeedback(TimestampedModel, Base):
    __tablename__ = "item_feedback"
    __table_args__ = (
        UniqueConstraint("user_id", "reading_item_id", name="uq_feedback_user_item"),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    reading_item_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("reading_items.id", ondelete="CASCADE"), nullable=False
    )
    quality_rating: Mapped[int] = mapped_column(Integer, nullable=False)
    perceived_level: Mapped[str] = mapped_column(String(16), nullable=False)
    comment: Mapped[str | None] = mapped_column(Text)


class ItemReport(TimestampedModel, Base):
    __tablename__ = "item_reports"

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    reading_item_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("reading_items.id", ondelete="CASCADE"), nullable=False
    )
    content: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(16), default="open", nullable=False)


class GenerationJob(TimestampedModel, Base):
    __tablename__ = "generation_jobs"
    __table_args__ = (
        UniqueConstraint(
            "requested_by", "idempotency_key", name="uq_generation_job_idempotency"
        ),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    requested_by: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    idempotency_key: Mapped[str | None] = mapped_column(String(255), index=True)
    graph_thread_id: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="queued", nullable=False, index=True)
    current_node: Mapped[str] = mapped_column(String(64), default="queued", nullable=False)
    language: Mapped[str] = mapped_column(
        String(8), default="ja", server_default="ja", nullable=False
    )
    official_level: Mapped[str] = mapped_column(String(16), nullable=False)
    length_type: Mapped[str] = mapped_column(String(16), nullable=False)
    topic: Mapped[str] = mapped_column(String(32), nullable=False)
    revision_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    generator_model: Mapped[str] = mapped_column(String(128), nullable=False)
    answer_validator_model: Mapped[str] = mapped_column(String(128), nullable=False)
    quality_validator_model: Mapped[str] = mapped_column(String(128), nullable=False)
    prompt_version: Mapped[str] = mapped_column(String(64), nullable=False)
    input_tokens: Mapped[int | None] = mapped_column(Integer)
    output_tokens: Mapped[int | None] = mapped_column(Integer)
    estimated_cost_usd: Mapped[float | None] = mapped_column(Numeric(12, 6))
    actual_cost_usd: Mapped[float | None] = mapped_column(Numeric(12, 6))
    error_code: Mapped[str | None] = mapped_column(String(64))
    error_detail: Mapped[str | None] = mapped_column(Text)
    generated_item_id: Mapped[UUID | None] = mapped_column(
        Uuid, ForeignKey("reading_items.id", ondelete="CASCADE")
    )
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    usage_events: Mapped[list[GenerationUsageEvent]] = relationship(
        back_populates="generation_job",
        cascade="all, delete-orphan",
        order_by="GenerationUsageEvent.event_index",
        lazy="selectin",
    )


class GenerationUsageEvent(TimestampedModel, Base):
    __tablename__ = "generation_usage_events"
    __table_args__ = (
        UniqueConstraint(
            "generation_job_id",
            "event_index",
            name="uq_generation_usage_event_position",
        ),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    generation_job_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey("generation_jobs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    event_index: Mapped[int] = mapped_column(Integer, nullable=False)
    stage: Mapped[str] = mapped_column(String(32), nullable=False)
    model_id: Mapped[str] = mapped_column(String(128), nullable=False)
    input_tokens: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    cache_creation_input_tokens: Mapped[int] = mapped_column(
        Integer, default=0, nullable=False
    )
    cache_read_input_tokens: Mapped[int] = mapped_column(
        Integer, default=0, nullable=False
    )
    output_tokens: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    actual_cost_usd: Mapped[float | None] = mapped_column(Numeric(12, 6))
    stop_reason: Mapped[str | None] = mapped_column(String(32))

    generation_job: Mapped[GenerationJob] = relationship(back_populates="usage_events")


class ItemValidation(TimestampedModel, Base):
    __tablename__ = "item_validations"

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    generation_job_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("generation_jobs.id", ondelete="CASCADE"), nullable=False
    )
    reading_item_id: Mapped[UUID | None] = mapped_column(
        Uuid, ForeignKey("reading_items.id", ondelete="CASCADE")
    )
    validator_role: Mapped[str] = mapped_column(String(16), nullable=False)
    model_id: Mapped[str] = mapped_column(String(128), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False)
    score: Mapped[int | None] = mapped_column(Integer)
    issue_codes: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    evidence: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    raw_response: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
