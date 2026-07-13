from __future__ import annotations

import asyncio
import json
from dataclasses import dataclass
from http.cookiejar import CookieJar
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urlparse
from urllib.request import HTTPCookieProcessor, Request, build_opener

from .exchange_system import _castgc_cookie


APP_ID = "4770397878132218"
ROLE_ID = "20230211151103310"
APP_SHOW_URL = "https://ehall.nju.edu.cn/appShow"
APP_INDEX_URL = "https://ehallapp.nju.edu.cn/jwapp/sys/wdkb/*default/index.do"
CHANGE_ROLE_URL = (
    "https://ehallapp.nju.edu.cn/jwapp/sys/funauthapp/api/"
    f"changeAppRole/wdkb/{ROLE_ID}.do"
)
STUDENT_INFO_URL = (
    "https://ehallapp.nju.edu.cn/jwapp/sys/wdkb/modules/xskcb/cxxsjbxx.do"
)
STUDENT_INFO_ACTION = "cxxsjbxx"
AUTH_HOST = "authserver.nju.edu.cn"
EHALL_APP_HOST = "ehallapp.nju.edu.cn"


class StudentProfileError(RuntimeError):
    def __init__(self, message: str, *, auth_expired: bool = False):
        super().__init__(message)
        self.auth_expired = auth_expired


@dataclass(frozen=True)
class StudentProfile:
    grade: str
    major_code: str
    major_name: str
    department_code: str
    department_name: str

    def as_dict(self) -> dict[str, str]:
        return {
            "grade": self.grade,
            "majorCode": self.major_code,
            "majorName": self.major_name,
            "departmentCode": self.department_code,
            "departmentName": self.department_name,
        }


def parse_student_profile(payload: Any) -> StudentProfile:
    try:
        if payload.get("code") != "0":
            raise ValueError("eHall returned a non-zero application code")
        rows = payload["datas"][STUDENT_INFO_ACTION]["rows"]
        row = rows[0]
        grade = _text(row.get("XZNJ")) or _text(row.get("XZNJMC"))
        major_code = _text(row.get("ZYDM"))
        major_name = _text(row.get("ZYMC"))
        department_code = _text(row.get("YXDM"))
        department_name = _text(row.get("YXDM_DISPLAY")) or _text(row.get("YXMC"))
    except (AttributeError, IndexError, KeyError, TypeError, ValueError) as error:
        raise StudentProfileError("eHall 暂未返回本人专业信息") from error

    if not grade or not major_code or not major_name:
        raise StudentProfileError("eHall 暂未返回本人专业信息")
    return StudentProfile(
        grade=grade,
        major_code=major_code,
        major_name=major_name,
        department_code=department_code,
        department_name=department_name,
    )


class StudentProfileClient:
    async def profile(self, castgc: str) -> dict[str, str]:
        return await asyncio.to_thread(self._profile, castgc)

    def _profile(self, castgc: str) -> dict[str, str]:
        cookies = CookieJar()
        cookies.set_cookie(_castgc_cookie(castgc))
        opener = build_opener(HTTPCookieProcessor(cookies))

        try:
            self._read(
                opener,
                f"{APP_SHOW_URL}?{urlencode({'appId': APP_ID})}",
            )
            self._read(
                opener,
                f"{APP_INDEX_URL}?{urlencode({'_roleId': ROLE_ID, 'EMAP_LANG': 'zh', 'THEME': ''})}",
            )
            self._read(opener, CHANGE_ROLE_URL)
            payload = json.loads(self._read(opener, STUDENT_INFO_URL, post=True))
        except StudentProfileError:
            raise
        except (HTTPError, URLError, TimeoutError, json.JSONDecodeError) as error:
            raise StudentProfileError("eHall 专业信息暂时不可用，请稍后重试") from error

        return parse_student_profile(payload).as_dict()

    @staticmethod
    def _read(opener: Any, url: str, *, post: bool = False) -> str:
        request = Request(
            url,
            data=b"" if post else None,
            headers={"User-Agent": "NanyongZhike/0.1 read-only"},
        )
        with opener.open(request, timeout=20) as response:
            final = urlparse(response.geturl())
            if final.hostname == AUTH_HOST:
                raise StudentProfileError(
                    "统一身份认证登录已过期，请重新登录", auth_expired=True
                )
            if final.hostname not in {"ehall.nju.edu.cn", EHALL_APP_HOST}:
                raise StudentProfileError("eHall 返回了异常地址，请稍后重试")
            charset = response.headers.get_content_charset() or "utf-8"
            return response.read().decode(charset, errors="replace")


def _text(value: Any) -> str:
    return str(value).strip() if value is not None else ""
