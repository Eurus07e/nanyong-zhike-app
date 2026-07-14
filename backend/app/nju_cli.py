from __future__ import annotations

import asyncio
import json
import os
import platform
import shutil
import tempfile
import time
from contextlib import asynccontextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import Any, AsyncIterator

from .config import Settings


class NjuCliError(RuntimeError):
    def __init__(self, message: str, *, auth_expired: bool = False):
        super().__init__(message)
        self.auth_expired = auth_expired


@dataclass
class _OwnerGate:
    semaphore: asyncio.Semaphore
    references: int = 0


class _ProcessLimiter:
    def __init__(self, global_limit: int, owner_limit: int):
        self.global_semaphore = asyncio.Semaphore(global_limit)
        self.owner_limit = owner_limit
        self.owner_gates: dict[str, _OwnerGate] = {}

    @asynccontextmanager
    async def slot(self, owner: str) -> AsyncIterator[None]:
        gate = self.owner_gates.get(owner)
        if gate is None:
            gate = _OwnerGate(asyncio.Semaphore(self.owner_limit))
            self.owner_gates[owner] = gate
        gate.references += 1
        try:
            # Take the narrower gate first so one user's queue cannot occupy global slots.
            async with gate.semaphore:
                async with self.global_semaphore:
                    yield
        finally:
            gate.references -= 1
            if gate.references == 0 and self.owner_gates.get(owner) is gate:
                self.owner_gates.pop(owner, None)


class NjuCli:
    _WINDOWS_SANDBOX_ENV = frozenset(
        {
            "HOME",
            "USERPROFILE",
            "LOCALAPPDATA",
            "APPDATA",
            "TMPDIR",
            "TEMP",
            "TMP",
        }
    )
    _PASSTHROUGH_ENV = frozenset(
        {
            "HOME",
            "PATH",
            "LANG",
            "LC_ALL",
            "LC_CTYPE",
            "TZ",
            "TMPDIR",
            "TEMP",
            "TMP",
            "SSL_CERT_FILE",
            "SSL_CERT_DIR",
            "SYSTEMROOT",
            "WINDIR",
            "COMSPEC",
            "PATHEXT",
            "USERPROFILE",
            "APPDATA",
            "LOCALAPPDATA",
            "HTTP_PROXY",
            "HTTPS_PROXY",
            "NO_PROXY",
            "http_proxy",
            "https_proxy",
            "no_proxy",
        }
    )

    def __init__(self, settings: Settings):
        self.settings = settings
        self.binary = self._resolve_binary()
        self.process_limiter = _ProcessLimiter(
            settings.nju_cli_global_concurrency,
            settings.nju_cli_user_concurrency,
        )

    def _resolve_binary(self) -> Path:
        if self.settings.app_env.casefold() == "desktop":
            bundled = Path(self.settings.nju_cli_bin).expanduser()
            if bundled.is_file() and (os.name == "nt" or os.access(bundled, os.X_OK)):
                return bundled
            raise RuntimeError("发行包不完整：内置 nju-cli 不可用，请重新下载并完整解压")

        candidates: list[Path] = []
        if self.settings.nju_cli_bin:
            candidates.append(Path(self.settings.nju_cli_bin).expanduser())
        found = shutil.which("nju-cli")
        if found:
            candidates.append(Path(found))

        machine = platform.machine().lower()
        target = "macos-aarch64" if platform.system() == "Darwin" else (
            "linux-aarch64" if machine in {"arm64", "aarch64"} else "linux-x86_64"
        )
        candidates.append(Path.home() / "nju-cli-plugin" / "v1.4.6" / target / "nju-cli")
        candidates.extend(
            Path.home().glob(
                ".codex/plugins/cache/nju-cli/nju-cli/*/bin/*/nju-cli"
            )
        )
        candidates.extend(
            Path.home().glob(
                ".codex/plugins/cache/nju-cli/nju-cli/*/scripts/nju-cli"
            )
        )

        for candidate in candidates:
            if candidate.is_file() and os.access(candidate, os.X_OK):
                return candidate
        raise RuntimeError(
            "未找到 nju-cli。请安装 nju-cli 1.4.6，或设置 NJU_CLI_BIN。"
        )

    async def login(self, username: str, password: str) -> str:
        # Credentials stay in the child environment, never in argv or application logs.
        with tempfile.TemporaryDirectory(prefix="nanyong-login-") as cache:
            env = self._base_env(Path(cache))
            env["NJU_USERNAME"] = username
            env["NJU_PASSWORD"] = password
            await self._execute(
                ["login"], env=env, owner=username.casefold(), timeout=45
            )
            auth_file = Path(cache) / "nju-cli" / "auth" / "auth.json"
            if not auth_file.exists():
                raise NjuCliError("登录成功但未收到认证凭据，请稍后重试")
            try:
                castgc = json.loads(auth_file.read_text(encoding="utf-8"))["castgc"]
            except (json.JSONDecodeError, KeyError) as error:
                raise NjuCliError("认证凭据格式异常") from error
            return str(castgc)

    async def json(
        self,
        castgc: str,
        args: list[str],
        *,
        owner: str,
        timeout: int = 45,
    ) -> Any:
        with tempfile.TemporaryDirectory(prefix="nanyong-session-") as cache:
            cache_path = Path(cache)
            auth_dir = cache_path / "nju-cli" / "auth"
            auth_dir.mkdir(parents=True, mode=0o700)
            auth_file = auth_dir / "auth.json"
            auth_file.write_text(
                json.dumps({"castgc": castgc, "updated_at_unix": int(time.time())}),
                encoding="utf-8",
            )
            auth_file.chmod(0o600)
            output = await self._execute(
                args,
                env=self._base_env(cache_path),
                owner=owner.casefold(),
                timeout=timeout,
            )
        try:
            return json.loads(output)
        except json.JSONDecodeError as error:
            raise NjuCliError("学校服务返回了无法解析的数据") from error

    @staticmethod
    def _base_env(cache_path: Path) -> dict[str, str]:
        is_windows = platform.system() == "Windows"
        if is_windows:
            allowed = {key.casefold() for key in NjuCli._PASSTHROUGH_ENV}
            env = {
                key.upper(): value
                for key, value in os.environ.items()
                if key.casefold() in allowed
            }
        else:
            env = {
                key: value
                for key, value in os.environ.items()
                if key in NjuCli._PASSTHROUGH_ENV
            }
        env.setdefault("PATH", os.defpath)
        env["XDG_CACHE_HOME"] = str(cache_path)
        env["NJU_CLI_CACHE_DIR"] = str(cache_path / "nju-cli")
        if is_windows:
            sandbox = str(cache_path)
            for key in NjuCli._WINDOWS_SANDBOX_ENV:
                env[key] = sandbox
        env["RUST_BACKTRACE"] = "0"
        return env

    async def _execute(
        self,
        args: list[str],
        *,
        env: dict[str, str],
        owner: str,
        timeout: int,
    ) -> str:
        async with self.process_limiter.slot(owner):
            process = await asyncio.create_subprocess_exec(
                str(self.binary),
                *args,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                env=env,
            )
            try:
                stdout, stderr = await asyncio.wait_for(
                    process.communicate(), timeout=timeout
                )
            except TimeoutError as error:
                process.kill()
                await process.communicate()
                raise NjuCliError("学校服务响应超时，请稍后重试") from error

        if process.returncode != 0:
            raw = stderr.decode("utf-8", errors="replace").strip()
            lowered = raw.lower()
            expired = "not logged in" in lowered or "login has expired" in lowered
            if expired:
                message = "统一身份认证登录已过期，请重新登录"
            elif "用户名或密码" in raw or "login failed" in lowered:
                message = "学号或密码错误，或验证码识别失败"
            else:
                message = "学校服务暂时不可用，请稍后重试"
            raise NjuCliError(message, auth_expired=expired)
        return stdout.decode("utf-8", errors="strict")
