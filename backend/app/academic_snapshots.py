from __future__ import annotations

import json
import threading
import time
from typing import Any

from cryptography.fernet import Fernet, InvalidToken

from .config import Settings
from .database import Database


class AcademicSnapshotRepository:
    """Encrypted, per-user cache for the latest grade overview."""

    def __init__(self, database: Database, settings: Settings):
        self.database = database
        self.cipher = Fernet(settings.fernet_key)
        self._lock = threading.RLock()

    def get(self, username: str) -> dict[str, Any] | None:
        with self.database.connection() as connection:
            row = connection.execute(
                "SELECT encrypted_payload, grade_count, updated_at "
                "FROM academic_snapshots WHERE username = ?",
                (username,),
            ).fetchone()
        if row is None:
            return None
        try:
            raw = self.cipher.decrypt(
                str(row["encrypted_payload"]).encode("ascii")
            ).decode("utf-8")
            payload = json.loads(raw)
        except (InvalidToken, UnicodeDecodeError, json.JSONDecodeError):
            self.delete(username)
            return None
        if not isinstance(payload, dict):
            self.delete(username)
            return None
        return {
            "payload": payload,
            "gradeCount": int(row["grade_count"]),
            "updatedAt": int(row["updated_at"]),
        }

    def save(
        self, username: str, payload: dict[str, Any], grade_count: int
    ) -> int | None:
        encoded = json.dumps(
            payload, ensure_ascii=False, separators=(",", ":")
        ).encode("utf-8")
        encrypted = self.cipher.encrypt(encoded).decode("ascii")
        updated_at = int(time.time())
        with self._lock, self.database.connection() as connection:
            previous = connection.execute(
                "SELECT grade_count FROM academic_snapshots WHERE username = ?",
                (username,),
            ).fetchone()
            connection.execute(
                """
                INSERT INTO academic_snapshots(
                    username, encrypted_payload, grade_count, updated_at
                ) VALUES (?, ?, ?, ?)
                ON CONFLICT(username) DO UPDATE SET
                    encrypted_payload = excluded.encrypted_payload,
                    grade_count = excluded.grade_count,
                    updated_at = excluded.updated_at
                """,
                (username, encrypted, grade_count, updated_at),
            )
        return int(previous["grade_count"]) if previous else None

    def delete(self, username: str) -> None:
        with self.database.connection() as connection:
            connection.execute(
                "DELETE FROM academic_snapshots WHERE username = ?", (username,)
            )


def count_graded_courses(payload: dict[str, Any]) -> int:
    rows = payload.get("rows")
    if not isinstance(rows, list):
        return 0
    return sum(
        1
        for row in rows
        if isinstance(row, dict)
        and row.get("ZCJ") is not None
        and str(row.get("ZCJ")).strip()
    )
