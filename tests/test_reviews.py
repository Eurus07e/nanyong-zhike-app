import hashlib
import json

from backend.app.database import Database
from backend.app.reviews import ReviewRepository, normalize


def test_normalize_is_literal_and_unicode_safe():
    assert normalize("  微积分Ⅱ（第一层次） ") == "微积分ii(第一层次)"
    assert normalize(" C++ ") == "c++"
    assert normalize("[") == "["


def test_combined_course_and_teacher_search_does_not_break_cpp(tmp_path):
    source = tmp_path / "reviews.json"
    source.write_text(
        json.dumps(
            [
                {"课程名称": "高等数学", "教师": "张老师", "评价1": "讲解清晰"},
                {"课程名称": "高等数学", "教师": "李老师", "评价1": "作业较多"},
                {"课程名称": "C++程序设计", "教师": "王老师", "评价1": "内容扎实"},
                {"课程名称": "100%实习", "教师": "下划线_老师", "评价1": "按比例计分"},
                {"课程名称": "路径\\课程", "教师": "反斜杠老师", "评价1": "路径清晰"},
            ],
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )
    database = Database(tmp_path / "reviews.db")
    database.initialize()
    repository = ReviewRepository(database, source)
    repository.sync()

    combined = repository.search("高等数学 + 张老师", "all")
    combined_without_spaces = repository.search("高等数学+张老师", "all")
    cpp = repository.search("C++", "all")

    assert combined["total"] == 1
    assert combined["items"][0]["teacher"] == "张老师"
    assert combined_without_spaces["total"] == 1
    assert combined_without_spaces["items"][0]["teacher"] == "张老师"
    assert cpp["total"] == 1

    percent = repository.search("%", "all")
    underscore = repository.search("_", "all")
    backslash = repository.search("\\", "all")
    assert percent["total"] == 1
    assert percent["items"][0]["courseName"] == "100%实习"
    assert underscore["total"] == 1
    assert underscore["items"][0]["teacher"] == "下划线_老师"
    assert backslash["total"] == 1
    assert backslash["items"][0]["courseName"] == "路径\\课程"


def test_search_supports_stable_offset_pagination(tmp_path):
    source = tmp_path / "reviews.json"
    source.write_text(
        json.dumps([{"课程名称": "测试课程", "教师": "教师", "评价1": str(index)} for index in range(55)], ensure_ascii=False),
        encoding="utf-8",
    )
    database = Database(tmp_path / "reviews.db")
    database.initialize()
    repository = ReviewRepository(database, source)
    repository.sync()

    first = repository.search("测试课程", limit=50)
    second = repository.search("测试课程", limit=50, offset=50)

    assert first["total"] == 55
    assert len(first["items"]) == 50
    assert len(second["items"]) == 5


def test_sync_omits_empty_and_category_only_reviews(tmp_path):
    source = tmp_path / "reviews.json"
    source.write_text(
        json.dumps(
            [
                {"课程名称": "没有评价", "教师": "教师", "评价1": None},
                {"课程名称": "空白评价", "教师": "教师", "评价1": "   "},
                {"课程名称": "标签评价", "教师": "教师", "评价1": "关于课程特色："},
                {"课程名称": "有效评价", "教师": "教师", "评价1": "关于课程特色：讲解清晰"},
                {"课程名称": "有效评价", "教师": "教师", "评价2": "讲解清晰"},
                {"课程名称": "字面空值", "教师": "教师", "评价1": "null"},
            ],
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )
    database = Database(tmp_path / "reviews.db")
    database.initialize()
    repository = ReviewRepository(database, source)

    assert repository.sync() == 1
    result = repository.search("教师")

    assert result["total"] == 1
    assert len(result["items"]) == 1
    assert result["items"][0]["courseName"] == "有效评价"
    assert result["items"][0]["review"] == "讲解清晰"


def test_sync_rebuilds_legacy_rows_when_format_version_is_missing(tmp_path):
    source = tmp_path / "reviews.json"
    source.write_text(
        json.dumps(
            [{"课程名称": "有效评价", "教师": "教师", "评价1": "讲解清晰"}],
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )
    database = Database(tmp_path / "reviews.db")
    database.initialize()
    repository = ReviewRepository(database, source)

    # Simulate the database generated before empty reviews were filtered.
    database.replace_reviews(
        [("旧课程", "教师", "", [], "旧课程", "教师")]
    )
    digest = hashlib.sha256(source.read_bytes()).hexdigest()
    database.set_metadata("review_digest", digest)
    database.set_metadata("review_count", "1")

    assert repository.sync() == 1
    result = repository.search("教师")
    assert result["total"] == 1
    assert result["items"][0]["courseName"] == "有效评价"


def test_search_excludes_legacy_empty_rows_from_total_and_pages(tmp_path):
    source = tmp_path / "reviews.json"
    source.write_text(
        json.dumps(
            [{"课程名称": "有效评价", "教师": "教师", "评价1": "讲解清晰"}],
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )
    database = Database(tmp_path / "reviews.db")
    database.initialize()
    repository = ReviewRepository(database, source)
    repository.sync()
    with database.connection() as connection:
        connection.executemany(
            """
            INSERT INTO reviews(
                course_name, teacher, review_text, sources_json,
                course_normalized, teacher_normalized
            ) VALUES (?, ?, ?, ?, ?, ?)
            """,
            [
                ("旧课程", "教师", "", "[]", "旧课程", "教师"),
                ("旧课程", "教师", "null", "[]", "旧课程", "教师"),
                ("旧课程", "教师", "关于课程特色：", "[]", "旧课程", "教师"),
            ],
        )

    result = repository.search("教师", limit=1)
    next_page = repository.search("教师", limit=1, offset=1)
    assert result["total"] == 1
    assert len(result["items"]) == 1
    assert next_page["total"] == 1
    assert next_page["items"] == []
