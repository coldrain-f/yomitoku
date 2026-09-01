import pytest
from pydantic import ValidationError

from app.schemas import GenerationConditions
from app.services.reading_policy import RECOMMENDED_SECONDS, is_level_for_language


def test_japanese_levels_include_n1_plus() -> None:
    assert is_level_for_language("ja", "N1+")
    assert not is_level_for_language("ko", "N1+")


def test_korean_levels_include_topik_six_plus() -> None:
    assert is_level_for_language("ko", "TOPIK 6급+")
    assert not is_level_for_language("ja", "TOPIK 6급+")


def test_generation_conditions_reject_a_level_from_another_language() -> None:
    with pytest.raises(ValidationError, match="does not belong"):
        GenerationConditions(
            language="ko",
            official_level="N2",
            length_type="medium",
            topic="교육",
        )


def test_recommended_seconds_match_the_reading_lengths() -> None:
    assert RECOMMENDED_SECONDS == {"short": 180, "medium": 300, "long": 420}
