import asyncio

import pytest
from fastapi import HTTPException

from backend.app.academic import passed_course_detail_requests, summarize_grades
from backend.app.security import Session


def test_summarize_grades_counts_only_passed_credits():
    summary = summarize_grades(
        {
            "rows": [
                {"XF": "3", "SFJG": "1", "KCXZDM_DISPLAY": "通修", "ZCJ": "90", "XNXQDM": "2025-1"},
                {"XF": "2", "SFJG": "0", "KCXZDM_DISPLAY": "通修", "ZCJ": "40", "XNXQDM": "2025-1"},
                {"XF": ".25", "SFJG_DISPLAY": "是", "KCXZDM_DISPLAY": "通识", "ZCJ": "合格", "XNXQDM": "2025-2"},
            ]
        }
    )
    assert summary["earnedCredits"] == 3.25
    assert summary["passedCourses"] == 2
    assert summary["weightedAverage"] == 70.0
    assert summary["gpa"] == 3.5
    assert summary["degreeGpa"] is None
    assert summary["categories"] == [
        {"name": "通修", "credits": 3.0},
        {"name": "通识", "credits": 0.25},
    ]
    assert summary["graduationCategories"] == [
        {"name": "通识通修课程", "credits": 3.25},
        {"name": "学科专业课程", "credits": 0.0},
        {"name": "多元发展课程", "credits": 0.0},
        {"name": "毕业论文/设计", "credits": 0.0},
    ]


def test_passed_course_detail_requests_group_unique_passed_courses_by_term():
    payload = {
        "rows": [
            {"KCH": "G1", "XNXQDM": "2025-2026-1", "KCXZDM_DISPLAY": "通识", "SFJG": "1"},
            {"KCH": "G1", "XNXQDM": "2025-2026-1", "KCXZDM_DISPLAY": "通识", "SFJG_DISPLAY": "是"},
            {"KCH": "G2", "XNXQDM": "2025-2026-2", "KCXZDM_DISPLAY": "通识课程", "SFJG": "1"},
            {"KCH": "FAILED", "XNXQDM": "2025-2026-1", "KCXZDM_DISPLAY": "通识", "SFJG": "0"},
            {"KCH": "MAJOR", "XNXQDM": "2025-2026-1", "KCXZDM_DISPLAY": "平台", "SFJG": "1"},
            {"KCH": "", "XNXQDM": "2025-2026-1", "KCXZDM_DISPLAY": "通识", "SFJG": "1"},
            {"KCH": "NO_TERM", "XNXQDM": "", "KCXZDM_DISPLAY": "通识", "SFJG": "1"},
        ]
    }

    assert passed_course_detail_requests(payload) == {
        "2025-2026-1": ["G1", "MAJOR"],
        "2025-2026-2": ["G2"],
    }


async def test_enrich_passed_courses_batches_by_term_and_isolates_fallback_failures(monkeypatch):
    from backend.app import main

    payload = {
        "rows": [
            {"KCH": "G1", "XNXQDM": "2025-2026-1", "KCXZDM_DISPLAY": "通识", "SFJG": "1"},
            {"KCH": "MISSING", "XNXQDM": "2025-2026-1", "KCXZDM_DISPLAY": "通识", "SFJG": "1"},
            {"KCH": "G2", "XNXQDM": "2025-2026-1", "KCXZDM_DISPLAY": "平台", "SFJG": "1"},
            {"KCH": "ENGLISH", "XNXQDM": "2025-2026-2", "KCXZDM_DISPLAY": "通修", "SFJG": "1"},
        ]
    }
    calls: list[tuple[tuple[str, ...], int]] = []

    async def fake_run_cli(session, args, *, timeout=45):
        course_ids = args[3:args.index("--term")]
        calls.append((tuple(course_ids), timeout))
        if "MISSING" in course_ids:
            raise HTTPException(status_code=502, detail="学校服务响应超时，请稍后重试")
        return [
            {
                "schedule": {"KCH": course_id},
                "course_info": {"rows": [{"BY9_DISPLAY": f"官方分类-{course_id}"}]},
            }
            for course_id in course_ids
        ]

    monkeypatch.setattr(main, "run_cli", fake_run_cli)
    enriched = await main.enrich_passed_course_details(
        Session(username="alice", castgc="ticket", expires_at=9_999_999_999),
        payload,
    )

    assert sorted(calls) == [
        (("ENGLISH",), 45),
        (("G1",), 45),
        (("G1", "G2", "MISSING"), 90),
        (("G2",), 45),
        (("MISSING",), 45),
    ]
    rows = {row["KCH"]: row for row in enriched["rows"]}
    assert rows["G1"]["BY9_DISPLAY"] == "官方分类-G1"
    assert rows["G2"]["BY9_DISPLAY"] == "官方分类-G2"
    assert rows["ENGLISH"]["BY9_DISPLAY"] == "官方分类-ENGLISH"
    assert "BY9_DISPLAY" not in rows["MISSING"]


async def test_enrich_passed_courses_limits_term_batch_concurrency(monkeypatch):
    from backend.app import main

    monkeypatch.setattr(main.settings, "nju_cli_user_concurrency", 2)
    active = 0
    peak = 0

    async def fake_run_cli(session, args, *, timeout=45):
        nonlocal active, peak
        course_ids = args[3:args.index("--term")]
        active += 1
        peak = max(peak, active)
        await asyncio.sleep(0.01)
        active -= 1
        return [
            {
                "schedule": {"KCH": course_id},
                "course_info": {"rows": [{"BY9_DISPLAY": "官方分类"}]},
            }
            for course_id in course_ids
        ]

    monkeypatch.setattr(main, "run_cli", fake_run_cli)
    payload = {
        "rows": [
            {
                "KCH": f"C{index}",
                "XNXQDM": f"2025-2026-{index + 1}",
                "SFJG": "1",
            }
            for index in range(6)
        ]
    }

    await main.enrich_passed_course_details(
        Session(username="alice", castgc="ticket", expires_at=9_999_999_999),
        payload,
    )

    assert peak == 2


async def test_enrich_passed_courses_propagates_authentication_failure(monkeypatch):
    from backend.app import main

    async def fake_run_cli(session, args, *, timeout=45):
        course_ids = args[3:args.index("--term")]
        if "AUTH" in course_ids:
            raise HTTPException(status_code=401, detail="统一身份认证登录已过期，请重新登录")
        return []

    monkeypatch.setattr(main, "run_cli", fake_run_cli)
    payload = {
        "rows": [
            {"KCH": "AUTH", "XNXQDM": "2025-2026-1", "SFJG": "1"},
            {"KCH": "G1", "XNXQDM": "2025-2026-1", "SFJG": "1"},
        ]
    }

    with pytest.raises(HTTPException) as caught:
        await main.enrich_passed_course_details(
            Session(username="alice", castgc="ticket", expires_at=9_999_999_999),
            payload,
        )

    assert caught.value.status_code == 401
    assert caught.value.detail == "统一身份认证登录已过期，请重新登录"
