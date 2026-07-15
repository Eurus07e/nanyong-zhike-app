from __future__ import annotations

import asyncio
import re
import time
from typing import Any
from urllib.parse import urlsplit, urlunsplit

from .nju_cli import NjuCli


NOTICE_PATTERN = re.compile(r"^(?P<id>\d+)\s+(?P<date>\d{2}-\d{2})\s+(?P<title>.+?)\s*$")


def parse_notices(output: str) -> list[dict[str, str]]:
    items: list[dict[str, str]] = []
    for raw_line in output.splitlines():
        match = NOTICE_PATTERN.match(raw_line.strip())
        if not match:
            continue
        items.append(
            {
                "id": match.group("id"),
                "date": match.group("date"),
                "title": match.group("title"),
            }
        )
    return items


class NoticeService:
    def __init__(self, nju: NjuCli, *, ttl_seconds: int = 10 * 60):
        self.nju = nju
        self.ttl_seconds = ttl_seconds
        self._expires_at = 0.0
        self._items: list[dict[str, str]] = []
        self._details: dict[str, str] = {}
        self._lock = asyncio.Lock()
        self._detail_lock = asyncio.Lock()

    async def list(self, *, limit: int = 8, force: bool = False) -> dict[str, Any]:
        if not force and self._items and time.monotonic() < self._expires_at:
            return {"items": self._items[:limit], "source": "cache"}
        async with self._lock:
            if not force and self._items and time.monotonic() < self._expires_at:
                return {"items": self._items[:limit], "source": "cache"}
            rows = await self.nju.public_cache_json(
                [
                    "academic-affairs",
                    "notifications",
                    "list",
                    "--page-size",
                    str(max(limit, 10)),
                ],
                "nju-cli/academic-affairs/announcements.json",
                owner="public-notices",
                timeout=30,
            )
            self._items = [item for row in rows if (item := _notice_dict(row))]
            self._expires_at = time.monotonic() + self.ttl_seconds
            return {"items": self._items[:limit], "source": "fresh"}

    async def detail(self, notice_id: str) -> dict[str, str] | None:
        if not self._items:
            await self.list(limit=20)
        item = next((item for item in self._items if item["id"] == notice_id), None)
        if item is None:
            return None
        cached = self._details.get(notice_id)
        if cached is not None:
            return {**item, "content": cached}
        async with self._detail_lock:
            cached = self._details.get(notice_id)
            if cached is None:
                cached = (
                    await self.nju.text(
                        ["view-html", item["url"]],
                        owner="public-notices",
                        timeout=30,
                    )
                ).strip()
                cached = _clean_notice_markdown(cached)
                self._details[notice_id] = cached
        return {**item, "content": cached}


def _notice_dict(row: Any) -> dict[str, str] | None:
    if not isinstance(row, dict):
        return None
    notice_id = str(row.get("id") or "").strip()
    title = str(row.get("title") or "").strip()
    date = str(row.get("publish_time") or "").strip()
    url = _secure_notice_url(str(row.get("url") or "").strip())
    if not notice_id.isdigit() or not title or not url:
        return None
    return {"id": notice_id, "date": date, "title": title, "url": url}


def _secure_notice_url(url: str) -> str:
    parsed = urlsplit(url)
    if parsed.hostname != "jw.nju.edu.cn":
        return ""
    return urlunsplit(("https", parsed.netloc, parsed.path, parsed.query, ""))


def _clean_notice_markdown(content: str) -> str:
    cleaned = re.sub(r"\A---\s*\n.*?\n---\s*\n", "", content, count=1, flags=re.DOTALL)
    return cleaned.strip()
