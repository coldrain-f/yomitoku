from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.schemas import (
    AdminReadingItemCreate,
    AdminReadingItemUpdate,
    GenerationConditions,
)
from app.services import translation as translation_service
from app.services.item_metrics import first_submissions_by_user_item
from app.services.reading_policy import (
    RECOMMENDED_SECONDS,
    is_generation_level_for_language,
    is_level_for_language,
)
from app.services.translation import deepl_translate_url


def test_japanese_levels_include_n1_plus() -> None:
    assert is_level_for_language("ja", "N1+")
    assert not is_level_for_language("ko", "N1+")


def test_korean_levels_include_topik_six_plus() -> None:
    assert is_level_for_language("ko", "TOPIK 6급+")
    assert not is_level_for_language("ja", "TOPIK 6급+")


def test_measurement_unavailable_level_is_limited_to_manual_korean_items() -> None:
    assert is_level_for_language("ko", "측정불가")
    assert not is_level_for_language("ja", "측정불가")
    assert not is_generation_level_for_language("ko", "측정불가")


def test_generation_conditions_reject_a_level_from_another_language() -> None:
    with pytest.raises(ValidationError, match="does not belong"):
        GenerationConditions(
            language="ko",
            official_level="N2",
            length_type="medium",
            topic="교육",
        )


def test_generation_conditions_reject_the_manual_only_level() -> None:
    with pytest.raises(ValidationError, match="not available"):
        GenerationConditions(
            language="ko",
            official_level="측정불가",
            length_type="medium",
            topic="교육",
        )


def test_manual_reading_items_allow_an_empty_explanation() -> None:
    item = AdminReadingItemCreate(
        title="해설 없는 검토 문항",
        passage="검토 단계에서는 해설을 나중에 입력할 수 있다.",
        question="이 문항의 상태는 무엇인가?",
        explanation="",
        language="ko",
        official_level="TOPIK 4급",
        length_type="short",
        topic="교육",
        recommended_seconds=180,
        choices=[
            {"text": "검토 상태", "isCorrect": True},
            {"text": "게시 상태", "isCorrect": False},
            {"text": "삭제 상태", "isCorrect": False},
            {"text": "완료 상태", "isCorrect": False},
        ],
    )

    assert item.explanation == ""
    assert AdminReadingItemUpdate(explanation="").explanation == ""


def test_generation_conditions_normalize_distinct_keywords() -> None:
    conditions = GenerationConditions(
        language="ja",
        official_level="N2",
        length_type="medium",
        topic="수필",
        keywords=[" 지역 도서관 ", "지역 도서관", "", "청소년", "청소년"],
    )

    assert conditions.keywords == ["지역 도서관", "청소년"]


def test_recommended_seconds_match_the_reading_lengths() -> None:
    assert RECOMMENDED_SECONDS == {"short": 180, "medium": 300, "long": 420}


def test_deepl_translation_url_uses_the_free_endpoint_for_free_keys() -> None:
    assert deepl_translate_url("abc123:fx") == "https://api-free.deepl.com/v2/translate"
    assert deepl_translate_url("abc123") == "https://api.deepl.com/v2/translate"


@pytest.mark.asyncio
async def test_translate_texts_batches_uncached_sections(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[list[str]] = []

    def fake_translate(
        *, api_key: str, source_texts: list[str], source_language: str
    ) -> list[str]:
        assert api_key == "deepl-key"
        assert source_language == "ja"
        calls.append(source_texts)
        return [f"translated {source_text}" for source_text in source_texts]

    translation_service._translation_cache.clear()
    monkeypatch.setattr(
        translation_service,
        "get_settings",
        lambda: SimpleNamespace(
            deepl_api_key=SimpleNamespace(get_secret_value=lambda: "deepl-key")
        ),
    )
    monkeypatch.setattr(translation_service, "_translate_with_deepl", fake_translate)
    try:
        translated = await translation_service.translate_texts(
            ["title", "passage", "question"],
            "ja",
        )
    finally:
        translation_service._translation_cache.clear()

    assert translated == [
        "translated title",
        "translated passage",
        "translated question",
    ]
    assert calls == [["title", "passage", "question"]]


def test_first_submissions_keep_the_original_outcome() -> None:
    user_id = uuid4()
    item_id = uuid4()
    submitted_at = datetime.now(UTC)
    first = SimpleNamespace(
        user_id=user_id,
        reading_item_id=item_id,
        submitted_at=submitted_at,
        is_correct=False,
    )
    retry = SimpleNamespace(
        user_id=user_id,
        reading_item_id=item_id,
        submitted_at=submitted_at + timedelta(minutes=1),
        is_correct=True,
    )

    outcomes = first_submissions_by_user_item([retry, first])

    assert outcomes[(user_id, item_id)] is first
    assert outcomes[(user_id, item_id)].is_correct is False
