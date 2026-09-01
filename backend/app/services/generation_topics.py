from __future__ import annotations

from collections.abc import Callable, Sequence
from random import choice

from app.services.reading_policy import GENERATION_TOPICS, RECOMMENDED_TOPIC


def resolve_generation_topic(
    requested_topic: str,
    choose_topic: Callable[[Sequence[str]], str] = choice,
) -> str:
    topic = requested_topic.strip()
    if topic != RECOMMENDED_TOPIC:
        return topic
    return choose_topic(GENERATION_TOPICS)
