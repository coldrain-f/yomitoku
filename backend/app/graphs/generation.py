from __future__ import annotations

from datetime import UTC, datetime
from operator import add
from typing import Annotated, Any, Final, NotRequired, TypedDict
from uuid import UUID

from langgraph.graph import END, START, StateGraph
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config import get_settings
from app.db.models import (
    GenerationJob,
    GenerationUsageEvent,
    ItemValidation,
    ReadingChoice,
    ReadingItem,
)
from app.schemas import GeneratedReading, GenerationConditions, ValidatorOutcome
from app.services.generation_provider import (
    GenerationProvider,
    GenerationOutputTruncatedError,
    GenerationStructuredOutputError,
    ModelUsage,
    estimate_usage_cost,
)
from app.services.reading_policy import RECOMMENDED_SECONDS
from app.services.validation import validate_generated_reading


class GenerationState(TypedDict):
    job_id: str
    conditions: dict[str, Any]
    models: dict[str, str]
    revision_count: int
    output_retry_count: int
    revision_feedback: list[str]
    item: NotRequired[dict[str, Any]]
    schema_issues: NotRequired[list[str]]
    answer_validation: NotRequired[dict[str, Any]]
    quality_validation: NotRequired[dict[str, Any]]
    terminal_status: NotRequired[str]
    output_retry_error: NotRequired[str | None]
    failure_code: NotRequired[str]
    failure_detail: NotRequired[str]
    usage_events: Annotated[list[dict[str, Any]], add]


VALIDATION_SCORE_FLOORS: Final = {"answer": 85, "quality": 85}
OUTPUT_RETRY_EXHAUSTED_CODE: Final = "generation_output_retry_exhausted"


async def update_job_progress(
    session_factory: async_sessionmaker[AsyncSession],
    job_id: str,
    *,
    status: str,
    current_node: str,
) -> None:
    async with session_factory() as session:
        job = await session.get(GenerationJob, UUID(job_id))
        if not job:
            raise RuntimeError(f"Generation job {job_id} was not found.")
        job.status = status
        job.current_node = current_node
        await session.commit()


def validation_feedback(state: GenerationState) -> list[str]:
    feedback = list(state.get("schema_issues", []))
    for key in ("answer_validation", "quality_validation"):
        outcome_data = state.get(key)
        if outcome_data:
            outcome = ValidatorOutcome.model_validate(outcome_data)
            role = key.removesuffix("_validation")
            feedback.extend(f"{role}: {code}" for code in outcome.issue_codes)
            feedback.extend(f"{role}: {evidence}" for evidence in outcome.evidence)
    return list(dict.fromkeys(feedback))


def enforce_validation_gate(
    outcome: ValidatorOutcome, role: str
) -> ValidatorOutcome:
    issue_codes = list(dict.fromkeys(outcome.issue_codes))
    minimum_score = VALIDATION_SCORE_FLOORS[role]
    if outcome.score < minimum_score:
        issue_codes.append(f"{role}_score_below_{minimum_score}")
    if outcome.status != "passed" and not issue_codes:
        issue_codes.append(f"{role}_validator_{outcome.status}")
    status = "warning" if outcome.status == "passed" and issue_codes else outcome.status
    return outcome.model_copy(
        update={"status": status, "issue_codes": list(dict.fromkeys(issue_codes))}
    )


def structured_output_retry_update(
    state: GenerationState,
    error: GenerationStructuredOutputError,
    maximum_retries: int,
) -> dict[str, Any]:
    next_retry_count = state["output_retry_count"] + 1
    usage_events = (
        [usage_event("generate", error.usage)] if error.usage is not None else []
    )
    if next_retry_count > maximum_retries:
        failure_detail = (
            "AI 응답이 완전한 문항 형식으로 끝나지 않아 자동 재시도 후에도 "
            "생성에 실패했습니다. 잠시 후 다시 시도해 주세요."
            if maximum_retries
            else "AI 응답이 완전한 문항 형식으로 끝나지 않아 생성에 실패했습니다. "
            "잠시 후 다시 시도해 주세요."
        )
        return {
            "terminal_status": "failed",
            "failure_code": OUTPUT_RETRY_EXHAUSTED_CODE,
            "failure_detail": failure_detail,
            "usage_events": usage_events,
        }
    if isinstance(error, GenerationOutputTruncatedError):
        retry_error = "AI 응답이 중간에 잘려 동일한 조건으로 한 번 더 생성합니다."
    else:
        retry_error = "AI 응답 형식이 올바르지 않아 동일한 조건으로 한 번 더 생성합니다."
    return {
        "output_retry_count": next_retry_count,
        "output_retry_error": retry_error,
        "usage_events": usage_events,
    }


def usage_event(stage: str, usage: ModelUsage) -> dict[str, Any]:
    return {"stage": stage, **usage.model_dump(mode="json")}


def apply_usage_totals(job: GenerationJob, usage_events: list[dict[str, Any]]) -> None:
    usage = [ModelUsage.model_validate(event) for event in usage_events]
    costs = [estimate_usage_cost(event) for event in usage]
    job.input_tokens = sum(event.total_input_tokens for event in usage)
    job.output_tokens = sum(event.output_tokens for event in usage)
    job.actual_cost_usd = (
        sum(cost for cost in costs if cost is not None)
        if all(cost is not None for cost in costs)
        else None
    )


def persist_usage_events(
    job: GenerationJob, usage_events: list[dict[str, Any]]
) -> None:
    for event_index, payload in enumerate(usage_events, start=1):
        usage = ModelUsage.model_validate(payload)
        job.usage_events.append(
            GenerationUsageEvent(
                event_index=event_index,
                stage=str(payload.get("stage", "unknown")),
                model_id=usage.model,
                input_tokens=usage.input_tokens,
                cache_creation_input_tokens=usage.cache_creation_input_tokens,
                cache_read_input_tokens=usage.cache_read_input_tokens,
                output_tokens=usage.output_tokens,
                actual_cost_usd=estimate_usage_cost(usage),
                stop_reason=usage.stop_reason,
            )
        )


def build_generation_graph(
    session_factory: async_sessionmaker[AsyncSession], provider: GenerationProvider
) -> StateGraph:
    settings = get_settings()
    graph: StateGraph = StateGraph(GenerationState)

    async def generate(state: GenerationState) -> dict[str, Any]:
        await update_job_progress(
            session_factory,
            state["job_id"],
            status="generating",
            current_node="generate",
        )
        try:
            result = await provider.generate(
                GenerationConditions.model_validate(state["conditions"]),
                state["revision_feedback"],
                state["models"]["generator_model"],
            )
        except GenerationStructuredOutputError as error:
            retry_update = structured_output_retry_update(
                state,
                error,
                settings.max_generation_output_retries,
            )
            if retry_update.get("terminal_status") != "failed":
                await update_job_progress(
                    session_factory,
                    state["job_id"],
                    status="retrying",
                    current_node="retry_generate",
                )
            return retry_update
        return {
            "item": result.value.model_dump(mode="json", by_alias=False),
            "schema_issues": [],
            "output_retry_error": None,
            "usage_events": [usage_event("generate", result.usage)],
        }

    async def validate_schema(state: GenerationState) -> dict[str, Any]:
        await update_job_progress(
            session_factory,
            state["job_id"],
            status="validating",
            current_node="validate_schema",
        )
        conditions = GenerationConditions.model_validate(state["conditions"])
        item = GeneratedReading.model_validate(state["item"])
        issues = validate_generated_reading(
            item,
            conditions.length_type,
            conditions.language,
        )
        result: dict[str, Any] = {"schema_issues": issues}
        if issues and state["revision_count"] >= settings.max_generation_revisions:
            result["terminal_status"] = "held"
        return result

    async def verify_answer(state: GenerationState) -> dict[str, Any]:
        await update_job_progress(
            session_factory,
            state["job_id"],
            status="validating",
            current_node="verify_answer",
        )
        item = GeneratedReading.model_validate(state["item"])
        conditions = GenerationConditions.model_validate(state["conditions"])
        result = await provider.verify_answer(
            item,
            conditions.language,
            state["models"]["answer_validator_model"],
        )
        outcome = result.value
        expected_choice = next(
            index
            for index, choice in enumerate(item.choices, start=1)
            if choice.is_correct
        )
        if outcome.correct_choice_index != expected_choice:
            outcome = outcome.model_copy(
                update={
                    "status": "warning",
                    "issue_codes": [*outcome.issue_codes, "answer_mismatch"],
                }
            )
        outcome = enforce_validation_gate(outcome, "answer")
        return {
            "answer_validation": outcome.model_dump(mode="json", by_alias=False),
            "usage_events": [usage_event("verify_answer", result.usage)],
        }

    async def verify_quality(state: GenerationState) -> dict[str, Any]:
        await update_job_progress(
            session_factory,
            state["job_id"],
            status="validating",
            current_node="verify_quality",
        )
        conditions = GenerationConditions.model_validate(state["conditions"])
        result = await provider.verify_quality(
            GeneratedReading.model_validate(state["item"]),
            conditions,
            state["models"]["quality_validator_model"],
        )
        outcome = result.value
        outcome = enforce_validation_gate(outcome, "quality")
        return {
            "quality_validation": outcome.model_dump(mode="json", by_alias=False),
            "usage_events": [usage_event("verify_quality", result.usage)],
        }

    async def decide(state: GenerationState) -> dict[str, Any]:
        answer = ValidatorOutcome.model_validate(state["answer_validation"])
        quality = ValidatorOutcome.model_validate(state["quality_validation"])
        if answer.status == "passed" and quality.status == "passed":
            return {"terminal_status": "ready_for_review", "revision_feedback": []}
        feedback = validation_feedback(state)
        if state["revision_count"] >= settings.max_generation_revisions:
            return {"terminal_status": "held", "revision_feedback": feedback}
        return {"revision_feedback": feedback}

    async def revise(state: GenerationState) -> dict[str, Any]:
        await update_job_progress(
            session_factory,
            state["job_id"],
            status="revising",
            current_node="revise",
        )
        return {
            "revision_count": state["revision_count"] + 1,
            "revision_feedback": validation_feedback(state),
        }

    async def persist(state: GenerationState) -> dict[str, Any]:
        job_id = UUID(state["job_id"])
        terminal_status = state["terminal_status"]
        item = GeneratedReading.model_validate(state["item"])
        conditions = GenerationConditions.model_validate(state["conditions"])
        item_status = "review" if terminal_status == "ready_for_review" else "held"

        async with session_factory() as session:
            job = await session.get(GenerationJob, job_id)
            if not job:
                raise RuntimeError(f"Generation job {job_id} was not found.")
            if job.generated_item_id:
                return {}

            apply_usage_totals(job, state.get("usage_events", []))
            persist_usage_events(job, state.get("usage_events", []))

            reading_item = ReadingItem(
                title=item.title,
                passage=item.passage,
                question=item.question,
                explanation=item.explanation,
                language=conditions.language,
                official_level=conditions.official_level,
                length_type=conditions.length_type,
                topic=conditions.topic,
                recommended_seconds=RECOMMENDED_SECONDS[conditions.length_type],
                status=item_status,
            )
            reading_item.choices = [
                ReadingChoice(
                    text=choice.text,
                    canonical_order=index,
                    is_correct=choice.is_correct,
                    wrong_explanation=choice.wrong_explanation,
                )
                for index, choice in enumerate(item.choices, start=1)
            ]
            session.add(reading_item)
            await session.flush()

            schema_issues = state.get("schema_issues", [])
            session.add(
                ItemValidation(
                    generation_job_id=job.id,
                    reading_item_id=reading_item.id,
                    validator_role="schema",
                    model_id="rule-v1",
                    status="passed" if not schema_issues else "failed",
                    score=100 if not schema_issues else 0,
                    issue_codes=schema_issues,
                    evidence=[],
                    raw_response={"issues": schema_issues},
                )
            )
            for role, state_key, model_id in (
                ("answer", "answer_validation", job.answer_validator_model),
                ("quality", "quality_validation", job.quality_validator_model),
            ):
                payload = state.get(state_key)
                if not payload:
                    continue
                outcome = ValidatorOutcome.model_validate(payload)
                session.add(
                    ItemValidation(
                        generation_job_id=job.id,
                        reading_item_id=reading_item.id,
                        validator_role=role,
                        model_id=model_id,
                        status=outcome.status,
                        score=outcome.score,
                        issue_codes=outcome.issue_codes,
                        evidence=outcome.evidence,
                        raw_response=outcome.model_dump(mode="json", by_alias=True),
                    )
                )

            job.status = terminal_status
            job.current_node = "complete"
            job.revision_count = state["revision_count"]
            job.generated_item_id = reading_item.id
            job.completed_at = datetime.now(UTC)
            await session.commit()
        return {}

    async def fail(state: GenerationState) -> dict[str, Any]:
        async with session_factory() as session:
            job = await session.get(GenerationJob, UUID(state["job_id"]))
            if not job:
                raise RuntimeError(f"Generation job {state['job_id']} was not found.")
            if job.completed_at:
                return {}
            apply_usage_totals(job, state.get("usage_events", []))
            persist_usage_events(job, state.get("usage_events", []))
            job.status = "failed"
            job.current_node = "failed"
            job.error_code = state["failure_code"]
            job.error_detail = state["failure_detail"]
            job.completed_at = datetime.now(UTC)
            await session.commit()
        return {}

    def after_generate(state: GenerationState) -> str:
        if state.get("terminal_status") == "failed":
            return "fail"
        if state.get("output_retry_error"):
            return "generate"
        return "validate_schema"

    def after_schema(state: GenerationState) -> str | list[str]:
        if state.get("terminal_status") == "held":
            return "persist"
        if state.get("schema_issues"):
            return "revise"
        return ["verify_answer", "verify_quality"]

    def after_decision(state: GenerationState) -> str:
        return "persist" if state.get("terminal_status") else "revise"

    graph.add_node("generate", generate)
    graph.add_node("validate_schema", validate_schema)
    graph.add_node("verify_answer", verify_answer)
    graph.add_node("verify_quality", verify_quality)
    graph.add_node("decide", decide)
    graph.add_node("revise", revise)
    graph.add_node("persist", persist)
    graph.add_node("fail", fail)
    graph.add_edge(START, "generate")
    graph.add_conditional_edges("generate", after_generate)
    graph.add_conditional_edges("validate_schema", after_schema)
    graph.add_edge(["verify_answer", "verify_quality"], "decide")
    graph.add_conditional_edges("decide", after_decision)
    graph.add_edge("revise", "generate")
    graph.add_edge("persist", END)
    graph.add_edge("fail", END)
    return graph
