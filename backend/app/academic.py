from __future__ import annotations

from collections import defaultdict
from typing import Any


def passed_course_detail_requests(payload: dict[str, Any]) -> dict[str, list[str]]:
    """Group unique passed course IDs by term for detail lookup."""
    grouped: dict[str, set[str]] = defaultdict(set)
    rows = payload.get("rows", []) if isinstance(payload, dict) else []
    for row in rows:
        if not isinstance(row, dict):
            continue
        passed = str(row.get("SFJG", "")) == "1" or row.get("SFJG_DISPLAY") == "是"
        term = str(row.get("XNXQDM") or "").strip()
        course_id = str(row.get("KCH") or "").strip()
        if passed and term and course_id:
            grouped[term].add(course_id)
    return {
        term: sorted(course_ids)
        for term, course_ids in sorted(grouped.items())
    }


def _number(value: Any) -> float:
    try:
        return float(value or 0)
    except (TypeError, ValueError):
        return 0.0


def _optional_number(value: Any) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def summarize_grades(payload: dict[str, Any]) -> dict[str, Any]:
    rows = payload.get("rows", []) if isinstance(payload, dict) else []
    categories: dict[str, float] = defaultdict(float)
    earned = 0.0
    weighted_score = 0.0
    scored_credits = 0.0
    terms: dict[str, float] = defaultdict(float)
    passed_count = 0

    for row in rows:
        if not isinstance(row, dict):
            continue
        credit = _number(row.get("XF"))
        passed = str(row.get("SFJG", "")) == "1" or row.get("SFJG_DISPLAY") == "是"
        if passed:
            earned += credit
            passed_count += 1
            category = str(row.get("KCXZDM_DISPLAY") or "未分类")
            categories[category] += credit
            term = str(row.get("XNXQDM_DISPLAY") or row.get("XNXQDM") or "未知学期")
            terms[term] += credit
        score = _optional_number(row.get("ZCJ"))
        if score is not None and credit:
            weighted_score += score * credit
            scored_credits += credit

    graduation_categories = {
        "通识通修课程": 0.0,
        "学科专业课程": 0.0,
        "多元发展课程": 0.0,
        "毕业论文/设计": 0.0,
    }
    for name, credits in categories.items():
        if "毕业" in name:
            target = "毕业论文/设计"
        elif "选修" in name and "通识" not in name:
            target = "多元发展课程"
        elif any(label in name for label in ("平台", "学科", "专业")):
            target = "学科专业课程"
        else:
            target = "通识通修课程"
        graduation_categories[target] += credits

    return {
        "earnedCredits": round(earned, 2),
        "weightedAverage": round(weighted_score / scored_credits, 2) if scored_credits else None,
        "gpa": round(weighted_score / scored_credits / 20, 2) if scored_credits else None,
        "degreeGpa": None,
        "degreeGpaUnavailableReason": "eHall 成绩接口未提供学位课标记，无法可靠区分学位课。",
        "passedCourses": passed_count,
        "categories": [
            {"name": name, "credits": round(credits, 2)}
            for name, credits in sorted(categories.items(), key=lambda item: -item[1])
        ],
        "terms": [
            {"name": name, "credits": round(credits, 2)}
            for name, credits in sorted(terms.items())
        ],
        "graduationCategories": [
            {"name": name, "credits": round(credits, 2)}
            for name, credits in graduation_categories.items()
        ],
    }
