import re

from app.schemas import GeneratedReading, LengthType, ReadingLanguage
from app.services.reading_policy import PASSAGE_CHARACTER_LIMITS


# Choices are shuffled for every attempt, so explanations must describe the answer
# by its wording and passage evidence rather than its canonical position.
CHOICE_POSITION_REFERENCE_PATTERNS = (
    re.compile(
        r"(?:선택지|보기)\s*\d+\s*(?:번)?\s*(?:이|가|은|는)?\s*(?:정답|답)"
    ),
    re.compile(
        r"(?:정답|답)\s*(?:은|는|이|가)?\s*(?:선택지|보기)?\s*\d+\s*(?:번)?"
    ),
    re.compile(
        r"\d+\s*번\s*(?:선택지|보기)?\s*(?:이|가|은|는)?\s*(?:정답|답)"
    ),
    re.compile(
        r"(?:選択肢|正解|答え)\s*(?:は|が|:)?\s*(?:第\s*)?\d+\s*(?:番|つ目)"
    ),
    re.compile(
        r"(?:第\s*)?\d+\s*(?:番|つ目)\s*(?:の選択肢)?\s*(?:が|は)?\s*(?:正解|答え)"
    ),
    re.compile(
        r"(?:choice|option|answer)\s*(?:number\s*)?(?:\d+|[A-D])\b",
        re.IGNORECASE,
    ),
    re.compile(
        r"(?:the\s+)?(?:\d+(?:st|nd|rd|th)?|[A-D])\s+"
        r"(?:choice|option|answer)\b",
        re.IGNORECASE,
    ),
)


def has_choice_position_reference(text: str | None) -> bool:
    """Return whether an explanation depends on a choice's displayed position."""
    return bool(
        text
        and any(pattern.search(text) for pattern in CHOICE_POSITION_REFERENCE_PATTERNS)
    )


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
    if any(
        has_choice_position_reference(explanation)
        for explanation in (
            item.explanation,
            *(choice.wrong_explanation for choice in item.choices),
        )
    ):
        issues.append("explanation_references_choice_position")
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
