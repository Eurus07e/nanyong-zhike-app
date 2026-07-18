from __future__ import annotations

import asyncio
import datetime
import json
import re
import time
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urlsplit, urlunsplit
from urllib.request import Request, build_opener

from .nju_cli import NjuCli, NjuCliError


NOTICE_PATTERN = re.compile(r"^(?P<id>\d+)\s+(?P<date>\d{2}-\d{2})\s+(?P<title>.+?)\s*$")
NOTICE_DATE_PATTERN = re.compile(
    r"^(?:(?P<year>\d{4})-)?(?P<month>\d{2})-(?P<day>\d{2})"
    r"(?:[ T](?P<hour>\d{2}):(?P<minute>\d{2})"
    r"(?::(?P<second>\d{2})(?:\.\d+)?)?)?$"
)
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
        return [item for row in rows if (item := _public_notice_dict(row))]


class NoticeService:
    def __init__(
        self,
        nju: NjuCli,
        *,
        source: PublicNoticeSource | None = None,
        ttl_seconds: int = 10 * 60,
        failure_retry_seconds: int = 30,
    ):
        self.nju = nju
        self.source = source or PublicNoticeSource()
        self.ttl_seconds = ttl_seconds
        self.failure_retry_seconds = failure_retry_seconds
        self._expires_at = 0.0
        self._failure_retry_until = 0.0
        self._failure_error: NjuCliError | None = None
        self._refresh_generation = 0
        self._items: list[dict[str, str]] = []
        self._details: dict[str, str] = {}
        self._lock = asyncio.Lock()
        self._detail_lock = asyncio.Lock()

    async def list(self, *, limit: int = 8, force: bool = False) -> dict[str, Any]:
        generation = self._refresh_generation
        now = time.monotonic()
        if now < self._failure_retry_until and self._failure_error is not None:
            if not self._items:
                raise self._failure_error
            return {"items": self._items[:limit], "source": "cache"}
        if not force and self._items and now < self._expires_at:
            return {"items": self._items[:limit], "source": "cache"}
        async with self._lock:
            now = time.monotonic()
            if now < self._failure_retry_until and self._failure_error is not None:
                if not self._items:
                    raise self._failure_error
                return {"items": self._items[:limit], "source": "cache"}
            if self._items and (
                (not force and now < self._expires_at)
                or generation != self._refresh_generation
            ):
                return {"items": self._items[:limit], "source": "cache"}
            try:
                rows = await self.source.list(max(limit, 10))
                items = _notice_rows(rows)
                if not items:
                    raise NjuCliError("南京大学本科生院返回的通知列表为空")
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
                    items = _notice_rows(rows)
                    if not items:
                        raise NjuCliError("nju-cli 返回的通知列表为空")
                except NjuCliError:
                    retry_until = time.monotonic() + self.failure_retry_seconds
                    self._expires_at = retry_until
                    self._failure_retry_until = retry_until
                    self._failure_error = source_error
                    self._refresh_generation += 1
                    if self._items:
                        return {"items": self._items[:limit], "source": "cache"}
                    raise source_error
            self._items = items
            self._expires_at = time.monotonic() + self.ttl_seconds
            self._failure_retry_until = 0.0
            self._failure_error = None
            self._refresh_generation += 1
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
    date = _notice_date(str(row.get("publish_time") or "").strip())
    url = _secure_notice_url(str(row.get("url") or "").strip())
    if not notice_id.isdigit() or not date or not title or not url:
        return None
    return {"id": notice_id, "date": date, "title": title, "url": url}


def _notice_rows(rows: Any) -> list[dict[str, str]]:
    if not isinstance(rows, list):
        return []
    return [item for row in rows if (item := _notice_dict(row))]


def _public_notice_dict(row: Any) -> dict[str, Any] | None:
    if not isinstance(row, dict):
        return None
    publish_time = _notice_date(str(row.get("publishTime") or "").strip())
    url = row.get("url") or row.get("wapUrl") or row.get("link") or ""
    return {
        "id": row.get("id"),
        "publish_time": publish_time,
        "title": row.get("title"),
        "url": url,
    }


def _notice_date(value: str) -> str:
    match = NOTICE_DATE_PATTERN.fullmatch(value)
    if not match:
        return ""
    year = int(match.group("year") or 2000)
    month = int(match.group("month"))
    day = int(match.group("day"))
    try:
        datetime.date(year, month, day)
    except ValueError:
        return ""
    hour = match.group("hour")
    if hour is not None and (
        int(hour) > 23
        or int(match.group("minute")) > 59
        or int(match.group("second") or 0) > 59
    ):
        return ""
    return f"{month:02d}-{day:02d}"


def _secure_notice_url(url: str) -> str:
    try:
        parsed = urlsplit(url)
        port = parsed.port
    except ValueError:
        return ""
    if (
        parsed.scheme not in {"http", "https"}
        or parsed.hostname != "jw.nju.edu.cn"
        or parsed.username is not None
        or parsed.password is not None
        or port not in {None, 80 if parsed.scheme == "http" else 443}
    ):
        return ""
    return urlunsplit(("https", "jw.nju.edu.cn", parsed.path, parsed.query, ""))


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
