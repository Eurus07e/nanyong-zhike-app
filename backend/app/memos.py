from __future__ import annotations

import json
import re
import time
from collections.abc import Callable
from typing import Any
from urllib.parse import urlsplit

from .database import Database


_TAG_PATTERN = re.compile(r"(?<!#)#([\w\u3400-\u9fff-]{1,50})", re.UNICODE)


def extract_tags(content: str) -> list[str]:
    tags: list[str] = []
    seen: set[str] = set()
    for match in _TAG_PATTERN.finditer(content):
        tag = match.group(1).strip("-")
        key = tag.casefold()
        if not tag or key in seen:
            continue
        seen.add(key)
        tags.append(tag)
    return tags


class MemoRepository:
    def __init__(self, database: Database, *, clock: Callable[[], int] | None = None):
        self.database = database
        self.clock = clock or (lambda: int(time.time()))

    def list(self, username: str, query: str = "") -> list[dict[str, Any]]:
        where = "username = ?"
        params: list[Any] = [username]
        normalized_query = query.strip()
        if normalized_query:
            wildcard = f"%{_escape_like(normalized_query)}%"
            where += (
                " AND (content LIKE ? ESCAPE '\\' COLLATE NOCASE"
                " OR tags_json LIKE ? ESCAPE '\\' COLLATE NOCASE)"
            )
            params.extend([wildcard, wildcard])
        with self.database.connection() as connection:
            rows = connection.execute(
                f"""
                SELECT id, content, tags_json, pinned, link_url, link_label,
                       created_at, updated_at
                FROM memos
                WHERE {where}
                ORDER BY pinned DESC, updated_at DESC, id DESC
                """,
                params,
            ).fetchall()
        return [_memo_dict(row) for row in rows]

    def create(
        self,
        username: str,
        content: str,
        *,
        link_url: str | None = None,
        link_label: str | None = None,
    ) -> dict[str, Any]:
        cleaned = _clean_content(content)
        cleaned_url, cleaned_label = _clean_link(link_url, link_label)
        now = self.clock()
        with self.database.connection() as connection:
            cursor = connection.execute(
                """
                INSERT INTO memos(
                    username, content, tags_json, pinned, link_url, link_label,
                    created_at, updated_at
                ) VALUES (?, ?, ?, 0, ?, ?, ?, ?)
                """,
                (
                    username,
                    cleaned,
                    json.dumps(extract_tags(cleaned), ensure_ascii=False),
                    cleaned_url,
                    cleaned_label,
                    now,
                    now,
                ),
            )
            row = connection.execute(
                "SELECT id, content, tags_json, pinned, link_url, link_label, created_at, updated_at FROM memos WHERE id = ?",
                (cursor.lastrowid,),
            ).fetchone()
        if row is None:
            raise RuntimeError("备忘录创建失败")
        return _memo_dict(row)

    def update(
        self,
        username: str,
        memo_id: int,
        *,
        content: str | None = None,
        pinned: bool | None = None,
    ) -> dict[str, Any] | None:
        assignments: list[str] = []
        params: list[Any] = []
        if content is not None:
            cleaned = _clean_content(content)
            assignments.extend(["content = ?", "tags_json = ?"])
            params.extend([
                cleaned,
                json.dumps(extract_tags(cleaned), ensure_ascii=False),
            ])
        if pinned is not None:
            assignments.append("pinned = ?")
            params.append(int(pinned))
        if not assignments:
            return self.get(username, memo_id)

        assignments.append("updated_at = ?")
        params.extend([self.clock(), username, memo_id])
        with self.database.connection() as connection:
            cursor = connection.execute(
                f"UPDATE memos SET {', '.join(assignments)} WHERE username = ? AND id = ?",
                params,
            )
            if cursor.rowcount == 0:
                return None
            row = connection.execute(
                """
                SELECT id, content, tags_json, pinned, link_url, link_label,
                       created_at, updated_at
                FROM memos WHERE username = ? AND id = ?
                """,
                (username, memo_id),
            ).fetchone()
        return _memo_dict(row) if row else None

    def get(self, username: str, memo_id: int) -> dict[str, Any] | None:
        with self.database.connection() as connection:
            row = connection.execute(
                """
                SELECT id, content, tags_json, pinned, link_url, link_label,
                       created_at, updated_at
                FROM memos WHERE username = ? AND id = ?
                """,
                (username, memo_id),
            ).fetchone()
        return _memo_dict(row) if row else None

    def delete(self, username: str, memo_id: int) -> bool:
        with self.database.connection() as connection:
            cursor = connection.execute(
                "DELETE FROM memos WHERE username = ? AND id = ?",
                (username, memo_id),
            )
        return cursor.rowcount > 0


def _clean_content(content: str) -> str:
    cleaned = content.strip()
    if not cleaned:
        raise ValueError("备忘录内容不能为空")
    if len(cleaned) > 10_000:
        raise ValueError("备忘录内容不能超过 10000 个字符")
    return cleaned


def _escape_like(value: str) -> str:
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def _clean_link(url: str | None, label: str | None) -> tuple[str | None, str | None]:
    if url is None or not url.strip():
        return None, None
    cleaned_url = url.strip()
    parsed = urlsplit(cleaned_url)
    if parsed.scheme != "https" or not parsed.hostname:
        raise ValueError("备忘录链接必须使用有效的 HTTPS 地址")
    cleaned_label = (label or "打开链接").strip()
    if not cleaned_label or len(cleaned_label) > 80:
        raise ValueError("备忘录链接文字长度无效")
    return cleaned_url, cleaned_label


def _memo_dict(row: Any) -> dict[str, Any]:
    try:
        tags = json.loads(row["tags_json"])
    except (TypeError, json.JSONDecodeError):
        tags = []
    return {
        "id": int(row["id"]),
        "content": str(row["content"]),
        "tags": [str(tag) for tag in tags if str(tag)],
        "pinned": bool(row["pinned"]),
        "linkUrl": str(row["link_url"]) if row["link_url"] else None,
        "linkLabel": str(row["link_label"]) if row["link_label"] else None,
        "createdAt": int(row["created_at"]),
        "updatedAt": int(row["updated_at"]),
    }
