import json
from datetime import datetime
from typing import Any, Literal
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


ReadingLanguage = Literal["ja", "ko"]
JapaneseLevel = Literal["N5", "N4", "N3", "N2", "N1", "N1+"]
KoreanLevel = Literal[
    "TOPIK 1급",
    "TOPIK 2급",
    "TOPIK 3급",
    "TOPIK 4급",
    "TOPIK 5급",
    "TOPIK 6급",
    "TOPIK 6급+",
    "측정불가",
]
ReadingLevel = JapaneseLevel | KoreanLevel
LengthType = Literal["short", "medium", "long"]
ValidationStatus = Literal["passed", "warning", "failed"]
DistractorType = Literal[
    "background_knowledge_trap",
    "relation_or_agent_reversal",
    "partial_truth_off_focus",
    "scope_or_degree_distortion",
    "unsupported_inference",
]


class GenerationConditions(ApiModel):
    official_level: ReadingLevel
    length_type: LengthType
    topic: str = Field(min_length=1, max_length=32)
    keywords: list[str] = Field(default_factory=list, max_length=5)
    language: ReadingLanguage = "ja"

    @model_validator(mode="after")
    def validate_level_for_language(self) -> "GenerationConditions":
        from app.services.reading_policy import (
            is_generation_level_for_language,
            is_level_for_language,
        )

        if not is_level_for_language(self.language, self.official_level):
            raise ValueError(
                "The selected level does not belong to the content language."
            )
        if not is_generation_level_for_language(self.language, self.official_level):
            raise ValueError(
                "The selected level is not available for AI-generated content."
            )
        normalized_keywords: list[str] = []
        seen_keywords: set[str] = set()
        for keyword in self.keywords:
            normalized_keyword = keyword.strip()
            if not normalized_keyword:
                continue
            if len(normalized_keyword) > 40:
                raise ValueError("Each generation keyword must be 40 characters or fewer.")
            keyword_key = normalized_keyword.casefold()
            if keyword_key in seen_keywords:
                continue
            seen_keywords.add(keyword_key)
            normalized_keywords.append(normalized_keyword)
        self.keywords = normalized_keywords
        return self


class GenerationJobCreateRequest(GenerationConditions):
    generator_model: str | None = Field(default=None, min_length=1, max_length=128)
    validator_model: str | None = Field(default=None, min_length=1, max_length=128)


class GenerationModelOptionsResponse(ApiModel):
    models: list[str]
    default_generator_model: str
    default_validator_model: str


class GeneratedChoice(ApiModel):
    text: str = Field(min_length=1)
    is_correct: bool
    wrong_explanation: str | None = None
    distractor_type: DistractorType | None = None


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


class GeneratedTitle(ApiModel):
    title: str = Field(min_length=1, max_length=255)


class ValidatorOutcome(ApiModel):
    status: ValidationStatus
    score: int = Field(ge=0, le=100)
    issue_codes: list[str] = Field(default_factory=list)
    evidence: list[str] = Field(default_factory=list)
    correct_choice_index: int | None = Field(default=None, ge=1, le=4)

    @model_validator(mode="before")
    @classmethod
    def normalize_model_response(cls, data: Any) -> Any:
        if not isinstance(data, dict):
            return data
        values = dict(data)
        issue_codes = _coerce_issue_codes(
            values.get("issueCodes", values.get("issue_codes", []))
        )
        evidence, evidence_issue_codes = _normalize_evidence(
            values.get("evidence", [])
        )
        for issue_code in evidence_issue_codes:
            if issue_code not in issue_codes:
                issue_codes.append(issue_code)
        values["issueCodes"] = issue_codes
        values["evidence"] = evidence
        return values


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


class GenerationUsageEventResponse(ApiModel):
    event_index: int
    usage_status: Literal["pending", "recorded", "unknown"]
    stage: str
    model_id: str
    input_tokens: int
    cache_creation_input_tokens: int
    cache_read_input_tokens: int
    output_tokens: int
    actual_cost_usd: float | None
    stop_reason: str | None
    created_at: datetime


class GenerationJobHistoryItem(GenerationJobResponse):
    generator_model: str
    answer_validator_model: str
    quality_validator_model: str
    prompt_version: str
    input_tokens: int | None
    output_tokens: int | None
    cache_creation_input_tokens: int
    cache_read_input_tokens: int
    actual_cost_usd: float | None
    usage_events: list[GenerationUsageEventResponse]
    usage_complete: bool


class GenerationJobHistoryPage(ApiModel):
    items: list[GenerationJobHistoryItem]
    page: int
    page_size: int
    total_items: int
    total_pages: int


class ReadingItemSummary(ApiModel):
    id: UUID
    title: str
    language: ReadingLanguage
    official_level: ReadingLevel
    length_type: LengthType
    topic: str
    recommended_seconds: int
    status: str
    published_at: datetime | None
    created_at: datetime
    updated_at: datetime
    perceived_level: ReadingLevel | None = None
    perceived_level_visible: bool = False
    perceived_vote_count: int = 0
    item_accuracy: float | None = None
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


class GoogleCredentialRequest(ApiModel):
    credential: str = Field(min_length=1, max_length=16_384)


class AuthenticationResponse(ApiModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"
    expires_in: int
    user: CurrentUserResponse


class ReadingChoicePublic(ApiModel):
    id: UUID
    text: str


class ReadingItemDetail(ApiModel):
    id: UUID
    title: str
    language: ReadingLanguage
    official_level: ReadingLevel
    length_type: LengthType
    topic: str
    recommended_seconds: int
    passage: str
    question: str
    choices: list[ReadingChoicePublic]


class PassageTranslationResponse(ApiModel):
    source_language: ReadingLanguage
    target_language: ReadingLanguage
    source_text: str
    translated_text: str


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


class AttemptItemDetail(ReadingItemSummary):
    passage: str
    question: str
    choices: list[ReadingChoicePublic]


class AttemptState(ApiModel):
    id: UUID
    item_id: UUID
    item: AttemptItemDetail
    started_at: datetime
    elapsed_seconds: int
    selected_choice_id: UUID | None
    submitted: bool
    result: AttemptResult | None


class FeedbackRequest(ApiModel):
    quality_rating: int = Field(ge=1, le=5)
    perceived_level: ReadingLevel
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
    by_language: list[StatisticGroup]
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
    quality_average: float | None
    report_count: int
    challenger_count: int


class AdminReadingItemCreate(ApiModel):
    title: str = Field(min_length=1, max_length=255)
    passage: str = Field(min_length=1)
    question: str = Field(min_length=1)
    explanation: str = Field(min_length=1)
    language: ReadingLanguage = "ja"
    official_level: ReadingLevel
    length_type: LengthType
    topic: str = Field(min_length=1, max_length=32)
    recommended_seconds: int = Field(ge=1, le=14_400)
    choices: list[ReadingChoiceInput]

    @model_validator(mode="after")
    def validate_choices(self) -> "AdminReadingItemCreate":
        validate_choice_inputs(self.choices)
        from app.services.reading_policy import is_level_for_language

        if not is_level_for_language(self.language, self.official_level):
            raise ValueError("The selected level does not belong to the content language.")
        return self


class AdminTitleSuggestionRequest(ApiModel):
    passage: str = Field(min_length=1, max_length=20_000)
    language: ReadingLanguage


class AdminTitleSuggestionResponse(ApiModel):
    title: str


class AdminReadingItemUpdate(ApiModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    passage: str | None = Field(default=None, min_length=1)
    question: str | None = Field(default=None, min_length=1)
    explanation: str | None = Field(default=None, min_length=1)
    language: ReadingLanguage | None = None
    official_level: ReadingLevel | None = None
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


def _coerce_issue_codes(value: Any) -> list[str]:
    entries = value if isinstance(value, list) else [value]
    issue_codes: list[str] = []
    for entry in entries:
        if entry is None:
            continue
        if isinstance(entry, dict):
            issue_code = (
                entry.get("issueCode")
                or entry.get("issue_code")
                or entry.get("code")
            )
            if issue_code is None:
                continue
            entry = issue_code
        text = str(entry).strip()
        if text and text not in issue_codes:
            issue_codes.append(text)
    return issue_codes


def _normalize_evidence(value: Any) -> tuple[list[str], list[str]]:
    if value is None:
        return [], []
    entries = value if isinstance(value, list) else [value]
    evidence: list[str] = []
    issue_codes: list[str] = []
    for entry in entries:
        if entry is None:
            continue
        if isinstance(entry, dict):
            issue_code = (
                entry.get("issueCode")
                or entry.get("issue_code")
                or entry.get("code")
            )
            if issue_code is not None:
                issue_codes.append(str(issue_code).strip())
            evidence.append(_stringify_evidence_object(entry))
            continue
        evidence.append(str(entry).strip())
    return [entry for entry in evidence if entry], [
        issue_code for issue_code in issue_codes if issue_code
    ]


def _stringify_evidence_object(value: dict[str, Any]) -> str:
    issue_code = value.get("issueCode") or value.get("issue_code") or value.get("code")
    message = next(
        (
            value[key]
            for key in (
                "message",
                "detail",
                "description",
                "reason",
                "explanation",
                "evidence",
                "text",
            )
            if value.get(key)
        ),
        None,
    )
    if issue_code and message:
        return f"{issue_code}: {_stringify_json_value(message)}"
    if message:
        return _stringify_json_value(message)
    return _stringify_json_value(value)


def _stringify_json_value(value: Any) -> str:
    if isinstance(value, str):
        return value.strip()
    try:
        return json.dumps(value, ensure_ascii=False, sort_keys=True)
    except TypeError:
        return str(value).strip()
