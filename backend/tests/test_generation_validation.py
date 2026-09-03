from types import SimpleNamespace

import pytest

from app.graphs.generation import (
    COMPACT_OUTPUT_RETRY_FEEDBACK,
    OUTPUT_RETRY_EXHAUSTED_CODE,
    enforce_validation_gate,
    structured_output_retry_update,
    validation_feedback,
)
from app.schemas import (
    GeneratedChoice,
    GeneratedReading,
    GenerationConditions,
    ValidatorOutcome,
)
from app.services.generation_provider import (
    AnthropicGenerationProvider,
    GenerationOutputFormatError,
    GenerationOutputTruncatedError,
    GENERATOR_MAX_TOKENS_BY_LENGTH,
    ModelUsage,
    StubGenerationProvider,
    estimate_usage_cost,
)
from app.services.validation import validate_generated_reading


def _sample_generated_reading() -> GeneratedReading:
    return GeneratedReading(
        title="背景を考える",
        passage="結果だけを見ると、理由を見落とすことがある。",
        question="筆者が大切だと考えていることは何か。",
        choices=[
            GeneratedChoice(
                text="早く決めること。",
                is_correct=False,
                wrong_explanation="本文は結論を急がず理由を確かめるよう述べている。",
                distractor_type="relation_or_agent_reversal",
            ),
            GeneratedChoice(text="理由を確かめること。", is_correct=True),
            GeneratedChoice(
                text="数だけを比べること。",
                is_correct=False,
                wrong_explanation="本文の一部の表現だけに注目している。",
                distractor_type="partial_truth_off_focus",
            ),
            GeneratedChoice(
                text="意見を必ず避けること。",
                is_correct=False,
                wrong_explanation="本文は意見を避けるよう述べていない。",
                distractor_type="scope_or_degree_distortion",
            ),
        ],
        explanation="本文は理由を確かめる大切さを述べている。",
    )


@pytest.mark.asyncio
async def test_stub_generation_passes_deterministic_checks() -> None:
    conditions = GenerationConditions(
        official_level="N2", length_type="medium", topic="교육"
    )
    result = await StubGenerationProvider().generate(conditions, [], "stub")
    item = result.value

    assert validate_generated_reading(item, "medium") == []
    assert len(item.choices) == 4
    assert sum(choice.is_correct for choice in item.choices) == 1
    assert item.explanation.startswith("글은")
    assert item.choices[0].wrong_explanation.startswith("글은")


@pytest.mark.asyncio
async def test_stub_answer_validator_identifies_the_only_correct_choice() -> None:
    conditions = GenerationConditions(
        official_level="N3", length_type="short", topic="생활"
    )
    provider = StubGenerationProvider()
    item = (await provider.generate(conditions, [], "stub")).value
    outcome = (await provider.verify_answer(item, "ja", "stub")).value

    assert outcome.status == "passed"
    assert outcome.correct_choice_index == 3


class FakeParsedResponse:
    def __init__(self, parsed_output: object, stop_reason: str = "end_turn") -> None:
        self.parsed_output = parsed_output
        self.stop_reason = stop_reason
        self.usage = SimpleNamespace(
            input_tokens=300,
            output_tokens=200,
            cache_creation_input_tokens=600,
            cache_read_input_tokens=0,
        )


class FakeAnthropicMessages:
    def __init__(self, stop_reason: str = "end_turn") -> None:
        self.calls: list[dict[str, object]] = []
        self.stop_reason = stop_reason

    async def parse(self, **kwargs: object) -> FakeParsedResponse:
        self.calls.append(kwargs)
        output_format = kwargs["output_format"]
        if output_format is GeneratedReading:
            return FakeParsedResponse(_sample_generated_reading(), self.stop_reason)
        if output_format is ValidatorOutcome:
            return FakeParsedResponse(
                ValidatorOutcome(
                    status="passed",
                    score=94,
                    evidence=["Supported by the passage."],
                    correct_choice_index=2,
                ),
                self.stop_reason,
            )
        raise AssertionError(f"Unexpected output format: {output_format}")


def _anthropic_provider_with_fake_client(
    messages: FakeAnthropicMessages,
) -> AnthropicGenerationProvider:
    provider = AnthropicGenerationProvider.__new__(AnthropicGenerationProvider)
    provider.client = SimpleNamespace(messages=messages)
    return provider


@pytest.mark.asyncio
async def test_anthropic_generation_uses_native_structured_output() -> None:
    messages = FakeAnthropicMessages()
    provider = _anthropic_provider_with_fake_client(messages)
    conditions = GenerationConditions(
        official_level="N2", length_type="medium", topic="교육"
    )

    result = await provider.generate(conditions, [], "generator-model")
    item = result.value

    assert item.title == "背景を考える"
    assert item.choices[1].is_correct is True
    assert messages.calls[0]["output_format"] is GeneratedReading
    assert messages.calls[0]["model"] == "generator-model"
    assert messages.calls[0]["max_tokens"] == GENERATOR_MAX_TOKENS_BY_LENGTH["medium"]
    assert messages.calls[0]["system"][0]["cache_control"] == {"type": "ephemeral"}
    assert result.usage.total_input_tokens == 900
    assert "Write the explanation and every wrongExplanation naturally in Korean." in messages.calls[0]["messages"][0]["content"]


@pytest.mark.asyncio
async def test_anthropic_generation_rejects_truncated_structured_output() -> None:
    messages = FakeAnthropicMessages(stop_reason="max_tokens")
    provider = _anthropic_provider_with_fake_client(messages)
    conditions = GenerationConditions(
        official_level="N2", length_type="medium", topic="교육"
    )

    with pytest.raises(GenerationOutputTruncatedError, match="token limit") as error:
        await provider.generate(conditions, [], "generator-model")

    assert error.value.usage is not None
    assert error.value.usage.output_tokens == 200


class InvalidJsonAnthropicMessages:
    async def parse(self, **kwargs: object) -> FakeParsedResponse:
        GeneratedReading.model_validate_json("not valid JSON")
        raise AssertionError("Expected Pydantic validation to raise.")


@pytest.mark.asyncio
async def test_anthropic_generation_identifies_invalid_structured_json() -> None:
    provider = _anthropic_provider_with_fake_client(InvalidJsonAnthropicMessages())
    conditions = GenerationConditions(
        official_level="N2", length_type="medium", topic="교육"
    )

    with pytest.raises(GenerationOutputFormatError, match="requested structured output"):
        await provider.generate(conditions, [], "generator-model")


@pytest.mark.asyncio
async def test_anthropic_validators_use_native_structured_output() -> None:
    messages = FakeAnthropicMessages()
    provider = _anthropic_provider_with_fake_client(messages)
    item = _sample_generated_reading()
    conditions = GenerationConditions(
        official_level="N2", length_type="medium", topic="교육"
    )

    answer = (await provider.verify_answer(item, "ja", "validator-model")).value
    quality = (await provider.verify_quality(item, conditions, "validator-model")).value

    assert answer.status == "passed"
    assert quality.correct_choice_index == 2
    assert [call["output_format"] for call in messages.calls] == [
        ValidatorOutcome,
        ValidatorOutcome,
    ]
    assert [call["model"] for call in messages.calls] == [
        "validator-model",
        "validator-model",
    ]
    assert "DISTRACTOR_TYPE_MISMATCH" in messages.calls[1]["system"][0]["text"]
    assert messages.calls[1]["system"][0]["cache_control"] == {"type": "ephemeral"}


@pytest.mark.asyncio
async def test_stub_generation_supports_korean_topik_conditions() -> None:
    conditions = GenerationConditions(
        language="ko",
        official_level="TOPIK 6급+",
        length_type="short",
        topic="과학",
    )

    item = (await StubGenerationProvider().generate(conditions, [], "stub")).value

    assert "글쓴이" in item.question
    assert validate_generated_reading(item, "short", "ko") == []
    assert item.explanation.startswith("本文は")
    assert item.choices[0].wrong_explanation.startswith("本文は")


@pytest.mark.asyncio
async def test_anthropic_korean_generation_requests_japanese_explanations() -> None:
    messages = FakeAnthropicMessages()
    provider = _anthropic_provider_with_fake_client(messages)
    conditions = GenerationConditions(
        language="ko",
        official_level="TOPIK 4급",
        length_type="medium",
        topic="생활",
    )

    await provider.generate(conditions, [], "generator-model")

    assert "Write the explanation and every wrongExplanation naturally in Japanese." in messages.calls[0]["messages"][0]["content"]


def test_validator_outcome_accepts_structured_evidence_entries() -> None:
    outcome = ValidatorOutcome.model_validate(
        {
            "status": "warning",
            "score": 72,
            "evidence": [
                {
                    "issueCode": "WEAK_DISTRACTOR",
                    "message": "Distractor choice is too easy to eliminate.",
                },
                {
                    "issueCode": "DISTRACTOR_OVERLAP",
                    "description": "Two incorrect choices overlap in meaning.",
                },
            ],
        }
    )
    assert outcome.issue_codes == ["WEAK_DISTRACTOR", "DISTRACTOR_OVERLAP"]
    assert outcome.evidence == [
        "WEAK_DISTRACTOR: Distractor choice is too easy to eliminate.",
        "DISTRACTOR_OVERLAP: Two incorrect choices overlap in meaning.",
    ]


def test_usage_cost_counts_cache_reads_separately() -> None:
    usage = ModelUsage(
        model="claude-fable-5",
        input_tokens=1_000_000,
        cache_creation_input_tokens=1_000_000,
        cache_read_input_tokens=1_000_000,
        output_tokens=1_000_000,
    )

    assert estimate_usage_cost(usage) == 73.5


def test_structured_output_retry_is_limited_and_keeps_failed_attempt_usage() -> None:
    error = GenerationOutputTruncatedError(
        "The model response reached its output token limit.",
        ModelUsage(model="claude-fable-5", input_tokens=120, output_tokens=5_000),
    )
    first_retry = structured_output_retry_update(
        {
            "output_retry_count": 0,
            "revision_feedback": ["quality: WEAK_DISTRACTOR"],
        },
        error,
        maximum_retries=1,
    )

    assert first_retry["output_retry_count"] == 1
    assert "중간에 잘려" in first_retry["output_retry_error"]
    assert first_retry["revision_feedback"] == [
        "quality: WEAK_DISTRACTOR",
        COMPACT_OUTPUT_RETRY_FEEDBACK,
    ]
    assert first_retry["usage_events"] == [
        {
            "stage": "generate",
            "model": "claude-fable-5",
            "input_tokens": 120,
            "output_tokens": 5_000,
            "cache_creation_input_tokens": 0,
            "cache_read_input_tokens": 0,
            "stop_reason": None,
        }
    ]

    exhausted = structured_output_retry_update(
        {"output_retry_count": 1},
        error,
        maximum_retries=1,
    )

    assert exhausted["terminal_status"] == "failed"
    assert exhausted["failure_code"] == OUTPUT_RETRY_EXHAUSTED_CODE


@pytest.mark.parametrize(
    ("length_type", "expected_max_tokens"),
    [
        ("short", 3_500),
        ("medium", 5_000),
        ("long", 7_000),
    ],
)
def test_generation_output_budget_scales_by_requested_length(
    length_type: str, expected_max_tokens: int
) -> None:
    assert GENERATOR_MAX_TOKENS_BY_LENGTH[length_type] == expected_max_tokens


def test_deterministic_validation_requires_distinct_distractor_types() -> None:
    item = _sample_generated_reading()
    item.choices[2] = item.choices[2].model_copy(
        update={"distractor_type": "relation_or_agent_reversal"}
    )

    issues = validate_generated_reading(item, "short")

    assert "duplicate_distractor_type" in issues


def test_validation_gate_rejects_low_scores_and_preserves_repair_feedback() -> None:
    answer = enforce_validation_gate(
        ValidatorOutcome(status="passed", score=61), "answer"
    )
    quality = ValidatorOutcome(
        status="warning",
        score=82,
        issue_codes=["WEAK_DISTRACTOR"],
        evidence=["Choice 3 is unrelated to the passage."],
    )
    feedback = validation_feedback(
        {
            "schema_issues": [],
            "answer_validation": answer.model_dump(mode="json"),
            "quality_validation": quality.model_dump(mode="json"),
        }
    )

    assert answer.status == "warning"
    assert "answer_score_below_85" in answer.issue_codes
    assert "quality: WEAK_DISTRACTOR" in feedback
    assert "quality: Choice 3 is unrelated to the passage." in feedback
