from __future__ import annotations

from dataclasses import dataclass
from typing import Final, Generic, Protocol, TypeVar

from anthropic import AsyncAnthropic
from pydantic import BaseModel, ValidationError

from app.core.config import Settings
from app.schemas import (
    GeneratedChoice,
    GeneratedReading,
    GenerationConditions,
    ReadingLanguage,
    ValidatorOutcome,
)
from app.services.reading_policy import PASSAGE_CHARACTER_LIMITS, TOPIC_LABELS

ModelT = TypeVar("ModelT", bound=BaseModel)

GENERATOR_MAX_TOKENS: Final = 5_000
VALIDATOR_MAX_TOKENS: Final = 3_000
CACHE_CONTROL: Final = {"type": "ephemeral"}
PASSAGE_CHARACTER_TARGETS: Final = {
    "short": (140, 320),
    "medium": (320, 720),
    "long": (800, 1_300),
}

GENERATOR_SYSTEM_PROMPT: Final = """You create rigorous exam-style reading-comprehension items.
The question must be answerable only from the passage, not outside knowledge. Build one clearly
supported correct answer and three plausible distractors. Each distractor must reuse or closely track a
specific passage idea, but be wrong for one precise, explainable reason. Do not make distractors absurd,
unrelated, grammatically mismatched, or trivially eliminated.

Use three different distractor types, one for each incorrect choice:
- background_knowledge_trap: plausible real-world knowledge, but unsupported or contradicted by the passage.
- relation_or_agent_reversal: retain passage words while reversing a cause/effect, comparison, condition, or actor.
- partial_truth_off_focus: a true minor detail that does not answer the question's main focus.
- scope_or_degree_distortion: exaggerate or narrow a qualified claim such as some/may/tends to.
- unsupported_inference: a tempting conclusion that the passage does not justify.
Choose only types that fit the passage; do not force an unnatural reversal. The three types must be distinct.
The wrongExplanation for each distractor must identify the relevant passage idea and the exact mismatch.

Return title, passage, question, explanation, and exactly four choices. Each choice must include text,
isCorrect, wrongExplanation, and distractorType. Set distractorType to null for the one correct choice and
to one of the listed types for every incorrect choice. Exactly one choice must have isCorrect true."""

ANSWER_VALIDATOR_SYSTEM_PROMPT: Final = """Independently solve each supplied reading question.
Use only passage evidence. Identify the best answer, then check whether another choice is also defensible,
whether the supplied correct choice is unsupported, and whether the question relies on outside knowledge.
Pass only when exactly one choice is supported and the item is exam-ready.

Use status failed for no supported answer or multiple supported answers; warning for a repairable issue.
Use precise issueCodes when needed: ANSWER_MISMATCH, MULTIPLE_SUPPORTED_ANSWERS,
NO_SUPPORTED_ANSWER, UNSUPPORTED_CORRECT_ANSWER, QUESTION_AMBIGUITY, or
BACKGROUND_KNOWLEDGE_DEPENDENCY. Evidence must name the choice and the passage fact that supports the judgment.
Return status, score (0-100), issueCodes, evidence, and correctChoiceIndex (1-4)."""

QUALITY_VALIDATOR_SYSTEM_PROMPT: Final = """You are an exacting reading-comprehension item editor.
Review supplied items for exam readiness, not merely grammatical correctness.

Verify all of the following:
1. The question has exactly one answer supported by the passage and the explanation proves that answer.
2. Each incorrect choice is plausible on a quick read, tied to a passage idea, and wrong for one checkable reason.
3. The three distractorType values are distinct and match the actual error in their choices.
4. The set contains no duplicate meaning, irrelevant nonsense, factual invention, or option that can be eliminated
   without reading the passage.
5. The question, vocabulary, grammar, and inference demand fit the requested level.

Mark weak or ambiguous distractors with specific issueCodes such as WEAK_DISTRACTOR,
DISTRACTOR_OVERLAP, DISTRACTOR_NOT_TEXT_ANCHORED, DISTRACTOR_TYPE_MISMATCH,
BACKGROUND_KNOWLEDGE_DEPENDENCY, QUESTION_AMBIGUITY, OUT_OF_LEVEL, or EXPLANATION_MISMATCH.
Give passed only to a clean item with score 85 or higher. Use warning for a repairable problem and failed for
an ambiguous item with more than one defensible answer. Evidence must identify the choice and its exact issue.
Return status, score (0-100), issueCodes, and evidence."""


class GenerationOutputTruncatedError(RuntimeError):
    """A structured response reached the output limit before the JSON object completed."""


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


@dataclass(frozen=True)
class ProviderResult(Generic[ModelT]):
    value: ModelT
    usage: ModelUsage


MODEL_PRICES_PER_MILLION: Final = {
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
                        wrong_explanation="글은 결과만 보고 결론을 내리지 말고, 그 배경의 이유를 살펴야 한다고 말합니다.",
                        distractor_type="relation_or_agent_reversal",
                    ),
                    GeneratedChoice(
                        text="사람마다 기준이 다르다는 사실만 기억하는 것",
                        is_correct=False,
                        wrong_explanation="사람마다 기준이 다르다는 내용은 맞지만, 글의 핵심은 그 사실을 바탕으로 배경의 이유를 살피는 태도입니다.",
                        distractor_type="partial_truth_off_focus",
                    ),
                    GeneratedChoice(
                        text="배경의 이유를 살피며 생각하는 것",
                        is_correct=True,
                    ),
                    GeneratedChoice(
                        text="작아 보이는 차이는 언제나 생각을 바꾼다고 보는 것",
                        is_correct=False,
                        wrong_explanation="글은 작은 차이가 생각을 바꾸는 단서가 될 수도 있다고 했을 뿐, 언제나 그렇다고 단정하지는 않습니다.",
                        distractor_type="scope_or_degree_distortion",
                    ),
                ],
                explanation="글은 눈에 보이는 결과만으로 판단하지 않고 그 배경의 이유를 살피는 태도가 중요하다고 말합니다. 따라서 3번이 정답입니다.",
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
                    wrong_explanation="本文は、結果だけで結論を出さず、その背景にある理由を確かめるべきだと述べています。",
                    distractor_type="relation_or_agent_reversal",
                ),
                GeneratedChoice(
                    text="人によって基準が違う事実だけを覚えること。",
                    is_correct=False,
                    wrong_explanation="人によって基準が違うことは本文の一部と合いますが、筆者の主張は背景の理由を確かめる姿勢です。",
                    distractor_type="partial_truth_off_focus",
                ),
                GeneratedChoice(
                    text="背景にある理由を確かめながら考えること。",
                    is_correct=True,
                ),
                GeneratedChoice(
                    text="小さく見える違いは必ず考え方を変えると考えること。",
                    is_correct=False,
                    wrong_explanation="本文は、小さな違いが手がかりになることもあると述べているだけで、必ず考え方を変えるとは言っていません。",
                    distractor_type="scope_or_degree_distortion",
                ),
            ],
            explanation="本文は、目に見える結果だけで判断せず、その背景にある理由を確かめる姿勢が大切だと述べています。したがって03が正解です。",
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
    ) -> ProviderResult[GeneratedReading]:
        feedback = "\n".join(f"- {issue}" for issue in revision_feedback) or "없음"
        language_name = "Japanese" if conditions.language == "ja" else "Korean"
        level_name = "JLPT" if conditions.language == "ja" else "TOPIK"
        topic = (
            TOPIC_LABELS.get(conditions.topic, conditions.topic)
            if conditions.language == "ja"
            else conditions.topic
        )
        minimum_characters, maximum_characters = PASSAGE_CHARACTER_LIMITS[
            conditions.length_type
        ]
        target_minimum, target_maximum = PASSAGE_CHARACTER_TARGETS[
            conditions.length_type
        ]
        furigana_rule = "Do not use furigana." if conditions.language == "ja" else ""
        prompt = f"""<generation_request>
Create one rigorous, exam-style {language_name} reading-comprehension item.
Write the title, passage, question, choices, and explanation naturally in {language_name}.
Requested {level_name} level: {conditions.official_level}
Requested length: {conditions.length_type}
Topic: {topic}
The passage must contain {minimum_characters}-{maximum_characters} non-whitespace characters,
excluding line breaks. Aim for {target_minimum}-{target_maximum} characters unless the level demands
slightly more context. Revision feedback from the prior attempt: {feedback}
{furigana_rule}
</generation_request>"""
        return await self._structured_response(
            model,
            GENERATOR_SYSTEM_PROMPT,
            prompt,
            GeneratedReading,
            max_tokens=GENERATOR_MAX_TOKENS,
        )

    async def verify_answer(
        self, item: GeneratedReading, language: ReadingLanguage, model: str
    ) -> ProviderResult[ValidatorOutcome]:
        choices = "\n".join(
            f"{index}. {choice.text}"
            for index, choice in enumerate(item.choices, start=1)
        )
        language_name = "Japanese" if language == "ja" else "Korean"
        prompt = f"""<answer_validation language="{language_name}">
<passage>{item.passage}</passage>
<question>{item.question}</question>
<choices>{choices}</choices>
</answer_validation>"""
        return await self._structured_response(
            model,
            ANSWER_VALIDATOR_SYSTEM_PROMPT,
            prompt,
            ValidatorOutcome,
            max_tokens=VALIDATOR_MAX_TOKENS,
        )

    async def verify_quality(
        self, item: GeneratedReading, conditions: GenerationConditions, model: str
    ) -> ProviderResult[ValidatorOutcome]:
        language_name = "Japanese" if conditions.language == "ja" else "Korean"
        level_name = "JLPT" if conditions.language == "ja" else "TOPIK"
        prompt = f"""<quality_validation>
Language: {language_name}
Framework: {level_name}
Requested level: {conditions.official_level}
<item>{item.model_dump_json(by_alias=True)}</item>
</quality_validation>"""
        return await self._structured_response(
            model,
            QUALITY_VALIDATOR_SYSTEM_PROMPT,
            prompt,
            ValidatorOutcome,
            max_tokens=VALIDATOR_MAX_TOKENS,
        )

    async def _structured_response(
        self,
        model: str,
        system_prompt: str,
        prompt: str,
        output_format: type[ModelT],
        *,
        max_tokens: int,
    ) -> ProviderResult[ModelT]:
        try:
            response = await self.client.messages.parse(
                model=model,
                max_tokens=max_tokens,
                system=[
                    {
                        "type": "text",
                        "text": system_prompt,
                        "cache_control": CACHE_CONTROL,
                    }
                ],
                messages=[{"role": "user", "content": prompt}],
                output_format=output_format,
            )
        except ValidationError as error:
            if any(
                issue.get("type") == "json_invalid"
                and "EOF while parsing" in str(issue.get("msg", ""))
                for issue in error.errors()
            ):
                raise GenerationOutputTruncatedError(
                    "The model response ended before the structured JSON completed."
                ) from error
            raise
        if response.stop_reason == "max_tokens":
            raise GenerationOutputTruncatedError(
                "The model response reached its output token limit."
            )
        if response.parsed_output is None:
            raise RuntimeError("The Anthropic response did not contain parsed output.")
        usage = response.usage
        return ProviderResult(
            value=response.parsed_output,
            usage=ModelUsage(
                model=model,
                input_tokens=getattr(usage, "input_tokens", 0),
                output_tokens=getattr(usage, "output_tokens", 0),
                cache_creation_input_tokens=getattr(
                    usage, "cache_creation_input_tokens", 0
                ),
                cache_read_input_tokens=getattr(usage, "cache_read_input_tokens", 0),
                stop_reason=response.stop_reason,
            ),
        )


def build_generation_provider(settings: Settings) -> GenerationProvider:
    if settings.generation_provider == "anthropic":
        return AnthropicGenerationProvider(settings)
    return StubGenerationProvider()
