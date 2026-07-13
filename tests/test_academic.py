from backend.app.academic import summarize_grades


def test_summarize_grades_counts_only_passed_credits():
    summary = summarize_grades(
        {
            "rows": [
                {"XF": "3", "SFJG": "1", "KCXZDM_DISPLAY": "通修", "ZCJ": "90", "XNXQDM": "2025-1"},
                {"XF": "2", "SFJG": "0", "KCXZDM_DISPLAY": "通修", "ZCJ": "40", "XNXQDM": "2025-1"},
                {"XF": ".25", "SFJG_DISPLAY": "是", "KCXZDM_DISPLAY": "通识", "ZCJ": "合格", "XNXQDM": "2025-2"},
            ]
        }
    )
    assert summary["earnedCredits"] == 3.25
    assert summary["passedCourses"] == 2
    assert summary["weightedAverage"] == 70.0
    assert summary["gpa"] == 3.5
    assert summary["degreeGpa"] is None
    assert summary["categories"] == [
        {"name": "通修", "credits": 3.0},
        {"name": "通识", "credits": 0.25},
    ]
    assert summary["graduationCategories"] == [
        {"name": "通识通修课程", "credits": 3.25},
        {"name": "学科专业课程", "credits": 0.0},
        {"name": "多元发展课程", "credits": 0.0},
        {"name": "毕业论文/设计", "credits": 0.0},
    ]
