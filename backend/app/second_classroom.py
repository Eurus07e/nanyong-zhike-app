from __future__ import annotations

import asyncio
import base64
import json
import re
import time
from html import unescape
from http.cookiejar import Cookie, CookieJar
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlencode, urlparse
from urllib.request import HTTPRedirectHandler, HTTPCookieProcessor, Request, build_opener

from .version import APP_USER_AGENT


AUTH_HOST = "authserver.nju.edu.cn"
YOUTH_HOST = "youth.nju.edu.cn"
SERVICE_URL = "https://youth.nju.edu.cn/tw"
SYSTEM_URL = "https://youth.nju.edu.cn/tw/"
CTX_URL = "https://youth.nju.edu.cn/tw/ctx"
PROFILE_URL = "https://youth.nju.edu.cn/tw/zyz/grzl/create"


class SecondClassroomError(RuntimeError):
    def __init__(self, message: str, *, auth_expired: bool = False):
        super().__init__(message)
        self.auth_expired = auth_expired


class _YouthRedirect(HTTPRedirectHandler):
    def redirect_request(self, req: Any, fp: Any, code: int, msg: str, headers: Any, newurl: str) -> Any:
        parsed = urlparse(newurl)
        allowed = parsed.hostname in {AUTH_HOST, YOUTH_HOST} and parsed.scheme in {"http", "https"}
        if not allowed or (parsed.hostname == AUTH_HOST and parsed.scheme != "https"):
            raise SecondClassroomError("第二课堂返回了不安全的跳转地址")
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def _value_after_label(page: str, label: str) -> str:
    match = re.search(
        rf'<label[^>]*>\s*{re.escape(label)}\s*</label>.*?<input[^>]*\bvalue=["\']([^"\']*)',
        page,
        re.S | re.I,
    )
    return unescape(match.group(1)).strip() if match else ""


def _select_value(page: str, name: str, variable: str) -> str:
    select = re.search(rf'<select[^>]*name=["\']{re.escape(name)}["\'][^>]*>(.*?)</select>', page, re.S | re.I)
    selected = re.search(rf'\bvar\s+{re.escape(variable)}\s*=\s*["\']([^"\']*)', page)
    if not select or not selected:
        return ""
    options = {
        unescape(value).strip(): unescape(re.sub(r'<[^>]+>', '', label)).strip()
        for value, label in re.findall(r'<option[^>]*value=["\']([^"\']*)["\'][^>]*>(.*?)</option>', select.group(1), re.S | re.I)
    }
    values = [options.get(item.strip(), item.strip()) for item in selected.group(1).split(',') if item.strip()]
    return "、".join(values)


def parse_second_classroom_profile(page: str, *, fetched_at: int) -> dict[str, Any]:
    def integer(label: str) -> int:
        try:
            return max(0, int(float(_value_after_label(page, label) or 0)))
        except ValueError:
            return 0

    try:
        service_hours = max(0, float(_value_after_label(page, "服务总时长") or 0))
    except ValueError:
        service_hours = 0
    result = {
        "fetchedAt": int(fetched_at),
        "studentId": _value_after_label(page, "学号"),
        "name": _value_after_label(page, "姓名"),
        "grade": _value_after_label(page, "年级"),
        "college": _value_after_label(page, "学院"),
        "email": _value_after_label(page, "电子邮箱"),
        "englishLevel": _select_value(page, "data.yyjn", "yyjn"),
        "otherLanguages": _select_value(page, "data.qtyy", "qtyy"),
        "otherSkills": _select_value(page, "data.qtjn", "qtjn"),
        "activityCount": integer("参加活动数"),
        "serviceHours": service_hours,
        "dishonestyCount": integer("不诚信记录"),
        "sourceUrl": SYSTEM_URL,
    }
    if not result["studentId"]:
        raise SecondClassroomError("第二课堂暂未返回个人资料")
    return result


def _profile_scope(encoded_context: str) -> str:
    try:
        context = json.loads(base64.b64decode(encoded_context + "===").decode("utf-8"))
        menu = next(item for item in context["menus"] if item.get("moduleEntityName") == "dekt.zyz-grzl")
        menu_id = str(menu["id"])
    except (ValueError, KeyError, StopIteration, TypeError, json.JSONDecodeError) as error:
        raise SecondClassroomError("第二课堂暂未返回个人资料入口") from error
    return base64.b64encode(menu_id.encode()).decode().rstrip("=")


class SecondClassroomClient:
    async def profile(self, castgc: str) -> dict[str, Any]:
        return await asyncio.to_thread(self._profile, castgc)

    def _profile(self, castgc: str) -> dict[str, Any]:
        jar = CookieJar()
        jar.set_cookie(_castgc_cookie(castgc))
        opener = build_opener(_YouthRedirect(), HTTPCookieProcessor(jar))
        login_url = f"https://{AUTH_HOST}/authserver/login?service={quote(SERVICE_URL, safe='')}"
        try:
            final = opener.open(Request(login_url, headers={"User-Agent": APP_USER_AGENT}), timeout=20)
            final.read()
            if urlparse(final.geturl()).hostname == AUTH_HOST:
                raise SecondClassroomError("统一身份认证登录已过期，请重新登录", auth_expired=True)
            context_request = Request(CTX_URL, data=b"", method="POST", headers={"Accept": "application/json", "User-Agent": APP_USER_AGENT})
            context = json.loads(opener.open(context_request, timeout=20).read().decode("utf-8"))
            scope = _profile_scope(context["data"])
            page_url = f"{PROFILE_URL}?{urlencode({'.me': scope})}"
            page = opener.open(Request(page_url, headers={"User-Agent": APP_USER_AGENT}), timeout=20).read().decode("utf-8", "replace")
        except SecondClassroomError:
            raise
        except (HTTPError, URLError, TimeoutError, KeyError, json.JSONDecodeError) as error:
            raise SecondClassroomError("南京大学第二课堂暂时不可用，请稍后重试") from error
        return parse_second_classroom_profile(page, fetched_at=int(time.time()))


def _castgc_cookie(castgc: str) -> Cookie:
    return Cookie(0, "CASTGC", castgc, None, False, AUTH_HOST, True, False, "/authserver", True, True, None, True, None, None, {"HttpOnly": None}, False)
