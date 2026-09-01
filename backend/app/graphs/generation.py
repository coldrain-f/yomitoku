from __future__ import annotations

from datetime import UTC, datetime
from typing import Any, NotRequired, TypedDict
from uuid import UUID

from langgraph.graph import END, START, StateGraph
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config import get_settings
from app.db.models import GenerationJob, ItemValidation, ReadingChoice, ReadingItem
from app.schemas import GeneratedReading, GenerationConditions, ValidatorOutcome
from app.services.generation_provider import GenerationProvider
from app.services.reading_policy import RECOMMENDED_SECONDS
from app.services.validation import validate_generated_reading


class GenerationState(TypedDict):
    job_id: str
    conditions: dict[str, Any]
    models: dict[str, str]
    revision_count: int
    revision_feedback: list[str]
    item: NotRequired[dict[str, Any]]
    schema_issues: NotRequired[list[str]]
    answer_validation: NotRequired[dict[str, Any]]
    quality_validation: NotRequired[dict[str, Any]]
    terminal_status: NotRequired[str]


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
            feedback.extend(ValidatorOutcome.model_validate(outcome_data).issue_codes)
    return list(dict.fromkeys(feedback))


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
        item = await provider.generate(
            GenerationConditions.model_validate(state["conditions"]),
            state["revision_feedback"],
            state["models"]["generator_model"],
        )
        return {"item": item.model_dump(mode="json", by_alias=False), "schema_issues": []}

    async def validate_schema(state: GenerationState) -> dict[str, Any]:
        await update_job_progress(
            session_factory,
            state["job_id"],
            status="validating",
            current_node="validate_schema",
        )
        conditions = GenerationConditions.model_validate(state["conditions"])
        item = GeneratedReading.model_validate(state["item"])
        issues = validate_generated_reading(item, conditions.length_type)
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
        outcome = await provider.verify_answer(
            item,
            state["models"]["answer_validator_model"],
        )
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
        return {"answer_validation": outcome.model_dump(mode="json", by_alias=False)}

    async def verify_quality(state: GenerationState) -> dict[str, Any]:
        await update_job_progress(
            session_factory,
            state["job_id"],
            status="validating",
            current_node="verify_quality",
        )
        outcome = await provider.verify_quality(
            GeneratedReading.model_validate(state["item"]),
            state["models"]["quality_validator_model"],
        )
        return {"quality_validation": outcome.model_dump(mode="json", by_alias=False)}

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

            reading_item = ReadingItem(
                title=item.title,
                passage=item.passage,
                question=item.question,
                explanation=item.explanation,
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
    graph.add_edge(START, "generate")
    graph.add_edge("generate", "validate_schema")
    graph.add_conditional_edges("validate_schema", after_schema)
    graph.add_edge(["verify_answer", "verify_quality"], "decide")
    graph.add_conditional_edges("decide", after_decision)
    graph.add_edge("revise", "generate")
    graph.add_edge("persist", END)
    return graph
