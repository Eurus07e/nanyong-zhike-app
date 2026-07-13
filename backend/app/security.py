from __future__ import annotations

import hashlib
import secrets
import threading
import time
from collections import OrderedDict, deque
from dataclasses import dataclass

from cryptography.fernet import Fernet, InvalidToken
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from .config import Settings
from .database import Database


SESSION_COOKIE = "nanyong_session"


@dataclass(frozen=True)
class Session:
    username: str
    castgc: str
    expires_at: int


class SessionStore:
    def __init__(self, database: Database, settings: Settings):
        self.database = database
        self.settings = settings
        self.cipher = Fernet(settings.fernet_key)
        self._purge_lock = threading.Lock()
        self._next_purge_at = 0.0

    @staticmethod
    def _hash(token: str) -> str:
        return hashlib.sha256(token.encode("ascii")).hexdigest()

    def create(self, username: str, castgc: str) -> tuple[str, Session]:
        self.purge_expired_if_due()
        now = int(time.time())
        expires_at = now + self.settings.session_ttl_hours * 3600
        token = secrets.token_urlsafe(48)
        encrypted = self.cipher.encrypt(castgc.encode("utf-8")).decode("ascii")
        with self.database.connection() as connection:
            connection.execute(
                """
                INSERT INTO sessions(
                    token_hash, username, encrypted_castgc,
                    created_at, expires_at, last_seen_at
                ) VALUES (?, ?, ?, ?, ?, ?)
                """,
                (self._hash(token), username, encrypted, now, expires_at, now),
            )
        return token, Session(username=username, castgc=castgc, expires_at=expires_at)

    def get(self, token: str | None) -> Session | None:
        if not token:
            return None
        self.purge_expired_if_due()
        now = int(time.time())
        token_hash = self._hash(token)
        with self.database.connection() as connection:
            row = connection.execute(
                "SELECT * FROM sessions WHERE token_hash = ?",
                (token_hash,),
            ).fetchone()
            if row and int(row["expires_at"]) <= now:
                connection.execute(
                    "DELETE FROM sessions WHERE token_hash = ?", (token_hash,)
                )
                row = None
            elif row:
                connection.execute(
                    "UPDATE sessions SET last_seen_at = ? WHERE token_hash = ?",
                    (now, token_hash),
                )
        if not row:
            return None
        try:
            castgc = self.cipher.decrypt(row["encrypted_castgc"].encode("ascii")).decode("utf-8")
        except InvalidToken:
            self.delete(token)
            return None
        return Session(
            username=str(row["username"]),
            castgc=castgc,
            expires_at=int(row["expires_at"]),
        )

    def delete(self, token: str | None) -> None:
        if not token:
            return
        with self.database.connection() as connection:
            connection.execute(
                "DELETE FROM sessions WHERE token_hash = ?", (self._hash(token),)
            )

    def purge_expired(self) -> int:
        with self.database.connection() as connection:
            cursor = connection.execute(
                "DELETE FROM sessions WHERE expires_at <= ?", (int(time.time()),)
            )
        self._next_purge_at = (
            time.monotonic() + self.settings.session_cleanup_interval_seconds
        )
        return max(cursor.rowcount, 0)

    def purge_expired_if_due(self) -> int:
        if time.monotonic() < self._next_purge_at:
            return 0
        with self._purge_lock:
            if time.monotonic() < self._next_purge_at:
                return 0
            return self.purge_expired()


class LoginRateLimiter:
    def __init__(
        self,
        *,
        ip_attempts: int = 60,
        username_attempts: int = 5,
        window_seconds: int = 15 * 60,
        max_ip_entries: int = 10_000,
        max_username_entries: int = 50_000,
    ):
        self.ip_attempts = ip_attempts
        self.username_attempts = username_attempts
        self.window_seconds = window_seconds
        self.max_ip_entries = max_ip_entries
        self.max_username_entries = max_username_entries
        self.ip_entries: OrderedDict[str, deque[float]] = OrderedDict()
        self.username_entries: OrderedDict[str, deque[float]] = OrderedDict()
        self._next_prune_at = 0.0

    @property
    def entry_count(self) -> int:
        return len(self.ip_entries) + len(self.username_entries)

    def allow(self, ip: str, username: str) -> bool:
        now = time.monotonic()
        self._prune_if_due(now)

        # Stop at the IP gate first so a blocked source cannot fill the username map.
        if not self._record(
            self.ip_entries, ip, self.ip_attempts, self.max_ip_entries, now
        ):
            return False
        return self._record(
            self.username_entries,
            username.casefold(),
            self.username_attempts,
            self.max_username_entries,
            now,
        )

    def clear_username(self, username: str) -> None:
        self.username_entries.pop(username.casefold(), None)

    def _record(
        self,
        entries: OrderedDict[str, deque[float]],
        key: str,
        attempts: int,
        max_entries: int,
        now: float,
    ) -> bool:
        queue = entries.get(key)
        if queue is None:
            if len(entries) >= max_entries:
                self._prune_entries(entries, now)
            # Fail closed instead of evicting an active bucket and weakening limits.
            if len(entries) >= max_entries:
                return False
            queue = deque()
            entries[key] = queue
        else:
            entries.move_to_end(key)

        cutoff = now - self.window_seconds
        while queue and queue[0] <= cutoff:
            queue.popleft()
        if len(queue) >= attempts:
            return False
        queue.append(now)
        return True

    def _prune_if_due(self, now: float) -> None:
        if now < self._next_prune_at:
            return
        self._prune_entries(self.ip_entries, now)
        self._prune_entries(self.username_entries, now)
        self._next_prune_at = now + min(60, self.window_seconds)

    def _prune_entries(
        self, entries: OrderedDict[str, deque[float]], now: float
    ) -> None:
        cutoff = now - self.window_seconds
        for key, queue in list(entries.items()):
            while queue and queue[0] <= cutoff:
                queue.popleft()
            if not queue:
                entries.pop(key, None)


class LoginBodyLimitMiddleware:
    """Buffer the small login body so chunked requests cannot bypass the limit."""

    def __init__(self, app: ASGIApp, max_body_bytes: int):
        self.app = app
        self.max_body_bytes = max_body_bytes

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if not (
            scope["type"] == "http"
            and scope.get("method") == "POST"
            and scope.get("path") in {"/api/auth/login", "/api/auth/login/"}
        ):
            await self.app(scope, receive, send)
            return

        headers = dict(scope.get("headers", []))
        content_length = headers.get(b"content-length")
        if content_length:
            try:
                declared_length = int(content_length)
            except ValueError:
                await self._reject(scope, send, 400, "无效的请求长度")
                return
            if declared_length < 0:
                await self._reject(scope, send, 400, "无效的请求长度")
                return
            if declared_length > self.max_body_bytes:
                await self._reject(scope, send, 413, "登录请求内容过大")
                return

        messages: list[Message] = []
        total = 0
        while True:
            message = await receive()
            messages.append(message)
            if message["type"] == "http.disconnect":
                break
            if message["type"] != "http.request":
                continue
            total += len(message.get("body", b""))
            if total > self.max_body_bytes:
                await self._reject(scope, send, 413, "登录请求内容过大")
                return
            if not message.get("more_body", False):
                break

        index = 0

        async def replay() -> Message:
            nonlocal index
            if index < len(messages):
                message = messages[index]
                index += 1
                return message
            return {"type": "http.disconnect"}

        await self.app(scope, replay, send)

    @staticmethod
    async def _reject(
        scope: Scope, send: Send, status_code: int, detail: str
    ) -> None:
        response = JSONResponse(
            {"detail": detail},
            status_code=status_code,
            headers={"Cache-Control": "no-store"},
        )
        await response(scope, receive=_never_receive, send=send)


async def _never_receive() -> Message:
    return {"type": "http.disconnect"}
