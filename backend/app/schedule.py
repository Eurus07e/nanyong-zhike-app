from __future__ import annotations

from typing import Any


COURSE_DETAIL_FIELDS = (
    "KCM",
    "KCFLDM",
    "KCFLDM_DISPLAY",
    "KCFL1",
    "KCFL1_DISPLAY",
    "BY9",
    "BY9_DISPLAY",
    "XGXKLBDM",
    "XGXKLBDM_DISPLAY",
    "SFXGXK",
    "SFXGXK_DISPLAY",
)


def merge_schedule_details(payload: Any, details: Any) -> Any:
    """Add course classification fields missing from the schedule list response."""
    if not isinstance(payload, dict) or not isinstance(payload.get("rows"), list):
        return payload
    if not isinstance(details, list):
        return payload

    by_class: dict[str, dict[str, Any]] = {}
    by_course: dict[str, dict[str, Any]] = {}
    for detail in details:
        if not isinstance(detail, dict):
            continue
        schedule = detail.get("schedule")
        course_info = detail.get("course_info")
        info_rows = course_info.get("rows") if isinstance(course_info, dict) else None
        info = info_rows[0] if isinstance(info_rows, list) and info_rows else None
        if not isinstance(schedule, dict) or not isinstance(info, dict):
            continue
        class_id = schedule.get("JXBID")
        course_id = schedule.get("KCH")
        if class_id:
            by_class[str(class_id)] = info
        if course_id:
            by_course[str(course_id)] = info

    for row in payload["rows"]:
        if not isinstance(row, dict):
            continue
        info = by_class.get(str(row.get("JXBID") or "")) or by_course.get(
            str(row.get("KCH") or "")
        )
        if not info:
            continue
        for field in COURSE_DETAIL_FIELDS:
            if not row.get(field) and info.get(field):
                row[field] = info[field]
    return payload
