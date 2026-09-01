from types import SimpleNamespace

import pytest

from app.graphs.generation import enforce_validation_gate, validation_feedback
from app.schemas import (
    GeneratedChoice,
    GeneratedReading,
    GenerationConditions,
    ValidatorOutcome,
)
from app.services.generation_provider import (
    AnthropicGenerationProvider,
    StubGenerationProvider,
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
    item = await StubGenerationProvider().generate(conditions, [], "stub")

    assert validate_generated_reading(item, "medium") == []
    assert len(item.choices) == 4
    assert sum(choice.is_correct for choice in item.choices) == 1


@pytest.mark.asyncio
async def test_stub_answer_validator_identifies_the_only_correct_choice() -> None:
    conditions = GenerationConditions(
        official_level="N3", length_type="short", topic="생활"
    )
    provider = StubGenerationProvider()
    item = await provider.generate(conditions, [], "stub")
    outcome = await provider.verify_answer(item, "ja", "stub")

    assert outcome.status == "passed"
    assert outcome.correct_choice_index == 3


class FakeParsedResponse:
    def __init__(self, parsed_output: object) -> None:
        self.parsed_output = parsed_output


class FakeAnthropicMessages:
    def __init__(self) -> None:
        self.calls: list[dict[str, object]] = []

    async def parse(self, **kwargs: object) -> FakeParsedResponse:
        self.calls.append(kwargs)
        output_format = kwargs["output_format"]
        if output_format is GeneratedReading:
            return FakeParsedResponse(_sample_generated_reading())
        if output_format is ValidatorOutcome:
            return FakeParsedResponse(
                ValidatorOutcome(
                    status="passed",
                    score=94,
                    evidence=["Supported by the passage."],
                    correct_choice_index=2,
                )
            )
        raise AssertionError(f"Unexpected output format: {output_format}")


def _anthropic_provider_with_fake_client(
    messages: FakeAnthropicMessages,
) -> AnthropicGenerationProvider:
    provider = AnthropicGenerationProvider.__new__(AnthropicGenerationProvider)
    provider.client = SimpleNamespace(messages=messages)
    provider.generator_temperature = 0.4
    provider.validator_temperature = 0.0
    return provider


@pytest.mark.asyncio
async def test_anthropic_generation_uses_native_structured_output() -> None:
    messages = FakeAnthropicMessages()
    provider = _anthropic_provider_with_fake_client(messages)
    conditions = GenerationConditions(
        official_level="N2", length_type="medium", topic="교육"
    )

    item = await provider.generate(conditions, [], "generator-model")

    assert item.title == "背景を考える"
    assert item.choices[1].is_correct is True
    assert messages.calls[0]["output_format"] is GeneratedReading
    assert messages.calls[0]["model"] == "generator-model"
    assert messages.calls[0]["temperature"] == 0.4


@pytest.mark.asyncio
async def test_anthropic_validators_use_native_structured_output() -> None:
    messages = FakeAnthropicMessages()
    provider = _anthropic_provider_with_fake_client(messages)
    item = _sample_generated_reading()
    conditions = GenerationConditions(
        official_level="N2", length_type="medium", topic="교육"
    )

    answer = await provider.verify_answer(item, "ja", "validator-model")
    quality = await provider.verify_quality(item, conditions, "validator-model")

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
    assert [call["temperature"] for call in messages.calls] == [0.0, 0.0]
    assert "DISTRACTOR_TYPE_MISMATCH" in messages.calls[1]["messages"][0]["content"]


@pytest.mark.asyncio
async def test_stub_generation_supports_korean_topik_conditions() -> None:
    conditions = GenerationConditions(
        language="ko",
        official_level="TOPIK 6급+",
        length_type="short",
        topic="과학",
    )

    item = await StubGenerationProvider().generate(conditions, [], "stub")

    assert "글쓴이" in item.question
    assert validate_generated_reading(item, "short", "ko") == []


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
