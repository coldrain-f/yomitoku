from __future__ import annotations

from collections.abc import Callable, Sequence
from random import choice

RECOMMENDED_TOPIC = "추천"
GENERATION_TOPICS = (
    "생활",
    "사회",
    "경제",
    "과학",
    "기술",
    "문화",
    "여행",
    "요리",
    "게임",
    "교육",
    "환경",
)


def resolve_generation_topic(
    requested_topic: str,
    choose_topic: Callable[[Sequence[str]], str] = choice,
) -> str:
    topic = requested_topic.strip()
    if topic != RECOMMENDED_TOPIC:
        return topic
    return choose_topic(GENERATION_TOPICS)
