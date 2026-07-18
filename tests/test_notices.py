import asyncio
import json

import pytest

from backend.app.nju_cli import NjuCliError
from backend.app.notices import (
    NoticeService,
    PublicNoticeSource,
    _clean_notice_markdown,
    _notice_dict,
    parse_notices,
)


class _JsonOpener:
    class _Response:
        def __init__(self, payload):
            self.payload = payload

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return None

        def read(self):
            return json.dumps(self.payload).encode()

    def __init__(self, payload):
        self.payload = payload

    def open(self, request, timeout):
        assert request.full_url.endswith("queryObj=articles")
        assert timeout == 20
        return self._Response(self.payload)


def test_parse_notices_skips_non_notice_lines():
    output = """
    公告通知
    835881 06-12 2026年暑期学校和秋季学期本科课程选课通知
    835849 06-12 【学生】本科期末教学重要事项通知
    invalid line
    """

    assert parse_notices(output) == [
        {
            "id": "835881",
            "date": "06-12",
            "title": "2026年暑期学校和秋季学期本科课程选课通知",
        },
        {
            "id": "835849",
            "date": "06-12",
            "title": "【学生】本科期末教学重要事项通知",
        },
    ]


def test_clean_notice_markdown_removes_site_chrome_and_repairs_adjacent_bold():
    content = """---
title: 测试通知
---

[![](https://jw.nju.edu.cn/_upload/site/logo.png)教学信息网](/main.htm "返回本科生院首页")

# 测试通知

**一、时间安排**

**1.****暑期课程选课时间**

附件![](https://jw.nju.edu.cn/icon_pdf.gif)[课程包.pdf](https://jw.nju.edu.cn/course.pdf)

![](https://jw.nju.edu.cn/_visitcount?siteId=414&type=3&articleId=835881)
"""

    cleaned = _clean_notice_markdown(content)

    assert cleaned.startswith("# 测试通知")
    assert "教学信息网" not in cleaned
    assert "logo.png" not in cleaned
    assert "**" not in cleaned
    assert "### 一、时间安排" in cleaned
    assert "1.暑期课程选课时间" in cleaned
    assert "_visitcount" not in cleaned
    assert "[课程包.pdf]" in cleaned


async def test_notice_service_caches_public_cli_results():
    class Source:
        def __init__(self):
            self.list_calls = 0

        async def list(self, limit):
            self.list_calls += 1
            return [{
                "id": 835881,
                "publish_time": "06-12",
                "title": "测试通知",
                "url": "http://jw.nju.edu.cn/c1/29/c26263a835881/page.htm",
            }]

    class FakeNju:
        def __init__(self):
            self.detail_calls = 0

        async def text(self, args, *, owner, timeout):
            self.detail_calls += 1
            return "---\ntitle: 测试通知\n---\n\n# 测试通知\n\n通知正文"

    nju = FakeNju()
    source = Source()
    service = NoticeService(nju, source=source, ttl_seconds=60)

    first = await service.list(limit=5)
    second = await service.list(limit=5)

    assert first["source"] == "fresh"
    assert second["source"] == "cache"
    assert first["items"] == second["items"]
    assert first["items"][0]["url"].startswith("https://jw.nju.edu.cn/")
    assert source.list_calls == 1

    detail = await service.detail("835881")
    cached_detail = await service.detail("835881")

    assert detail == cached_detail
    assert detail is not None
    assert detail["content"].startswith("# 测试通知")
    assert "title: 测试通知" not in detail["content"]
    assert nju.detail_calls == 1


async def test_notice_service_rejects_untrusted_notice_urls():
    class Source:
        async def list(self, limit):
            return [
                {"id": 1, "title": "可信", "publish_time": "01-01", "url": "https://jw.nju.edu.cn/a"},
                {"id": 2, "title": "不可信", "publish_time": "01-02", "url": "https://example.com/a"},
            ]

    response = await NoticeService(object(), source=Source()).list()

    assert [item["id"] for item in response["items"]] == ["1"]


async def test_notice_service_falls_back_to_cli_when_public_api_fails():
    class Source:
        async def list(self, limit):
            raise NjuCliError("public API failed")

    class FakeNju:
        async def public_cache_json(self, args, cache_file, *, owner, timeout):
            return [{
                "id": 835881,
                "publish_time": "06-12",
                "title": "备用通知",
                "url": "https://jw.nju.edu.cn/c1/29/c26263a835881/page.htm",
            }]

    response = await NoticeService(FakeNju(), source=Source()).list()

    assert response["items"][0]["title"] == "备用通知"


async def test_notice_service_falls_back_when_primary_url_is_malformed():
    class Source:
        async def list(self, limit):
            return [{
                "id": 835881,
                "publish_time": "06-12",
                "title": "畸形链接通知",
                "url": "http://[",
            }]

    class FakeNju:
        async def public_cache_json(self, args, cache_file, *, owner, timeout):
            return [{
                "id": 835882,
                "publish_time": "06-13",
                "title": "备用通知",
                "url": "https://jw.nju.edu.cn/c1/29/c26263a835882/page.htm",
            }]

    response = await NoticeService(FakeNju(), source=Source()).list()

    assert response["items"] == [{
        "id": "835882",
        "date": "06-13",
        "title": "备用通知",
        "url": "https://jw.nju.edu.cn/c1/29/c26263a835882/page.htm",
    }]


@pytest.mark.parametrize(
    "primary_rows",
    [
        None,
        [{"id": "bad", "title": "", "url": ""}],
    ],
)
async def test_notice_service_falls_back_when_primary_rows_have_no_valid_items(
    primary_rows,
):
    class Source:
        async def list(self, limit):
            return primary_rows

    class FakeNju:
        def __init__(self):
            self.fallback_calls = 0

        async def public_cache_json(self, args, cache_file, *, owner, timeout):
            self.fallback_calls += 1
            return [{
                "id": 835881,
                "publish_time": "06-12",
                "title": " 备用通知 ",
                "url": "http://jw.nju.edu.cn/c1/29/c26263a835881/page.htm",
            }]

    nju = FakeNju()
    response = await NoticeService(nju, source=Source()).list()

    assert response == {
        "items": [{
            "id": "835881",
            "date": "06-12",
            "title": "备用通知",
            "url": "https://jw.nju.edu.cn/c1/29/c26263a835881/page.htm",
        }],
        "source": "fresh",
    }
    assert nju.fallback_calls == 1


async def test_notice_service_rejects_cli_fallback_without_valid_items():
    class Source:
        async def list(self, limit):
            return []

    class FakeNju:
        def __init__(self):
            self.fallback_calls = 0

        async def public_cache_json(self, args, cache_file, *, owner, timeout):
            self.fallback_calls += 1
            return [{"id": "bad", "title": "", "url": ""}]

    nju = FakeNju()
    service = NoticeService(nju, source=Source())

    with pytest.raises(NjuCliError, match="南京大学本科生院返回的通知列表为空"):
        await service.list()
    assert nju.fallback_calls == 1


async def test_notice_service_returns_stale_items_when_forced_refresh_sources_fail():
    class Source:
        def __init__(self):
            self.calls = 0

        async def list(self, limit):
            self.calls += 1
            if self.calls == 1:
                return [{
                    "id": 835881,
                    "publish_time": "06-12",
                    "title": "已有通知",
                    "url": "https://jw.nju.edu.cn/c1/29/c26263a835881/page.htm",
                }]
            raise NjuCliError("primary failed")

    class FakeNju:
        def __init__(self):
            self.calls = 0

        async def public_cache_json(self, args, cache_file, *, owner, timeout):
            self.calls += 1
            raise NjuCliError("fallback failed")

    source = Source()
    nju = FakeNju()
    service = NoticeService(
        nju,
        source=source,
        ttl_seconds=60,
        failure_retry_seconds=60,
    )
    first = await service.list()

    first_refresh = await service.list(force=True)
    second_refresh = await service.list(force=True)

    assert first_refresh == {"items": first["items"], "source": "cache"}
    assert second_refresh == first_refresh
    assert source.calls == 2
    assert nju.calls == 1


async def test_notice_service_coalesces_concurrent_forced_refreshes():
    class Source:
        def __init__(self):
            self.calls = 0

        async def list(self, limit):
            self.calls += 1
            if self.calls == 1:
                return [{
                    "id": 835881,
                    "publish_time": "06-12",
                    "title": "已有通知",
                    "url": "https://jw.nju.edu.cn/c1/29/c26263a835881/page.htm",
                }]
            await asyncio.sleep(0)
            raise NjuCliError("primary failed")

    class FakeNju:
        def __init__(self):
            self.calls = 0

        async def public_cache_json(self, args, cache_file, *, owner, timeout):
            self.calls += 1
            raise NjuCliError("fallback failed")

    source = Source()
    nju = FakeNju()
    service = NoticeService(nju, source=source, ttl_seconds=0)
    first = await service.list()

    responses = await asyncio.gather(*(service.list(force=True) for _ in range(3)))

    assert responses == [
        {"items": first["items"], "source": "cache"},
        {"items": first["items"], "source": "cache"},
        {"items": first["items"], "source": "cache"},
    ]
    assert source.calls == 2
    assert nju.calls == 1


async def test_notice_service_refreshes_again_after_coalesced_success():
    class Source:
        def __init__(self):
            self.calls = 0

        async def list(self, limit):
            self.calls += 1
            if self.calls > 1:
                await asyncio.sleep(0)
            return [{
                "id": 835881,
                "publish_time": "06-12",
                "title": f"第 {self.calls} 次刷新",
                "url": "https://jw.nju.edu.cn/c1/29/c26263a835881/page.htm",
            }]

    source = Source()
    service = NoticeService(object(), source=source, ttl_seconds=60)
    await service.list()

    concurrent = await asyncio.gather(
        *(service.list(force=True) for _ in range(3))
    )
    independent = await service.list(force=True)

    assert source.calls == 3
    assert sorted(response["source"] for response in concurrent) == [
        "cache",
        "cache",
        "fresh",
    ]
    assert {response["items"][0]["title"] for response in concurrent} == {
        "第 2 次刷新"
    }
    assert independent["source"] == "fresh"
    assert independent["items"][0]["title"] == "第 3 次刷新"


async def test_notice_service_coalesces_concurrent_stale_fallbacks():
    class Source:
        def __init__(self):
            self.calls = 0

        async def list(self, limit):
            self.calls += 1
            if self.calls == 1:
                return [{
                    "id": 835881,
                    "publish_time": "06-12",
                    "title": "已有通知",
                    "url": "https://jw.nju.edu.cn/c1/29/c26263a835881/page.htm",
                }]
            await asyncio.sleep(0)
            raise NjuCliError("primary failed")

    class FakeNju:
        def __init__(self):
            self.calls = 0

        async def public_cache_json(self, args, cache_file, *, owner, timeout):
            self.calls += 1
            raise NjuCliError("fallback failed")

    source = Source()
    nju = FakeNju()
    service = NoticeService(nju, source=source, ttl_seconds=0)
    first = await service.list()

    responses = await asyncio.gather(*(service.list() for _ in range(3)))

    assert responses == [
        {"items": first["items"], "source": "cache"},
        {"items": first["items"], "source": "cache"},
        {"items": first["items"], "source": "cache"},
    ]
    assert source.calls == 2
    assert nju.calls == 1


async def test_notice_service_returns_stale_items_when_cli_fallback_is_invalid():
    class Source:
        def __init__(self):
            self.calls = 0

        async def list(self, limit):
            self.calls += 1
            if self.calls == 1:
                return [{
                    "id": 835881,
                    "publish_time": "06-12",
                    "title": "已有通知",
                    "url": "https://jw.nju.edu.cn/c1/29/c26263a835881/page.htm",
                }]
            return []

    class FakeNju:
        async def public_cache_json(self, args, cache_file, *, owner, timeout):
            return [{"id": "bad", "title": "", "url": ""}]

    service = NoticeService(FakeNju(), source=Source())
    first = await service.list()

    response = await service.list(force=True)

    assert response == {"items": first["items"], "source": "cache"}


async def test_notice_service_reraises_primary_error_without_cached_items():
    class Source:
        async def list(self, limit):
            raise NjuCliError("primary failed clearly")

    class FakeNju:
        async def public_cache_json(self, args, cache_file, *, owner, timeout):
            raise NjuCliError("fallback failed")

    service = NoticeService(FakeNju(), source=Source())

    with pytest.raises(NjuCliError, match="primary failed clearly"):
        await service.list(force=True)


async def test_notice_service_coalesces_concurrent_failures_without_cached_items():
    class Source:
        def __init__(self):
            self.calls = 0

        async def list(self, limit):
            self.calls += 1
            await asyncio.sleep(0)
            raise NjuCliError("primary failed clearly")

    class FakeNju:
        def __init__(self):
            self.calls = 0

        async def public_cache_json(self, args, cache_file, *, owner, timeout):
            self.calls += 1
            raise NjuCliError("fallback failed")

    source = Source()
    nju = FakeNju()
    service = NoticeService(nju, source=source)

    responses = await asyncio.gather(
        *(service.list(force=True) for _ in range(3)),
        return_exceptions=True,
    )

    assert all(
        isinstance(response, NjuCliError)
        and str(response) == "primary failed clearly"
        for response in responses
    )
    assert source.calls == 1
    assert nju.calls == 1


@pytest.mark.parametrize(
    "invalid_field",
    [
        {"publish_time": "not-a-date"},
        {"publish_time": "2025-02-29"},
        {"publish_time": "2026-06-12 99:99:99"},
        {"url": "https://jw.nju.edu.cn:bad/path"},
        {"url": "https://user:pass@jw.nju.edu.cn/path"},
        {"url": "ftp://jw.nju.edu.cn/path"},
    ],
)
def test_notice_rows_reject_malformed_dates_and_urls(invalid_field):
    row = {
        "id": 835881,
        "publish_time": "06-12",
        "title": "测试通知",
        "url": "https://jw.nju.edu.cn/c1/29/c26263a835881/page.htm",
        **invalid_field,
    }

    assert _notice_dict(row) is None


@pytest.mark.parametrize("link_field", ["url", "wapUrl", "link"])
@pytest.mark.parametrize(
    ("publish_time", "expected_date"),
    [
        ("2026-06-12 16:05:51.0", "06-12"),
        ("06-12", "06-12"),
    ],
)
def test_public_notice_source_normalizes_the_official_json_shape(
    link_field,
    publish_time,
    expected_date,
):
    notice_url = "http://jw.nju.edu.cn/c1/29/c26263a835881/page.htm"
    payload = {
        "result": "true",
        "data": [{
            "id": 835881,
            "publishTime": publish_time,
            "title": "测试通知",
            link_field: notice_url,
        }],
    }

    source = PublicNoticeSource()
    source.opener = _JsonOpener(payload)

    assert source._list(8) == [{
        "id": 835881,
        "publish_time": expected_date,
        "title": "测试通知",
        "url": notice_url,
    }]


def test_public_notice_source_reports_invalid_payload():
    source = PublicNoticeSource()
    source.opener = _JsonOpener({})

    with pytest.raises(NjuCliError, match="异常"):
        source._list(8)
