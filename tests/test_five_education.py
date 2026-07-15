from __future__ import annotations

import pytest

from backend.app.five_education import (
    FiveEducationError,
    _allowed_url,
    normalize_five_education,
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


def test_only_cas_and_five_education_hosts_are_allowed() -> None:
    assert _allowed_url("https://authserver.nju.edu.cn/authserver/login")
    assert _allowed_url("https://ndwy.nju.edu.cn/dztml/wdwy")
    assert not _allowed_url("http://ndwy.nju.edu.cn/dztml/wdwy")
    assert not _allowed_url("https://ndwy.nju.edu.cn.evil.example/wdwy")
    assert not _allowed_url("https://example.com/")
