import pytest

from app.schemas import (
    GeneratedChoice,
    GeneratedReading,
    GenerationConditions,
    ValidatorOutcome,
)
from app.services.generation_provider import (
    StubGenerationProvider,
    _model_validate_json_response,
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


@pytest.mark.parametrize(
    "response_template",
    [
        "```json\n{}\n```",
        "`json\n{}\n`",
    ],
)
def test_generated_reading_json_response_accepts_markdown_fences(
    response_template: str,
) -> None:
    payload = _sample_generated_reading().model_dump_json(by_alias=True)
    item = _model_validate_json_response(
        GeneratedReading,
        response_template.format(payload),
    )

    assert item.title == "背景を考える"
    assert item.choices[1].is_correct is True


def test_validator_outcome_json_response_accepts_surrounding_text() -> None:
    payload = ValidatorOutcome(
        status="passed",
        score=94,
        evidence=["Supported by the passage."],
        correct_choice_index=2,
    ).model_dump_json(by_alias=True)

    outcome = _model_validate_json_response(
        ValidatorOutcome,
        f"Here is the JSON:\n{payload}\nDone.",
    )

    assert outcome.status == "passed"
    assert outcome.correct_choice_index == 2


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
