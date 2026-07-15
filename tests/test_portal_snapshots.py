from __future__ import annotations

import sqlite3

from backend.app.config import Settings
from backend.app.database import Database
from backend.app.portal_snapshots import PortalSnapshotRepository


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
