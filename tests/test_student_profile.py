import pytest

from backend.app.student_profile import StudentProfileError, parse_student_profile


def test_parse_student_profile_returns_only_academic_matching_fields():
    payload = {
        "code": "0",
        "datas": {
            "cxxsjbxx": {
                "rows": [
                    {
                        "XH": "251880000",
                        "XM": "测试学生",
                        "XZNJ": "2025",
                        "ZYDM": "761",
                        "ZYMC": "智能科学与技术",
                        "YXDM": "400760",
                        "YXDM_DISPLAY": "智能科学与技术学院",
                    }
                ]
            }
        },
    }

    assert parse_student_profile(payload).as_dict() == {
        "grade": "2025",
        "majorCode": "761",
        "majorName": "智能科学与技术",
        "departmentCode": "400760",
        "departmentName": "智能科学与技术学院",
    }


def test_parse_student_profile_uses_department_name_fallback():
    payload = {
        "code": "0",
        "datas": {
            "cxxsjbxx": {
                "rows": [
                    {
                        "XZNJMC": "2024",
                        "ZYDM": "100",
                        "ZYMC": "测试专业",
                        "YXDM": "200",
                        "YXMC": "测试院系",
                    }
                ]
            }
        },
    }

    profile = parse_student_profile(payload)

    assert profile.grade == "2024"
    assert profile.department_name == "测试院系"


def test_parse_student_profile_rejects_missing_major():
    with pytest.raises(StudentProfileError, match="本人专业信息"):
        parse_student_profile(
            {"code": "0", "datas": {"cxxsjbxx": {"rows": [{"XZNJ": "2025"}]}}}
        )
