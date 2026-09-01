from __future__ import annotations

from typing import Final

from app.schemas import JlptLevel, LengthType

JLPT_LEVELS: Final[tuple[JlptLevel, ...]] = ("N5", "N4", "N3", "N2", "N1")
LENGTH_TYPES: Final[tuple[LengthType, ...]] = ("short", "medium", "long")

LEVEL_ORDER: Final[dict[JlptLevel, int]] = {
    level: index for index, level in enumerate(JLPT_LEVELS, start=1)
}

RECOMMENDED_TOPIC: Final = "추천"
TOPIC_LABELS: Final[dict[str, str]] = {
    "생활": "日々の暮らし",
    "사회": "社会の変化",
    "경제": "身近な経済",
    "과학": "科学の見方",
    "기술": "技術との距離",
    "문화": "文化の役割",
    "여행": "旅先の発見",
    "요리": "料理の工夫",
    "게임": "遊びの価値",
    "교육": "学びの時間",
    "환경": "環境との関わり",
}
GENERATION_TOPICS: Final[tuple[str, ...]] = tuple(TOPIC_LABELS)

RECOMMENDED_SECONDS: Final[dict[LengthType, int]] = {
    "short": 60,
    "medium": 150,
    "long": 270,
}

MINIMUM_PERCEIVED_LEVEL_VOTES: Final = 10

PASSAGE_CHARACTER_LIMITS: Final[dict[LengthType, tuple[int, int]]] = {
    "short": (80, 500),
    "medium": (180, 1_000),
    "long": (360, 1_800),
}
