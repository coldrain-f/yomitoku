from typing import Literal
from uuid import UUID

from sqlalchemy import case, func, select

from app.db.models import Attempt, ReadingItem


def learner_progress_for_submissions(
    submissions: list[Attempt], recommended_seconds: int
) -> tuple[
    Literal["correct", "wrong"] | None,
    bool,
    Literal[80, 90, 100] | None,
    Literal[
        "first_submission_on_time",
        "first_submission_timed_out",
        "retry_passed",
    ]
    | None,
]:
    """Derive the permanent list score from a learner's submitted attempts."""
    if not submissions:
        return None, False, None, None

    first = submissions[0]
    first_submission_timed_out = bool(
        first.elapsed_seconds is not None
        and first.elapsed_seconds > recommended_seconds
    )
    latest_status: Literal["correct", "wrong"] = (
        "correct" if first.is_correct else "wrong"
    )
    for attempt in submissions[1:]:
        latest_status = "correct" if attempt.is_correct else "wrong"

    for index, attempt in enumerate(submissions):
        if not attempt.is_correct:
            continue
        if index == 0:
            if first_submission_timed_out:
                return (
                    latest_status,
                    first_submission_timed_out,
                    90,
                    "first_submission_timed_out",
                )
            return (
                latest_status,
                first_submission_timed_out,
                100,
                "first_submission_on_time",
            )
        return latest_status, first_submission_timed_out, 80, "retry_passed"

    return latest_status, first_submission_timed_out, None, None


def learner_progress_query(user_id: UUID):
    """Return first/latest submission facts for one learner, grouped by item."""
    ranked = (
        select(
            Attempt.reading_item_id.label("reading_item_id"),
            Attempt.is_correct.label("is_correct"),
            Attempt.elapsed_seconds.label("elapsed_seconds"),
            func.row_number()
            .over(
                partition_by=Attempt.reading_item_id,
                order_by=(Attempt.submitted_at.asc(), Attempt.id.asc()),
            )
            .label("first_position"),
        )
        .where(
            Attempt.user_id == user_id,
            Attempt.submitted_at.is_not(None),
        )
        .subquery()
    )
    return (
        select(
            ranked.c.reading_item_id,
            func.max(
                case(
                    (
                        ranked.c.first_position == 1,
                        case((ranked.c.is_correct.is_(True), 1), else_=0),
                    ),
                    else_=0,
                )
            ).label("first_correct"),
            func.max(
                case(
                    (ranked.c.first_position == 1, ranked.c.elapsed_seconds),
                    else_=None,
                )
            ).label("first_elapsed_seconds"),
            func.max(
                case((ranked.c.is_correct.is_(True), 1), else_=0)
            ).label("has_correct"),
        )
        .group_by(ranked.c.reading_item_id)
        .subquery()
    )


def learner_score_expression(progress, item: ReadingItem):
    return case(
        (
            progress.c.first_correct == 1,
            case(
                (progress.c.first_elapsed_seconds > item.recommended_seconds, 90),
                else_=100,
            ),
        ),
        (progress.c.has_correct == 1, 80),
        else_=None,
    )
