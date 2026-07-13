import pytest

from backend.app.config import Settings


def test_production_rejects_example_app_secret():
    settings = Settings(
        app_env="production",
        app_secret="replace-with-at-least-32-random-characters",
    )

    with pytest.raises(RuntimeError, match="placeholder"):
        settings.resolved_secret()


def test_production_accepts_non_placeholder_app_secret():
    settings = Settings(
        app_env="production",
        app_secret="M9e2GqQv_b4Q1cF8zS7yUdP6nL3xW0rK5aTj",
    )

    assert settings.resolved_secret() == "M9e2GqQv_b4Q1cF8zS7yUdP6nL3xW0rK5aTj"
