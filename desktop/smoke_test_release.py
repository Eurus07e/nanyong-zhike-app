from __future__ import annotations

import argparse
import hashlib
import json
import os
import platform
import sqlite3
import subprocess
import tempfile
import time
import urllib.request
from pathlib import Path

if __package__:
    from .verify_nju_cli_patch import verify_nju_cli_patch
else:
    from verify_nju_cli_patch import verify_nju_cli_patch


_TEXT_PROCESS_OPTIONS = {
    "text": True,
    "encoding": "utf-8",
    "errors": "replace",
}

REQUIRED_FRONTEND_ASSETS = (
    "login-campus-1.jpg",
    "login-campus-2.jpg",
    "login-campus-3.jpg",
    "login-campus-4.jpg",
    "default-avatar.jpeg",
    "alipay-support.jpeg",
    "favicon.svg",
    "favicon-32x32.png",
    "favicon.ico",
    "apple-touch-icon.png",
    "apple-touch-icon-precomposed.png",
)
REQUIRED_FRONTEND_ASSET_SHA256 = {
    "alipay-support.jpeg": "91b2b166ef13806317ca1823afd5adaa28d992bc10b7c7f61e094fefbd3cb625",
}
REQUIRED_MEMO_COLUMNS = {
    "username",
    "content",
    "tags_json",
    "pinned",
    "link_url",
    "link_label",
    "created_at",
    "updated_at",
}
REQUIRED_ACADEMIC_SNAPSHOT_COLUMNS = {
    "username",
    "encrypted_payload",
    "grade_count",
    "updated_at",
}
REQUIRED_PORTAL_SNAPSHOT_COLUMNS = {
    "username",
    "cache_key",
    "encrypted_payload",
    "updated_at",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dist", required=True, type=Path)
    return parser.parse_args()


def get(url: str) -> tuple[bytes, str]:
    with urllib.request.urlopen(url, timeout=2) as response:
        if response.status != 200:
            raise RuntimeError(f"GET {url} returned {response.status}")
        return response.read(), response.headers.get_content_type()


def validate_frontend_asset(filename: str, payload: bytes, content_type: str) -> None:
    suffix = Path(filename).suffix.lower()
    formats: dict[str, tuple[set[str], tuple[bytes, ...]]] = {
        ".jpg": ({"image/jpeg"}, (b"\xff\xd8\xff",)),
        ".jpeg": ({"image/jpeg"}, (b"\xff\xd8\xff",)),
        ".png": ({"image/png"}, (b"\x89PNG\r\n\x1a\n",)),
        ".ico": (
            {"image/x-icon", "image/vnd.microsoft.icon"},
            (b"\x00\x00\x01\x00",),
        ),
        ".svg": ({"image/svg+xml"}, (b"<svg", b"<?xml")),
    }
    expected = formats.get(suffix)
    normalized_payload = payload.lstrip() if suffix == ".svg" else payload
    if (
        expected is None
        or content_type not in expected[0]
        or len(payload) < 100
        or not normalized_payload.startswith(expected[1])
    ):
        raise RuntimeError(
            f"invalid frontend asset: {filename} ({content_type}, {len(payload)} bytes)"
        )
    expected_sha256 = REQUIRED_FRONTEND_ASSET_SHA256.get(filename)
    if expected_sha256 and hashlib.sha256(payload).hexdigest() != expected_sha256:
        raise RuntimeError(f"invalid frontend asset checksum: {filename}")


def validate_database_schema(path: Path) -> None:
    required = {
        "sessions", "reviews", "metadata", "memos",
        "academic_snapshots", "portal_snapshots",
    }
    connection = sqlite3.connect(path)
    try:
        tables = {
            str(row[0])
            for row in connection.execute(
                "SELECT name FROM sqlite_master WHERE type = 'table'"
            )
        }
        memo_columns = {
            str(row[1]) for row in connection.execute("PRAGMA table_info(memos)")
        }
        snapshot_columns = {
            str(row[1])
            for row in connection.execute("PRAGMA table_info(academic_snapshots)")
        }
        portal_snapshot_columns = {
            str(row[1])
            for row in connection.execute("PRAGMA table_info(portal_snapshots)")
        }
    finally:
        connection.close()
    missing = sorted(required - tables)
    if missing:
        raise RuntimeError(f"desktop database is missing tables: {', '.join(missing)}")
    missing_memo_columns = sorted(REQUIRED_MEMO_COLUMNS - memo_columns)
    if missing_memo_columns:
        raise RuntimeError(
            "desktop database memos table is missing columns: "
            + ", ".join(missing_memo_columns)
        )
    missing_snapshot_columns = sorted(
        REQUIRED_ACADEMIC_SNAPSHOT_COLUMNS - snapshot_columns
    )
    if missing_snapshot_columns:
        raise RuntimeError(
            "desktop database academic_snapshots table is missing columns: "
            + ", ".join(missing_snapshot_columns)
        )
    missing_portal_snapshot_columns = sorted(
        REQUIRED_PORTAL_SNAPSHOT_COLUMNS - portal_snapshot_columns
    )
    if missing_portal_snapshot_columns:
        raise RuntimeError(
            "desktop database portal_snapshots table is missing columns: "
            + ", ".join(missing_portal_snapshot_columns)
        )


def main() -> None:
    args = parse_args()
    suffix = ".exe" if platform.system() == "Windows" else ""
    executable = args.dist / f"NanyongZhike{suffix}"
    nju_cli = args.dist / "_internal" / "bin" / f"nju-cli{suffix}"
    if not executable.is_file() or not nju_cli.is_file():
        raise SystemExit("desktop distribution is missing an executable")

    verify_nju_cli_patch(nju_cli)

    cli_check = subprocess.run(
        [str(nju_cli), "--help"],
        capture_output=True,
        timeout=20,
        check=False,
        **_TEXT_PROCESS_OPTIONS,
    )
    if cli_check.returncode != 0 or "Usage:" not in cli_check.stdout:
        raise SystemExit(f"bundled nju-cli failed:\n{cli_check.stdout}\n{cli_check.stderr}")

    with tempfile.TemporaryDirectory(prefix="nanyong-release-smoke-") as state:
        env = os.environ.copy()
        env["NANYONG_ZHIKE_DATA_DIR"] = state
        env["NANYONG_ZHIKE_NO_BROWSER"] = "1"
        process = subprocess.Popen(
            [str(executable)],
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            **_TEXT_PROCESS_OPTIONS,
        )
        try:
            base_url = "http://127.0.0.1:8000"
            for _ in range(120):
                if process.poll() is not None:
                    output = process.stdout.read() if process.stdout else ""
                    raise RuntimeError(f"desktop app exited early:\n{output}")
                try:
                    health_body, _ = get(f"{base_url}/api/health")
                    health = json.loads(health_body)
                    if health == {
                        "status": "ok",
                        "service": "南雍知课",
                        "version": "1.1.6",
                        "deployment": "desktop",
                    }:
                        break
                except (OSError, ValueError):
                    time.sleep(0.25)
            else:
                raise RuntimeError("desktop app did not become healthy within 30 seconds")

            index, index_content_type = get(base_url)
            if (
                index_content_type != "text/html"
                or b'<div id="root"></div>' not in index
            ):
                raise RuntimeError("frontend index was not served")
            for asset in REQUIRED_FRONTEND_ASSETS:
                payload, content_type = get(f"{base_url}/{asset}")
                validate_frontend_asset(asset, payload, content_type)

            state_path = Path(state)
            if not (state_path / ".app-secret").is_file():
                raise RuntimeError("desktop secret was not created in the user data directory")
            if not (state_path / "nanyong.db").is_file():
                raise RuntimeError("desktop database was not created in the user data directory")
            validate_database_schema(state_path / "nanyong.db")
        finally:
            if process.poll() is None:
                process.terminate()
                try:
                    process.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait(timeout=5)

    print(f"desktop smoke test passed on {platform.system()} {platform.machine()}")


if __name__ == "__main__":
    main()
