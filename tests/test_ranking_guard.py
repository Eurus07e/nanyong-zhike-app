from __future__ import annotations

import importlib
import shutil
import sys
from types import SimpleNamespace

import pytest
from fastapi import HTTPException


@pytest.mark.asyncio
async def test_hosted_ranking_guard_prevents_insecure_network_call(monkeypatch, tmp_path):
    monkeypatch.setenv("APP_SECRET", "test-secret-with-at-least-thirty-two-characters")
    monkeypatch.setenv("DATABASE_PATH", str(tmp_path / "test.db"))
    monkeypatch.setenv("NJU_CLI_BIN", shutil.which("true") or "/bin/true")
    monkeypatch.setenv("REVIEW_DATA_PATH", str(tmp_path / "reviews.json"))
    monkeypatch.setenv("FRONTEND_DIST", str(tmp_path / "frontend"))
    monkeypatch.setenv("ALLOW_INSECURE_EXCHANGE_SYSTEM", "false")

    from backend.app.config import get_settings

    get_settings.cache_clear()
    sys.modules.pop("backend.app.main", None)
    main = importlib.import_module("backend.app.main")
    called = False

    async def unexpected_call(_: str):
        nonlocal called
        called = True

    monkeypatch.setattr(main.exchange_system, "academic_ranking", unexpected_call)

    with pytest.raises(HTTPException) as caught:
        await main.academic_ranking(SimpleNamespace(castgc="must-not-leave-process"))

    assert caught.value.status_code == 503
    assert caught.value.detail == "学校排名服务暂不可安全连接"
    assert called is False
