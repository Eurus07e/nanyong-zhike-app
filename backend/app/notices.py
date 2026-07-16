from __future__ import annotations

import asyncio
import json
import re
import time
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urlsplit, urlunsplit
from urllib.request import Request, build_opener

from .nju_cli import NjuCli, NjuCliError


NOTICE_PATTERN = re.compile(r"^(?P<id>\d+)\s+(?P<date>\d{2}-\d{2})\s+(?P<title>.+?)\s*$")
NOTICE_API = "https://jw.nju.edu.cn/_wp3services/generalQuery?queryObj=articles"
NOTICE_ORDERS = json.dumps(
    [
        {"field": "top", "type": "desc"},
        {"field": "new", "type": "desc"},
        {"field": "publishTime", "type": "desc"},
    ],
    ensure_ascii=True,
    separators=(",", ":"),
)
NOTICE_RETURN_INFOS = json.dumps(
    [
        {
            "field": "title",
            "pattern": [{"name": "lp", "value": "999"}],
            "name": "title",
        },
        {"field": "f1", "name": "f1"},
        {
            "field": "publishTime",
            "pattern": [{"name": "d", "value": "MM-dd"}],
            "name": "publishTime",
        },
        {"field": "topImg", "name": "topImg"},
        {"field": "newImg", "name": "newImg"},
        {"field": "link", "name": "link"},
    ],
    ensure_ascii=True,
    separators=(",", ":"),
)


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


class PublicNoticeSource:
    def __init__(self) -> None:
        self.opener = build_opener()

    async def list(self, limit: int) -> list[dict[str, Any]]:
        return await asyncio.to_thread(self._list, limit)

    def _list(self, limit: int) -> list[dict[str, Any]]:
        body = urlencode(
            {
                "siteId": "414",
                "columnId": "26263",
                "pageIndex": "1",
                "rows": str(max(1, min(limit, 100))),
                "orders": NOTICE_ORDERS,
                "returnInfos": NOTICE_RETURN_INFOS,
            }
        ).encode("ascii")
        request = Request(
            NOTICE_API,
            data=body,
            method="POST",
            headers={
                "Content-Type": "application/x-www-form-urlencoded",
                "User-Agent": "NanyongZhike/2.0 read-only",
            },
        )
        try:
            with self.opener.open(request, timeout=20) as response:
                payload = json.loads(response.read().decode("utf-8"))
        except (
            HTTPError,
            URLError,
            TimeoutError,
            UnicodeDecodeError,
            json.JSONDecodeError,
        ) as error:
            raise NjuCliError("南京大学本科生院通知暂时不可用，请稍后重试") from error

        rows = payload.get("data") if isinstance(payload, dict) else None
        if (
            not isinstance(payload, dict)
            or payload.get("result") != "true"
            or not isinstance(rows, list)
        ):
            raise NjuCliError("南京大学本科生院返回了异常的通知数据")
        return [
            {
                "id": item.get("id"),
                "publish_time": item.get("publishTime"),
                "title": item.get("title"),
                "url": item.get("url"),
            }
            for item in rows
            if isinstance(item, dict)
        ]


class NoticeService:
    def __init__(
        self,
        nju: NjuCli,
        *,
        source: PublicNoticeSource | None = None,
        ttl_seconds: int = 10 * 60,
    ):
        self.nju = nju
        self.source = source or PublicNoticeSource()
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
            try:
                rows = await self.source.list(max(limit, 10))
            except NjuCliError as source_error:
                try:
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
                except NjuCliError:
                    raise source_error
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
    cleaned = re.sub(
        r"\A\[\s*!\[[^\]]*\]\([^)\n]+\)[^\]\n]*\]\([^)\n]+\)\s*",
        "",
        cleaned,
        count=1,
    )
    cleaned = re.sub(
        r"(?m)^[ \t]*!\[[^\]]*\]\([^)\n]*/_visitcount\?[^)\n]*\)[ \t]*\n?",
        "",
        cleaned,
    )
    cleaned = re.sub(
        r"(?m)^[ \t]*\*\*([^*\n]+)\*\*[ \t]*$",
        r"### \1",
        cleaned,
    )
    cleaned = cleaned.replace("**", "")
    return cleaned.strip()
