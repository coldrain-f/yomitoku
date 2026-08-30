from app.schemas import GeneratedReading, LengthType

MINIMUM_PASSAGE_CHARACTERS: dict[LengthType, int] = {
    "short": 80,
    "medium": 180,
    "long": 360,
}

MAXIMUM_PASSAGE_CHARACTERS: dict[LengthType, int] = {
    "short": 500,
    "medium": 1_000,
    "long": 1_800,
}


def validate_generated_reading(
    item: GeneratedReading, length_type: LengthType
) -> list[str]:
    """Run deterministic checks before asking a validator model for judgment."""
    issues: list[str] = []
    passage_length = len(item.passage.replace("\n", "").strip())

    if passage_length < MINIMUM_PASSAGE_CHARACTERS[length_type]:
        issues.append("passage_too_short")
    if passage_length > MAXIMUM_PASSAGE_CHARACTERS[length_type]:
        issues.append("passage_too_long")
    if any("(" in choice.text or "（" in choice.text for choice in item.choices):
        issues.append("furigana_not_supported")
    if any(
        not choice.wrong_explanation
        for choice in item.choices
        if not choice.is_correct
    ):
        issues.append("missing_wrong_explanation")
    return issues
