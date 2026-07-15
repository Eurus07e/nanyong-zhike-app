from __future__ import annotations

import json
import threading
import time
from typing import Any

from cryptography.fernet import Fernet, InvalidToken

from .config import Settings
from .database import Database


class PortalSnapshotRepository:
    """Encrypted per-user snapshots used to render the previous portal state."""

    def __init__(self, database: Database, settings: Settings):
        self.database = database
        self.cipher = Fernet(settings.fernet_key)
        self._lock = threading.RLock()

    def list(self, username: str) -> dict[str, dict[str, Any]]:
        with self.database.connection() as connection:
            rows = connection.execute(
                "SELECT cache_key, encrypted_payload, updated_at "
                "FROM portal_snapshots WHERE username = ?",
                (username,),
            ).fetchall()
        entries: dict[str, dict[str, Any]] = {}
        invalid: list[str] = []
        for row in rows:
            try:
                raw = self.cipher.decrypt(
                    str(row["encrypted_payload"]).encode("ascii")
                ).decode("utf-8")
                value = json.loads(raw)
            except (InvalidToken, UnicodeDecodeError, json.JSONDecodeError):
                invalid.append(str(row["cache_key"]))
                continue
            entries[str(row["cache_key"])] = {
                "value": value,
                "updatedAt": int(row["updated_at"]),
            }
        if invalid:
            self.delete(username, invalid)
        return entries

    def get(self, username: str, cache_key: str) -> dict[str, Any] | None:
        with self.database.connection() as connection:
            row = connection.execute(
                "SELECT encrypted_payload, updated_at FROM portal_snapshots "
                "WHERE username = ? AND cache_key = ?",
                (username, cache_key),
            ).fetchone()
        if row is None:
            return None
        try:
            raw = self.cipher.decrypt(
                str(row["encrypted_payload"]).encode("ascii")
            ).decode("utf-8")
            value = json.loads(raw)
        except (InvalidToken, UnicodeDecodeError, json.JSONDecodeError):
            self.delete(username, [cache_key])
            return None
        return {"value": value, "updatedAt": int(row["updated_at"])}

    def save(self, username: str, cache_key: str, value: Any) -> int:
        encoded = json.dumps(
            value, ensure_ascii=False, separators=(",", ":")
        ).encode("utf-8")
        encrypted = self.cipher.encrypt(encoded).decode("ascii")
        updated_at = int(time.time())
        with self._lock, self.database.connection() as connection:
            connection.execute(
                """
                INSERT INTO portal_snapshots(
                    username, cache_key, encrypted_payload, updated_at
                ) VALUES (?, ?, ?, ?)
                ON CONFLICT(username, cache_key) DO UPDATE SET
                    encrypted_payload = excluded.encrypted_payload,
                    updated_at = excluded.updated_at
                """,
                (username, cache_key, encrypted, updated_at),
            )
        return updated_at

    def delete(self, username: str, cache_keys: list[str]) -> None:
        if not cache_keys:
            return
        placeholders = ",".join("?" for _ in cache_keys)
        with self.database.connection() as connection:
            connection.execute(
                f"DELETE FROM portal_snapshots WHERE username = ? "
                f"AND cache_key IN ({placeholders})",
                [username, *cache_keys],
            )
