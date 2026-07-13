import asyncio

import pytest

from backend.app.nju_cli import NjuCli, _ProcessLimiter


def test_child_environment_uses_allowlist(monkeypatch, tmp_path):
    monkeypatch.setenv("APP_SECRET", "must-not-reach-child")
    monkeypatch.setenv("NJU_PASSWORD", "must-not-reach-child")
    monkeypatch.setenv("UNRELATED_PRIVATE_VALUE", "must-not-reach-child")
    monkeypatch.setenv("HTTPS_PROXY", "http://proxy.example")

    env = NjuCli._base_env(tmp_path)

    assert "APP_SECRET" not in env
    assert "NJU_PASSWORD" not in env
    assert "UNRELATED_PRIVATE_VALUE" not in env
    assert env["HTTPS_PROXY"] == "http://proxy.example"
    assert env["XDG_CACHE_HOME"] == str(tmp_path)
    assert env["RUST_BACKTRACE"] == "0"


@pytest.mark.asyncio
async def test_process_limiter_caps_global_and_per_owner_concurrency():
    limiter = _ProcessLimiter(global_limit=3, owner_limit=2)
    active_global = 0
    max_global = 0
    active_by_owner: dict[str, int] = {}
    max_by_owner: dict[str, int] = {}

    async def work(owner: str):
        nonlocal active_global, max_global
        async with limiter.slot(owner):
            active_global += 1
            active_by_owner[owner] = active_by_owner.get(owner, 0) + 1
            max_global = max(max_global, active_global)
            max_by_owner[owner] = max(
                max_by_owner.get(owner, 0), active_by_owner[owner]
            )
            await asyncio.sleep(0.01)
            active_by_owner[owner] -= 1
            active_global -= 1

    await asyncio.gather(
        *(work(owner) for owner in ["a", "a", "a", "a", "b", "b", "c", "c"])
    )

    assert max_global <= 3
    assert all(value <= 2 for value in max_by_owner.values())
    assert limiter.owner_gates == {}
