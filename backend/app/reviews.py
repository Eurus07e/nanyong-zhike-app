from __future__ import annotations

import hashlib
import json
import re
import unicodedata
from pathlib import Path
from typing import Any, Literal

from .database import Database


_REVIEW_FORMAT_VERSION = "2"
_REVIEW_CATEGORY_PREFIX = re.compile(r"^\s*关于课程特色(?:\s*[:：]\s*|\s*$)")
_EMPTY_REVIEW_TEXTS = frozenset(
    {"null", "none", "nan", "暂无评价", "暂无文字评价"}
)


def normalize(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, (list, tuple, set)):
        value = " ".join(str(item) for item in value if item is not None)
    return "".join(
        unicodedata.normalize("NFKC", str(value)).strip().casefold().split()
    )


def escape_like(value: str) -> str:
    """Escape SQLite LIKE metacharacters in a literal query fragment."""
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def _string(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, (dict, list)):
        return json.dumps(value, ensure_ascii=False)
    return str(value).strip()


def clean_review(value: Any) -> str:
    """Return displayable review text, removing an empty category label."""
    text = _REVIEW_CATEGORY_PREFIX.sub("", _string(value), count=1).strip()
    if text.casefold() in _EMPTY_REVIEW_TEXTS:
        return ""
    return text


class ReviewRepository:
    def __init__(self, database: Database, source: Path):
        self.database = database
        self.source = source

    def sync(self, *, force: bool = False) -> int:
        if not self.source.exists():
            return 0
        digest = hashlib.sha256(self.source.read_bytes()).hexdigest()
        if (
            not force
            and self.database.metadata("review_digest") == digest
            and self.database.metadata("review_format_version") == _REVIEW_FORMAT_VERSION
        ):
            return int(self.database.metadata("review_count") or "0")

        raw = json.loads(self.source.read_text(encoding="utf-8"))
        if not isinstance(raw, list):
            raise ValueError("review data must be a JSON array")

        rows: list[tuple[str, str, str, list[str], str, str]] = []
        seen: set[tuple[str, str, str]] = set()
        for item in raw:
            if not isinstance(item, dict):
                continue
            course = _string(item.get("课程名称"))
            teacher = _string(item.get("教师"))
            sources_raw = item.get("来源", [])
            if isinstance(sources_raw, list):
                sources = [_string(source) for source in sources_raw if _string(source)]
            else:
                sources = [_string(sources_raw)] if _string(sources_raw) else []
            reviews: list[str] = []
            for key, value in item.items():
                if not str(key).startswith("评价"):
                    continue
                review = clean_review(value)
                if review:
                    reviews.append(review)
            if not course and not teacher:
                continue
            if not reviews:
                continue
            for review in reviews:
                dedupe_key = (course, teacher, review)
                if dedupe_key in seen:
                    continue
                seen.add(dedupe_key)
                rows.append(
                    (course, teacher, review, sources, normalize(course), normalize(teacher))
                )

        self.database.replace_reviews(rows)
        self.database.set_metadata("review_digest", digest)
        self.database.set_metadata("review_count", str(len(rows)))
        self.database.set_metadata("review_format_version", _REVIEW_FORMAT_VERSION)
        return len(rows)

    def search(
        self,
        query: str,
        field: Literal["all", "course", "teacher"] = "all",
        limit: int = 50,
        offset: int = 0,
    ) -> dict[str, Any]:
        query_normalized = normalize(query)
        if not query_normalized:
            return {"items": [], "total": 0, "query": ""}

        columns = {
            "all": "(course_normalized LIKE ? ESCAPE '\\' OR teacher_normalized LIKE ? ESCAPE '\\')",
            "course": "course_normalized LIKE ? ESCAPE '\\'",
            "teacher": "teacher_normalized LIKE ? ESCAPE '\\'",
        }
        review_filter = """
            length(trim(review_text)) > 0
            AND lower(trim(review_text)) NOT IN ('null', 'none', 'nan', '暂无评价', '暂无文字评价')
            AND trim(review_text) NOT IN ('关于课程特色', '关于课程特色:', '关于课程特色：')
        """
        params: list[Any]
        combined = re.split(r"(?<!\+)\s*\+\s*(?!\+)", query.strip(), maxsplit=1) if field == "all" else []
        if len(combined) == 2 and all(part.strip() for part in combined):
            course_query, teacher_query = (normalize(part) for part in combined)
            where = "(course_normalized LIKE ? ESCAPE '\\' AND teacher_normalized LIKE ? ESCAPE '\\')"
            params = [f"%{escape_like(course_query)}%", f"%{escape_like(teacher_query)}%"]
        else:
            wildcard = f"%{escape_like(query_normalized)}%"
            params = [wildcard, wildcard] if field == "all" else [wildcard]
            where = columns[field]

        where = f"({review_filter}) AND ({where})"

        with self.database.connection() as connection:
            total = connection.execute(
                f"SELECT COUNT(*) AS count FROM reviews WHERE {where}", params
            ).fetchone()["count"]
            rows = connection.execute(
                f"""
                SELECT course_name, teacher, review_text, sources_json
                FROM reviews
                WHERE {where}
                ORDER BY
                  CASE WHEN course_normalized = ? OR teacher_normalized = ? THEN 0 ELSE 1 END,
                  course_name, teacher, id
                LIMIT ? OFFSET ?
                """,
                [*params, query_normalized, query_normalized, limit, offset],
            ).fetchall()

        items = [
            {
                "courseName": row["course_name"],
                "teacher": row["teacher"],
                "review": row["review_text"],
                "sources": json.loads(row["sources_json"]),
            }
            for row in rows
        ]
        return {
            "items": items,
            "total": int(total),
            "query": query.strip(),
        }
