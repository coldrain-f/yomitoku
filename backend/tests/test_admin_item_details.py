from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.api.routes.admin import update_admin_reading_item
from app.core.security import CurrentUser
from app.db.models import (
    ItemReport,
    ItemValidation,
    PassageHighlight,
    ReadingChoice,
    ReadingItem,
)
from app.schemas import AdminReadingItemUpdate
from app.services.admin_reading_items import get_admin_item, serialize_detail
from app.services.item_metrics import collect_item_metrics
from tests.factories import make_generation_job, make_user


@pytest.mark.asyncio
async def test_admin_item_detail_includes_validation_and_report_records(
    sessions: async_sessionmaker[AsyncSession],
) -> None:
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
        user = await make_user(session, role="admin")
        job = await make_generation_job(
            session,
            requested_by=user.id,
            status="ready_for_review",
            current_node="complete",
        )
        session.add(item)
        await session.flush()
        session.add_all(
            [
                ItemReport(
                    user_id=user.id,
                    reading_item_id=item_id,
                    content="이 선택지는 본문 근거와 맞지 않습니다.",
                    status="open",
                    created_at=now,
                ),
                ItemReport(
                    user_id=user.id,
                    reading_item_id=item_id,
                    content="해설의 표현을 확인해 주세요.",
                    status="open",
                    created_at=now + timedelta(minutes=1),
                ),
                ItemValidation(
                    generation_job_id=job.id,
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
                    generation_job_id=job.id,
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


@pytest.mark.asyncio
async def test_passage_edit_requires_confirmation_before_clearing_highlights(
    sessions: async_sessionmaker[AsyncSession],
) -> None:
    item_id = uuid4()
    async with sessions() as session:
        user = await make_user(session, role="admin")
        current_user = CurrentUser(id=user.id, role="admin")
        item = ReadingItem(
            id=item_id,
            title="하이라이트 문항",
            passage="본문의 근거를 먼저 확인한다.",
            question="글의 핵심은 무엇인가?",
            explanation="본문의 근거를 확인해야 한다.",
            language="ja",
            official_level="N2",
            length_type="short",
            topic="교육",
            recommended_seconds=180,
            status="published",
        )
        item.choices = [
            ReadingChoice(
                text=f"선택지 {index}",
                canonical_order=index,
                is_correct=index == 1,
            )
            for index in range(1, 5)
        ]
        session.add(item)
        await session.flush()
        session.add(
            PassageHighlight(
                user_id=user.id,
                reading_item_id=item_id,
                start_offset=0,
                end_offset=2,
                selected_text="본문",
            )
        )
        await session.commit()

        await update_admin_reading_item(
            item_id,
            AdminReadingItemUpdate(title="수정한 제목"),
            session,
            current_user,
        )
        assert await session.scalar(select(func.count()).select_from(PassageHighlight)) == 1

        with pytest.raises(HTTPException) as error:
            await update_admin_reading_item(
                item_id,
                AdminReadingItemUpdate(passage="바뀐 본문입니다."),
                session,
                current_user,
            )
        assert error.value.status_code == 409
        assert await session.scalar(select(func.count()).select_from(PassageHighlight)) == 1

        detail = await update_admin_reading_item(
            item_id,
            AdminReadingItemUpdate(
                passage="바뀐 본문입니다.",
                clear_passage_highlights=True,
            ),
            session,
            current_user,
        )

    assert detail.highlight_count == 0
