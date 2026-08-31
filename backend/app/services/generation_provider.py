from __future__ import annotations

from typing import Protocol, TypeVar

from anthropic import AsyncAnthropic
from pydantic import BaseModel

from app.core.config import Settings
from app.schemas import (
    GeneratedChoice,
    GeneratedReading,
    GenerationConditions,
    ValidatorOutcome,
)

ModelT = TypeVar("ModelT", bound=BaseModel)


class GenerationProvider(Protocol):
    async def generate(
        self, conditions: GenerationConditions, revision_feedback: list[str]
    ) -> GeneratedReading: ...

    async def verify_answer(self, item: GeneratedReading) -> ValidatorOutcome: ...

    async def verify_quality(self, item: GeneratedReading) -> ValidatorOutcome: ...


class StubGenerationProvider:
    """Local provider used to test every workflow stage without model spend."""

    async def generate(
        self, conditions: GenerationConditions, revision_feedback: list[str]
    ) -> GeneratedReading:
        topic_label = {
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
        }.get(conditions.topic, "身近なテーマ")
        base = (
            f"{topic_label}について考えるとき、すぐに答えを一つに決めることは簡単ではない。"
            "人によって置かれた状況や大切にしていることが違うからである。"
            "そこで必要なのは、目に見える結果だけで判断せず、その背景にある理由を確かめる姿勢だ。"
            "時間をかけて話を聞くと、最初は小さく見えた違いが、考え方を変える手がかりになることもある。"
        )
        repeats = {"short": 1, "medium": 2, "long": 4}[conditions.length_type]
        passage = "\n\n".join(base for _ in range(repeats))
        return GeneratedReading(
            title=f"{topic_label}を考えるために",
            passage=passage,
            question="筆者が最も大切だと考えていることはどれか。",
            choices=[
                GeneratedChoice(
                    text="短い時間で結論だけを決めること。",
                    is_correct=False,
                    wrong_explanation="本文は、すぐに一つの答えを決めるのではなく背景を確かめる姿勢を重視しています。",
                ),
                GeneratedChoice(
                    text="目に見える結果だけを比べること。",
                    is_correct=False,
                    wrong_explanation="本文は、結果だけで判断しないことが必要だと述べています。",
                ),
                GeneratedChoice(
                    text="背景にある理由を確かめながら考えること。",
                    is_correct=True,
                ),
                GeneratedChoice(
                    text="自分と同じ考えの人だけに聞くこと。",
                    is_correct=False,
                    wrong_explanation="本文は、異なる状況や考え方に目を向けることを示しています。",
                ),
            ],
            explanation="本文は、目に見える結果だけで判断せず、その背景にある理由を確かめる姿勢が大切だと述べています。したがって03が正解です。",
        )

    async def verify_answer(self, item: GeneratedReading) -> ValidatorOutcome:
        correct_index = next(
            index
            for index, choice in enumerate(item.choices, start=1)
            if choice.is_correct
        )
        return ValidatorOutcome(
            status="passed",
            score=100,
            evidence=["The answer verifier independently identified one supported choice."],
            correct_choice_index=correct_index,
        )

    async def verify_quality(self, item: GeneratedReading) -> ValidatorOutcome:
        return ValidatorOutcome(
            status="passed",
            score=95,
            evidence=["The choices are distinct and the explanation supports the answer."],
        )


class AnthropicGenerationProvider:
    def __init__(self, settings: Settings) -> None:
        if not settings.anthropic_api_key:
            raise RuntimeError("ANTHROPIC_API_KEY is required for the anthropic provider.")
        self.client = AsyncAnthropic(
            api_key=settings.anthropic_api_key.get_secret_value()
        )
        self.generator_model = settings.generator_model
        self.answer_validator_model = settings.answer_validator_model
        self.quality_validator_model = settings.quality_validator_model

    async def generate(
        self, conditions: GenerationConditions, revision_feedback: list[str]
    ) -> GeneratedReading:
        feedback = "\n".join(f"- {issue}" for issue in revision_feedback) or "없음"
        prompt = f"""Create one Japanese reading-comprehension item as strict JSON only.
Requested JLPT level: {conditions.official_level}
Requested length: {conditions.length_type}
Topic: {conditions.topic}
Revision feedback from the prior attempt: {feedback}

Return title, passage, question, explanation, and exactly four choices.
Each choice must include text, isCorrect, and wrongExplanation for incorrect choices.
Exactly one choice must have isCorrect true. Do not use furigana.
"""
        return await self._structured_response(
            self.generator_model,
            prompt,
            GeneratedReading,
        )

    async def verify_answer(self, item: GeneratedReading) -> ValidatorOutcome:
        choices = "\n".join(
            f"{index}. {choice.text}"
            for index, choice in enumerate(item.choices, start=1)
        )
        prompt = f"""Independently solve this Japanese reading question. Do not assume a supplied answer.
Passage:\n{item.passage}\n\nQuestion:\n{item.question}\n\nChoices:\n{choices}

Return strict JSON with status (passed, warning, or failed), score (0-100),
issueCodes (string array), evidence (string array), and correctChoiceIndex (1-4).
"""
        return await self._structured_response(
            self.answer_validator_model,
            prompt,
            ValidatorOutcome,
        )

    async def verify_quality(self, item: GeneratedReading) -> ValidatorOutcome:
        prompt = f"""Review this Japanese reading item for ambiguous choices, weak distractors,
and whether the explanation follows from the passage. Return strict JSON with
status (passed, warning, or failed), score (0-100), issueCodes, and evidence.

{item.model_dump_json(by_alias=True)}
"""
        return await self._structured_response(
            self.quality_validator_model,
            prompt,
            ValidatorOutcome,
        )

    async def _structured_response(
        self,
        model: str,
        prompt: str,
        output_format: type[ModelT],
    ) -> ModelT:
        response = await self.client.messages.parse(
            model=model,
            max_tokens=2_000,
            messages=[{"role": "user", "content": prompt}],
            output_format=output_format,
        )
        if response.parsed_output is None:
            raise RuntimeError("The Anthropic response did not contain parsed output.")
        return response.parsed_output


def build_generation_provider(settings: Settings) -> GenerationProvider:
    if settings.generation_provider == "anthropic":
        return AnthropicGenerationProvider(settings)
    return StubGenerationProvider()
