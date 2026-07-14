from __future__ import annotations

import json
import os
import platform
import secrets
import socket
import sys
import threading
import time
import urllib.error
import urllib.request
import webbrowser
from pathlib import Path

import certifi

from backend.app.version import APP_VERSION


APP_NAME = "NanyongZhike"
DEFAULT_PORT = 8000


def configure_console_encoding() -> None:
    for stream_name in ("stdout", "stderr"):
        stream = getattr(sys, stream_name, None)
        reconfigure = getattr(stream, "reconfigure", None)
        if not callable(reconfigure):
            continue
        try:
            reconfigure(encoding="utf-8", errors="replace")
        except (OSError, ValueError):
            pass


def resource_path(*parts: str) -> Path:
    if getattr(sys, "frozen", False):
        root = Path(getattr(sys, "_MEIPASS"))
    else:
        root = Path(__file__).resolve().parents[1]
    return root.joinpath(*parts)


def user_data_dir() -> Path:
    override = os.environ.get("NANYONG_ZHIKE_DATA_DIR")
    if override:
        return Path(override).expanduser().resolve()

    system = platform.system()
    if system == "Darwin":
        return Path.home() / "Library" / "Application Support" / APP_NAME
    if system == "Windows":
        base = Path(os.environ.get("LOCALAPPDATA", Path.home() / "AppData" / "Local"))
        return base / APP_NAME
    base = Path(os.environ.get("XDG_DATA_HOME", Path.home() / ".local" / "share"))
    return base / APP_NAME


def load_or_create_secret(directory: Path) -> str:
    secret_path = directory / ".app-secret"
    try:
        return secret_path.read_text(encoding="ascii").strip()
    except FileNotFoundError:
        secret = secrets.token_urlsafe(48)
        try:
            descriptor = os.open(secret_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        except FileExistsError:
            return secret_path.read_text(encoding="ascii").strip()
        with os.fdopen(descriptor, "w", encoding="ascii") as stream:
            stream.write(secret)
        return secret


def configure_environment() -> Path:
    if os.name != "nt":
        os.umask(0o077)
    data_dir = user_data_dir()
    data_dir.mkdir(parents=True, exist_ok=True, mode=0o700)

    executable_name = "nju-cli.exe" if platform.system() == "Windows" else "nju-cli"
    nju_cli = resource_path("bin", executable_name)
    if not nju_cli.is_file():
        raise RuntimeError(f"发行包不完整：缺少 {executable_name}")

    values = {
        "APP_ENV": "desktop",
        "APP_SECRET": load_or_create_secret(data_dir),
        "COOKIE_SECURE": "false",
        "DATABASE_PATH": str(data_dir / "nanyong.db"),
        "REVIEW_DATA_PATH": str(resource_path("data", "reviews", "merged_data.json")),
        "FRONTEND_DIST": str(resource_path("frontend", "dist")),
        "NJU_CLI_BIN": str(nju_cli),
        "SSL_CERT_FILE": certifi.where(),
        # The school exchange system has no HTTPS endpoint. Desktop releases
        # keep this requested feature available; hosted deployments stay off by default.
        "ALLOW_INSECURE_EXCHANGE_SYSTEM": "true",
    }
    os.environ.update(values)
    return data_dir


def is_nanyong_zhike_running(port: int) -> bool:
    try:
        with urllib.request.urlopen(
            f"http://127.0.0.1:{port}/api/health", timeout=0.5
        ) as response:
            payload = json.loads(response.read().decode("utf-8"))
        return is_compatible_health(payload)
    except (OSError, ValueError, urllib.error.URLError):
        return False


def is_compatible_health(payload: object) -> bool:
    return (
        isinstance(payload, dict)
        and payload.get("status") == "ok"
        and payload.get("service") == "南雍知课"
        and payload.get("version") == APP_VERSION
        and payload.get("deployment") == "desktop"
    )


def select_port() -> tuple[int, bool]:
    if is_nanyong_zhike_running(DEFAULT_PORT):
        return DEFAULT_PORT, True
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
        try:
            probe.bind(("127.0.0.1", DEFAULT_PORT))
        except OSError:
            probe.bind(("127.0.0.1", 0))
        return int(probe.getsockname()[1]), False


def open_when_ready(url: str) -> None:
    if os.environ.get("NANYONG_ZHIKE_NO_BROWSER") == "1":
        print(f"浏览器自动打开已关闭，请访问 {url}", flush=True)
        return

    def wait_for_server() -> None:
        for _ in range(120):
            try:
                with urllib.request.urlopen(f"{url}/api/health", timeout=0.5):
                    webbrowser.open(url)
                    return
            except OSError:
                time.sleep(0.1)
        print(f"浏览器未自动打开，请手动访问 {url}", flush=True)

    threading.Thread(target=wait_for_server, daemon=True).start()


def main() -> int:
    configure_console_encoding()
    try:
        data_dir = configure_environment()
        port, already_running = select_port()
        url = f"http://127.0.0.1:{port}"
        if already_running:
            print("南雍知课已经在运行，正在打开浏览器。", flush=True)
            webbrowser.open(url)
            return 0

        print("南雍知课正在启动……", flush=True)
        print(f"本地数据：{data_dir}", flush=True)
        print("关闭此窗口或按 Ctrl+C 即可停止。", flush=True)
        open_when_ready(url)

        import uvicorn

        from backend.app.main import app

        uvicorn.run(
            app,
            host="127.0.0.1",
            port=port,
            access_log=False,
            log_level="warning",
        )
        return 0
    except KeyboardInterrupt:
        return 0
    except Exception as error:
        print(f"启动失败：{error}", file=sys.stderr, flush=True)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
