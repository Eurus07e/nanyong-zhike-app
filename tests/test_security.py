import sqlite3

import pytest

from backend.app.config import Settings
from backend.app.database import Database
from backend.app.security import LoginBodyLimitMiddleware, LoginRateLimiter, SessionStore


def test_session_storage_never_contains_raw_ticket_or_browser_token(tmp_path):
    database_path = tmp_path / "sessions.db"
    database = Database(database_path)
    database.initialize()
    settings = Settings(
        app_secret="test-secret-with-at-least-thirty-two-characters",
        database_path=database_path,
    )
    store = SessionStore(database, settings)

    browser_token, _ = store.create("test-student", "CASTGC-plaintext-ticket")

    with sqlite3.connect(database_path) as connection:
        token_hash, encrypted_ticket = connection.execute(
            "SELECT token_hash, encrypted_castgc FROM sessions"
        ).fetchone()

    assert browser_token not in token_hash
    assert "CASTGC-plaintext-ticket" not in encrypted_ticket
    assert store.get(browser_token).castgc == "CASTGC-plaintext-ticket"


def test_expired_session_is_deleted_when_accessed(tmp_path):
    database_path = tmp_path / "sessions.db"
    database = Database(database_path)
    database.initialize()
    settings = Settings(
        app_secret="test-secret-with-at-least-thirty-two-characters",
        database_path=database_path,
    )
    store = SessionStore(database, settings)
    browser_token, _ = store.create("test-student", "CASTGC-ticket")

    with sqlite3.connect(database_path) as connection:
        connection.execute("UPDATE sessions SET expires_at = 0")
        connection.commit()
    store._next_purge_at = float("inf")

    assert store.get(browser_token) is None
    with sqlite3.connect(database_path) as connection:
        assert connection.execute("SELECT COUNT(*) FROM sessions").fetchone()[0] == 0


def test_login_rate_limit_applies_to_ip_and_username_separately():
    ip_limiter = LoginRateLimiter(
        ip_attempts=2,
        username_attempts=10,
        window_seconds=900,
        max_ip_entries=10,
        max_username_entries=10,
    )
    assert ip_limiter.allow("192.0.2.1", "student-a")
    assert ip_limiter.allow("192.0.2.1", "student-b")
    assert not ip_limiter.allow("192.0.2.1", "student-c")

    username_limiter = LoginRateLimiter(
        ip_attempts=10,
        username_attempts=2,
        window_seconds=900,
        max_ip_entries=10,
        max_username_entries=10,
    )
    assert username_limiter.allow("192.0.2.1", "Student")
    assert username_limiter.allow("192.0.2.2", "student")
    assert not username_limiter.allow("192.0.2.3", "STUDENT")
    username_limiter.clear_username("student")
    assert username_limiter.allow("192.0.2.3", "student")


def test_login_rate_limit_maps_are_bounded():
    limiter = LoginRateLimiter(
        ip_attempts=10,
        username_attempts=10,
        window_seconds=900,
        max_ip_entries=2,
        max_username_entries=2,
    )
    assert limiter.allow("192.0.2.1", "student-a")
    assert limiter.allow("192.0.2.2", "student-b")
    assert not limiter.allow("192.0.2.3", "student-c")
    assert limiter.entry_count == 4


@pytest.mark.asyncio
async def test_login_body_limit_rejects_chunked_oversized_request():
    app_called = False

    async def downstream(scope, receive, send):
        nonlocal app_called
        app_called = True

    middleware = LoginBodyLimitMiddleware(downstream, max_body_bytes=8)
    chunks = iter(
        [
            {"type": "http.request", "body": b"12345", "more_body": True},
            {"type": "http.request", "body": b"67890", "more_body": False},
        ]
    )
    sent = []

    async def receive():
        return next(chunks)

    async def send(message):
        sent.append(message)

    await middleware(
        {
            "type": "http",
            "method": "POST",
            "path": "/api/auth/login",
            "headers": [],
        },
        receive,
        send,
    )

    assert not app_called
    assert next(message for message in sent if message["type"] == "http.response.start")[
        "status"
    ] == 413


@pytest.mark.asyncio
async def test_login_body_limit_replays_valid_request():
    received = bytearray()

    async def downstream(scope, receive, send):
        while True:
            message = await receive()
            if message["type"] != "http.request":
                break
            received.extend(message.get("body", b""))
            if not message.get("more_body", False):
                break

    middleware = LoginBodyLimitMiddleware(downstream, max_body_bytes=8)
    chunks = iter(
        [
            {"type": "http.request", "body": b"123", "more_body": True},
            {"type": "http.request", "body": b"456", "more_body": False},
        ]
    )

    async def receive():
        return next(chunks)

    async def send(message):
        raise AssertionError(f"unexpected response: {message}")

    await middleware(
        {
            "type": "http",
            "method": "POST",
            "path": "/api/auth/login",
            "headers": [],
        },
        receive,
        send,
    )
    assert received == b"123456"
