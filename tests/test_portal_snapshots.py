from __future__ import annotations

import sqlite3

import pytest
from fastapi import HTTPException

from backend.app import main
from backend.app.config import Settings
from backend.app.database import Database
from backend.app.portal_snapshots import PortalSnapshotRepository
from backend.app.security import Session


def repository(tmp_path) -> tuple[PortalSnapshotRepository, Database]:
    database = Database(tmp_path / "portal-snapshots.db")
    database.initialize()
    settings = Settings(
        _env_file=None,
        app_secret="test-secret-for-encrypted-portal-snapshots",
        database_path=database.path,
    )
    return PortalSnapshotRepository(database, settings), database


def test_portal_snapshots_are_encrypted_and_isolated(tmp_path):
    snapshots, database = repository(tmp_path)
    value = {"rows": [{"KCM": "高等数学", "SKJS": "张老师"}]}

    snapshots.save("alice", "/api/schedule?term=2026-2027-1", value)

    assert snapshots.get("alice", "/api/schedule?term=2026-2027-1")["value"] == value
    assert snapshots.get("bob", "/api/schedule?term=2026-2027-1") is None
    assert snapshots.list("alice")["/api/schedule?term=2026-2027-1"]["value"] == value

    with sqlite3.connect(database.path) as connection:
        encrypted = connection.execute(
            "SELECT encrypted_payload FROM portal_snapshots WHERE username = ?",
            ("alice",),
        ).fetchone()[0]
    assert "高等数学" not in encrypted
    assert "张老师" not in encrypted


def test_portal_snapshot_overwrites_only_the_matching_key(tmp_path):
    snapshots, _ = repository(tmp_path)
    snapshots.save("alice", "/api/academic/profile", {"grade": "2025"})
    snapshots.save("alice", "/api/schedule/terms", [{"DM": "old"}])
    snapshots.save("alice", "/api/schedule/terms", [{"DM": "new"}])

    entries = snapshots.list("alice")

    assert entries["/api/academic/profile"]["value"] == {"grade": "2025"}
    assert entries["/api/schedule/terms"]["value"] == [{"DM": "new"}]


async def test_refresh_uses_stale_portal_snapshot_only_for_retryable_failure(
    monkeypatch, tmp_path
):
    snapshots, _ = repository(tmp_path)
    cache_key = "/api/five-education/overview"
    stale = {"summary": {"totalActivities": 8}}
    snapshots.save("alice", cache_key, stale)
    monkeypatch.setattr(main, "portal_snapshots", snapshots)
    session = Session(username="alice", castgc="ticket", expires_at=2_000_000_000)

    async def unavailable():
        raise HTTPException(status_code=502, detail="upstream unavailable")

    assert await main.portal_cache_first(session, cache_key, True, unavailable) == stale

    async def expired():
        raise HTTPException(status_code=401, detail="expired")

    with pytest.raises(HTTPException, match="401: expired"):
        await main.portal_cache_first(session, cache_key, True, expired)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "payload",
    [
        [],
        {},
        [{"DM": "", "MC": "2025-2026-1"}],
        [{"DM": "2025-2026-1", "MC": ""}],
    ],
)
async def test_schedule_terms_rejects_empty_or_malformed_upstream_payloads(
    monkeypatch, tmp_path, payload
):
    snapshots, _ = repository(tmp_path)
    cache_key = "/api/schedule/terms"
    stale = [{"DM": "2024-2025-2", "MC": "第二学期"}]
    snapshots.save("alice", cache_key, stale)
    monkeypatch.setattr(main, "portal_snapshots", snapshots)
    session = Session(username="alice", castgc="ticket", expires_at=2_000_000_000)

    async def malformed_loader(*_args):
        return payload

    monkeypatch.setattr(main, "run_cli", malformed_loader)

    assert await main.schedule_terms(session, refresh=True) == stale
    assert snapshots.get("alice", cache_key)["value"] == stale


@pytest.mark.asyncio
@pytest.mark.parametrize("payload", [[], {}, {"rows": "bad"}])
async def test_schedule_rejects_malformed_upstream_payload_without_overwriting_snapshot(
    monkeypatch, tmp_path, payload
):
    snapshots, _ = repository(tmp_path)
    cache_key = "/api/schedule?term=2026-2027-1"
    stale = {"rows": [{"KCH": "00000001", "KCM": "高等数学"}]}
    snapshots.save("alice", cache_key, stale)
    monkeypatch.setattr(main, "portal_snapshots", snapshots)
    session = Session(username="alice", castgc="ticket", expires_at=2_000_000_000)

    async def malformed_loader(*_args, **_kwargs):
        return payload

    monkeypatch.setattr(main, "run_cli", malformed_loader)

    assert await main.schedule(
        session, term="2026-2027-1", refresh=True
    ) == stale
    assert snapshots.get("alice", cache_key)["value"] == stale
