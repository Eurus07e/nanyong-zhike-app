from __future__ import annotations

import hashlib
import os
import sys
from pathlib import Path

from desktop import launcher, prepare_release


ROOT = Path(__file__).resolve().parents[1]


def test_launcher_forces_utf8_console_output(monkeypatch):
    class Stream:
        def __init__(self):
            self.options = None

        def reconfigure(self, **options):
            self.options = options

    stdout = Stream()
    stderr = Stream()
    monkeypatch.setattr(launcher.sys, "stdout", stdout)
    monkeypatch.setattr(launcher.sys, "stderr", stderr)

    launcher.configure_console_encoding()

    expected = {"encoding": "utf-8", "errors": "replace"}
    assert stdout.options == expected
    assert stderr.options == expected


def test_windows_launcher_uses_utf8_code_page():
    script = (ROOT / "desktop" / "launchers" / "启动南雍知课.cmd").read_text(
        encoding="utf-8"
    )

    assert "chcp 65001 >nul" in script


def test_secret_is_created_once_with_restricted_permissions(tmp_path):
    first = launcher.load_or_create_secret(tmp_path)
    second = launcher.load_or_create_secret(tmp_path)

    assert first == second
    assert len(first) >= 48
    if os.name != "nt":
        assert (tmp_path / ".app-secret").stat().st_mode & 0o077 == 0


def test_user_data_dir_supports_test_override(monkeypatch, tmp_path):
    target = tmp_path / "state"
    monkeypatch.setenv("NANYONG_ZHIKE_DATA_DIR", str(target))

    assert launcher.user_data_dir() == target.resolve()


def test_launcher_only_reuses_same_version_desktop_instance():
    compatible = getattr(launcher, "is_compatible_health", None)
    assert callable(compatible), "launcher must distinguish release and dev servers"

    expected = {
        "status": "ok",
        "service": "南雍知课",
        "version": "2.0.0",
        "deployment": "desktop",
    }
    assert compatible(expected) is True
    assert compatible({**expected, "deployment": "development"}) is False
    assert compatible({**expected, "version": "0.9.0"}) is False
    assert compatible({"status": "ok", "service": "南雍知课"}) is False


def test_launcher_respects_explicit_release_smoke_port(monkeypatch):
    monkeypatch.setenv("NANYONG_ZHIKE_PORT", "43127")
    monkeypatch.setattr(launcher, "is_nanyong_zhike_running", lambda port: False)

    assert launcher.select_port() == (43127, False)


def test_desktop_environment_enables_complete_local_feature_set(monkeypatch, tmp_path):
    resources = tmp_path / "resources"
    executable = resources / "bin" / ("nju-cli.exe" if os.name == "nt" else "nju-cli")
    executable.parent.mkdir(parents=True)
    executable.write_bytes(b"test")
    (resources / "frontend" / "dist").mkdir(parents=True)
    reviews = resources / "data" / "reviews" / "merged_data.json"
    reviews.parent.mkdir(parents=True)
    reviews.write_text("[]", encoding="utf-8")
    state = tmp_path / "state"

    monkeypatch.setenv("NANYONG_ZHIKE_DATA_DIR", str(state))
    monkeypatch.setattr(launcher, "resource_path", lambda *parts: resources.joinpath(*parts))

    assert launcher.configure_environment() == state
    assert os.environ["APP_ENV"] == "desktop"
    assert os.environ["COOKIE_SECURE"] == "false"
    assert os.environ["ALLOW_INSECURE_EXCHANGE_SYSTEM"] == "true"
    assert Path(os.environ["NJU_CLI_BIN"]) == executable
    assert Path(os.environ["DATABASE_PATH"]).parent == state


def test_desktop_bundle_excludes_local_user_state() -> None:
    spec = (ROOT / "desktop" / "nanyong_zhike.spec").read_text(encoding="utf-8")

    assert 'frontend" / "dist' in spec
    assert 'data" / "reviews" / "merged_data.json' in spec
    for private_path in (
        "nanyong.db",
        ".dev-secret",
        ".app-secret",
        'ROOT / ".env"',
        "localStorage",
    ):
        assert private_path not in spec


def test_release_builds_and_verifies_patched_nju_cli_from_pinned_source():
    workflow = (ROOT / ".github" / "workflows" / "release.yml").read_text(
        encoding="utf-8"
    )

    assert (
        "https://github.com/nju-cli/nju-cli/archive/refs/tags/v1.4.6.tar.gz"
        in workflow
    )
    assert "6d7f794e87b8c22a1f6b700899f0c03c08f37a57499cc5e7014f0a80031b141c" in workflow
    assert "python desktop/patch_nju_cli.py .release-tools/nju-cli-source" in workflow
    assert "git -C .release-tools/nju-cli-source apply" not in workflow
    assert 'grep -Fq \'std::env::var_os("NJU_CLI_CACHE_DIR")\'' in workflow
    assert "third_party/patches/nju-cli-v1.4.6-cache-dir.patch" in workflow
    assert "cargo build --locked --release -p cli" in workflow
    assert "CARGO_NET_GIT_FETCH_WITH_CLI" in workflow
    assert "desktop/verify_nju_cli_patch.py" in workflow
    assert "releases/download/v1.4.6" not in workflow
    assert "NJU_CLI_PATH=" in workflow
    assert 'tags:\n      - "v2.0.0"' in workflow
    assert "NJU_CLI_BIN: /bin/true" in workflow
    assert "console=False" in (ROOT / "desktop" / "nanyong_zhike.spec").read_text(
        encoding="utf-8"
    )
    assert "NanyongZhike-macos-arm64.dmg" in workflow
    assert "windows-installer.iss" in workflow
    assert "choco install" not in workflow
    assert "release-assets/*" in workflow
    assert "contents: read" in workflow
    assert workflow.count("persist-credentials: false") == 2
    assert "34e114876b0b11c390a56381ad16ebd13914f8d5" in workflow
    assert "a26af69be951a213d495a4c3e4e4022e16d87065" in workflow
    assert "49933ea5288caeca8642d1e84afbd3f7d6820020" in workflow
    assert "4be7066ada62dd38de10e7b70166bc74ed198c30" in workflow
    assert "ea165f8d65b6e75b540449e92b4886f43607fa02" in workflow
    assert "d3f86a106a0bac45b974a628896c90dbdf5c8093" in workflow
    publish = workflow[workflow.index("  publish:") :]
    assert "contents: write" in publish


def test_packaged_smoke_test_rechecks_nju_cli_cache_isolation():
    smoke_test = (ROOT / "desktop" / "smoke_test_release.py").read_text(
        encoding="utf-8"
    )

    assert "verify_nju_cli_patch(nju_cli)" in smoke_test


def test_packaged_smoke_test_passes_its_dynamic_port_to_launcher():
    smoke_test = (ROOT / "desktop" / "smoke_test_release.py").read_text(
        encoding="utf-8"
    )

    assert 'env["NANYONG_ZHIKE_PORT"] = str(port)' in smoke_test
    assert 'base_url = f"http://127.0.0.1:{port}"' in smoke_test


def test_prepare_release_bundles_upstream_source_and_cache_patch(
    monkeypatch, tmp_path
):
    distribution = tmp_path / "dist" / "NanyongZhike"
    distribution.mkdir(parents=True)
    (distribution / "NanyongZhike").write_bytes(b"desktop")
    launcher_path = tmp_path / "desktop" / "launchers" / "启动南雍知课.sh"
    launcher_path.parent.mkdir(parents=True)
    launcher_path.write_text("#!/bin/sh\n", encoding="utf-8")
    desktop_entry = tmp_path / "desktop" / "launchers" / "南雍知课.desktop"
    desktop_entry.write_text("[Desktop Entry]\n", encoding="utf-8")
    usage = tmp_path / "desktop" / "使用说明.txt"
    usage.write_text("usage", encoding="utf-8")
    for document in ("README.md", "LICENSE", "THIRD_PARTY_NOTICES.md", "SECURITY.md"):
        (tmp_path / document).write_text(document, encoding="utf-8")
    patch = (
        tmp_path
        / "third_party"
        / "patches"
        / "nju-cli-v1.4.6-cache-dir.patch"
    )
    patch.parent.mkdir(parents=True)
    patch.write_bytes(b"auditable cache patch")
    source = tmp_path / "nju-cli-v1.4.6-source.tar.gz"
    source.write_bytes(b"upstream source")

    monkeypatch.setattr(prepare_release, "ROOT", tmp_path)
    monkeypatch.setattr(
        sys,
        "argv",
        [
            "prepare_release.py",
            "--platform",
            "linux",
            "--arch",
            "x86_64",
            "--nju-source",
            str(source),
        ],
    )

    prepare_release.main()

    third_party = (
        tmp_path
        / "release"
        / "NanyongZhike-linux-x86_64"
        / "third-party-sources"
    )
    assert (third_party / "nju-cli-v1.4.6.tar.gz").read_bytes() == source.read_bytes()
    assert (third_party / patch.name).read_bytes() == patch.read_bytes()
    assert (third_party.parent / "南雍知课.desktop").is_file()


def test_launcher_uses_file_logging_when_no_console_is_available(
    monkeypatch, tmp_path
):
    monkeypatch.setattr(launcher.sys, "stdout", None)
    monkeypatch.setattr(launcher.sys, "stderr", None)

    log_path = launcher.configure_file_logging(tmp_path)

    print("launcher ready", flush=True)
    assert log_path.read_text(encoding="utf-8") == "launcher ready\n"


def test_frozen_launcher_always_writes_a_diagnostic_log(monkeypatch, tmp_path):
    class Stream:
        pass

    monkeypatch.setattr(launcher.sys, "frozen", True, raising=False)
    monkeypatch.setattr(launcher.sys, "stdout", Stream())
    monkeypatch.setattr(launcher.sys, "stderr", Stream())

    log_path = launcher.configure_file_logging(tmp_path)

    print("desktop launch", flush=True)
    assert log_path.read_text(encoding="utf-8") == "desktop launch\n"


def test_windows_installer_creates_native_shortcuts_without_a_terminal() -> None:
    installer = (ROOT / "desktop" / "windows-installer.iss").read_text(
        encoding="utf-8"
    )

    assert "PrivilegesRequired=lowest" in installer
    assert 'Name: "desktopicon"' in installer
    assert "NanyongZhike.exe" in installer
    assert "cmd.exe" not in installer


def test_windows_installer_uses_pinned_local_simplified_chinese_messages() -> None:
    installer = (ROOT / "desktop" / "windows-installer.iss").read_text(
        encoding="utf-8"
    )

    assert (
        '#define ChineseSimplifiedMessagesFile AddBackslash(SourcePath) + '
        '"Languages\\ChineseSimplified.isl"'
    ) in installer
    assert 'MessagesFile: "{#ChineseSimplifiedMessagesFile}"' in installer
    assert "compiler:Languages" not in installer
    assert '#ifndef AppOutputDir' in installer
    assert '#define AppOutputDir "..\\release"' in installer
    assert "OutputDir={#AppOutputDir}" in installer


def test_windows_installer_preflight_pins_and_verifies_translation() -> None:
    script_path = ROOT / "desktop" / "preflight_windows_installer.ps1"
    language_path = ROOT / "desktop" / "Languages" / "ChineseSimplified.isl"
    attributes = (ROOT / ".gitattributes").read_text(encoding="utf-8")
    assert script_path.is_file(), "shared Windows installer preflight must exist"
    assert language_path.is_file(), "pinned Simplified Chinese messages must be bundled"
    script = script_path.read_text(encoding="utf-8")
    language = language_path.read_bytes()

    expected_hash = "7d544b9bb1d142cfa11f2e5d3cc8abe2e55f8e066c5124e3772675aa236e1278"
    assert hashlib.sha256(language).hexdigest() == expected_hash
    assert b"Maintained by Zhenghan Yang" in language
    assert "desktop/Languages/ChineseSimplified.isl -text" in attributes
    assert expected_hash in script
    assert "desktop/Languages/ChineseSimplified.isl" not in script
    assert 'Join-Path $DesktopDirectory "Languages\\ChineseSimplified.isl"' in script
    assert "curl.exe" not in script
    assert "$LASTEXITCODE" in script
    assert "Get-FileHash" in script
    assert "SHA256" in script


def test_windows_installer_preflight_compiles_and_cleans_only_synthetic_outputs() -> None:
    script_path = ROOT / "desktop" / "preflight_windows_installer.ps1"
    assert script_path.is_file(), "shared Windows installer preflight must exist"
    script = script_path.read_text(encoding="utf-8")

    assert "$PSScriptRoot" in script
    assert 'Resolve-Path (Join-Path $PSScriptRoot "..")' in script
    assert "Inno Setup 6\\ISCC.exe" in script
    assert 'Join-Path $RepositoryRoot "dist\\NanyongZhike\\NanyongZhike.exe"' in script
    assert 'if (Test-Path -LiteralPath $PlaceholderDirectory)' in script
    assert "[byte[]](0)" in script
    assert "try {" in script
    assert "finally {" in script
    assert "& $Compiler" in script
    assert "/DAppVersion" not in script
    assert '"/DAppOutputDir=..\\release-preflight"' in script
    assert "$LASTEXITCODE" in script
    assert 'Join-Path $RepositoryRoot "release-preflight"' in script
    assert (
        'Join-Path $PreflightOutputDirectory '
        '"NanyongZhike-windows-x86_64-setup.exe"'
    ) in script
    assert "Test-Path -LiteralPath $SetupPath -PathType Leaf" in script
    first_cleanup = script.index(
        "Remove-Item -LiteralPath $PreflightOutputDirectory -Recurse -Force"
    )
    create_output = script.index(
        "New-Item -ItemType Directory -Path $PreflightOutputDirectory"
    )
    assert first_cleanup < create_output
    assert "Remove-Item -LiteralPath $PlaceholderDirectory -Recurse -Force" in script
    assert "Remove-Item -LiteralPath $PreflightOutputDirectory -Recurse -Force" in script
    assert 'Join-Path $RepositoryRoot "release\\NanyongZhike-windows-x86_64-setup.exe"' not in script
    assert "Remove-Item -LiteralPath $LanguageFile" not in script


def test_windows_workflows_run_shared_installer_preflight_early() -> None:
    ci = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
    release = (ROOT / ".github" / "workflows" / "release.yml").read_text(
        encoding="utf-8"
    )

    assert "  windows-installer-preflight:" in ci
    ci_preflight = ci[ci.index("  windows-installer-preflight:") :]
    assert "runs-on: windows-latest" in ci_preflight
    assert "desktop/preflight_windows_installer.ps1" in ci_preflight

    package = release[release.index("  package:") : release.index("  publish:")]
    checkout_index = package.index("actions/checkout@")
    preflight_index = package.index("desktop/preflight_windows_installer.ps1")
    toolchain_indices = (
        package.index("actions/setup-python@"),
        package.index("actions/setup-node@"),
        package.index("dtolnay/rust-toolchain@"),
    )
    assert checkout_index < preflight_index < min(toolchain_indices)
    preflight_step = package[package.rfind("- name:", 0, preflight_index) : preflight_index]
    assert "if: matrix.platform == 'windows'" in preflight_step
    assert "shell: pwsh" in preflight_step


def test_release_windows_installer_build_checks_exit_code_and_exact_output() -> None:
    workflow = (ROOT / ".github" / "workflows" / "release.yml").read_text(
        encoding="utf-8"
    )
    build_start = workflow.index("      - name: Build Windows installer")
    build_end = workflow.index("      - uses: actions/upload-artifact@", build_start)
    build_step = workflow[build_start:build_end]

    assert '& $compiler "/DAppVersion=2.0.0" "desktop\\windows-installer.iss"' in build_step
    assert "$LASTEXITCODE" in build_step
    assert (
        'Test-Path -LiteralPath "release\\NanyongZhike-windows-x86_64-setup.exe" '
        "-PathType Leaf"
    ) in build_step


def test_macos_spec_builds_a_windowed_application_bundle() -> None:
    spec = (ROOT / "desktop" / "nanyong_zhike.spec").read_text(encoding="utf-8")

    assert "console=False" in spec
    assert "BUNDLE(" in spec
    assert 'name="南雍知课.app"' in spec
    assert '"CFBundleShortVersionString": "2.0.0"' in spec

    workflow = (ROOT / ".github" / "workflows" / "release.yml").read_text(
        encoding="utf-8"
    )
    assert 'xattr -cr "dist/南雍知课.app"' in workflow
    assert 'codesign --verify --deep --strict "dist/南雍知课.app"' in workflow


def test_third_party_notice_documents_patched_nju_cli_source_build():
    notice = (ROOT / "THIRD_PARTY_NOTICES.md").read_text(encoding="utf-8")

    assert "NJU_CLI_CACHE_DIR" in notice
    assert "nju-cli-v1.4.6-cache-dir.patch" in notice
    assert "2026-07-14" in notice
    assert "从源码构建" in notice
    for filename in (
        "login-campus-1.jpg",
        "login-campus-2.jpg",
        "login-campus-3.jpg",
        "login-campus-4.jpg",
        "default-avatar.jpeg",
    ):
        assert filename in notice
    assert "项目维护者提供" in notice


def test_third_party_notice_documents_pinned_user_contributed_inno_translation():
    notice = (ROOT / "THIRD_PARTY_NOTICES.md").read_text(encoding="utf-8")

    assert "jrsoftware/issrc" in notice
    assert "cfdf48923178df4b4f040e038b423aa555a61ffc" in notice
    assert "Files/Languages/Unofficial/ChineseSimplified.isl" in notice
    assert "7d544b9bb1d142cfa11f2e5d3cc8abe2e55f8e066c5124e3772675aa236e1278" in notice
    assert "用户贡献翻译" in notice
    assert "Zhenghan Yang" in notice
    assert "官方翻译" not in notice


def test_readme_describes_patched_source_build_without_calling_it_official_binary():
    readme = (ROOT / "README.md").read_text(encoding="utf-8")

    assert "应用公开的缓存隔离补丁" in readme
    assert "源码与补丁" in readme
    assert "内置官方 `nju-cli`" not in readme
