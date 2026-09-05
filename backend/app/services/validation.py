import re

from app.schemas import GeneratedReading, LengthType, ReadingLanguage
from app.services.reading_policy import PASSAGE_CHARACTER_LIMITS


def validate_generated_reading(
    item: GeneratedReading,
    length_type: LengthType,
    language: ReadingLanguage = "ja",
) -> list[str]:
    """Run deterministic checks before asking a validator model for judgment."""
    issues: list[str] = []
    # Paragraph breaks are formatting, while ordinary spaces remain part of reading length.
    passage_length = len(item.passage.replace("\r", "").replace("\n", "").strip())

    minimum_characters, maximum_characters = PASSAGE_CHARACTER_LIMITS[length_type]

    if passage_length < minimum_characters:
        issues.append("passage_too_short")
    if passage_length > maximum_characters:
        issues.append("passage_too_long")
    if language == "ja" and any(
        re.search(r"[\u3400-\u9fff々](?:\([ぁ-ゖァ-ヺー]+\)|（[ぁ-ゖァ-ヺー]+）)", text)
        for text in [item.passage, item.question, *(choice.text for choice in item.choices)]
    ):
        issues.append("furigana_not_supported")
    if any(
        not choice.wrong_explanation
        for choice in item.choices
        if not choice.is_correct
    ):
        issues.append("missing_wrong_explanation")
    correct_choice = next(choice for choice in item.choices if choice.is_correct)
    if correct_choice.distractor_type is not None:
        issues.append("correct_choice_has_distractor_type")
    distractor_types = [
        choice.distractor_type
        for choice in item.choices
        if not choice.is_correct
    ]
    if any(distractor_type is None for distractor_type in distractor_types):
        issues.append("missing_distractor_type")
    elif len(set(distractor_types)) != len(distractor_types):
        issues.append("duplicate_distractor_type")
    return issues
