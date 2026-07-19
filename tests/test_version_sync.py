import json
import tomllib
from html.parser import HTMLParser
from pathlib import Path

from backend.app.version import APP_USER_AGENT, APP_VERSION


ROOT = Path(__file__).resolve().parents[1]
INTERNAL_VERSION = "3.0.0"
PUBLIC_RELEASE_VERSION = "3.0"
PUBLIC_RELEASE_TAG = f"v{PUBLIC_RELEASE_VERSION}"


class ScriptSourceCollector(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.sources: list[str] = []

    def handle_starttag(
        self, tag: str, attrs: list[tuple[str, str | None]]
    ) -> None:
        if tag != "script":
            return
        source = dict(attrs).get("src")
        if source:
            self.sources.append(source)


def test_v3_internal_release_version_is_synchronized() -> None:
    package = json.loads(
        (ROOT / "frontend" / "package.json").read_text(encoding="utf-8")
    )
    package_lock = json.loads(
        (ROOT / "frontend" / "package-lock.json").read_text(encoding="utf-8")
    )
    pyproject = tomllib.loads((ROOT / "pyproject.toml").read_text(encoding="utf-8"))
    usage = (ROOT / "desktop" / "使用说明.txt").read_text(encoding="utf-8")

    assert APP_VERSION == INTERNAL_VERSION
    assert package["version"] == APP_VERSION
    assert package_lock["version"] == APP_VERSION
    assert package_lock["packages"][""]["version"] == APP_VERSION
    assert pyproject["project"]["version"] == APP_VERSION
    assert usage.startswith(f"南雍知课 {PUBLIC_RELEASE_TAG} 使用说明")


def test_v3_desktop_release_metadata_maps_public_tag_to_semver() -> None:
    workflow = (ROOT / ".github" / "workflows" / "release.yml").read_text(
        encoding="utf-8"
    )
    spec = (ROOT / "desktop" / "nanyong_zhike.spec").read_text(encoding="utf-8")
    installer = (ROOT / "desktop" / "windows-installer.iss").read_text(
        encoding="utf-8"
    )
    smoke = (ROOT / "desktop" / "smoke_test_release.py").read_text(
        encoding="utf-8"
    )

    assert f'tags:\n      - "{PUBLIC_RELEASE_TAG}"' in workflow
    assert (
        f'& $compiler "/DAppVersion={INTERNAL_VERSION}" '
        '"desktop\\windows-installer.iss"'
    ) in workflow
    assert f'"CFBundleShortVersionString": "{INTERNAL_VERSION}"' in spec
    assert f'"CFBundleVersion": "{INTERNAL_VERSION}"' in spec
    assert f'#define AppVersion "{INTERNAL_VERSION}"' in installer
    assert f'"version": "{INTERNAL_VERSION}"' in smoke


def test_v3_static_preview_surfaces_use_public_release_label() -> None:
    public_version_surfaces = (
        ROOT / "docs" / "badges" / "download-latest.svg",
        ROOT / "docs" / "badges" / "release-download.svg",
        ROOT / "frontend" / "preview" / "index.html",
        ROOT / "frontend" / "src" / "preview-main.tsx",
        ROOT / "docs" / "index.html",
    )
    for surface in public_version_surfaces:
        source = surface.read_text(encoding="utf-8")
        assert PUBLIC_RELEASE_TAG in source, surface
        assert "v2.0.3" not in source, surface

    generator = (ROOT / "scripts" / "generate_preview_data.py").read_text(
        encoding="utf-8"
    )
    assert f'"version": "{INTERNAL_VERSION}"' in generator

    fixture = json.loads(
        (ROOT / "frontend" / "src" / "preview-data.json").read_text(
            encoding="utf-8"
        )
    )
    assert fixture["meta"]["version"] == INTERNAL_VERSION

    page = (ROOT / "docs" / "index.html").read_text(encoding="utf-8")
    parser = ScriptSourceCollector()
    parser.feed(page)
    generated_scripts = [
        source
        for source in parser.sources
        if source.startswith("./assets/") and source.endswith(".js")
    ]
    assert len(generated_scripts) == 1

    generated_bundle = ROOT / "docs" / generated_scripts[0]
    assert generated_bundle.is_file()
    bundle = generated_bundle.read_text(encoding="utf-8")
    assert PUBLIC_RELEASE_TAG in bundle
    assert "v2.0.3" not in bundle
    assert "增强校园接口刷新与旧快照兜底" in bundle
    assert "修正培养方案学分显示" in bundle
    assert "桌面发行收窄为 Windows 与 macOS" in bundle


def test_external_read_only_clients_identify_the_v3_release() -> None:
    notices = (ROOT / "backend" / "app" / "notices.py").read_text(encoding="utf-8")
    exchange = (ROOT / "backend" / "app" / "exchange_system.py").read_text(
        encoding="utf-8"
    )
    clients = [
        notices,
        exchange,
        (ROOT / "backend" / "app" / "five_education.py").read_text(encoding="utf-8"),
        (ROOT / "backend" / "app" / "second_classroom.py").read_text(encoding="utf-8"),
        (ROOT / "backend" / "app" / "student_profile.py").read_text(encoding="utf-8"),
    ]

    assert APP_USER_AGENT == f"NanyongZhike/{APP_VERSION} read-only"
    assert "from .version import APP_USER_AGENT" in notices
    assert "from .version import APP_USER_AGENT" in exchange
    assert '"User-Agent": APP_USER_AGENT' in notices
    assert '"User-Agent": APP_USER_AGENT' in exchange
    for source in clients:
        assert "from .version import APP_USER_AGENT" in source
        assert "NanyongZhike/0.1" not in source
        assert "NanyongZhike/1.2" not in source
        assert "NanyongZhike/2.0" not in source


def test_readme_identifies_v3_public_release_and_preserves_history() -> None:
    readme = (ROOT / "README.md").read_text(encoding="utf-8")

    assert f"本 README 对应南雍知课 {PUBLIC_RELEASE_TAG}。" in readme
    assert (
        "https://github.com/Eurus07e/nanyong-zhike-app/releases/tag/"
        f"{PUBLIC_RELEASE_TAG}"
    ) in readme
    assert f"发布工作流仅监听准确的 `{PUBLIC_RELEASE_TAG}` 标签" in readme
    assert f"内部版本号使用 `{INTERNAL_VERSION}`" in readme
    assert "AI 助手 Beta" not in readme
    assert "以下命令适用于 macOS；Windows PowerShell 命令见下方" in readme
    for patch_version in range(8):
        assert f"- `v1.1.{patch_version}`：" in readme
    assert (
        "- `v1.1.6`：Windows 冒烟测试显式关闭 SQLite 连接，"
        "开发环境优先解析插件缓存中的原生 nju-cli。"
    ) in readme
    assert (
        "- `v1.1.7`：固定并校验 Windows 安装器简体中文语言文件，"
        "在 CI 与发布构建前用真实 Inno Setup 提前验证安装脚本。"
    ) in readme
    assert "- `v2.0.0`：" in readme
    assert "- `v2.0.1`：" in readme
    assert "- `v2.0.2`：" in readme
    assert "- `v2.0.3`：" in readme
