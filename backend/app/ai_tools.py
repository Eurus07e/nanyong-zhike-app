from __future__ import annotations

import json
from typing import Any

from .security import Session


TOOL_LABELS: dict[str, str] = {
    "get_academic_profile": "个人资料",
    "get_academic_overview": "学业概览",
    "get_grades": "全部课程成绩",
    "get_schedule_terms": "课表学期列表",
    "get_schedule": "我的课表",
    "get_programs": "培养方案列表",
    "get_program_nodes": "培养方案结构",
    "get_program_courses": "培养方案课程",
    "get_five_education": "五育总览",
    "get_five_education_activities": "五育活动",
    "get_second_classroom": "第二课堂",
    "list_notices": "重要通知",
    "search_reviews": "课程红黑榜",
    "list_memos": "个人备忘录",
}


def _object(properties: dict[str, Any], required: list[str] | None = None) -> dict[str, Any]:
    value: dict[str, Any] = {
        "type": "object",
        "properties": properties,
        "additionalProperties": False,
    }
    if required:
        value["required"] = required
    return value


AI_TOOL_SPECS: list[dict[str, Any]] = [
    {
        "type": "function",
        "function": {
            "name": "get_academic_profile",
            "description": "查询当前登录用户的年级、专业和院系。",
            "parameters": _object({}),
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_academic_overview",
            "description": "查询当前用户的学分、成绩点、课程数量和培养方案完成概览。",
            "parameters": _object({}),
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_grades",
            "description": "查询全部课程成绩，可按明确的学期代码筛选。学期格式为 2025-2026-1；用户使用本学期、上学期等相对时间时不得猜测或退回默认学期。",
            "parameters": _object({
                "term": {"type": "string", "description": "可选学期代码，例如 2025-2026-1。"},
            }),
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_schedule_terms",
            "description": "列出南京大学 eHall 当前可查询的课表学期代码与名称。遇到本学期、下学期、上学期等相对学期表达时，应先调用本工具确认目标学期是否已经开放。",
            "parameters": _object({}),
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_schedule",
            "description": "查询当前用户某个明确学期的课表和课程时间安排。用户使用相对学期表达时先调用 get_schedule_terms，并传入解析后的 term；不得省略 term 后把默认课表冒充用户要求的学期。",
            "parameters": _object({
                "term": {"type": "string", "description": "可选学期代码，例如 2025-2026-1。"},
            }),
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_programs",
            "description": "搜索可用培养方案，可按年级、院系或方案名称筛选。",
            "parameters": _object({
                "name": {"type": "string", "description": "可选培养方案名称关键词。"},
                "grade": {"type": "string", "description": "可选四位年级，例如 2025。"},
                "department": {"type": "string", "description": "可选院系代码。"},
            }),
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_program_nodes",
            "description": "查询指定培养方案的结构节点。先用 get_programs 获取 PYFADM。",
            "parameters": _object(
                {"programId": {"type": "string", "description": "培养方案 ID。"}},
                ["programId"],
            ),
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_program_courses",
            "description": "查询培养方案某个课程节点下的课程。",
            "parameters": _object(
                {
                    "programId": {"type": "string", "description": "培养方案 ID。"},
                    "nodeId": {"type": "string", "description": "课程节点 ID。"},
                },
                ["programId", "nodeId"],
            ),
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_five_education",
            "description": "查询五育德智体美劳总览和成长模块。",
            "parameters": _object({}),
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_five_education_activities",
            "description": "查询五育系统中的个人活动记录。",
            "parameters": _object({}),
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_second_classroom",
            "description": "查询第二课堂个人资料、活动数和服务时长。",
            "parameters": _object({}),
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_notices",
            "description": "查询南京大学本科生院最近的重要通知。",
            "parameters": _object({
                "limit": {"type": "integer", "minimum": 1, "maximum": 12},
            }),
        },
    },
    {
        "type": "function",
        "function": {
            "name": "search_reviews",
            "description": "搜索课程红黑榜公开评价。",
            "parameters": _object(
                {
                    "q": {"type": "string", "description": "课程名、教师名或组合关键词。"},
                    "field": {"type": "string", "enum": ["all", "course", "teacher"]},
                    "limit": {"type": "integer", "minimum": 1, "maximum": 20},
                },
                ["q"],
            ),
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_memos",
            "description": "查询当前用户自己的备忘录。",
            "parameters": _object({
                "q": {"type": "string", "description": "可选正文或标签搜索词。"},
            }),
        },
    },
]

ALLOWED_TOOL_NAMES = frozenset(TOOL_LABELS)


def _string(arguments: dict[str, Any], key: str, *, max_length: int = 120) -> str | None:
    value = arguments.get(key)
    if value is None:
        return None
    if not isinstance(value, str):
        raise ValueError(f"工具参数 {key} 必须是字符串")
    value = value.strip()
    if len(value) > max_length:
        raise ValueError(f"工具参数 {key} 过长")
    return value or None


def _integer(arguments: dict[str, Any], key: str, default: int, minimum: int, maximum: int) -> int:
    value = arguments.get(key, default)
    if isinstance(value, bool) or not isinstance(value, int):
        raise ValueError(f"工具参数 {key} 必须是整数")
    return max(minimum, min(maximum, value))


async def dispatch_tool(name: str, arguments: dict[str, Any], session: Session) -> Any:
    """Run one explicitly allowlisted, read-only campus query."""
    if name not in ALLOWED_TOOL_NAMES:
        raise ValueError("模型请求了未开放的工具")
    if not isinstance(arguments, dict):
        raise ValueError("工具参数必须是 JSON 对象")

    # Import lazily to keep the tool registry independent from FastAPI app startup.
    from . import main

    if name == "get_academic_profile":
        return await main.academic_profile(session, refresh=False)
    if name == "get_academic_overview":
        return await main.academic_overview(session, refresh=False)
    if name == "get_grades":
        return await main.grades(session, term=_string(arguments, "term", max_length=20))
    if name == "get_schedule_terms":
        return await main.schedule_terms(session, refresh=False)
    if name == "get_schedule":
        return await main.schedule(session, term=_string(arguments, "term", max_length=20), refresh=False)
    if name == "get_programs":
        return await main.programs(
            session,
            name=_string(arguments, "name"),
            grade=_string(arguments, "grade", max_length=4),
            department=_string(arguments, "department", max_length=24),
            refresh=False,
        )
    if name == "get_program_nodes":
        program_id = _string(arguments, "programId", max_length=100)
        if not program_id:
            raise ValueError("缺少 programId")
        return await main.program_nodes(program_id, session, refresh=False)
    if name == "get_program_courses":
        program_id = _string(arguments, "programId", max_length=100)
        node_id = _string(arguments, "nodeId", max_length=100)
        if not program_id or not node_id:
            raise ValueError("缺少 programId 或 nodeId")
        return await main.program_courses(program_id, node_id, session, refresh=False)
    if name == "get_five_education":
        return await main.five_education_overview(session, refresh=False)
    if name == "get_five_education_activities":
        return await main.five_education_activities(session, refresh=False)
    if name == "get_second_classroom":
        return await main.second_classroom_profile(session, refresh=False)
    if name == "list_notices":
        return await main.important_notices(
            limit=_integer(arguments, "limit", 12, 1, 12), refresh=False
        )
    if name == "search_reviews":
        query = _string(arguments, "q", max_length=80)
        if not query:
            raise ValueError("缺少搜索词 q")
        field = _string(arguments, "field", max_length=10) or "all"
        if field not in {"all", "course", "teacher"}:
            raise ValueError("field 只能是 all、course 或 teacher")
        return await main.review_search(
            q=query,
            field=field,
            limit=_integer(arguments, "limit", 20, 1, 20),
            offset=0,
        )
    if name == "list_memos":
        return await main.list_memos(session, q=_string(arguments, "q", max_length=100) or "")
    raise ValueError("模型请求了未开放的工具")


def compact_tool_result(value: Any, *, max_chars: int = 24_000) -> str:
    raw = json.dumps(value, ensure_ascii=False, separators=(",", ":"), default=str)
    if len(raw) <= max_chars:
        return raw
    return json.dumps(
        {
            "truncated": True,
            "message": "结果过长，仅保留前一部分；请用更具体的条件再次查询。",
            "data": raw[: max_chars - 12000],
        },
        ensure_ascii=False,
    )
