import asyncio

import pytest

from backend.app.config import Settings
from backend.app.nju_cli import NjuCli, NjuCliError, _ProcessLimiter


def test_child_environment_uses_allowlist(monkeypatch, tmp_path):
    monkeypatch.setenv("APP_SECRET", "must-not-reach-child")
    monkeypatch.setenv("NJU_PASSWORD", "must-not-reach-child")
    monkeypatch.setenv("UNRELATED_PRIVATE_VALUE", "must-not-reach-child")
    monkeypatch.setenv("HTTPS_PROXY", "http://proxy.example")
    monkeypatch.setenv("SYSTEMROOT", r"C:\Windows")
    monkeypatch.setenv("TEMP", r"C:\Users\student\AppData\Local\Temp")
    monkeypatch.setenv("USERPROFILE", r"C:\Users\student")

    env = NjuCli._base_env(tmp_path)

    assert "APP_SECRET" not in env
    assert "NJU_PASSWORD" not in env
    assert "UNRELATED_PRIVATE_VALUE" not in env
    assert env["HTTPS_PROXY"] == "http://proxy.example"
    assert env["SYSTEMROOT"] == r"C:\Windows"
    assert env["TEMP"] == r"C:\Users\student\AppData\Local\Temp"
    assert env["USERPROFILE"] == r"C:\Users\student"
    assert env["XDG_CACHE_HOME"] == str(tmp_path)
    assert env["RUST_BACKTRACE"] == "0"


def test_windows_child_environment_confines_profile_and_temp_dirs(
    monkeypatch, tmp_path
):
    real_profile = r"C:\Users\student"
    real_local_app_data = rf"{real_profile}\AppData\Local"
    real_roaming_app_data = rf"{real_profile}\AppData\Roaming"
    real_temp = rf"{real_local_app_data}\Temp"
    monkeypatch.setattr("backend.app.nju_cli.platform.system", lambda: "Windows")
    monkeypatch.setenv("HOME", real_profile)
    monkeypatch.setenv("USERPROFILE", real_profile)
    monkeypatch.setenv("LOCALAPPDATA", real_local_app_data)
    monkeypatch.setenv("APPDATA", real_roaming_app_data)
    monkeypatch.setenv("TMPDIR", real_temp)
    monkeypatch.setenv("TEMP", real_temp)
    monkeypatch.setenv("TMP", real_temp)
    monkeypatch.setenv("SYSTEMROOT", r"C:\Windows")

    env = NjuCli._base_env(tmp_path)

    sandbox = str(tmp_path)
    for name in (
        "HOME",
        "USERPROFILE",
        "LOCALAPPDATA",
        "APPDATA",
        "TMPDIR",
        "TEMP",
        "TMP",
        "XDG_CACHE_HOME",
    ):
        assert env[name] == sandbox
    assert env["NJU_CLI_CACHE_DIR"] == str(tmp_path / "nju-cli")
    assert env["SYSTEMROOT"] == r"C:\Windows"


def test_windows_child_environment_accepts_mixed_case_system_keys(
    monkeypatch, tmp_path
):
    monkeypatch.setattr("backend.app.nju_cli.platform.system", lambda: "Windows")
    monkeypatch.delenv("PATH", raising=False)
    monkeypatch.setenv("Path", r"C:\Windows\System32")
    monkeypatch.setenv("SystemRoot", r"C:\Windows")
    monkeypatch.setenv("ComSpec", r"C:\Windows\System32\cmd.exe")

    env = NjuCli._base_env(tmp_path)

    assert env["PATH"] == r"C:\Windows\System32"
    assert env["SYSTEMROOT"] == r"C:\Windows"
    assert env["COMSPEC"] == r"C:\Windows\System32\cmd.exe"
    assert "Path" not in env
    assert "SystemRoot" not in env
    assert "ComSpec" not in env


def test_windows_child_processes_never_create_console_windows(monkeypatch):
    monkeypatch.setattr("backend.app.nju_cli.platform.system", lambda: "Windows")

    assert NjuCli._subprocess_options() == {
        "creationflags": NjuCli._WINDOWS_CREATE_NO_WINDOW
    }


def test_non_windows_child_processes_do_not_receive_windows_flags(monkeypatch):
    monkeypatch.setattr("backend.app.nju_cli.platform.system", lambda: "Linux")

    assert NjuCli._subprocess_options() == {}


@pytest.mark.asyncio
async def test_execute_passes_windows_no_window_flag_to_child(monkeypatch, tmp_path):
    captured: dict[str, object] = {}

    class Process:
        returncode = 0

        async def communicate(self):
            return b"{}", b""

    async def create_subprocess_exec(*args, **kwargs):
        captured["args"] = args
        captured["kwargs"] = kwargs
        return Process()

    client = object.__new__(NjuCli)
    client.binary = tmp_path / "nju-cli.exe"
    client.process_limiter = _ProcessLimiter(global_limit=1, owner_limit=1)
    monkeypatch.setattr("backend.app.nju_cli.platform.system", lambda: "Windows")
    monkeypatch.setattr(
        "backend.app.nju_cli.asyncio.create_subprocess_exec",
        create_subprocess_exec,
    )

    assert await client._execute([], env={}, owner="student", timeout=1) == "{}"
    assert captured["kwargs"]["creationflags"] == NjuCli._WINDOWS_CREATE_NO_WINDOW


@pytest.mark.asyncio
async def test_execute_kills_and_reaps_child_on_timeout(monkeypatch, tmp_path):
    class Process:
        returncode = None
        killed = False
        communicate_calls = 0

        async def communicate(self):
            self.communicate_calls += 1
            if self.communicate_calls == 1:
                await asyncio.Event().wait()
            return b"", b""

        def kill(self):
            self.killed = True
            self.returncode = -9

    process = Process()

    async def create_subprocess_exec(*args, **kwargs):
        return process

    client = object.__new__(NjuCli)
    client.binary = tmp_path / "nju-cli"
    client.process_limiter = _ProcessLimiter(global_limit=1, owner_limit=1)
    monkeypatch.setattr(
        "backend.app.nju_cli.asyncio.create_subprocess_exec",
        create_subprocess_exec,
    )

    with pytest.raises(NjuCliError, match="响应超时"):
        await client._execute([], env={}, owner="student", timeout=0.01)

    assert process.killed is True
    assert process.communicate_calls == 2


@pytest.mark.asyncio
async def test_execute_kills_and_reaps_child_when_request_is_cancelled(
    monkeypatch, tmp_path
):
    started = asyncio.Event()

    class Process:
        returncode = None
        killed = False
        communicate_calls = 0

        async def communicate(self):
            self.communicate_calls += 1
            if self.communicate_calls == 1:
                started.set()
                await asyncio.Event().wait()
            return b"", b""

        def kill(self):
            self.killed = True
            self.returncode = -9

    process = Process()

    async def create_subprocess_exec(*args, **kwargs):
        return process

    client = object.__new__(NjuCli)
    client.binary = tmp_path / "nju-cli"
    client.process_limiter = _ProcessLimiter(global_limit=1, owner_limit=1)
    monkeypatch.setattr(
        "backend.app.nju_cli.asyncio.create_subprocess_exec",
        create_subprocess_exec,
    )

    task = asyncio.create_task(
        client._execute([], env={}, owner="student", timeout=30)
    )
    await started.wait()
    task.cancel()

    with pytest.raises(asyncio.CancelledError):
        await task

    assert process.killed is True
    assert process.communicate_calls == 2


@pytest.mark.asyncio
async def test_execute_does_not_mask_cancellation_when_child_exits_first(
    monkeypatch, tmp_path
):
    started = asyncio.Event()

    class Process:
        returncode = None
        communicate_calls = 0

        async def communicate(self):
            self.communicate_calls += 1
            if self.communicate_calls == 1:
                started.set()
                await asyncio.Event().wait()
            return b"", b""

        def kill(self):
            raise ProcessLookupError

    process = Process()

    async def create_subprocess_exec(*args, **kwargs):
        return process

    client = object.__new__(NjuCli)
    client.binary = tmp_path / "nju-cli"
    client.process_limiter = _ProcessLimiter(global_limit=1, owner_limit=1)
    monkeypatch.setattr(
        "backend.app.nju_cli.asyncio.create_subprocess_exec",
        create_subprocess_exec,
    )

    task = asyncio.create_task(
        client._execute([], env={}, owner="student", timeout=30)
    )
    await started.wait()
    process.returncode = 0
    task.cancel()

    with pytest.raises(asyncio.CancelledError):
        await task

    assert process.communicate_calls == 2


def test_desktop_mode_never_falls_back_to_unverified_nju_cli(
    monkeypatch, tmp_path
):
    fallback = tmp_path / "nju-cli"
    fallback.write_bytes(b"unverified")
    fallback.chmod(0o755)
    monkeypatch.setattr("backend.app.nju_cli.shutil.which", lambda _: str(fallback))

    with pytest.raises(RuntimeError, match="发行包不完整"):
        NjuCli(
            Settings(
                app_env="desktop",
                nju_cli_bin=str(tmp_path / "missing-nju-cli"),
            )
        )


def test_development_resolves_plugin_launcher_to_cached_binary(monkeypatch, tmp_path):
    launcher = tmp_path / "plugin" / "scripts" / "nju-cli"
    launcher.parent.mkdir(parents=True)
    launcher.write_text("#!/bin/sh\n", encoding="ascii")
    launcher.chmod(0o755)
    cached = tmp_path / "nju-cli-plugin" / "v1.4.6" / "macos-aarch64" / "nju-cli"
    cached.parent.mkdir(parents=True)
    cached.write_bytes(b"binary")
    cached.chmod(0o755)
    monkeypatch.setenv("HOME", str(tmp_path))
    monkeypatch.setenv("APP_ENV", "development")
    monkeypatch.setattr("backend.app.nju_cli.platform.system", lambda: "Darwin")
    monkeypatch.setattr("backend.app.nju_cli.platform.machine", lambda: "arm64")
    monkeypatch.setattr("backend.app.nju_cli.shutil.which", lambda _: None)

    client = NjuCli(Settings(nju_cli_bin=str(launcher)))

    assert client.binary == cached


def test_development_resolves_windows_plugin_launcher_to_cached_binary(
    monkeypatch, tmp_path
):
    launcher = tmp_path / "plugin" / "scripts" / "nju-cli.ps1"
    launcher.parent.mkdir(parents=True)
    launcher.write_text("Write-Output nju-cli\n", encoding="ascii")
    local_app_data = tmp_path / "LocalAppData"
    cached = (
        local_app_data
        / "nju-cli-plugin"
        / "v1.4.6"
        / "windows-x86_64"
        / "nju-cli.exe"
    )
    cached.parent.mkdir(parents=True)
    cached.write_bytes(b"binary")
    monkeypatch.setenv("HOME", str(tmp_path))
    monkeypatch.setenv("LOCALAPPDATA", str(local_app_data))
    monkeypatch.setenv("APP_ENV", "development")
    monkeypatch.setattr("backend.app.nju_cli.platform.system", lambda: "Windows")
    monkeypatch.setattr("backend.app.nju_cli.platform.machine", lambda: "AMD64")
    monkeypatch.setattr("backend.app.nju_cli.shutil.which", lambda _: None)

    client = NjuCli(Settings(nju_cli_bin=str(launcher)))

    assert client.binary == cached


@pytest.mark.asyncio
async def test_process_limiter_caps_global_and_per_owner_concurrency():
    limiter = _ProcessLimiter(global_limit=3, owner_limit=2)
    active_global = 0
    max_global = 0
    active_by_owner: dict[str, int] = {}
    max_by_owner: dict[str, int] = {}

    async def work(owner: str):
        nonlocal active_global, max_global
        async with limiter.slot(owner):
            active_global += 1
            active_by_owner[owner] = active_by_owner.get(owner, 0) + 1
            max_global = max(max_global, active_global)
            max_by_owner[owner] = max(
                max_by_owner.get(owner, 0), active_by_owner[owner]
            )
            await asyncio.sleep(0.01)
            active_by_owner[owner] -= 1
            active_global -= 1

    await asyncio.gather(
        *(work(owner) for owner in ["a", "a", "a", "a", "b", "b", "c", "c"])
    )

    assert max_global <= 3
    assert all(value <= 2 for value in max_by_owner.values())
    assert limiter.owner_gates == {}
