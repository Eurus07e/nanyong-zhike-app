import json
import tomllib
from pathlib import Path

from backend.app.version import APP_VERSION


ROOT = Path(__file__).resolve().parents[1]


def test_v1_1_5_release_version_is_synchronized() -> None:
    package = json.loads(
        (ROOT / "frontend" / "package.json").read_text(encoding="utf-8")
    )
    pyproject = tomllib.loads((ROOT / "pyproject.toml").read_text(encoding="utf-8"))
    usage = (ROOT / "desktop" / "使用说明.txt").read_text(encoding="utf-8")

    assert APP_VERSION == "1.1.5"
    assert package["version"] == APP_VERSION
    assert pyproject["project"]["version"] == APP_VERSION
    assert usage.startswith("南雍知课 v1.1.5 使用说明")
