from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from backend.app import main
from backend.app.config import Settings
from backend.app.database import Database
from backend.app.five_education import (
    FiveEducationError,
    _activity_menu_scope,
    _allowed_url,
    _current_period,
    normalize_five_education,
    normalize_five_education_activities,
)
from backend.app.portal_snapshots import PortalSnapshotRepository
from backend.app.security import Session


@pytest.fixture
def isolated_portal_snapshots(monkeypatch, tmp_path) -> None:
    database = Database(tmp_path / "portal-snapshots.db")
    database.initialize()
    settings = Settings(
        _env_file=None,
        app_secret="test-secret-for-five-education-routes",
        database_path=database.path,
    )
    monkeypatch.setattr(
        main, "portal_snapshots", PortalSnapshotRepository(database, settings)
    )


def sample_payload() -> dict:
    return {
        "code": 0,
        "msg": "ok",
        "data": None,
        "extend": {
            "dbzt": {
                "xh": "251000000",
                "dhds": 2,
                "zhds": 3,
                "thds": 4,
                "mhds": 1,
                "lhds": 5,
                "zsc": 8.5,
                "mks": "1,3,5",
                "mksc": '{"1": 12, "2": 3, "3": 0}',
            },
            "njhds": {"nj": "2025", "d": 150, "z": 210, "t": 300, "m": 90, "l": 240},
            "njrs": {"2025": 100},
            "mkList": [
                {"id": 1, "mc": "基础实践", "dbsc": 10, "fdsc": 12},
                {"id": 2, "mc": "学科实践", "dbsc": 5, "fdsc": 8},
                {"id": 3, "mc": "综合实践", "dbsc": 0, "fdsc": 99},
            ],
            "dpj": 1,
            "ypj": 3,
            "wdhdMe": "opaque-private-marker",
            "wysm": "规则说明",
        },
    }


def test_normalizes_real_five_education_shape_without_private_fields() -> None:
    result = normalize_five_education(sample_payload(), fetched_at=1_700_000_000)

    assert result["fetchedAt"] == 1_700_000_000
    assert result["summary"] == {
        "totalActivities": 15,
        "laborTotalDuration": 8.5,
        "evaluatedCount": 3,
        "evaluationTotal": 4,
        "evaluationRate": 0.75,
    }
    assert result["dimensions"] == [
        {"key": "moral", "label": "德", "personalCount": 2, "cohortAverage": 1.5},
        {"key": "intellectual", "label": "智", "personalCount": 3, "cohortAverage": 2.1},
        {"key": "physical", "label": "体", "personalCount": 4, "cohortAverage": 3.0},
        {"key": "aesthetic", "label": "美", "personalCount": 1, "cohortAverage": 0.9},
        {"key": "labor", "label": "劳", "personalCount": 5, "cohortAverage": 2.4},
    ]
    assert result["growthModules"] == [
        {
            "id": 1,
            "name": "基础实践",
            "actualDuration": 12.0,
            "requiredDuration": 10.0,
            "displayTargetDuration": 12.0,
            "achieved": True,
        },
        {
            "id": 2,
            "name": "学科实践",
            "actualDuration": 3.0,
            "requiredDuration": 5.0,
            "displayTargetDuration": 8.0,
            "achieved": False,
        },
        {
            "id": 3,
            "name": "综合实践",
            "actualDuration": 0.0,
            "requiredDuration": 0.0,
            "displayTargetDuration": None,
            "achieved": False,
        },
    ]
    assert result["interests"] == [
        {"key": "moral", "label": "德"},
        {"key": "physical", "label": "体"},
        {"key": "labor", "label": "劳"},
    ]
    assert result["source"] == {
        "systemName": "南京大学五育系统",
        "systemUrl": "https://ndwy.nju.edu.cn/dztml/#/",
    }
    serialized = repr(result)
    assert "251000000" not in serialized
    assert "opaque-private-marker" not in serialized
    assert "规则说明" not in serialized


def test_positive_duration_achieves_a_zero_threshold_module() -> None:
    payload = sample_payload()
    payload["extend"]["dbzt"]["mksc"] = '{"1": 12, "2": 3, "3": 0.5}'

    result = normalize_five_education(payload, fetched_at=1)

    assert result["growthModules"][2]["achieved"] is True


def test_all_zero_data_stays_zero_instead_of_missing_or_nan() -> None:
    payload = sample_payload()
    payload["extend"]["dbzt"].update(
        {"dhds": 0, "zhds": 0, "thds": 0, "mhds": 0, "lhds": 0, "zsc": 0, "mksc": "{}", "mks": ""}
    )
    payload["extend"].update({"dpj": 0, "ypj": 0, "njhds": {"nj": "2025"}, "njrs": {"2025": 0}})

    result = normalize_five_education(payload, fetched_at=1)

    assert result["summary"]["totalActivities"] == 0
    assert result["summary"]["evaluationRate"] == 0
    assert all(item["cohortAverage"] == 0 for item in result["dimensions"])
    assert result["interests"] == []


def test_malformed_module_duration_json_is_rejected() -> None:
    payload = sample_payload()
    payload["extend"]["dbzt"]["mksc"] = "not-json"

    with pytest.raises(FiveEducationError, match="数据格式异常"):
        normalize_five_education(payload, fetched_at=1)


def sample_activity_payload() -> dict:
    return {
        "code": 0,
        "count": 1,
        "data": [
            {
                "id": 631295,
                "name": "学生姓名不得返回",
                "xhgh": "251000000",
                "wxh": "private-wechat",
                "bmsj": "2026-05-17T06:53:08.000+00:00",
                "shzt": {"label": "审核通过", "value": 1},
                "sfpj": True,
                "pj": None,
                "xm": {
                    "mc": "护航添彩·安质课堂",
                    "ywmc": "Supermarket Store Assistant",
                    "wylx": "劳/基础实践-后勤劳动实践",
                    "ssmk": "基础实践",
                    "ldlx": {"mc": "服务性劳动"},
                    "fzrdw": {"mc": "后勤服务集团"},
                    "fzrxm": "卢老师",
                    "lxfs": "13800000000",
                    "mail": "contact@example.edu.cn",
                    "bmks": "2026-05-17T04:00:00.000+00:00",
                    "bmjs": "2026-05-29T12:00:00.000+00:00",
                    "xmks": "2026-05-30T05:00:00.000+00:00",
                    "xmjs": "2026-05-30T07:00:00.000+00:00",
                    "hddd": "鼓楼校区南大教超",
                    "bmfs": {"label": "启用报名无需审核，人满即止"},
                    "zmrs": 7,
                    "nrjj": "活动介绍",
                    "khbf": "考核办法",
                    "sc": 2,
                },
                "rd": {
                    "rdzt": {"label": "已提交"},
                    "cj": "优秀",
                    "lrsc": 2,
                    "rdsc": 2,
                    "js": "参加",
                    "xhgh": "251000000",
                },
            }
        ],
    }


def test_normalizes_detailed_activities_with_explicit_privacy_whitelist() -> None:
    result = normalize_five_education_activities(
        sample_activity_payload(),
        academic_year="2025-2026",
        term="2",
        fetched_at=1_700_000_000,
    )

    assert result["academicYear"] == "2025-2026"
    assert result["term"] == "2"
    assert result["termLabel"] == "第二学期"
    assert result["count"] == 1
    assert result["items"][0] == {
        "id": "631295",
        "title": "护航添彩·安质课堂",
        "englishTitle": "Supermarket Store Assistant",
        "category": "劳/基础实践-后勤劳动实践",
        "module": "基础实践",
        "laborType": "服务性劳动",
        "organizer": "后勤服务集团",
        "coordinator": "卢老师",
        "contactPhone": "13800000000",
        "contactEmail": "contact@example.edu.cn",
        "registrationStart": "2026-05-17T04:00:00.000+00:00",
        "registrationEnd": "2026-05-29T12:00:00.000+00:00",
        "registeredAt": "2026-05-17T06:53:08.000+00:00",
        "activityStart": "2026-05-30T05:00:00.000+00:00",
        "activityEnd": "2026-05-30T07:00:00.000+00:00",
        "location": "鼓楼校区南大教超",
        "registrationMethod": "启用报名无需审核，人满即止",
        "capacity": 7,
        "description": "活动介绍",
        "assessmentMethod": "考核办法",
        "reviewStatus": "未评价",
        "approvalStatus": "审核通过",
        "recognitionStatus": "已提交",
        "participationStatus": "参加",
        "grade": "优秀",
        "activityDuration": 2.0,
        "recordedDuration": 2.0,
        "recognizedDuration": 2.0,
    }
    serialized = repr(result)
    assert "学生姓名不得返回" not in serialized
    assert "251000000" not in serialized
    assert "private-wechat" not in serialized
    assert "CASTGC" not in serialized


def test_activity_normalizer_handles_missing_values_without_invalid_dates() -> None:
    payload = {"code": 0, "count": 1, "data": [{"id": 1, "xm": {"mc": "活动"}}]}

    result = normalize_five_education_activities(
        payload, academic_year="2025-2026", term="1", fetched_at=1
    )

    assert result["termLabel"] == "第一学期"
    assert result["items"][0]["activityStart"] is None
    assert result["items"][0]["grade"] == ""


def test_discovers_my_activity_menu_scope_without_returning_profile_data() -> None:
    encoded = "eyJtZW51cyI6W3siaWQiOiJtZW51LTEiLCJtb2R1bGVFbnRpdHlOYW1lIjoicnQucnQtd2RoZCJ9XX0="

    assert _activity_menu_scope(encoded) == "bWVudS0x"


def test_extracts_current_period_from_authenticated_activity_page() -> None:
    html = '<script>var dqxn = "2025-2026"; var dqxq = "2";</script>'

    assert _current_period(html) == ("2025-2026", "2")


def test_activity_route_uses_current_encrypted_session(
    monkeypatch, isolated_portal_snapshots
) -> None:
    expected = normalize_five_education_activities(
        sample_activity_payload(), academic_year="2025-2026", term="2", fetched_at=1
    )

    async def activities(castgc: str) -> dict:
        assert castgc == "CASTGC-test"
        return expected

    monkeypatch.setattr(main.five_education, "activities", activities)
    main.app.dependency_overrides[main.current_session] = lambda: Session(
        username="alice", castgc="CASTGC-test", expires_at=9_999_999_999
    )
    client = TestClient(main.app)
    try:
        response = client.get("/api/five-education/activities?refresh=true")
        assert response.status_code == 200
        assert response.json() == expected
    finally:
        main.app.dependency_overrides.clear()


@pytest.mark.parametrize(
    ("error", "status_code"),
    [
        (FiveEducationError("统一身份认证登录已过期", auth_expired=True), 401),
        (FiveEducationError("南京大学五育系统暂时不可用"), 502),
    ],
)
def test_activity_route_maps_safe_upstream_errors(monkeypatch, error, status_code) -> None:
    async def activities(_: str) -> dict:
        raise error

    monkeypatch.setattr(main.five_education, "activities", activities)
    main.app.dependency_overrides[main.current_session] = lambda: Session(
        username="alice", castgc="CASTGC-test", expires_at=9_999_999_999
    )
    client = TestClient(main.app)
    try:
        response = client.get("/api/five-education/activities?refresh=true")
        assert response.status_code == status_code
        assert response.json() == {"detail": str(error)}
    finally:
        main.app.dependency_overrides.clear()


def test_only_cas_and_five_education_hosts_are_allowed() -> None:
    assert _allowed_url("https://authserver.nju.edu.cn/authserver/login")
    assert _allowed_url("https://ndwy.nju.edu.cn/dztml/wdwy")
    assert not _allowed_url("http://ndwy.nju.edu.cn/dztml/wdwy")
    assert not _allowed_url("https://ndwy.nju.edu.cn.evil.example/wdwy")
    assert not _allowed_url("https://example.com/")


def test_overview_route_uses_current_encrypted_session(
    monkeypatch, isolated_portal_snapshots
) -> None:
    expected = normalize_five_education(sample_payload(), fetched_at=1)

    async def overview(castgc: str) -> dict:
        assert castgc == "CASTGC-test"
        return expected

    monkeypatch.setattr(main.five_education, "overview", overview)
    main.app.dependency_overrides[main.current_session] = lambda: Session(
        username="alice", castgc="CASTGC-test", expires_at=9_999_999_999
    )
    client = TestClient(main.app)
    try:
        response = client.get("/api/five-education/overview?refresh=true")
        assert response.status_code == 200
        assert response.json() == expected
    finally:
        main.app.dependency_overrides.clear()


@pytest.mark.parametrize(
    ("path", "cache_key", "client_method"),
    [
        ("/api/five-education/overview?refresh=true", "/api/five-education/overview", "overview"),
        ("/api/five-education/activities?refresh=true", "/api/five-education/activities", "activities"),
    ],
)
def test_five_education_routes_use_encrypted_portal_snapshots(
    monkeypatch, path, cache_key, client_method
) -> None:
    expected = {"source": cache_key}
    calls: list[tuple[str, bool]] = []

    async def cache_first(session, next_key, refresh, loader):
        assert session.username == "alice"
        calls.append((next_key, refresh))
        return expected

    async def should_not_load(_):
        raise AssertionError("portal_cache_first should control the loader")

    monkeypatch.setattr(main, "portal_cache_first", cache_first)
    monkeypatch.setattr(main.five_education, client_method, should_not_load)
    main.app.dependency_overrides[main.current_session] = lambda: Session(
        username="alice", castgc="CASTGC-test", expires_at=9_999_999_999
    )
    client = TestClient(main.app)
    try:
        response = client.get(path)
        assert response.status_code == 200
        assert response.json() == expected
        assert calls == [(cache_key, True)]
    finally:
        main.app.dependency_overrides.clear()


@pytest.mark.parametrize(
    ("error", "status_code"),
    [
        (FiveEducationError("统一身份认证登录已过期", auth_expired=True), 401),
        (FiveEducationError("南京大学五育系统暂时不可用"), 502),
    ],
)
def test_overview_route_maps_safe_upstream_errors(monkeypatch, error, status_code) -> None:
    async def overview(_: str) -> dict:
        raise error

    monkeypatch.setattr(main.five_education, "overview", overview)
    main.app.dependency_overrides[main.current_session] = lambda: Session(
        username="alice", castgc="CASTGC-test", expires_at=9_999_999_999
    )
    client = TestClient(main.app)
    try:
        response = client.get("/api/five-education/overview?refresh=true")
        assert response.status_code == status_code
        assert response.json() == {"detail": str(error)}
    finally:
        main.app.dependency_overrides.clear()
