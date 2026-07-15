from __future__ import annotations

import json
import sqlite3
import threading
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator


class Database:
    def __init__(self, path: Path):
        self.path = path
        self._lock = threading.RLock()
        path.parent.mkdir(parents=True, exist_ok=True)

    @contextmanager
    def connection(self) -> Iterator[sqlite3.Connection]:
        connection = sqlite3.connect(self.path, timeout=15, check_same_thread=False)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        connection.execute("PRAGMA journal_mode = WAL")
        try:
            yield connection
            connection.commit()
        finally:
            connection.close()

    def initialize(self) -> None:
        with self._lock, self.connection() as connection:
            connection.executescript(
                """
                CREATE TABLE IF NOT EXISTS sessions (
                    token_hash TEXT PRIMARY KEY,
                    username TEXT NOT NULL,
                    encrypted_castgc TEXT NOT NULL,
                    created_at INTEGER NOT NULL,
                    expires_at INTEGER NOT NULL,
                    last_seen_at INTEGER NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_sessions_expires_at
                    ON sessions(expires_at);

                CREATE TABLE IF NOT EXISTS reviews (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    course_name TEXT NOT NULL,
                    teacher TEXT NOT NULL,
                    review_text TEXT NOT NULL,
                    sources_json TEXT NOT NULL,
                    course_normalized TEXT NOT NULL,
                    teacher_normalized TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_reviews_course
                    ON reviews(course_normalized);
                CREATE INDEX IF NOT EXISTS idx_reviews_teacher
                    ON reviews(teacher_normalized);

                CREATE TABLE IF NOT EXISTS memos (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    username TEXT NOT NULL,
                    content TEXT NOT NULL,
                    tags_json TEXT NOT NULL DEFAULT '[]',
                    pinned INTEGER NOT NULL DEFAULT 0 CHECK (pinned IN (0, 1)),
                    link_url TEXT,
                    link_label TEXT,
                    created_at INTEGER NOT NULL,
                    updated_at INTEGER NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_memos_timeline
                    ON memos(username, pinned DESC, updated_at DESC, id DESC);

                CREATE TABLE IF NOT EXISTS academic_snapshots (
                    username TEXT PRIMARY KEY,
                    encrypted_payload TEXT NOT NULL,
                    grade_count INTEGER NOT NULL,
                    updated_at INTEGER NOT NULL
                );

                CREATE TABLE IF NOT EXISTS portal_snapshots (
                    username TEXT NOT NULL,
                    cache_key TEXT NOT NULL,
                    encrypted_payload TEXT NOT NULL,
                    updated_at INTEGER NOT NULL,
                    PRIMARY KEY(username, cache_key)
                );

                CREATE TABLE IF NOT EXISTS metadata (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL
                );
                """
            )
            memo_columns = {
                str(row[1])
                for row in connection.execute("PRAGMA table_info(memos)")
            }
            if "link_url" not in memo_columns:
                connection.execute("ALTER TABLE memos ADD COLUMN link_url TEXT")
            if "link_label" not in memo_columns:
                connection.execute("ALTER TABLE memos ADD COLUMN link_label TEXT")

    def metadata(self, key: str) -> str | None:
        with self.connection() as connection:
            row = connection.execute(
                "SELECT value FROM metadata WHERE key = ?", (key,)
            ).fetchone()
        return str(row["value"]) if row else None

    def set_metadata(self, key: str, value: str) -> None:
        with self.connection() as connection:
            connection.execute(
                "INSERT INTO metadata(key, value) VALUES (?, ?) "
                "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                (key, value),
            )

    def replace_reviews(self, rows: list[tuple[str, str, str, list[str], str, str]]) -> None:
        with self._lock, self.connection() as connection:
            connection.execute("DELETE FROM reviews")
            connection.executemany(
                """
                INSERT INTO reviews(
                    course_name, teacher, review_text, sources_json,
                    course_normalized, teacher_normalized
                ) VALUES (?, ?, ?, ?, ?, ?)
                """,
                [
                    (course, teacher, review, json.dumps(sources, ensure_ascii=False), cn, tn)
                    for course, teacher, review, sources, cn, tn in rows
                ],
            )
