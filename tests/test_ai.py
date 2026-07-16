from __future__ import annotations

from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

import pytest
from fastapi.testclient import TestClient

from backend.app import main
from backend.app.ai_tools import AI_TOOL_SPECS, dispatch_tool
from backend.app import llm_gateway
from backend.app.llm_gateway import (
    AiChatRequest,
    AiGateway,
    academic_term_context,
    build_system_prompt,
    normalize_tool_arguments,
    validate_endpoint,
)
from backend.app.security import Session


def test_beijing_timezone_does_not_require_platform_tzdata() -> None:
    assert isinstance(llm_gateway.NJU_TIMEZONE, timezone)
    assert llm_gateway.NJU_TIMEZONE.utcoffset(None) == timedelta(hours=8)
    assert llm_gateway.NJU_TIMEZONE.tzname(None) == "Asia/Shanghai"


def test_ai_tool_registry_is_read_only_and_covers_core_sources() -> None:
    names = {str(item["function"]["name"]) for item in AI_TOOL_SPECS}

    assert {
        "get_academic_overview",
        "get_grades",
        "get_schedule_terms",
        "get_schedule",
        "get_programs",
        "get_program_nodes",
        "get_program_courses",
        "get_five_education",
        "get_second_classroom",
        "list_notices",
        "search_reviews",
        "list_memos",
    } <= names
    assert not names & {
        "create_memo",
        "update_memo",
        "delete_memo",
        "submit_course_selection",
    }

    schedule_tool = next(
        item["function"] for item in AI_TOOL_SPECS
        if item["function"]["name"] == "get_schedule"
    )
    assert "get_schedule_terms" in schedule_tool["description"]
    assert "相对" in schedule_tool["description"]


def test_ai_prompt_resolves_nju_relative_terms_from_beijing_time() -> None:
    context = academic_term_context(
        datetime(2026, 7, 16, 6, 2, tzinfo=ZoneInfo("Asia/Shanghai"))
    )

    assert context.current_term == "2025-2026-2"
    assert context.previous_term == "2025-2026-1"
    assert context.next_term == "2026-2027-1"

    prompt = build_system_prompt(context)
    assert "当前北京时间：2026-07-16 06:02" in prompt
    assert "当前教学参照学期：2025-2026-2" in prompt
    assert "紧接着的下一学期：2026-2027-1" in prompt
    assert "南大、NJU 均指南京大学" in prompt
    assert "悦读经典计划" in prompt
    assert "不得退回默认学期" in prompt


def test_ai_overrides_a_wrong_schedule_term_for_clear_relative_language() -> None:
    context = academic_term_context(
        datetime(2026, 7, 16, 6, 2, tzinfo=ZoneInfo("Asia/Shanghai"))
    )

    assert normalize_tool_arguments(
        "get_schedule",
        {"term": "2025-2026-2"},
        "帮我看看下学期课表有没有时间冲突。",
        context,
    ) == {"term": "2026-2027-1"}
    assert normalize_tool_arguments(
        "get_schedule",
        {"term": "2025-2026-2"},
        "分析 2025-2026-2 的课表。",
        context,
    ) == {"term": "2025-2026-2"}


@pytest.mark.asyncio
async def test_schedule_terms_tool_uses_the_existing_read_only_endpoint(monkeypatch) -> None:
    async def fake_schedule_terms(session, refresh=False):
        assert session.username == "alice"
        assert refresh is False
        return [{"DM": "2026-2027-1", "MC": "2026-2027学年 第1学期"}]

    monkeypatch.setattr(main, "schedule_terms", fake_schedule_terms)
    result = await dispatch_tool(
        "get_schedule_terms",
        {},
        Session(username="alice", castgc="ticket", expires_at=9_999_999_999),
    )

    assert result[0]["DM"] == "2026-2027-1"


def test_ai_provider_endpoint_allows_https_and_local_ollama_only() -> None:
    assert validate_endpoint("https://api.example.com/v1/chat/completions") == (
        "https://api.example.com/v1/chat/completions"
    )
    assert validate_endpoint("http://127.0.0.1:11434/v1/chat/completions").startswith(
        "http://127.0.0.1"
    )

    with pytest.raises(ValueError):
        validate_endpoint("http://example.com/v1/chat/completions")
    with pytest.raises(ValueError):
        validate_endpoint("http://169.254.169.254/latest/meta-data")


def test_ai_chat_requires_session() -> None:
    client = TestClient(main.app)

    response = client.post(
        "/api/ai/chat",
        json={
            "endpoint": "https://api.example.com/v1/chat/completions",
            "model": "demo",
            "apiKey": "secret",
            "messages": [{"role": "user", "content": "我还缺什么课？"}],
        },
    )

    assert response.status_code == 401


def test_ai_chat_passes_request_to_gateway_without_persisting_it(monkeypatch) -> None:
    captured: dict[str, object] = {}

    async def fake_chat(body, session):
        captured["body"] = body
        captured["session"] = session
        return {
            "message": "你还需要查询培养方案后才能确认。",
            "sources": [{"label": "培养方案", "tool": "get_program_nodes"}],
            "model": body.model,
        }

    monkeypatch.setattr(main.ai_gateway, "chat", fake_chat)
    main.app.dependency_overrides[main.current_session] = lambda: Session(
        username="alice", castgc="ticket", expires_at=9_999_999_999
    )
    client = TestClient(main.app)
    try:
        response = client.post(
            "/api/ai/chat",
            json={
                "endpoint": "https://api.example.com/v1/chat/completions",
                "model": "demo",
                "apiKey": "request-only-secret",
                "messages": [{"role": "user", "content": "我还缺什么课？"}],
            },
        )
    finally:
        main.app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json()["message"].startswith("你还需要")
    assert captured["session"].username == "alice"
    assert captured["body"].api_key == "request-only-secret"


def test_ai_chat_rejects_invalid_provider_endpoint() -> None:
    main.app.dependency_overrides[main.current_session] = lambda: Session(
        username="alice", castgc="ticket", expires_at=9_999_999_999
    )
    client = TestClient(main.app)
    try:
        response = client.post(
            "/api/ai/chat",
            json={
                "endpoint": "http://example.com/v1/chat/completions",
                "model": "demo",
                "apiKey": "request-only-secret",
                "messages": [{"role": "user", "content": "你好"}],
            },
        )
    finally:
        main.app.dependency_overrides.clear()

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_gateway_executes_read_only_tool_before_final_answer(monkeypatch) -> None:
    responses = iter([
        {
            "choices": [{
                "message": {
                    "role": "assistant",
                    "content": None,
                    "tool_calls": [{
                        "id": "call-1",
                        "type": "function",
                        "function": {"name": "get_academic_overview", "arguments": "{}"},
                    }],
                }
            }]
        },
        {"choices": [{"message": {"role": "assistant", "content": "你已获得 20 学分。"}}]},
    ])
    payloads: list[dict] = []

    def fake_post(endpoint, api_key, payload):
        assert endpoint.startswith("https://")
        assert api_key == "request-only-secret"
        payloads.append(payload)
        return next(responses)

    async def fake_tool(name, arguments, session):
        assert name == "get_academic_overview"
        assert arguments == {}
        assert session.username == "alice"
        return {"summary": {"earnedCredits": 20}}

    monkeypatch.setattr(llm_gateway, "_post_json_sync", fake_post)
    monkeypatch.setattr(llm_gateway, "dispatch_tool", fake_tool)
    result = await AiGateway().chat(
        AiChatRequest(
            endpoint="https://api.example.com/v1/chat/completions",
            model="demo",
            apiKey="request-only-secret",
            messages=[{"role": "user", "content": "我修了多少学分？"}],
        ),
        Session(username="alice", castgc="ticket", expires_at=9_999_999_999),
    )

    assert result["message"] == "你已获得 20 学分。"
    assert result["sources"] == [{"label": "学业概览", "tool": "get_academic_overview"}]
    assert any(message.get("role") == "tool" for message in payloads[1]["messages"])


@pytest.mark.asyncio
async def test_gateway_forces_a_final_answer_after_repeated_tool_calls(monkeypatch) -> None:
    payloads: list[dict] = []

    def fake_post(endpoint, api_key, payload):
        payloads.append(payload)
        if "tools" in payload:
            return {
                "choices": [{
                    "message": {
                        "role": "assistant",
                        "content": None,
                        "tool_calls": [{
                            "id": f"call-{len(payloads)}",
                            "type": "function",
                            "function": {
                                "name": "get_academic_overview",
                                "arguments": "{}",
                            },
                        }],
                    }
                }]
            }
        return {"choices": [{"message": {"role": "assistant", "content": "已根据刚才查询的数据整理完成。"}}]}

    async def fake_tool(name, arguments, session):
        return {"summary": {"earnedCredits": 20}}

    monkeypatch.setattr(llm_gateway, "_post_json_sync", fake_post)
    monkeypatch.setattr(llm_gateway, "dispatch_tool", fake_tool)
    result = await AiGateway(max_tool_rounds=2).chat(
        AiChatRequest(
            endpoint="https://api.example.com/v1/chat/completions",
            model="demo",
            apiKey="request-only-secret",
            messages=[{"role": "user", "content": "我还缺哪些培养方案学分？"}],
        ),
        Session(username="alice", castgc="ticket", expires_at=9_999_999_999),
    )

    assert result["message"] == "已根据刚才查询的数据整理完成。"
    assert len(payloads) == 2
    assert "tools" not in payloads[-1]
    assert "tool_choice" not in payloads[-1]
    assert payloads[-1]["messages"][-1]["role"] == "user"


@pytest.mark.asyncio
async def test_gateway_does_not_execute_identical_tool_calls_twice(monkeypatch) -> None:
    calls = 0

    def fake_post(endpoint, api_key, payload):
        if "tools" in payload:
            return {
                "choices": [{
                    "message": {
                        "role": "assistant",
                        "content": None,
                        "tool_calls": [{
                            "id": f"call-{len(payload['messages'])}",
                            "type": "function",
                            "function": {
                                "name": "get_academic_overview",
                                "arguments": "{}",
                            },
                        }],
                    }
                }]
            }
        return {"choices": [{"message": {"role": "assistant", "content": "已整理。"}}]}

    async def fake_tool(name, arguments, session):
        nonlocal calls
        calls += 1
        return {"summary": {"earnedCredits": 20}}

    monkeypatch.setattr(llm_gateway, "_post_json_sync", fake_post)
    monkeypatch.setattr(llm_gateway, "dispatch_tool", fake_tool)
    result = await AiGateway(max_tool_rounds=3).chat(
        AiChatRequest(
            endpoint="https://api.example.com/v1/chat/completions",
            model="demo",
            apiKey="request-only-secret",
            messages=[{"role": "user", "content": "我修了多少学分？"}],
        ),
        Session(username="alice", castgc="ticket", expires_at=9_999_999_999),
    )

    assert result["message"] == "已整理。"
    assert calls == 1


@pytest.mark.asyncio
async def test_gateway_corrects_relative_schedule_term_before_querying(monkeypatch) -> None:
    context = academic_term_context(
        datetime(2026, 7, 16, 6, 2, tzinfo=ZoneInfo("Asia/Shanghai"))
    )
    payloads: list[dict] = []

    def fake_post(endpoint, api_key, payload):
        payloads.append(payload)
        if "tools" in payload:
            return {
                "choices": [{
                    "message": {
                        "role": "assistant",
                        "content": None,
                        "tool_calls": [{
                            "id": "call-schedule",
                            "type": "function",
                            "function": {
                                "name": "get_schedule",
                                "arguments": '{"term":"2025-2026-2"}',
                            },
                        }],
                    }
                }]
            }
        return {"choices": [{"message": {"role": "assistant", "content": "已按下学期课表核对。"}}]}

    async def fake_tool(name, arguments, session):
        assert name == "get_schedule"
        assert arguments == {"term": "2026-2027-1"}
        return {"term": "2026-2027-1", "rows": []}

    monkeypatch.setattr(llm_gateway, "academic_term_context", lambda: context)
    monkeypatch.setattr(llm_gateway, "_post_json_sync", fake_post)
    monkeypatch.setattr(llm_gateway, "dispatch_tool", fake_tool)
    result = await AiGateway(max_tool_rounds=2).chat(
        AiChatRequest(
            endpoint="https://api.example.com/v1/chat/completions",
            model="demo",
            apiKey="request-only-secret",
            messages=[{"role": "user", "content": "帮我看看下学期课表有没有时间冲突。"}],
        ),
        Session(username="alice", castgc="ticket", expires_at=9_999_999_999),
    )

    assert result["message"] == "已按下学期课表核对。"
    assert payloads[0]["messages"][0]["content"].startswith("你是南雍知课的南京大学")
    assert '"term":"2026-2027-1"' in payloads[1]["messages"][2]["tool_calls"][0]["function"]["arguments"]
