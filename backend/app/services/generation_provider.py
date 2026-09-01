from __future__ import annotations

from typing import Protocol, TypeVar

from anthropic import AsyncAnthropic
from pydantic import BaseModel

from app.core.config import Settings
from app.schemas import (
    GeneratedChoice,
    GeneratedReading,
    GenerationConditions,
    ReadingLanguage,
    ValidatorOutcome,
)
from app.services.reading_policy import TOPIC_LABELS

ModelT = TypeVar("ModelT", bound=BaseModel)


class GenerationProvider(Protocol):
    async def generate(
        self,
        conditions: GenerationConditions,
        revision_feedback: list[str],
        model: str,
    ) -> GeneratedReading: ...

    async def verify_answer(
        self, item: GeneratedReading, language: ReadingLanguage, model: str
    ) -> ValidatorOutcome: ...

    async def verify_quality(
        self, item: GeneratedReading, language: ReadingLanguage, model: str
    ) -> ValidatorOutcome: ...


class StubGenerationProvider:
    """Local provider used to test every workflow stage without model spend."""

    async def generate(
        self,
        conditions: GenerationConditions,
        revision_feedback: list[str],
        model: str,
    ) -> GeneratedReading:
        if conditions.language == "ko":
            topic_label = conditions.topic
            base = (
                f"{topic_label}을 생각할 때 하나의 답을 바로 정하기는 쉽지 않다. "
                "사람마다 처한 상황과 중요하게 여기는 기준이 다르기 때문이다. "
                "그래서 눈에 보이는 결과만으로 판단하지 않고 그 배경의 이유를 살피는 태도가 필요하다. "
                "충분히 이야기를 들어 보면 처음에는 작아 보였던 차이가 생각을 바꾸는 단서가 되기도 한다."
            )
        else:
            topic_label = TOPIC_LABELS.get(conditions.topic, "身近なテーマ")
            base = (
                f"{topic_label}について考えるとき、すぐに答えを一つに決めることは簡単ではない。"
                "人によって置かれた状況や大切にしていることが違うからである。"
                "そこで必要なのは、目に見える結果だけで判断せず、その背景にある理由を確かめる姿勢だ。"
                "時間をかけて話を聞くと、最初は小さく見えた違いが、考え方を変える手がかりになることもある。"
            )
        repeats = {"short": 1, "medium": 2, "long": 4}[conditions.length_type]
        passage = "\n\n".join(base for _ in range(repeats))
        if conditions.language == "ko":
            return GeneratedReading(
                title=f"{topic_label}을 생각하며",
                passage=passage,
                question="글쓴이가 가장 중요하게 생각하는 태도는 무엇인가?",
                choices=[
                    GeneratedChoice(
                        text="짧은 시간 안에 결론만 정하는 것",
                        is_correct=False,
                        wrong_explanation="글은 성급히 결론을 내리기보다 배경을 살피는 태도를 강조합니다.",
                    ),
                    GeneratedChoice(
                        text="눈에 보이는 결과만 비교하는 것",
                        is_correct=False,
                        wrong_explanation="글은 결과만으로 판단하지 말아야 한다고 설명합니다.",
                    ),
                    GeneratedChoice(
                        text="배경의 이유를 살피며 생각하는 것",
                        is_correct=True,
                    ),
                    GeneratedChoice(
                        text="자신과 같은 의견만 듣는 것",
                        is_correct=False,
                        wrong_explanation="글은 서로 다른 상황과 생각에 귀를 기울이는 태도를 말합니다.",
                    ),
                ],
                explanation="글은 눈에 보이는 결과만으로 판단하지 않고 그 배경의 이유를 살피는 태도가 중요하다고 말합니다. 따라서 3번이 정답입니다.",
            )
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

    async def verify_answer(
        self, item: GeneratedReading, language: ReadingLanguage, model: str
    ) -> ValidatorOutcome:
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

    async def verify_quality(
        self, item: GeneratedReading, language: ReadingLanguage, model: str
    ) -> ValidatorOutcome:
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

    async def generate(
        self,
        conditions: GenerationConditions,
        revision_feedback: list[str],
        model: str,
    ) -> GeneratedReading:
        feedback = "\n".join(f"- {issue}" for issue in revision_feedback) or "없음"
        language_name = "Japanese" if conditions.language == "ja" else "Korean"
        level_name = "JLPT" if conditions.language == "ja" else "TOPIK"
        topic = (
            TOPIC_LABELS.get(conditions.topic, conditions.topic)
            if conditions.language == "ja"
            else conditions.topic
        )
        furigana_rule = "Do not use furigana." if conditions.language == "ja" else ""
        prompt = f"""Create one {language_name} reading-comprehension item as strict JSON only.
Write the title, passage, question, choices, and explanation naturally in {language_name}.
Requested {level_name} level: {conditions.official_level}
Requested length: {conditions.length_type}
Topic: {topic}
Revision feedback from the prior attempt: {feedback}

Return title, passage, question, explanation, and exactly four choices.
Each choice must include text, isCorrect, and wrongExplanation for incorrect choices.
Exactly one choice must have isCorrect true. {furigana_rule}
"""
        return await self._structured_response(
            model,
            prompt,
            GeneratedReading,
        )

    async def verify_answer(
        self, item: GeneratedReading, language: ReadingLanguage, model: str
    ) -> ValidatorOutcome:
        choices = "\n".join(
            f"{index}. {choice.text}"
            for index, choice in enumerate(item.choices, start=1)
        )
        language_name = "Japanese" if language == "ja" else "Korean"
        prompt = f"""Independently solve this {language_name} reading question. Do not assume a supplied answer.
Passage:\n{item.passage}\n\nQuestion:\n{item.question}\n\nChoices:\n{choices}

Return strict JSON with status (passed, warning, or failed), score (0-100),
issueCodes (string array), evidence (string array), and correctChoiceIndex (1-4).
"""
        return await self._structured_response(
            model,
            prompt,
            ValidatorOutcome,
        )

    async def verify_quality(
        self, item: GeneratedReading, language: ReadingLanguage, model: str
    ) -> ValidatorOutcome:
        language_name = "Japanese" if language == "ja" else "Korean"
        prompt = f"""Review this {language_name} reading item for ambiguous choices, weak distractors,
and whether the explanation follows from the passage. Return strict JSON with
status (passed, warning, or failed), score (0-100), issueCodes, and evidence.

{item.model_dump_json(by_alias=True)}
"""
        return await self._structured_response(
            model,
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
