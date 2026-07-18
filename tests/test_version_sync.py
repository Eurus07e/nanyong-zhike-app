import json
import tomllib
from html.parser import HTMLParser
from pathlib import Path

from backend.app.version import APP_VERSION


ROOT = Path(__file__).resolve().parents[1]
RELEASE_VERSION = "2.0.3"


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


def test_v2_0_3_release_version_is_synchronized() -> None:
    package = json.loads(
        (ROOT / "frontend" / "package.json").read_text(encoding="utf-8")
    )
    package_lock = json.loads(
        (ROOT / "frontend" / "package-lock.json").read_text(encoding="utf-8")
    )
    pyproject = tomllib.loads((ROOT / "pyproject.toml").read_text(encoding="utf-8"))
    usage = (ROOT / "desktop" / "使用说明.txt").read_text(encoding="utf-8")

    assert APP_VERSION == RELEASE_VERSION
    assert package["version"] == APP_VERSION
    assert package_lock["version"] == APP_VERSION
    assert package_lock["packages"][""]["version"] == APP_VERSION
    assert pyproject["project"]["version"] == APP_VERSION
    assert usage.startswith(f"南雍知课 v{APP_VERSION} 使用说明")


def test_v2_0_3_desktop_release_metadata_is_synchronized() -> None:
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

    assert f'tags:\n      - "v{RELEASE_VERSION}"' in workflow
    assert (
        f'& $compiler "/DAppVersion={RELEASE_VERSION}" '
        '"desktop\\windows-installer.iss"'
    ) in workflow
    assert f'"CFBundleShortVersionString": "{RELEASE_VERSION}"' in spec
    assert f'"CFBundleVersion": "{RELEASE_VERSION}"' in spec
    assert f'#define AppVersion "{RELEASE_VERSION}"' in installer
    assert f'"version": "{RELEASE_VERSION}"' in smoke


def test_v2_0_3_static_preview_surfaces_are_synchronized() -> None:
    version_surfaces = (
        ROOT / "docs" / "badges" / "download-latest.svg",
        ROOT / "docs" / "badges" / "release-download.svg",
        ROOT / "frontend" / "preview" / "index.html",
        ROOT / "frontend" / "src" / "preview-main.tsx",
        ROOT / "scripts" / "generate_preview_data.py",
        ROOT / "docs" / "index.html",
    )
    for surface in version_surfaces:
        source = surface.read_text(encoding="utf-8")
        assert RELEASE_VERSION in source, surface
        assert "v2.0.2" not in source, surface

    fixture = json.loads(
        (ROOT / "frontend" / "src" / "preview-data.json").read_text(
            encoding="utf-8"
        )
    )
    assert fixture["meta"]["version"] == RELEASE_VERSION

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
    assert RELEASE_VERSION in bundle
    assert "v2.0.2" not in bundle
    assert "完善十二节课表与异常课程兜底，并增强教务通知获取的稳定性。" in bundle


def test_readme_identifies_v2_0_3_as_current_release_and_preserves_history() -> None:
    readme = (ROOT / "README.md").read_text(encoding="utf-8")

    assert f"本 README 对应南雍知课 v{RELEASE_VERSION}。" in readme
    assert (
        "https://github.com/Eurus07e/nanyong-zhike-app/releases/tag/"
        f"v{RELEASE_VERSION}"
    ) in readme
    assert f"发布工作流仅监听准确的 `v{RELEASE_VERSION}` 标签" in readme
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
