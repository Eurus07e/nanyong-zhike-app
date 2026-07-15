from backend.app.notices import NoticeService, _clean_notice_markdown, parse_notices


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
    class FakeNju:
        def __init__(self):
            self.list_calls = 0
            self.detail_calls = 0

        async def public_cache_json(self, args, cache_file, *, owner, timeout):
            self.list_calls += 1
            return [{
                "id": 835881,
                "publish_time": "06-12",
                "title": "测试通知",
                "url": "http://jw.nju.edu.cn/c1/29/c26263a835881/page.htm",
            }]

        async def text(self, args, *, owner, timeout):
            self.detail_calls += 1
            return "---\ntitle: 测试通知\n---\n\n# 测试通知\n\n通知正文"

    nju = FakeNju()
    service = NoticeService(nju, ttl_seconds=60)

    first = await service.list(limit=5)
    second = await service.list(limit=5)

    assert first["source"] == "fresh"
    assert second["source"] == "cache"
    assert first["items"] == second["items"]
    assert first["items"][0]["url"].startswith("https://jw.nju.edu.cn/")
    assert nju.list_calls == 1

    detail = await service.detail("835881")
    cached_detail = await service.detail("835881")

    assert detail == cached_detail
    assert detail is not None
    assert detail["content"].startswith("# 测试通知")
    assert "title: 测试通知" not in detail["content"]
    assert nju.detail_calls == 1


async def test_notice_service_rejects_untrusted_notice_urls():
    class FakeNju:
        async def public_cache_json(self, args, cache_file, *, owner, timeout):
            return [
                {"id": 1, "title": "可信", "publish_time": "01-01", "url": "https://jw.nju.edu.cn/a"},
                {"id": 2, "title": "不可信", "publish_time": "01-02", "url": "https://example.com/a"},
            ]

    response = await NoticeService(FakeNju()).list()

    assert [item["id"] for item in response["items"]] == ["1"]
