from __future__ import annotations

import argparse
import json
import os
import subprocess
import tempfile
from pathlib import Path
from typing import Mapping


_CACHE_OVERRIDE = b"NJU_CLI_CACHE_DIR"
_PROBE_CASTGC = "nanyong-zhike-cache-isolation-probe"
_RUNTIME_ENV = frozenset(
    {
        "PATH",
        "SYSTEMROOT",
        "WINDIR",
        "COMSPEC",
        "PATHEXT",
    }
)
_SANDBOX_ENV = frozenset(
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


def _contains_cache_override(binary: Path) -> bool:
    overlap = b""
    with binary.open("rb") as stream:
        while chunk := stream.read(1024 * 1024):
            data = overlap + chunk
            if _CACHE_OVERRIDE in data:
                return True
            overlap = data[-(len(_CACHE_OVERRIDE) - 1) :]
    return False


def _runtime_environment(source: Mapping[str, str] | None = None) -> dict[str, str]:
    source = os.environ if source is None else source
    canonical = {key.casefold(): key for key in _RUNTIME_ENV}
    return {
        canonical[key.casefold()]: value
        for key, value in source.items()
        if key.casefold() in canonical
    }


def verify_nju_cli_patch(binary: Path) -> None:
    binary = binary.resolve()
    if not binary.is_file():
        raise RuntimeError(f"nju-cli binary does not exist: {binary}")
    if not _contains_cache_override(binary):
        raise RuntimeError(
            "nju-cli did not honor NJU_CLI_CACHE_DIR: binary lacks the cache override"
        )

    with tempfile.TemporaryDirectory(prefix="nanyong-nju-cli-probe-") as state:
        state_path = Path(state)
        cache_dir = state_path / "nju-cli"
        env = _runtime_environment()
        env.setdefault("PATH", os.defpath)
        for key in _SANDBOX_ENV:
            env[key] = str(state_path)
        env["XDG_CACHE_HOME"] = str(state_path)
        env["NJU_CLI_CACHE_DIR"] = str(cache_dir)
        env["RUST_BACKTRACE"] = "0"

        relative_env = env.copy()
        relative_env["NJU_CLI_CACHE_DIR"] = "relative-cache"
        relative_result = subprocess.run(
            [str(binary), "login", "--castgc", _PROBE_CASTGC],
            capture_output=True,
            text=True,
            timeout=20,
            cwd=state_path,
            env=relative_env,
            check=False,
        )
        if relative_result.returncode == 0:
            raise RuntimeError("patched nju-cli accepted a relative NJU_CLI_CACHE_DIR")

        result = subprocess.run(
            [str(binary), "login", "--castgc", _PROBE_CASTGC],
            capture_output=True,
            text=True,
            timeout=20,
            cwd=state_path,
            env=env,
            check=False,
        )
        if result.returncode != 0:
            detail = result.stderr.strip() or result.stdout.strip() or "no output"
            raise RuntimeError(f"patched nju-cli probe failed: {detail}")

        auth_file = cache_dir / "auth" / "auth.json"
        if not auth_file.is_file():
            raise RuntimeError(
                "nju-cli did not honor NJU_CLI_CACHE_DIR: expected auth.json is missing"
            )
        try:
            payload = json.loads(auth_file.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as error:
            raise RuntimeError("patched nju-cli wrote an invalid auth.json") from error
        if payload.get("castgc") != _PROBE_CASTGC:
            raise RuntimeError("patched nju-cli wrote an unexpected CASTGC probe value")

        auth_files = list(state_path.rglob("auth.json"))
        if auth_files != [auth_file]:
            raise RuntimeError("patched nju-cli wrote auth.json outside its cache override")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("binary", type=Path)
    args = parser.parse_args()
    verify_nju_cli_patch(args.binary)
    print("patched nju-cli cache isolation verified")


if __name__ == "__main__":
    main()
