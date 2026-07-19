from __future__ import annotations

import asyncio
import json
import os
import platform
import shutil
import subprocess
import tempfile
import time
from contextlib import asynccontextmanager, suppress
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
    _WINDOWS_CREATE_NO_WINDOW = getattr(subprocess, "CREATE_NO_WINDOW", 0x08000000)
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

        system = platform.system()
        machine = platform.machine().lower()
        if system == "Darwin":
            target, executable_name = "macos-aarch64", "nju-cli"
            launcher_names = {"nju-cli"}
        elif system == "Windows":
            target, executable_name = "windows-x86_64", "nju-cli.exe"
            launcher_names = {"nju-cli.ps1"}
        else:
            target = (
                "linux-aarch64"
                if machine in {"arm64", "aarch64"}
                else "linux-x86_64"
            )
            executable_name = "nju-cli"
            launcher_names = {"nju-cli"}
        home = Path(os.environ.get("HOME") or Path.home())
        cache_roots: list[Path] = []
        if system == "Windows" and os.environ.get("LOCALAPPDATA"):
            cache_roots.append(Path(os.environ["LOCALAPPDATA"]))
        elif os.environ.get("XDG_CACHE_HOME"):
            cache_roots.append(Path(os.environ["XDG_CACHE_HOME"]))
        cache_roots.append(home)
        candidates: list[Path] = []
        if self.settings.nju_cli_bin:
            configured = Path(self.settings.nju_cli_bin).expanduser()
            if configured.name in launcher_names and configured.parent.name == "scripts":
                plugin_root = configured.parent.parent
                candidates.append(plugin_root / "bin" / target / executable_name)
                candidates.extend(
                    root / "nju-cli-plugin" / "v1.4.6" / target / executable_name
                    for root in cache_roots
                )
            if system != "Windows" or configured.suffix.casefold() == ".exe":
                candidates.append(configured)
        found = shutil.which(executable_name)
        if found:
            candidates.append(Path(found))

        candidates.extend(
            root / "nju-cli-plugin" / "v1.4.6" / target / executable_name
            for root in cache_roots
        )
        candidates.extend(
            home.glob(
                f".codex/plugins/cache/nju-cli/nju-cli/*/bin/*/{executable_name}"
            )
        )
        if system != "Windows":
            candidates.extend(
                home.glob(
                    ".codex/plugins/cache/nju-cli/nju-cli/*/scripts/nju-cli"
                )
            )

        for candidate in candidates:
            if candidate.is_file() and (
                system == "Windows" or os.access(candidate, os.X_OK)
            ):
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

    async def text(
        self,
        args: list[str],
        *,
        owner: str = "public",
        timeout: int = 45,
    ) -> str:
        with tempfile.TemporaryDirectory(prefix="nanyong-public-") as cache:
            return await self._execute(
                args,
                env=self._base_env(Path(cache)),
                owner=owner.casefold(),
                timeout=timeout,
            )

    async def public_cache_json(
        self,
        args: list[str],
        cache_file: str,
        *,
        owner: str = "public",
        timeout: int = 45,
    ) -> Any:
        relative = Path(cache_file)
        if relative.is_absolute() or ".." in relative.parts:
            raise ValueError("cache_file must be a safe relative path")
        with tempfile.TemporaryDirectory(prefix="nanyong-public-") as cache:
            cache_path = Path(cache)
            await self._execute(
                args,
                env=self._base_env(cache_path),
                owner=owner.casefold(),
                timeout=timeout,
            )
            target = cache_path / relative
            if not target.is_file():
                raise NjuCliError("学校服务未返回公告列表")
            try:
                return json.loads(target.read_text(encoding="utf-8"))
            except json.JSONDecodeError as error:
                raise NjuCliError("学校服务返回了无法解析的公告列表") from error

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

    @classmethod
    def _subprocess_options(cls) -> dict[str, int]:
        if platform.system() == "Windows":
            return {"creationflags": cls._WINDOWS_CREATE_NO_WINDOW}
        return {}

    @staticmethod
    async def _terminate_and_reap(process: Any) -> None:
        if process.returncode is None:
            with suppress(ProcessLookupError, OSError):
                process.kill()
        await asyncio.shield(process.communicate())

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
                **self._subprocess_options(),
            )
            try:
                stdout, stderr = await asyncio.wait_for(
                    process.communicate(), timeout=timeout
                )
            except asyncio.CancelledError:
                # Request cancellation must not leave a credential-bearing child alive.
                await self._terminate_and_reap(process)
                raise
            except TimeoutError as error:
                await self._terminate_and_reap(process)
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
