from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.api.routes.admin import get_admin_item, serialize_detail
from app.db.base import Base
from app.db.models import (
    GenerationJob,
    ItemReport,
    ItemValidation,
    ReadingChoice,
    ReadingItem,
    User,
)
from app.services.item_metrics import collect_item_metrics


@pytest.fixture
async def sessions() -> async_sessionmaker[AsyncSession]:
    engine = create_async_engine("sqlite+aiosqlite://")
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    try:
        yield factory
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_admin_item_detail_includes_validation_and_report_records(
    sessions: async_sessionmaker[AsyncSession],
) -> None:
    user_id = uuid4()
    job_id = uuid4()
    item_id = uuid4()
    now = datetime(2026, 9, 5, tzinfo=UTC)
    async with sessions() as session:
        item = ReadingItem(
            id=item_id,
            title="검증 기록",
            passage="지문의 근거를 확인한다.",
            question="글의 핵심은 무엇인가?",
            explanation="근거를 확인하는 내용이다.",
            language="ja",
            official_level="N2",
            length_type="short",
            topic="교육",
            recommended_seconds=180,
            status="review",
        )
        item.choices = [
            ReadingChoice(
                text=f"선택지 {index}",
                canonical_order=index,
                is_correct=index == 1,
            )
            for index in range(1, 5)
        ]
        job = GenerationJob(
            id=job_id,
            requested_by=user_id,
            graph_thread_id=str(job_id),
            status="ready_for_review",
            current_node="complete",
            language="ja",
            official_level="N2",
            length_type="short",
            topic="교육",
            keywords=[],
            generator_model="claude-fable-5-1",
            answer_validator_model="claude-fable-5-1",
            quality_validator_model="claude-fable-5-1",
            prompt_version="v5",
        )
        session.add_all([User(id=user_id, role="admin"), item, job])
        await session.flush()
        session.add_all(
            [
                ItemReport(
                    user_id=user_id,
                    reading_item_id=item_id,
                    content="이 선택지는 본문 근거와 맞지 않습니다.",
                    status="open",
                    created_at=now,
                ),
                ItemReport(
                    user_id=user_id,
                    reading_item_id=item_id,
                    content="해설의 표현을 확인해 주세요.",
                    status="open",
                    created_at=now + timedelta(minutes=1),
                ),
                ItemValidation(
                    generation_job_id=job_id,
                    reading_item_id=item_id,
                    validator_role="answer",
                    model_id="claude-fable-5-1",
                    status="passed",
                    score=96,
                    issue_codes=[],
                    evidence=[],
                    raw_response={},
                    created_at=now,
                ),
                ItemValidation(
                    generation_job_id=job_id,
                    reading_item_id=item_id,
                    validator_role="quality",
                    model_id="claude-fable-5-1",
                    status="warning",
                    score=82,
                    issue_codes=["DISTRACTOR_OVERLAP"],
                    evidence=["2번과 3번 선택지가 의미상 가깝다."],
                    raw_response={},
                    created_at=now + timedelta(minutes=1),
                ),
            ]
        )
        await session.commit()

        loaded = await get_admin_item(session, item_id)
        metrics = await collect_item_metrics(session, [item_id])
        detail = await serialize_detail(session, loaded, metrics[item_id])

    assert [report.content for report in detail.reports] == [
        "해설의 표현을 확인해 주세요.",
        "이 선택지는 본문 근거와 맞지 않습니다.",
    ]
    assert [(validation.validator_role, validation.score) for validation in detail.validations] == [
        ("answer", 96),
        ("quality", 82),
    ]
    assert detail.validations[1].issue_codes == ["DISTRACTOR_OVERLAP"]
    assert detail.validations[1].evidence == ["2번과 3번 선택지가 의미상 가깝다."]
