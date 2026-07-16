from __future__ import annotations

import argparse
import json
import os
import re
import sqlite3
import sys
import time
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

PHONE_PATTERN = re.compile(r"(?<!\d)1[3-9]\d{9}(?!\d)")
EMAIL_PATTERN = re.compile(r"[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate a sanitized static data fixture for the README preview."
    )
    parser.add_argument(
        "--database",
        type=Path,
        default=ROOT / "data" / "nanyong.db",
        help="Source Nanyong Zhike SQLite database.",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=ROOT / "frontend" / "src" / "preview-data.json",
        help="Output JSON fixture.",
    )
    parser.add_argument(
        "--username",
        default="",
        help="Source account. Defaults to the numeric account with the most snapshots.",
    )
    return parser.parse_args()


def select_username(connection: sqlite3.Connection, requested: str) -> str:
    if requested:
        return requested
    row = connection.execute(
        """
        SELECT username, COUNT(*) AS snapshot_count
        FROM portal_snapshots
        WHERE username GLOB '[0-9]*'
        GROUP BY username
        ORDER BY snapshot_count DESC
        LIMIT 1
        """
    ).fetchone()
    if row is None:
        raise RuntimeError("No numeric account with portal snapshots was found")
    return str(row["username"])


def sanitize_value(path: str, value: Any) -> Any:
    if path == "/api/second-classroom/profile" and isinstance(value, dict):
        return {
            **value,
            "studentId": "已隐藏",
            "name": "Rick Sanchez",
            "email": "已隐藏",
        }
    if path == "/api/five-education/activities" and isinstance(value, dict):
        items = value.get("items")
        if isinstance(items, list):
            value = {
                **value,
                "items": [
                    {
                        **item,
                        "coordinator": "",
                        "contactPhone": "",
                        "contactEmail": "",
                    }
                    if isinstance(item, dict)
                    else item
                    for item in items
                ],
            }
        value = redact_contact_details(value)
    if path.startswith("/api/schedule") or path == "/api/academic/overview":
        value = redact_contact_details(value)
    return value


def redact_contact_details(value: Any) -> Any:
    if isinstance(value, dict):
        sanitized: dict[str, Any] = {}
        for key, item in value.items():
            if key == "JSHS" and isinstance(item, str):
                teachers = [
                    re.split(r"\s+电话：", teacher, maxsplit=1)[0].strip()
                    for teacher in item.split(",")
                ]
                sanitized[key] = ",".join(teacher for teacher in teachers if teacher)
            elif key in {"SKSM", "description"} and isinstance(item, str):
                sanitized[key] = PHONE_PATTERN.sub(
                    "已隐藏", EMAIL_PATTERN.sub("已隐藏", item)
                )
            else:
                sanitized[key] = redact_contact_details(item)
        return sanitized
    if isinstance(value, list):
        return [redact_contact_details(item) for item in value]
    return value


def redact_student_id(value: Any, username: str) -> Any:
    if isinstance(value, dict):
        return {
            key: redact_student_id(item, username)
            for key, item in value.items()
        }
    if isinstance(value, list):
        return [redact_student_id(item, username) for item in value]
    if isinstance(value, str) and username in value:
        return value.replace(username, "已隐藏")
    return value


def load_reviews(connection: sqlite3.Connection) -> list[dict[str, Any]]:
    rows = connection.execute(
        """
        SELECT course_name, teacher, review_text, sources_json
        FROM reviews
        WHERE LENGTH(TRIM(review_text)) >= 20
        ORDER BY id
        LIMIT 180
        """
    ).fetchall()
    return [
        {
            "courseName": str(row["course_name"]),
            "teacher": str(row["teacher"]),
            "review": str(row["review_text"]),
            "sources": json.loads(str(row["sources_json"])),
        }
        for row in rows
    ]


def demo_memos(now: int) -> list[dict[str, Any]]:
    return [
        {
            "id": 3,
            "content": "确认下学期培养方案中的通识课程安排 #选课",
            "tags": ["选课"],
            "pinned": True,
            "linkUrl": None,
            "linkLabel": None,
            "createdAt": now - 7200,
            "updatedAt": now - 1800,
        },
        {
            "id": 2,
            "content": "整理本周课程笔记，完成课程项目阶段总结 #学习",
            "tags": ["学习"],
            "pinned": False,
            "linkUrl": None,
            "linkLabel": None,
            "createdAt": now - 86400,
            "updatedAt": now - 86400,
        },
        {
            "id": 1,
            "content": "查看本科生院最新通知并加入计划 #校园",
            "tags": ["校园"],
            "pinned": False,
            "linkUrl": "https://jw.nju.edu.cn/main.psp",
            "linkLabel": "打开本科生院",
            "createdAt": now - 172800,
            "updatedAt": now - 172800,
        },
    ]


def demo_notices(now: int) -> list[dict[str, str]]:
    current = time.localtime(now)
    date = f"{current.tm_year}-{current.tm_mon:02d}-{current.tm_mday:02d}"
    return [
        {
            "id": "preview-1",
            "date": date,
            "title": "关于本科生课程学习与学业安排的近期通知",
            "url": "https://jw.nju.edu.cn/main.psp",
        },
        {
            "id": "preview-2",
            "date": date,
            "title": "关于学生培养方案与课程认定工作的说明",
            "url": "https://jw.nju.edu.cn/main.psp",
        },
        {
            "id": "preview-3",
            "date": date,
            "title": "近期校园教学服务事项提醒",
            "url": "https://jw.nju.edu.cn/main.psp",
        },
    ]


def main() -> int:
    args = parse_args()
    database_path = args.database.expanduser().resolve()
    if not database_path.is_file():
        raise RuntimeError(f"Database does not exist: {database_path}")

    os.environ["DATABASE_PATH"] = str(database_path)

    from backend.app.academic_snapshots import AcademicSnapshotRepository
    from backend.app.config import get_settings
    from backend.app.database import Database
    from backend.app.portal_snapshots import PortalSnapshotRepository

    get_settings.cache_clear()
    settings = get_settings()
    database = Database(settings.database_path)
    academic_snapshots = AcademicSnapshotRepository(database, settings)
    portal_snapshots = PortalSnapshotRepository(database, settings)

    with sqlite3.connect(database_path) as connection:
        connection.row_factory = sqlite3.Row
        username = select_username(connection, args.username)
        academic = academic_snapshots.get(username)
        if academic is None:
            raise RuntimeError("The selected account does not have an academic snapshot")
        portal = portal_snapshots.list(username)
        reviews = load_reviews(connection)

    now = int(time.time())
    entries = {
        path: {
            "value": sanitize_value(path, entry["value"]),
            "updatedAt": int(entry["updatedAt"]),
        }
        for path, entry in portal.items()
    }
    entries["/api/academic/overview"] = {
        "value": {
            **academic["payload"],
            "source": "cache",
            "cachedAt": int(academic["updatedAt"]),
            "newGradeCount": 0,
        },
        "updatedAt": int(academic["updatedAt"]),
    }

    notices = demo_notices(now)
    fixture = {
        "meta": {
            "generatedAt": now,
            "sessionUsername": "Rick Sanchez",
            "version": "2.0.2",
            "notice": "演示数据已脱敏，学号及身份字段不会公开。",
        },
        "entries": entries,
        "notices": notices,
        "noticeDetails": {
            notice["id"]: {
                **notice,
                "content": (
                    "这是南雍知课交互预览中的通知正文示例。"
                    "正式使用时，应用会从南京大学本科生院读取原始通知内容。"
                ),
            }
            for notice in notices
        },
        "reviews": reviews,
        "memos": demo_memos(now),
    }
    fixture = redact_student_id(fixture, username)

    serialized = json.dumps(
        fixture, ensure_ascii=False, indent=2, sort_keys=True
    )
    if username in serialized:
        raise RuntimeError("Privacy check failed: source student ID remains in fixture")

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(serialized + "\n", encoding="utf-8")
    print(
        f"Wrote sanitized preview data with {len(entries)} cached endpoints "
        f"and {len(reviews)} review samples to {args.output}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
