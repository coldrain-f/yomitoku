from collections.abc import Sequence

from app.services.generation_topics import GENERATION_TOPICS, resolve_generation_topic


def test_resolve_generation_topic_keeps_explicit_topic() -> None:
    assert resolve_generation_topic("문화") == "문화"


def test_resolve_generation_topic_trims_explicit_topic() -> None:
    assert resolve_generation_topic(" 여행 ") == "여행"


def test_resolve_generation_topic_picks_topic_for_recommendation() -> None:
    def choose_last(topics: Sequence[str]) -> str:
        return topics[-1]

    assert resolve_generation_topic("추천", choose_last) == "환경"
    assert "교육" in GENERATION_TOPICS
    assert len(set(GENERATION_TOPICS)) == len(GENERATION_TOPICS)
