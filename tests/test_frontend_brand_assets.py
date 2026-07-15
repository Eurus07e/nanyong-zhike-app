from __future__ import annotations

import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "frontend" / "public"


def test_safari_icon_links_are_explicit_and_versioned() -> None:
    html = (ROOT / "frontend" / "index.html").read_text(encoding="utf-8")

    assert re.search(
        r'<link rel="icon" href="/favicon-32x32\.png\?v=\d+" '
        r'type="image/png" sizes="32x32"\s*/?>',
        html,
    )
    assert re.search(
        r'<link rel="apple-touch-icon" href="/apple-touch-icon\.png\?v=\d+"\s*/?>',
        html,
    )
    assert re.search(
        r'<link rel="apple-touch-icon-precomposed" '
        r'href="/apple-touch-icon-precomposed\.png\?v=\d+"\s*/?>',
        html,
    )
    assert re.search(
        r'<link rel="shortcut icon" href="/favicon\.ico\?v=\d+"\s*/?>',
        html,
    )


def test_brand_icons_exist_and_are_not_the_account_avatar() -> None:
    avatar = (PUBLIC / "default-avatar.jpeg").read_bytes()

    for filename in (
        "favicon-32x32.png",
        "favicon.ico",
        "apple-touch-icon.png",
        "apple-touch-icon-precomposed.png",
    ):
        icon = (PUBLIC / filename).read_bytes()
        assert len(icon) > 100
        assert icon != avatar

    assert (PUBLIC / "favicon-32x32.png").read_bytes().startswith(
        b"\x89PNG\r\n\x1a\n"
    )
    assert (PUBLIC / "favicon.ico").read_bytes().startswith(b"\x00\x00\x01\x00")


def test_docker_build_context_keeps_all_random_login_images() -> None:
    ignored = {
        line.strip()
        for line in (ROOT / ".dockerignore").read_text(encoding="utf-8").splitlines()
    }

    for number in range(1, 5):
        assert f"frontend/public/login-campus-{number}.jpg" not in ignored


def test_optional_support_qr_is_a_real_jpeg_asset() -> None:
    qr = PUBLIC / "alipay-support.jpeg"
    assert qr.is_file()
    assert qr.read_bytes().startswith(b"\xff\xd8\xff")
    assert len(qr.read_bytes()) > 1000
