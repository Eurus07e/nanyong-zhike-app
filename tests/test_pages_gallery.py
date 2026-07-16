import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_pages_preview_is_built_from_the_real_frontend() -> None:
    preview_main = (ROOT / "frontend" / "src" / "preview-main.tsx").read_text(
        encoding="utf-8"
    )
    preview_config = (ROOT / "frontend" / "vite.preview.config.ts").read_text(
        encoding="utf-8"
    )

    assert "import App from './App'" in preview_main
    assert "installPreviewApi()" in preview_main
    assert "Rick Sanchez" in preview_main
    assert "outDir: resolve(directory, '../docs')" in preview_config


def test_pages_preview_build_uses_relative_static_assets() -> None:
    page = ROOT / "docs" / "index.html"

    assert page.exists()
    source = page.read_text(encoding="utf-8")
    assert "<title>南雍知课 v2.0.1 · 交互预览</title>" in source
    assert '<div id="root"></div>' in source
    assert 'src="./assets/' in source
    assert 'href="./assets/' in source


def test_preview_fixture_masks_identity_fields() -> None:
    fixture = json.loads(
        (ROOT / "frontend" / "src" / "preview-data.json").read_text(
            encoding="utf-8"
        )
    )
    profile = fixture["entries"]["/api/second-classroom/profile"]["value"]

    assert fixture["meta"]["sessionUsername"] == "Rick Sanchez"
    assert profile["studentId"] == "已隐藏"
    assert profile["name"] == "Rick Sanchez"
    assert profile["email"] == "已隐藏"


def test_readme_links_to_the_interactive_pages_preview() -> None:
    readme = (ROOT / "README.md").read_text(encoding="utf-8")
    preview = readme.split("## 界面预览", 1)[1].split("## 下载和启动", 1)[0]

    assert "https://eurus07e.github.io/nanyong-zhike-app/" in preview
    assert "docs/screenshots/interactive-preview.png" in preview
    assert "docs/badges/online-preview.svg" in preview
    assert "docs/badges/download-latest.svg" in preview
    assert 'alt="在线预览"' in preview
    assert "Rick Sanchez" in preview
