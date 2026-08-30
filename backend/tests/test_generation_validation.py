import pytest

from app.schemas import GenerationConditions
from app.services.generation_provider import StubGenerationProvider
from app.services.validation import validate_generated_reading


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
