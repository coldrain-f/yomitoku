from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING, Final, Protocol, TypeVar

from pydantic import BaseModel

from app.core.config import Settings
from app.schemas import (
    AdminExplanationSuggestionRequest,
    GeneratedChoice,
    GeneratedExplanation,
    GeneratedReading,
    GeneratedTitle,
    GeneratedTopic,
    GenerationConditions,
    ReadingLanguage,
    ValidatorOutcome,
)
from app.services.generation_prompts import (
    ANSWER_VALIDATOR_MAX_TOKENS,
    ANSWER_VALIDATOR_SYSTEM_PROMPT,
    CACHE_CONTROL,
    EXPLANATION_SUGGESTION_MAX_TOKENS,
    EXPLANATION_SYSTEM_PROMPT,
    GENERATOR_MAX_TOKENS_BY_LENGTH,
    GENERATOR_SYSTEM_PROMPT,
    PASSAGE_CHARACTER_TARGETS,
    QUALITY_VALIDATOR_MAX_TOKENS,
    QUALITY_VALIDATOR_SYSTEM_PROMPT,
    TITLE_SYSTEM_PROMPT,
    TOPIC_SUGGESTION_MAX_TOKENS,
    TOPIC_SYSTEM_PROMPT,
)
from app.services.reading_policy import GENERATION_TOPICS, TOPIC_LABELS

if TYPE_CHECKING:
    from app.services.anthropic_generation_provider import AnthropicGenerationProvider


__all__ = [
    "ANSWER_VALIDATOR_MAX_TOKENS",
    "ANSWER_VALIDATOR_SYSTEM_PROMPT",
    "AnthropicGenerationProvider",
    "CACHE_CONTROL",
    "EXPLANATION_SUGGESTION_MAX_TOKENS",
    "EXPLANATION_SYSTEM_PROMPT",
    "GENERATOR_MAX_TOKENS_BY_LENGTH",
    "GENERATOR_SYSTEM_PROMPT",
    "GenerationOutputFormatError",
    "GenerationOutputTruncatedError",
    "GenerationProvider",
    "GenerationStructuredOutputError",
    "MODEL_PRICES_PER_MILLION",
    "ModelUsage",
    "PASSAGE_CHARACTER_TARGETS",
    "ProviderResult",
    "QUALITY_VALIDATOR_MAX_TOKENS",
    "QUALITY_VALIDATOR_SYSTEM_PROMPT",
    "StubGenerationProvider",
    "TITLE_SYSTEM_PROMPT",
    "TOPIC_SUGGESTION_MAX_TOKENS",
    "TOPIC_SYSTEM_PROMPT",
    "build_generation_provider",
    "estimate_usage_cost",
]

ModelT = TypeVar("ModelT", bound=BaseModel)


class ModelUsage(BaseModel):
    model: str
    input_tokens: int = 0
    output_tokens: int = 0
    cache_creation_input_tokens: int = 0
    cache_read_input_tokens: int = 0
    stop_reason: str | None = None

    @property
    def total_input_tokens(self) -> int:
        return (
            self.input_tokens
            + self.cache_creation_input_tokens
            + self.cache_read_input_tokens
        )


class GenerationStructuredOutputError(RuntimeError):
    """The provider did not return a complete, parseable structured response."""

    def __init__(self, message: str, usage: ModelUsage | None = None) -> None:
        super().__init__(message)
        self.usage = usage


class GenerationOutputTruncatedError(GenerationStructuredOutputError):
    """A structured response reached the output limit before the JSON object completed."""


class GenerationOutputFormatError(GenerationStructuredOutputError):
    """A structured response could not be parsed into the requested output model."""


@dataclass(frozen=True)
class ProviderResult[ModelT: BaseModel]:
    value: ModelT
    usage: ModelUsage


MODEL_PRICES_PER_MILLION: Final = {
    "claude-fable-5-1": (10.0, 12.5, 0.25, 50.0),
    "claude-fable-5": (10.0, 12.5, 1.0, 50.0),
    "claude-opus-5": (5.0, 6.25, 0.5, 25.0),
    "claude-sonnet-5": (2.0, 2.5, 0.2, 10.0),
    "claude-haiku-4-5": (1.0, 1.25, 0.1, 5.0),
}


def estimate_usage_cost(usage: ModelUsage) -> float | None:
    prices = MODEL_PRICES_PER_MILLION.get(usage.model)
    if prices is None:
        return None
    input_price, cache_write_price, cache_read_price, output_price = prices
    return (
        usage.input_tokens * input_price
        + usage.cache_creation_input_tokens * cache_write_price
        + usage.cache_read_input_tokens * cache_read_price
        + usage.output_tokens * output_price
    ) / 1_000_000


class GenerationProvider(Protocol):
    async def suggest_title(
        self, passage: str, language: ReadingLanguage, model: str
    ) -> ProviderResult[GeneratedTitle]: ...

    async def suggest_topic(
        self, passage: str, language: ReadingLanguage, model: str
    ) -> ProviderResult[GeneratedTopic]: ...

    async def suggest_explanation(
        self,
        request: AdminExplanationSuggestionRequest,
        model: str,
    ) -> ProviderResult[GeneratedExplanation]: ...

    async def generate(
        self,
        conditions: GenerationConditions,
        revision_feedback: list[str],
        model: str,
    ) -> ProviderResult[GeneratedReading]: ...

    async def verify_answer(
        self, item: GeneratedReading, language: ReadingLanguage, model: str
    ) -> ProviderResult[ValidatorOutcome]: ...

    async def verify_quality(
        self, item: GeneratedReading, conditions: GenerationConditions, model: str
    ) -> ProviderResult[ValidatorOutcome]: ...


class StubGenerationProvider:
    """Local provider used to test every workflow stage without model spend."""

    @staticmethod
    def _result(value: ModelT, model: str) -> ProviderResult[ModelT]:
        return ProviderResult(value=value, usage=ModelUsage(model=model))

    async def suggest_title(
        self, passage: str, language: ReadingLanguage, model: str
    ) -> ProviderResult[GeneratedTitle]:
        first_line = next(
            (line.strip() for line in passage.splitlines() if line.strip()), ""
        )
        title = first_line.split("。", maxsplit=1)[0].split(".", maxsplit=1)[0].strip()
        if len(title) > 36:
            title = title[:36].rstrip()
        if not title:
            title = "새 독해 지문" if language == "ko" else "新しい読解"
        return self._result(GeneratedTitle(title=title), model)

    async def suggest_topic(
        self, passage: str, language: ReadingLanguage, model: str
    ) -> ProviderResult[GeneratedTopic]:
        topic = next(
            (
                candidate
                for candidate in GENERATION_TOPICS
                if candidate in passage
                or TOPIC_LABELS.get(candidate, "") in passage
            ),
            "생활",
        )
        return self._result(GeneratedTopic(topic=topic), model)

    async def suggest_explanation(
        self,
        request: AdminExplanationSuggestionRequest,
        model: str,
    ) -> ProviderResult[GeneratedExplanation]:
        correct_choice = next(choice for choice in request.choices if choice.is_correct)
        source = next(
            (line.strip() for line in request.passage.splitlines() if line.strip()),
            request.passage.strip(),
        )
        if request.language == "ja":
            explanation = (
                f"본문은 ‘{source[:120]}’라고 설명하므로, 정답은 "
                f"‘{correct_choice.text}’입니다."
            )
        else:
            explanation = (
                f"本文は「{source[:120]}」と述べているため、正解は"
                f"「{correct_choice.text}」です。"
            )
        return self._result(GeneratedExplanation(explanation=explanation), model)

    async def generate(
        self,
        conditions: GenerationConditions,
        revision_feedback: list[str],
        model: str,
    ) -> ProviderResult[GeneratedReading]:
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
            item = GeneratedReading(
                title=f"{topic_label}을 생각하며",
                passage=passage,
                question="글쓴이가 가장 중요하게 생각하는 태도는 무엇인가?",
                choices=[
                    GeneratedChoice(
                        text="눈에 보이는 결과만으로 이미 결론을 내리는 것",
                        is_correct=False,
                        wrong_explanation="本文は、結果だけで結論を出さず、その背景にある理由を確かめる必要があると述べています。",
                        distractor_type="relation_or_agent_reversal",
                    ),
                    GeneratedChoice(
                        text="사람마다 기준이 다르다는 사실만 기억하는 것",
                        is_correct=False,
                        wrong_explanation="人によって基準が違うことは本文の一部と合いますが、中心は背景にある理由を確かめる姿勢です。",
                        distractor_type="partial_truth_off_focus",
                    ),
                    GeneratedChoice(
                        text="배경의 이유를 살피며 생각하는 것",
                        is_correct=True,
                    ),
                    GeneratedChoice(
                        text="작아 보이는 차이는 언제나 생각을 바꾼다고 보는 것",
                        is_correct=False,
                        wrong_explanation="本文は小さな違いが考え方を変える手がかりになることもあると述べるだけで、いつもそうだとは断定していません。",
                        distractor_type="scope_or_degree_distortion",
                    ),
                ],
                explanation="本文は、目に見える結果だけで判断せず、その背景にある理由を確かめる姿勢が大切だと述べています。この内容は、理由を確かめることの大切さを示しています。",
            )
            return self._result(item, model)
        item = GeneratedReading(
            title=f"{topic_label}を考えるために",
            passage=passage,
            question="筆者が最も大切だと考えていることはどれか。",
            choices=[
                GeneratedChoice(
                    text="目に見える結果だけで先に結論を決めること。",
                    is_correct=False,
                    wrong_explanation="글은 결과만 보고 결론을 내리지 말고, 그 배경에 있는 이유를 확인해야 한다고 말합니다.",
                    distractor_type="relation_or_agent_reversal",
                ),
                GeneratedChoice(
                    text="人によって基準が違う事実だけを覚えること。",
                    is_correct=False,
                    wrong_explanation="사람마다 기준이 다르다는 내용은 본문의 일부와 맞지만, 중심 내용은 배경의 이유를 확인하는 태도입니다.",
                    distractor_type="partial_truth_off_focus",
                ),
                GeneratedChoice(
                    text="背景にある理由を確かめながら考えること。",
                    is_correct=True,
                ),
                GeneratedChoice(
                    text="小さく見える違いは必ず考え方を変えると考えること。",
                    is_correct=False,
                    wrong_explanation="글은 작은 차이가 생각을 바꾸는 실마리가 될 수도 있다고 했을 뿐, 반드시 그렇다고 말하지 않았습니다.",
                    distractor_type="scope_or_degree_distortion",
                ),
            ],
            explanation="글은 눈에 보이는 결과만으로 판단하지 말고 그 배경에 있는 이유를 확인하는 태도가 중요하다고 말합니다. 이는 이유를 확인하는 태도가 중요하다는 내용과 일치합니다.",
        )
        return self._result(item, model)

    async def verify_answer(
        self, item: GeneratedReading, language: ReadingLanguage, model: str
    ) -> ProviderResult[ValidatorOutcome]:
        correct_index = next(
            index
            for index, choice in enumerate(item.choices, start=1)
            if choice.is_correct
        )
        outcome = ValidatorOutcome(
            status="passed",
            score=100,
            evidence=["The answer verifier independently identified one supported choice."],
            correct_choice_index=correct_index,
        )
        return self._result(outcome, model)

    async def verify_quality(
        self, item: GeneratedReading, conditions: GenerationConditions, model: str
    ) -> ProviderResult[ValidatorOutcome]:
        outcome = ValidatorOutcome(
            status="passed",
            score=95,
            evidence=["The choices are distinct and the explanation supports the answer."],
        )
        return self._result(outcome, model)


def build_generation_provider(settings: Settings) -> GenerationProvider:
    if settings.generation_provider == "anthropic":
        from app.services.anthropic_generation_provider import (
            AnthropicGenerationProvider,
        )

        return AnthropicGenerationProvider(settings)
    return StubGenerationProvider()


def __getattr__(name: str) -> object:
    """Keep the former Anthropic provider import path available to callers."""
    if name == "AnthropicGenerationProvider":
        from app.services.anthropic_generation_provider import (
            AnthropicGenerationProvider,
        )

        return AnthropicGenerationProvider
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
