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
    perceived_level: JlptLevel | None = None
    perceived_level_visible: bool = False
    my_latest_status: Literal["correct", "wrong"] | None = None


class ReadingItemPage(ApiModel):
    items: list[ReadingItemSummary]
    page: int
    page_size: int
    total_items: int
    total_pages: int


class HealthResponse(ApiModel):
    status: Literal["ok"]
    database: Literal["ok"]


class CurrentUserResponse(ApiModel):
    id: UUID
    role: Literal["learner", "admin"]


class ReadingChoicePublic(ApiModel):
    id: UUID
    text: str


class ReadingItemDetail(ApiModel):
    id: UUID
    title: str
    official_level: JlptLevel
    length_type: LengthType
    topic: str
    recommended_seconds: int
    passage: str
    question: str
    choices: list[ReadingChoicePublic]


class AttemptStarted(ApiModel):
    id: UUID
    item_id: UUID
    started_at: datetime
    choices: list[ReadingChoicePublic]


class AttemptSubmitRequest(ApiModel):
    selected_choice_id: UUID
    client_elapsed_seconds: int = Field(ge=0, le=14_400)


class AttemptResult(ApiModel):
    attempt_id: UUID
    item_id: UUID
    is_correct: bool
    selected_choice_id: UUID
    correct_choice_id: UUID
    explanation: str
    selected_choice_wrong_explanation: str | None
    elapsed_seconds: int
    recommended_seconds: int
    item_accuracy: float | None
    challenger_count: int


class FeedbackRequest(ApiModel):
    quality_rating: int = Field(ge=1, le=5)
    perceived_level: JlptLevel
    comment: str | None = Field(default=None, max_length=2_000)


class ReportRequest(ApiModel):
    content: str = Field(min_length=1, max_length=4_000)


class StatisticGroup(ApiModel):
    key: str
    completed_count: int
    total_count: int
    accuracy: float | None
    average_elapsed_seconds: int | None


class StatisticsResponse(ApiModel):
    completed_count: int
    total_generated_count: int
    accuracy: float | None
    average_elapsed_seconds: int | None
    by_length: list[StatisticGroup]
    by_level: list[StatisticGroup]


class ReadingChoiceInput(ApiModel):
    id: UUID | None = None
    text: str = Field(min_length=1, max_length=2_000)
    is_correct: bool
    wrong_explanation: str | None = Field(default=None, max_length=4_000)


class AdminReadingItemDetail(ReadingItemSummary):
    passage: str
    question: str
    explanation: str
    choices: list[ReadingChoiceInput]
    perceived_vote_count: int
    quality_average: float | None
    report_count: int
    challenger_count: int
    item_accuracy: float | None


class AdminReadingItemCreate(ApiModel):
    title: str = Field(min_length=1, max_length=255)
    passage: str = Field(min_length=1)
    question: str = Field(min_length=1)
    explanation: str = Field(min_length=1)
    official_level: JlptLevel
    length_type: LengthType
    topic: str = Field(min_length=1, max_length=32)
    recommended_seconds: int = Field(ge=1, le=14_400)
    choices: list[ReadingChoiceInput]

    @model_validator(mode="after")
    def validate_choices(self) -> "AdminReadingItemCreate":
        validate_choice_inputs(self.choices)
        return self


class AdminReadingItemUpdate(ApiModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    passage: str | None = Field(default=None, min_length=1)
    question: str | None = Field(default=None, min_length=1)
    explanation: str | None = Field(default=None, min_length=1)
    official_level: JlptLevel | None = None
    length_type: LengthType | None = None
    topic: str | None = Field(default=None, min_length=1, max_length=32)
    recommended_seconds: int | None = Field(default=None, ge=1, le=14_400)
    choices: list[ReadingChoiceInput] | None = None

    @model_validator(mode="after")
    def validate_choices(self) -> "AdminReadingItemUpdate":
        if self.choices is not None:
            validate_choice_inputs(self.choices)
        return self


def validate_choice_inputs(choices: list[ReadingChoiceInput]) -> None:
    if len(choices) != 4:
        raise ValueError("Exactly four choices are required.")
    if sum(choice.is_correct for choice in choices) != 1:
        raise ValueError("Exactly one choice must be correct.")
    normalized = [choice.text.strip() for choice in choices]
    if len(set(normalized)) != len(normalized):
        raise ValueError("Choice text must be unique.")
