from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator


def to_camel(value: str) -> str:
    head, *tail = value.split("_")
    return head + "".join(part.title() for part in tail)


class ApiModel(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        from_attributes=True,
    )


JlptLevel = Literal["N5", "N4", "N3", "N2", "N1"]
LengthType = Literal["short", "medium", "long"]
ValidationStatus = Literal["passed", "warning", "failed"]


class GenerationConditions(ApiModel):
    official_level: JlptLevel
    length_type: LengthType
    topic: str = Field(min_length=1, max_length=32)


class GeneratedChoice(ApiModel):
    text: str = Field(min_length=1)
    is_correct: bool
    wrong_explanation: str | None = None


class GeneratedReading(ApiModel):
    title: str = Field(min_length=1, max_length=255)
    passage: str = Field(min_length=1)
    question: str = Field(min_length=1)
    choices: list[GeneratedChoice]
    explanation: str = Field(min_length=1)

    @model_validator(mode="after")
    def validate_choices(self) -> "GeneratedReading":
        if len(self.choices) != 4:
            raise ValueError("Exactly four choices are required.")
        if sum(choice.is_correct for choice in self.choices) != 1:
            raise ValueError("Exactly one choice must be correct.")
        normalized = [choice.text.strip() for choice in self.choices]
        if len(set(normalized)) != len(normalized):
            raise ValueError("Choice text must be unique.")
        return self


class ValidatorOutcome(ApiModel):
    status: ValidationStatus
    score: int = Field(ge=0, le=100)
    issue_codes: list[str] = Field(default_factory=list)
    evidence: list[str] = Field(default_factory=list)
    correct_choice_index: int | None = Field(default=None, ge=1, le=4)


class GenerationJobResponse(ApiModel):
    id: UUID
    status: str
    current_node: str
    conditions: GenerationConditions
    revision_count: int
    generated_item_id: UUID | None
    error_code: str | None
    error_detail: str | None
    created_at: datetime
    started_at: datetime | None
    completed_at: datetime | None


class ReadingItemSummary(ApiModel):
    id: UUID
    title: str
    official_level: JlptLevel
    length_type: LengthType
    topic: str
    recommended_seconds: int
    status: str
    published_at: datetime | None
    created_at: datetime
    updated_at: datetime


class ReadingItemPage(ApiModel):
    items: list[ReadingItemSummary]
    page: int
    page_size: int
    total_items: int
    total_pages: int


class HealthResponse(ApiModel):
    status: Literal["ok"]
    database: Literal["ok"]
