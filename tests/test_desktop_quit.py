from fastapi.testclient import TestClient

from backend.app import main


def test_desktop_quit_is_disabled_outside_desktop(monkeypatch):
    monkeypatch.setattr(main.settings, "app_env", "development")
    client = TestClient(main.app, client=("127.0.0.1", 50000))

    response = client.post("/api/desktop/quit")

    assert response.status_code == 404


def test_desktop_quit_schedules_exit_only_for_local_desktop(monkeypatch):
    called = []
    monkeypatch.setattr(main.settings, "app_env", "desktop")
    monkeypatch.setattr(main, "_schedule_desktop_exit", lambda: called.append(True))
    client = TestClient(main.app, client=("127.0.0.1", 50000))

    response = client.post("/api/desktop/quit")

    assert response.status_code == 200
    assert response.json() == {"ok": True}
    assert called == [True]
