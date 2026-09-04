from __future__ import annotations

from typing import Final

from app.schemas import LengthType, ReadingLanguage, ReadingLevel

JAPANESE_LEVELS: Final[tuple[ReadingLevel, ...]] = (
    "N5",
    "N4",
    "N3",
    "N2",
    "N1",
    "N1+",
)
KOREAN_LEVELS: Final[tuple[ReadingLevel, ...]] = (
    "TOPIK 1급",
    "TOPIK 2급",
    "TOPIK 3급",
    "TOPIK 4급",
    "TOPIK 5급",
    "TOPIK 6급",
    "TOPIK 6급+",
    "측정불가",
)
LEVELS_BY_LANGUAGE: Final[dict[ReadingLanguage, tuple[ReadingLevel, ...]]] = {
    "ja": JAPANESE_LEVELS,
    "ko": KOREAN_LEVELS,
}
GENERATION_LEVELS_BY_LANGUAGE: Final[
    dict[ReadingLanguage, tuple[ReadingLevel, ...]]
] = {
    "ja": JAPANESE_LEVELS,
    "ko": KOREAN_LEVELS[:-1],
}
LANGUAGE_ORDER: Final[dict[ReadingLanguage, int]] = {"ja": 0, "ko": 1}
LENGTH_TYPES: Final[tuple[LengthType, ...]] = ("short", "medium", "long")


def is_level_for_language(language: ReadingLanguage, level: str) -> bool:
    return level in LEVELS_BY_LANGUAGE[language]


def is_generation_level_for_language(
    language: ReadingLanguage, level: str
) -> bool:
    return level in GENERATION_LEVELS_BY_LANGUAGE[language]


def level_rank(language: ReadingLanguage, level: str) -> int:
    try:
        return LEVELS_BY_LANGUAGE[language].index(level) + 1
    except ValueError:
        return 0


def level_sort_key(language: ReadingLanguage, level: str) -> tuple[int, int]:
    return LANGUAGE_ORDER[language], level_rank(language, level)

RECOMMENDED_TOPIC: Final = "추천"
TOPIC_LABELS: Final[dict[str, str]] = {
    "생활": "日々の暮らし",
    "가족": "家族のかたち",
    "학교": "学校での学び",
    "직장": "働く日々",
    "건강": "健康を支える工夫",
    "취미": "趣味の楽しみ",
    "쇼핑": "買い物の選び方",
    "주거": "住まいの工夫",
    "교통": "移動と交通",
    "여행": "旅先の発見",
    "음식": "食べ物との関わり",
    "요리": "料理の工夫",
    "스포츠": "スポーツの価値",
    "게임": "遊びの価値",
    "동물": "動物と暮らす",
    "자연": "自然を見る目",
    "환경": "環境との関わり",
    "날씨": "天気と暮らし",
    "과학": "科学の見方",
    "기술": "技術との距離",
    "우주": "宇宙への関心",
    "의학": "医療と生活",
    "심리": "心の働き",
    "역사": "歴史から学ぶ",
    "지리": "土地と人々",
    "문화": "文化の役割",
    "예술": "芸術の表現",
    "음악": "音楽の力",
    "영화": "映像が伝えるもの",
    "문학": "物語を読む",
    "언어": "ことばの役割",
    "교육": "学びの時間",
    "사회": "社会の変化",
    "경제": "身近な経済",
    "금융": "お金の知識",
    "경영": "組織を動かす",
    "법률": "ルールと社会",
    "정치": "社会を決める仕組み",
    "미디어": "情報との向き合い方",
    "인터넷": "オンラインの世界",
    "지역사회": "地域で暮らす",
    "국제": "世界とのつながり",
    "안전": "安全を守る",
    "재난": "備えと復興",
    "농업": "食を支える農業",
    "건축": "建物と暮らし",
    "패션": "装いの文化",
    "디자인": "使いやすさを考える",
    "사진": "一枚の記録",
}
GENERATION_TOPICS: Final[tuple[str, ...]] = tuple(TOPIC_LABELS)

RECOMMENDED_SECONDS: Final[dict[LengthType, int]] = {
    "short": 180,
    "medium": 300,
    "long": 420,
}

MINIMUM_PERCEIVED_LEVEL_VOTES: Final = 10

PASSAGE_CHARACTER_LIMITS: Final[dict[LengthType, tuple[int, int]]] = {
    "short": (80, 500),
    "medium": (180, 1_000),
    "long": (360, 1_800),
}
