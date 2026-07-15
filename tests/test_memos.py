from __future__ import annotations

from fastapi.testclient import TestClient

from backend.app import main
from backend.app.database import Database
from backend.app.memos import MemoRepository, extract_tags
from backend.app.security import Session


def repository(tmp_path, ticks: list[int] | None = None) -> MemoRepository:
    database = Database(tmp_path / "memos.db")
    database.initialize()
    values = iter(ticks or range(1_700_000_000, 1_700_000_100))
    return MemoRepository(database, clock=lambda: next(values))


def test_extract_tags_supports_chinese_and_removes_duplicates():
    assert extract_tags("复习 #高等数学 和 #AI，再看 #高等数学 #ai") == [
        "高等数学",
        "AI",
    ]


def test_memo_timeline_is_isolated_and_orders_pinned_first(tmp_path):
    memos = repository(tmp_path, [100, 200, 300, 400])
    first = memos.create("alice", "第一条 #课程")
    second = memos.create("alice", "第二条")
    memos.create("bob", "其他用户的内容 #课程")

    pinned = memos.update("alice", first["id"], pinned=True)
    timeline = memos.list("alice")

    assert pinned is not None
    assert [item["id"] for item in timeline] == [first["id"], second["id"]]
    assert timeline[0]["pinned"] is True
    assert all("其他用户" not in item["content"] for item in timeline)


def test_edit_refreshes_tags_and_literal_search_is_safe(tmp_path):
    memos = repository(tmp_path, [100, 200, 300])
    created = memos.create("alice", "原内容 #旧标签")

    updated = memos.update("alice", created["id"], content="进度 50% #新标签")

    assert updated is not None
    assert updated["content"] == "进度 50% #新标签"
    assert updated["tags"] == ["新标签"]
    assert [item["id"] for item in memos.list("alice", "50%") ] == [created["id"]]
    assert memos.list("alice", "50_") == []


def test_other_user_cannot_update_or_delete_a_memo(tmp_path):
    memos = repository(tmp_path)
    created = memos.create("alice", "仅自己可见")

    assert memos.update("bob", created["id"], content="越权修改") is None
    assert memos.delete("bob", created["id"]) is False
    assert memos.list("bob") == []
    assert memos.delete("alice", created["id"]) is True
    assert memos.list("alice") == []


def test_memo_can_store_a_safe_source_link(tmp_path):
    memos = repository(tmp_path)

    created = memos.create(
        "alice",
        "本科生院通知",
        link_url="https://jw.nju.edu.cn/notice",
        link_label="查看通知原文",
    )

    assert created["linkUrl"] == "https://jw.nju.edu.cn/notice"
    assert created["linkLabel"] == "查看通知原文"
    assert memos.list("alice")[0]["linkUrl"] == created["linkUrl"]


def test_memo_rejects_non_https_source_links(tmp_path):
    memos = repository(tmp_path)

    try:
        memos.create("alice", "不安全链接", link_url="http://example.com")
    except ValueError as error:
        assert "HTTPS" in str(error)
    else:
        raise AssertionError("non-HTTPS memo links must be rejected")


def test_memo_api_requires_session_and_scopes_crud_to_current_user(tmp_path, monkeypatch):
    memos = repository(tmp_path)
    monkeypatch.setattr(main, "memo_repository", memos)
    client = TestClient(main.app)

    assert client.get("/api/memos").status_code == 401

    main.app.dependency_overrides[main.current_session] = lambda: Session(
        username="alice", castgc="ticket", expires_at=9_999_999_999
    )
    try:
        created = client.post("/api/memos", json={
            "content": "明天复习 #课程",
            "linkUrl": "https://jw.nju.edu.cn/notice",
            "linkLabel": "查看通知原文",
        })
        assert created.status_code == 201
        assert created.json()["linkUrl"] == "https://jw.nju.edu.cn/notice"
        memo_id = created.json()["id"]

        updated = client.patch(f"/api/memos/{memo_id}", json={"pinned": True})
        assert updated.status_code == 200
        assert updated.json()["pinned"] is True
        assert client.get("/api/memos", params={"q": "课程"}).json()["items"][0]["id"] == memo_id

        deleted = client.delete(f"/api/memos/{memo_id}")
        assert deleted.status_code == 204
        assert client.get("/api/memos").json() == {"items": []}
    finally:
        main.app.dependency_overrides.clear()


def test_memo_api_rejects_empty_or_oversized_content(tmp_path, monkeypatch):
    monkeypatch.setattr(main, "memo_repository", repository(tmp_path))
    main.app.dependency_overrides[main.current_session] = lambda: Session(
        username="alice", castgc="ticket", expires_at=9_999_999_999
    )
    client = TestClient(main.app)
    try:
        assert client.post("/api/memos", json={"content": "   "}).status_code == 422
        assert client.post("/api/memos", json={"content": "x" * 10_001}).status_code == 422
        assert client.post("/api/memos", json={
            "content": "不安全链接",
            "linkUrl": "http://example.com",
        }).status_code == 422
        assert client.patch("/api/memos/1", json={}).status_code == 422
    finally:
        main.app.dependency_overrides.clear()
