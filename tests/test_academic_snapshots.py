from __future__ import annotations

import sqlite3

from fastapi.testclient import TestClient

from backend.app import main
from backend.app.academic_snapshots import (
    AcademicSnapshotRepository,
    count_graded_courses,
)
from backend.app.config import Settings
from backend.app.database import Database
from backend.app.security import Session


def repository(tmp_path) -> tuple[AcademicSnapshotRepository, Database]:
    database = Database(tmp_path / "snapshots.db")
    database.initialize()
    settings = Settings(
        _env_file=None,
        app_secret="test-secret-for-encrypted-academic-snapshots",
        database_path=database.path,
    )
    return AcademicSnapshotRepository(database, settings), database


def test_academic_snapshot_is_encrypted_and_isolated_by_user(tmp_path):
    snapshots, database = repository(tmp_path)
    payload = {
        "grades": {"rows": [{"KCM": "高等数学", "ZCJ": "95"}]},
        "summary": {"earnedCredits": 4},
    }

    assert snapshots.save("alice", payload, 1) is None
    assert snapshots.get("alice") == {
        "payload": payload,
        "gradeCount": 1,
        "updatedAt": snapshots.get("alice")["updatedAt"],
    }
    assert snapshots.get("bob") is None

    with sqlite3.connect(database.path) as connection:
        encrypted = connection.execute(
            "SELECT encrypted_payload FROM academic_snapshots WHERE username = ?",
            ("alice",),
        ).fetchone()[0]
    assert "高等数学" not in encrypted
    assert encrypted.startswith("gAAAAA")


def test_count_graded_courses_ignores_blank_scores():
    assert count_graded_courses(
        {"rows": [{"ZCJ": "90"}, {"ZCJ": "合格"}, {"ZCJ": ""}, {}]}
    ) == 2


def test_academic_overview_returns_cache_then_reports_new_grades(
    tmp_path, monkeypatch
):
    snapshots, _ = repository(tmp_path)
    initial = {
        "grades": {"totalSize": 1, "rows": [{"KCH": "A", "ZCJ": "90"}]},
        "summary": {"earnedCredits": 2},
    }
    snapshots.save("alice", initial, 1)
    monkeypatch.setattr(main, "academic_snapshots", snapshots)

    async def fresh(_session):
        return {
            "grades": {
                "totalSize": 2,
                "rows": [
                    {"KCH": "A", "ZCJ": "90"},
                    {"KCH": "B", "ZCJ": "88"},
                ],
            },
            "summary": {"earnedCredits": 4},
        }

    monkeypatch.setattr(main, "fresh_academic_overview", fresh)
    main.app.dependency_overrides[main.current_session] = lambda: Session(
        username="alice", castgc="ticket", expires_at=9_999_999_999
    )
    client = TestClient(main.app)
    try:
        cached = client.get("/api/academic/overview")
        assert cached.status_code == 200
        assert cached.json()["source"] == "cache"
        assert cached.json()["grades"] == initial["grades"]

        refreshed = client.get("/api/academic/overview", params={"refresh": "true"})
        assert refreshed.status_code == 200
        assert refreshed.json()["source"] == "fresh"
        assert refreshed.json()["newGradeCount"] == 1
        assert snapshots.get("alice")["gradeCount"] == 2
    finally:
        main.app.dependency_overrides.clear()
