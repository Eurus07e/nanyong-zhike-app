from __future__ import annotations

import hashlib
import sqlite3
from pathlib import Path

import pytest

from desktop import smoke_test_release


SUPPORT_QR_PATH = Path(__file__).parents[1] / "frontend" / "public" / "alipay-support.jpeg"
SUPPORT_QR_SHA256 = "91b2b166ef13806317ca1823afd5adaa28d992bc10b7c7f61e094fefbd3cb625"
REQUIRED_MEMO_COLUMNS = {
    "username": "TEXT",
    "content": "TEXT",
    "tags_json": "TEXT",
    "pinned": "INTEGER",
    "link_url": "TEXT",
    "link_label": "TEXT",
    "created_at": "INTEGER",
    "updated_at": "INTEGER",
}
REQUIRED_ACADEMIC_SNAPSHOT_COLUMNS = {
    "username": "TEXT",
    "encrypted_payload": "TEXT",
    "grade_count": "INTEGER",
    "updated_at": "INTEGER",
}
REQUIRED_PORTAL_SNAPSHOT_COLUMNS = {
    "username": "TEXT",
    "cache_key": "TEXT",
    "encrypted_payload": "TEXT",
    "updated_at": "INTEGER",
}


def test_release_smoke_http_client_bypasses_environment_proxies():
    opener = getattr(smoke_test_release, "_LOCAL_HTTP_OPENER", None)

    assert opener is not None
    proxy_handlers = [
        handler
        for handler in opener.handlers
        if isinstance(handler, smoke_test_release.urllib.request.ProxyHandler)
    ]
    assert proxy_handlers == []


class CloseTrackingConnection(sqlite3.Connection):
    was_closed = False

    def close(self) -> None:
        self.was_closed = True
        super().close()


def create_snapshot_table(connection: sqlite3.Connection) -> None:
    columns = ", ".join(
        f"{name} {column_type}"
        for name, column_type in REQUIRED_ACADEMIC_SNAPSHOT_COLUMNS.items()
    )
    connection.execute(f"CREATE TABLE academic_snapshots({columns})")


def create_portal_snapshot_table(connection: sqlite3.Connection) -> None:
    columns = ", ".join(
        f"{name} {column_type}"
        for name, column_type in REQUIRED_PORTAL_SNAPSHOT_COLUMNS.items()
    )
    connection.execute(f"CREATE TABLE portal_snapshots({columns})")


def asset_validator():
    validator = getattr(smoke_test_release, "validate_frontend_asset", None)
    assert callable(validator), "release smoke test must validate asset contents"
    return validator


def test_release_smoke_decodes_child_output_portably() -> None:
    options = getattr(smoke_test_release, "_TEXT_PROCESS_OPTIONS", None)

    assert options == {
        "text": True,
        "encoding": "utf-8",
        "errors": "replace",
    }


def test_release_smoke_rejects_spa_fallback_for_missing_image() -> None:
    with pytest.raises(RuntimeError, match="invalid frontend asset"):
        asset_validator()("login-campus-2.jpg", b"<!doctype html><html></html>", "text/html")


@pytest.mark.parametrize(
    ("filename", "payload", "content_type"),
    [
        ("login-campus-1.jpg", b"\xff\xd8\xff" + b"x" * 128, "image/jpeg"),
        ("favicon-32x32.png", b"\x89PNG\r\n\x1a\n" + b"x" * 128, "image/png"),
        ("favicon.ico", b"\x00\x00\x01\x00" + b"x" * 128, "image/x-icon"),
        ("favicon.svg", b'<svg xmlns="http://www.w3.org/2000/svg">' + b"x" * 128, "image/svg+xml"),
    ],
)
def test_release_smoke_accepts_expected_asset_formats(
    filename: str, payload: bytes, content_type: str
) -> None:
    asset_validator()(filename, payload, content_type)


def test_release_smoke_requires_the_memo_table(tmp_path) -> None:
    database = tmp_path / "nanyong.db"
    with sqlite3.connect(database) as connection:
        for table in ("sessions", "reviews", "metadata"):
            connection.execute(f"CREATE TABLE {table}(id INTEGER)")

    validator = getattr(smoke_test_release, "validate_database_schema", None)
    assert callable(validator), "release smoke test must validate the database schema"
    with pytest.raises(RuntimeError, match="memos"):
        validator(database)

    with sqlite3.connect(database) as connection:
        columns = ", ".join(
            f"{name} {column_type}"
            for name, column_type in REQUIRED_MEMO_COLUMNS.items()
        )
        connection.execute(f"CREATE TABLE memos(id INTEGER, {columns})")
        create_snapshot_table(connection)
        create_portal_snapshot_table(connection)
    validator(database)


@pytest.mark.parametrize("missing_column", sorted(REQUIRED_MEMO_COLUMNS))
def test_release_smoke_requires_memo_columns(tmp_path, missing_column: str) -> None:
    database = tmp_path / "nanyong.db"
    with sqlite3.connect(database) as connection:
        for table in ("sessions", "reviews", "metadata"):
            connection.execute(f"CREATE TABLE {table}(id INTEGER)")
        columns = ", ".join(
            f"{name} {column_type}"
            for name, column_type in REQUIRED_MEMO_COLUMNS.items()
            if name != missing_column
        )
        connection.execute(f"CREATE TABLE memos(id INTEGER, {columns})")
        create_snapshot_table(connection)
        create_portal_snapshot_table(connection)

    with pytest.raises(RuntimeError, match=rf"memos.*{missing_column}"):
        smoke_test_release.validate_database_schema(database)


def test_release_smoke_requires_academic_snapshot_columns(tmp_path) -> None:
    database = tmp_path / "nanyong.db"
    with sqlite3.connect(database) as connection:
        for table in ("sessions", "reviews", "metadata"):
            connection.execute(f"CREATE TABLE {table}(id INTEGER)")
        memo_columns = ", ".join(
            f"{name} {column_type}"
            for name, column_type in REQUIRED_MEMO_COLUMNS.items()
        )
        connection.execute(f"CREATE TABLE memos(id INTEGER, {memo_columns})")
        connection.execute(
            "CREATE TABLE academic_snapshots(username TEXT, encrypted_payload TEXT)"
        )
        create_portal_snapshot_table(connection)

    with pytest.raises(RuntimeError, match=r"academic_snapshots.*grade_count"):
        smoke_test_release.validate_database_schema(database)


def test_release_smoke_requires_portal_snapshot_columns(tmp_path) -> None:
    database = tmp_path / "nanyong.db"
    with sqlite3.connect(database) as connection:
        for table in ("sessions", "reviews", "metadata"):
            connection.execute(f"CREATE TABLE {table}(id INTEGER)")
        memo_columns = ", ".join(
            f"{name} {column_type}"
            for name, column_type in REQUIRED_MEMO_COLUMNS.items()
        )
        connection.execute(f"CREATE TABLE memos(id INTEGER, {memo_columns})")
        create_snapshot_table(connection)
        connection.execute(
            "CREATE TABLE portal_snapshots(username TEXT, cache_key TEXT)"
        )

    with pytest.raises(RuntimeError, match=r"portal_snapshots.*encrypted_payload"):
        smoke_test_release.validate_database_schema(database)


def test_release_smoke_explicitly_closes_database_connection(
    tmp_path, monkeypatch: pytest.MonkeyPatch
) -> None:
    database = tmp_path / "nanyong.db"
    with sqlite3.connect(database) as connection:
        for table in ("sessions", "reviews", "metadata"):
            connection.execute(f"CREATE TABLE {table}(id INTEGER)")
        memo_columns = ", ".join(
            f"{name} {column_type}"
            for name, column_type in REQUIRED_MEMO_COLUMNS.items()
        )
        connection.execute(f"CREATE TABLE memos(id INTEGER, {memo_columns})")
        create_snapshot_table(connection)
        create_portal_snapshot_table(connection)

    real_connect = sqlite3.connect
    opened_connections: list[CloseTrackingConnection] = []

    def tracking_connect(*args, **kwargs) -> CloseTrackingConnection:
        connection = real_connect(*args, factory=CloseTrackingConnection, **kwargs)
        opened_connections.append(connection)
        return connection

    monkeypatch.setattr(smoke_test_release.sqlite3, "connect", tracking_connect)
    try:
        smoke_test_release.validate_database_schema(database)
        assert len(opened_connections) == 1
        assert opened_connections[0].was_closed
    finally:
        for connection in opened_connections:
            if not connection.was_closed:
                connection.close()


def test_release_smoke_requires_the_support_qr_asset() -> None:
    assets = getattr(smoke_test_release, "REQUIRED_FRONTEND_ASSETS", ())

    assert "alipay-support.jpeg" in assets


def test_release_smoke_accepts_the_reviewed_support_qr() -> None:
    payload = SUPPORT_QR_PATH.read_bytes()

    assert hashlib.sha256(payload).hexdigest() == SUPPORT_QR_SHA256
    asset_validator()("alipay-support.jpeg", payload, "image/jpeg")


def test_release_smoke_rejects_a_modified_support_qr() -> None:
    payload = SUPPORT_QR_PATH.read_bytes() + b"modified"

    with pytest.raises(RuntimeError, match="checksum"):
        asset_validator()("alipay-support.jpeg", payload, "image/jpeg")
