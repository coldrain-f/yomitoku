from types import SimpleNamespace

import pytest

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
            GeneratedChoice(text="早く決めること。", is_correct=False),
            GeneratedChoice(text="理由を確かめること。", is_correct=True),
            GeneratedChoice(text="数だけを比べること。", is_correct=False),
            GeneratedChoice(text="意見を避けること。", is_correct=False),
        ],
        explanation="本文は理由を確かめる大切さを述べている。",
    )


@pytest.mark.asyncio
async def test_stub_generation_passes_deterministic_checks() -> None:
    conditions = GenerationConditions(
        official_level="N2", length_type="medium", topic="교육"
    )
    item = await StubGenerationProvider().generate(conditions, [])

    assert validate_generated_reading(item, "medium") == []
    assert len(item.choices) == 4
    assert sum(choice.is_correct for choice in item.choices) == 1


@pytest.mark.asyncio
async def test_stub_answer_validator_identifies_the_only_correct_choice() -> None:
    conditions = GenerationConditions(
        official_level="N3", length_type="short", topic="생활"
    )
    provider = StubGenerationProvider()
    item = await provider.generate(conditions, [])
    outcome = await provider.verify_answer(item)

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
    provider.generator_model = "claude-fable-5"
    provider.answer_validator_model = "claude-fable-5"
    provider.quality_validator_model = "claude-fable-5"
    return provider


@pytest.mark.asyncio
async def test_anthropic_generation_uses_native_structured_output() -> None:
    messages = FakeAnthropicMessages()
    provider = _anthropic_provider_with_fake_client(messages)
    conditions = GenerationConditions(
        official_level="N2", length_type="medium", topic="교육"
    )

    item = await provider.generate(conditions, [])

    assert item.title == "背景を考える"
    assert item.choices[1].is_correct is True
    assert messages.calls[0]["output_format"] is GeneratedReading


@pytest.mark.asyncio
async def test_anthropic_validators_use_native_structured_output() -> None:
    messages = FakeAnthropicMessages()
    provider = _anthropic_provider_with_fake_client(messages)
    item = _sample_generated_reading()

    answer = await provider.verify_answer(item)
    quality = await provider.verify_quality(item)

    assert answer.status == "passed"
    assert quality.correct_choice_index == 2
    assert [call["output_format"] for call in messages.calls] == [
        ValidatorOutcome,
        ValidatorOutcome,
    ]


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
