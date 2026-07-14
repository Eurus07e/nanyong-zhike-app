from __future__ import annotations

import os
import subprocess
import textwrap
from pathlib import Path

import pytest


ROOT = Path(__file__).resolve().parents[1]
PATCH = ROOT / "third_party" / "patches" / "nju-cli-v1.4.6-cache-dir.patch"
VERIFIER = ROOT / "desktop" / "verify_nju_cli_patch.py"
UPSTREAM_AUTH_TAIL = """
fn auth_cache_file() -> Result<PathBuf> {
    Ok(auth_cache_dir()?.join("auth.json"))
}

fn auth_cache_dir() -> Result<PathBuf> {
    let app_dirs = AppDirs::new(Some("nju-cli"), true)
        .ok_or_else(|| anyhow!("failed to resolve application cache directory"))?;
    let dir = app_dirs.cache_dir.join("auth");

    std::fs::create_dir_all(&dir).with_context(|| format!("failed to create {}", dir.display()))?;

    Ok(dir)
}
""".lstrip()


def test_patch_applies_to_v146_auth_cache_function(tmp_path):
    source = tmp_path / "crates" / "cli" / "src" / "auth.rs"
    source.parent.mkdir(parents=True)
    source.write_text(UPSTREAM_AUTH_TAIL, encoding="utf-8")

    check = subprocess.run(
        ["git", "apply", "--check", str(PATCH)],
        cwd=tmp_path,
        capture_output=True,
        text=True,
        check=False,
    )

    assert check.returncode == 0, check.stderr
    subprocess.run(["git", "apply", str(PATCH)], cwd=tmp_path, check=True)
    patched = source.read_text(encoding="utf-8")
    assert 'std::env::var_os("NJU_CLI_CACHE_DIR")' in patched
    assert "cache_dir.is_absolute()" in patched
    assert "NJU_CLI_CACHE_DIR must be an absolute path" in patched


def _make_fake_nju_cli(path: Path, body: str) -> Path:
    path.write_text(
        "#!/usr/bin/env python3\n"
        "import json\n"
        "import os\n"
        "import pathlib\n"
        "import sys\n"
        + textwrap.dedent(body),
        encoding="utf-8",
    )
    path.chmod(0o755)
    return path


def _verify(binary: Path) -> None:
    assert VERIFIER.is_file(), "nju-cli patch verifier is missing"
    from desktop.verify_nju_cli_patch import verify_nju_cli_patch

    verify_nju_cli_patch(binary)


@pytest.mark.skipif(os.name == "nt", reason="POSIX fixture executable")
def test_verifier_accepts_binary_that_honors_cache_override(tmp_path):
    binary = _make_fake_nju_cli(
        tmp_path / "nju-cli",
        """
        assert sys.argv[1:3] == ["login", "--castgc"]
        cache_key = "NJU" + "_CLI_CACHE_DIR"
        cache = pathlib.Path(os.environ[cache_key])
        if not cache.is_absolute():
            sys.exit(2)
        auth = cache / "auth" / "auth.json"
        auth.parent.mkdir(parents=True)
        auth.write_text(json.dumps({"castgc": sys.argv[3]}), encoding="utf-8")
        """,
    )

    _verify(binary)


@pytest.mark.skipif(os.name == "nt", reason="POSIX fixture executable")
def test_verifier_rejects_unpatched_binary(tmp_path):
    binary = _make_fake_nju_cli(tmp_path / "nju-cli", "sys.exit(0)\n")

    with pytest.raises(RuntimeError, match="expected auth.json is missing"):
        _verify(binary)


def test_verifier_normalizes_mixed_case_windows_runtime_keys():
    from desktop import verify_nju_cli_patch

    select = getattr(verify_nju_cli_patch, "_runtime_environment", None)
    assert callable(select)
    assert select(
        {
            "Path": r"C:\Windows\System32",
            "SystemRoot": r"C:\Windows",
            "ComSpec": r"C:\Windows\System32\cmd.exe",
        }
    ) == {
        "PATH": r"C:\Windows\System32",
        "SYSTEMROOT": r"C:\Windows",
        "COMSPEC": r"C:\Windows\System32\cmd.exe",
    }
