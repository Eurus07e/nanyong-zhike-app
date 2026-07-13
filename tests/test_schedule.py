from backend.app.schedule import merge_schedule_details


def test_merge_schedule_details_uses_course_classification_not_selection_source():
    payload = {
        "rows": [
            {
                "KCH": "76070280",
                "JXBID": "2026202717607028001",
                "KCM": None,
                "XKLY_DISPLAY": "自选",
            }
        ]
    }
    details = [
        {
            "schedule": {
                "KCH": "76070280",
                "JXBID": "2026202717607028001",
            },
            "course_info": {
                "rows": [
                    {
                        "KCM": "数据结构与算法",
                        "KCFLDM": "23",
                        "KCFLDM_DISPLAY": "学科基础课程",
                        "KCFL1": "1",
                        "KCFL1_DISPLAY": "理论类课程",
                    }
                ]
            },
        }
    ]

    merged = merge_schedule_details(payload, details)

    assert merged["rows"][0]["KCM"] == "数据结构与算法"
    assert merged["rows"][0]["KCFLDM_DISPLAY"] == "学科基础课程"
    assert merged["rows"][0]["KCFL1_DISPLAY"] == "理论类课程"
    assert merged["rows"][0]["XKLY_DISPLAY"] == "自选"


def test_merge_schedule_details_leaves_schedule_usable_when_details_are_missing():
    payload = {"rows": [{"KCH": "00042050", "XKLY_DISPLAY": "自选"}]}

    assert merge_schedule_details(payload, []) == payload
