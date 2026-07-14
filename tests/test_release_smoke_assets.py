from __future__ import annotations

import pytest

from desktop import smoke_test_release


def asset_validator():
    validator = getattr(smoke_test_release, "validate_frontend_asset", None)
    assert callable(validator), "release smoke test must validate asset contents"
    return validator


def test_release_smoke_decodes_child_output_portably() -> None:
    options = getattr(smoke_test_release, "_TEXT_PROCESS_OPTIONS", None)

    assert options == {
        "text": True,
        "encoding": "utf-8",
        "errors": "replace",
    }


def test_release_smoke_rejects_spa_fallback_for_missing_image() -> None:
    with pytest.raises(RuntimeError, match="invalid frontend asset"):
        asset_validator()("login-campus-2.jpg", b"<!doctype html><html></html>", "text/html")


@pytest.mark.parametrize(
    ("filename", "payload", "content_type"),
    [
        ("login-campus-1.jpg", b"\xff\xd8\xff" + b"x" * 128, "image/jpeg"),
        ("favicon-32x32.png", b"\x89PNG\r\n\x1a\n" + b"x" * 128, "image/png"),
        ("favicon.ico", b"\x00\x00\x01\x00" + b"x" * 128, "image/x-icon"),
        ("favicon.svg", b'<svg xmlns="http://www.w3.org/2000/svg">' + b"x" * 128, "image/svg+xml"),
    ],
)
def test_release_smoke_accepts_expected_asset_formats(
    filename: str, payload: bytes, content_type: str
) -> None:
    asset_validator()(filename, payload, content_type)
