from __future__ import annotations

import asyncio
import base64
import json
import re
import time
from http.cookiejar import Cookie, CookieJar
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlencode, urlparse
from urllib.request import HTTPRedirectHandler, HTTPCookieProcessor, Request, build_opener

from .version import APP_USER_AGENT


AUTH_HOST = "authserver.nju.edu.cn"
FIVE_EDUCATION_HOST = "ndwy.nju.edu.cn"
SERVICE_URL = "https://ndwy.nju.edu.cn/dztml/"
SYSTEM_URL = "https://ndwy.nju.edu.cn/dztml/#/"
OVERVIEW_URL = "https://ndwy.nju.edu.cn/dztml/wdwy"
CONTEXT_URL = "https://ndwy.nju.edu.cn/dztml/ctx"
ACTIVITY_PAGE_URL = "https://ndwy.nju.edu.cn/dztml/rt/wdhd"
ACTIVITY_LIST_URL = "https://ndwy.nju.edu.cn/dztml/rt/wdhd/ajaxList"
ALLOWED_HOSTS = frozenset({AUTH_HOST, FIVE_EDUCATION_HOST})

DIMENSIONS = (
    ("1", "moral", "德", "dhds", "d"),
    ("2", "intellectual", "智", "zhds", "z"),
    ("3", "physical", "体", "thds", "t"),
    ("4", "aesthetic", "美", "mhds", "m"),
    ("5", "labor", "劳", "lhds", "l"),
)


class FiveEducationError(RuntimeError):
    def __init__(self, message: str, *, auth_expired: bool = False):
        super().__init__(message)
        self.auth_expired = auth_expired


def _connection_error(error: HTTPError | URLError | TimeoutError) -> FiveEducationError:
    return FiveEducationError("我的五育暂时不可用，请连接校园网或vpn并稍后重试")


def _allowed_url(url: str) -> bool:
    parsed = urlparse(url)
    return parsed.scheme == "https" and parsed.hostname in ALLOWED_HOSTS


class _AllowlistedRedirect(HTTPRedirectHandler):
    def redirect_request(
        self,
        req: Any,
        fp: Any,
        code: int,
        msg: str,
        headers: Any,
        newurl: str,
    ) -> Any:
        if not _allowed_url(newurl):
            raise FiveEducationError("五育系统返回了不安全的跳转地址")
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def _number(value: Any, *, default: float = 0) -> float:
    if value is None or value == "":
        return default
    if isinstance(value, bool):
        return float(value)
    try:
        return float(value)
    except (TypeError, ValueError) as error:
        raise FiveEducationError("五育系统返回的数据格式异常") from error


def _count(value: Any) -> int:
    return max(0, int(_number(value)))


def _duration(value: Any) -> float:
    return max(0, _number(value))


def _text(value: Any) -> str:
    return str(value or "").strip()


def _optional_text(value: Any) -> str | None:
    text = _text(value)
    return text or None


def _display_text(value: Any) -> str:
    text = _text(value)
    return "" if text.casefold() in {"/", "-", "null", "none"} else text


def _label(value: Any) -> str:
    if isinstance(value, dict):
        return _text(value.get("label") or value.get("mc"))
    return _text(value)


def normalize_five_education_activities(
    payload: dict[str, Any], *, academic_year: str, term: str, fetched_at: int
) -> dict[str, Any]:
    if payload.get("code") != 0 or not isinstance(payload.get("data"), list):
        raise FiveEducationError("五育系统暂未返回个人活动数据")

    items: list[dict[str, Any]] = []
    for raw in payload["data"]:
        if not isinstance(raw, dict) or not isinstance(raw.get("xm"), dict):
            raise FiveEducationError("五育系统返回的数据格式异常")
        project = raw["xm"]
        recognition = raw.get("rd") if isinstance(raw.get("rd"), dict) else {}
        recognized_project = (
            recognition.get("xm") if isinstance(recognition.get("xm"), dict) else {}
        )
        organizer = project.get("fzrdw") if isinstance(project.get("fzrdw"), dict) else {}
        labor_type = project.get("ldlx") if isinstance(project.get("ldlx"), dict) else {}
        items.append(
            {
                "id": _text(raw.get("id")),
                "title": _text(project.get("mc")) or "未命名活动",
                "englishTitle": _text(project.get("ywmc")),
                "category": _display_text(project.get("wylx")),
                "module": _display_text(project.get("ssmk")),
                "laborType": _text(labor_type.get("mc")),
                "organizer": _text(organizer.get("mc")),
                "coordinator": _text(project.get("fzrxm")),
                "contactPhone": _text(project.get("lxfs")),
                "contactEmail": _text(project.get("mail")),
                "registrationStart": _optional_text(project.get("bmks")),
                "registrationEnd": _optional_text(project.get("bmjs")),
                "registeredAt": _optional_text(raw.get("bmsj")),
                "activityStart": _optional_text(project.get("xmks")),
                "activityEnd": _optional_text(project.get("xmjs")),
                "location": _text(project.get("hddd")),
                "registrationMethod": _label(project.get("bmfs")),
                "capacity": _count(project.get("zmrs")),
                "description": _text(project.get("nrjj")).strip('"\n '),
                "assessmentMethod": _text(project.get("khbf")),
                "reviewStatus": (
                    "已评价"
                    if raw.get("pj") not in (None, "")
                    or recognition.get("pj") not in (None, "")
                    else "未评价"
                ),
                "approvalStatus": _label(raw.get("shzt")),
                "recognitionStatus": (
                    _label(recognition.get("rdzt"))
                    or _label(recognized_project.get("rdzt"))
                ),
                "participationStatus": _text(recognition.get("js")),
                "grade": _text(recognition.get("cj")),
                "activityDuration": _duration(project.get("sc")),
                "recordedDuration": _duration(recognition.get("lrsc")),
                "recognizedDuration": _duration(recognition.get("rdsc")),
            }
        )

    term_labels = {"1": "第一学期", "2": "第二学期", "3": "暑期学校"}
    return {
        "fetchedAt": int(fetched_at),
        "academicYear": _text(academic_year),
        "term": _text(term),
        "termLabel": term_labels.get(_text(term), _text(term) or "当前学期"),
        "count": len(items),
        "items": items,
    }


def _activity_menu_scope(encoded_context: str) -> str:
    try:
        decoded = base64.b64decode(encoded_context + "===").decode("utf-8")
        context = json.loads(decoded)
    except (ValueError, UnicodeDecodeError, json.JSONDecodeError) as error:
        raise FiveEducationError("五育系统返回的菜单数据格式异常") from error
    menus = context.get("menus") if isinstance(context, dict) else None
    if not isinstance(menus, list):
        raise FiveEducationError("五育系统返回的菜单数据格式异常")
    menu = next(
        (
            item
            for item in menus
            if isinstance(item, dict)
            and item.get("moduleEntityName") == "rt.rt-wdhd"
        ),
        None,
    )
    menu_id = _text(menu.get("id")) if menu else ""
    if not menu_id:
        raise FiveEducationError("五育系统暂未开放“我的活动”数据")
    return base64.b64encode(menu_id.encode("utf-8")).decode("ascii").rstrip("=")


def _current_period(page: str) -> tuple[str, str]:
    year_match = re.search(r'\bvar\s+dqxn\s*=\s*["\']([^"\']+)', page)
    term_match = re.search(r'\bvar\s+dqxq\s*=\s*["\']([^"\']+)', page)
    if not year_match or not term_match:
        raise FiveEducationError("五育系统暂未返回当前学年学期")
    return year_match.group(1).strip(), term_match.group(1).strip()


def _module_durations(raw: Any) -> dict[str, Any]:
    if raw in (None, ""):
        return {}
    if isinstance(raw, dict):
        return raw
    if not isinstance(raw, str):
        raise FiveEducationError("五育系统返回的数据格式异常")
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as error:
        raise FiveEducationError("五育系统返回的数据格式异常") from error
    if not isinstance(parsed, dict):
        raise FiveEducationError("五育系统返回的数据格式异常")
    return parsed


def normalize_five_education(
    payload: dict[str, Any], *, fetched_at: int
) -> dict[str, Any]:
    if payload.get("code") != 0 or not isinstance(payload.get("extend"), dict):
        raise FiveEducationError("五育系统暂未返回个人总览数据")

    extend = payload["extend"]
    profile = extend.get("dbzt")
    if not isinstance(profile, dict):
        raise FiveEducationError("五育系统返回的数据格式异常")

    cohort_totals = extend.get("njhds") if isinstance(extend.get("njhds"), dict) else {}
    cohort_sizes = extend.get("njrs") if isinstance(extend.get("njrs"), dict) else {}
    cohort_year = str(cohort_totals.get("nj") or "")
    cohort_size = _count(cohort_sizes.get(cohort_year))

    dimensions: list[dict[str, Any]] = []
    interest_definitions: dict[str, dict[str, str]] = {}
    for interest_id, key, label, personal_field, cohort_field in DIMENSIONS:
        personal_count = _count(profile.get(personal_field))
        cohort_total = _number(cohort_totals.get(cohort_field))
        cohort_average = round(cohort_total / cohort_size, 1) if cohort_size else 0
        dimensions.append(
            {
                "key": key,
                "label": label,
                "personalCount": personal_count,
                "cohortAverage": cohort_average,
            }
        )
        interest_definitions[interest_id] = {"key": key, "label": label}

    durations = _module_durations(profile.get("mksc"))
    raw_modules = extend.get("mkList")
    if raw_modules is None:
        raw_modules = []
    if not isinstance(raw_modules, list):
        raise FiveEducationError("五育系统返回的数据格式异常")

    growth_modules: list[dict[str, Any]] = []
    labor_breakdown: list[dict[str, Any]] = []
    for raw_module in raw_modules:
        if not isinstance(raw_module, dict):
            raise FiveEducationError("五育系统返回的数据格式异常")
        module_id = _count(raw_module.get("id"))
        name = str(raw_module.get("mc") or "未命名模块").strip()
        actual_duration = _duration(
            durations.get(str(module_id), durations.get(module_id, 0))
        )
        required_duration = _duration(raw_module.get("dbsc"))
        raw_display_target = _duration(raw_module.get("fdsc"))
        display_target = raw_display_target if raw_display_target < 99 else None
        achieved = actual_duration > 0 and actual_duration >= required_duration
        growth_modules.append(
            {
                "id": module_id,
                "name": name,
                "actualDuration": actual_duration,
                "requiredDuration": required_duration,
                "displayTargetDuration": display_target,
                "achieved": achieved,
            }
        )
        labor_breakdown.append(
            {
                "moduleId": module_id,
                "name": name,
                "actualDuration": actual_duration,
                "displayTargetDuration": display_target,
            }
        )

    selected_interest_ids = {
        item.strip()
        for item in str(profile.get("mks") or "").split(",")
        if item.strip()
    }
    interests = [
        interest_definitions[interest_id]
        for interest_id, *_ in DIMENSIONS
        if interest_id in selected_interest_ids
    ]

    evaluated_count = _count(extend.get("ypj"))
    evaluation_total = evaluated_count + _count(extend.get("dpj"))
    evaluation_rate = (
        round(evaluated_count / evaluation_total, 4) if evaluation_total else 0
    )
    total_activities = sum(item["personalCount"] for item in dimensions)

    return {
        "fetchedAt": int(fetched_at),
        "dimensions": dimensions,
        "summary": {
            "totalActivities": total_activities,
            "laborTotalDuration": _duration(profile.get("zsc")),
            "evaluatedCount": evaluated_count,
            "evaluationTotal": evaluation_total,
            "evaluationRate": evaluation_rate,
        },
        "growthModules": growth_modules,
        "laborBreakdown": labor_breakdown,
        "interests": interests,
        "source": {
            "systemName": "南京大学五育系统",
            "systemUrl": SYSTEM_URL,
        },
    }


class FiveEducationClient:
    async def overview(self, castgc: str) -> dict[str, Any]:
        return await asyncio.to_thread(self._overview, castgc)

    async def activities(self, castgc: str) -> dict[str, Any]:
        return await asyncio.to_thread(self._activities, castgc)

    def _overview(self, castgc: str) -> dict[str, Any]:
        opener = self._authenticated_opener(castgc)
        try:
            body, overview_final_url = self._read(
                opener, OVERVIEW_URL, accept="application/json"
            )
            overview_final = urlparse(overview_final_url)
            if overview_final.hostname == AUTH_HOST:
                raise FiveEducationError(
                    "统一身份认证登录已过期，请重新登录", auth_expired=True
                )
            if overview_final.hostname != FIVE_EDUCATION_HOST:
                raise FiveEducationError("五育系统返回了异常数据地址")
            payload = json.loads(body)
        except FiveEducationError:
            raise
        except json.JSONDecodeError as error:
            raise FiveEducationError("五育系统返回了无法解析的数据") from error
        except (HTTPError, URLError, TimeoutError) as error:
            raise _connection_error(error) from error

        if not isinstance(payload, dict):
            raise FiveEducationError("五育系统返回的数据格式异常")
        return normalize_five_education(payload, fetched_at=int(time.time()))

    def _activities(self, castgc: str) -> dict[str, Any]:
        opener = self._authenticated_opener(castgc)
        try:
            context_body, _ = self._read(
                opener,
                CONTEXT_URL,
                accept="application/json",
                method="POST",
                data=b"",
            )
            context_payload = json.loads(context_body)
            if context_payload.get("code") != 0 or not isinstance(context_payload.get("data"), str):
                raise FiveEducationError("五育系统暂未返回活动菜单")
            menu_scope = _activity_menu_scope(context_payload["data"])
            page_url = f"{ACTIVITY_PAGE_URL}?{urlencode({'.me': menu_scope})}"
            page, _ = self._read(opener, page_url)
            academic_year, term = _current_period(page)
            query = urlencode(
                {
                    "state": "all",
                    "xn": academic_year,
                    "xnxq": term,
                    "page": 1,
                    "limit": 500,
                    ".me": menu_scope,
                }
            )
            list_body, list_final_url = self._read(
                opener,
                f"{ACTIVITY_LIST_URL}?{query}",
                accept="application/json",
            )
            if urlparse(list_final_url).hostname == AUTH_HOST:
                raise FiveEducationError(
                    "统一身份认证登录已过期，请重新登录", auth_expired=True
                )
            payload = json.loads(list_body)
        except FiveEducationError:
            raise
        except json.JSONDecodeError as error:
            raise FiveEducationError("五育系统返回了无法解析的活动数据") from error
        except (HTTPError, URLError, TimeoutError) as error:
            raise _connection_error(error) from error
        if not isinstance(payload, dict):
            raise FiveEducationError("五育系统返回的活动数据格式异常")
        return normalize_five_education_activities(
            payload,
            academic_year=academic_year,
            term=term,
            fetched_at=int(time.time()),
        )

    def _authenticated_opener(self, castgc: str) -> Any:
        cookies = CookieJar()
        cookies.set_cookie(_castgc_cookie(castgc))
        opener = build_opener(_AllowlistedRedirect(), HTTPCookieProcessor(cookies))
        login_url = (
            f"https://{AUTH_HOST}/authserver/login?service="
            f"{quote(SERVICE_URL, safe='')}"
        )

        try:
            _, login_final_url = self._read(opener, login_url)
            login_final = urlparse(login_final_url)
            if login_final.hostname == AUTH_HOST:
                raise FiveEducationError(
                    "统一身份认证登录已过期，请重新登录", auth_expired=True
                )
            if login_final.hostname != FIVE_EDUCATION_HOST:
                raise FiveEducationError("五育系统返回了异常登录页面")

        except FiveEducationError:
            raise
        except (HTTPError, URLError, TimeoutError) as error:
            raise _connection_error(error) from error
        return opener

    @staticmethod
    def _read(
        opener: Any,
        url: str,
        *,
        accept: str = "text/html",
        method: str = "GET",
        data: bytes | None = None,
    ) -> tuple[str, str]:
        if not _allowed_url(url):
            raise FiveEducationError("五育系统请求地址不安全")
        request = Request(
            url,
            data=data,
            method=method,
            headers={
                "Accept": accept,
                "User-Agent": APP_USER_AGENT,
            },
        )
        with opener.open(request, timeout=20) as response:
            charset = response.headers.get_content_charset() or "utf-8"
            return response.read().decode(charset, errors="replace"), response.geturl()


def _castgc_cookie(castgc: str) -> Cookie:
    return Cookie(
        version=0,
        name="CASTGC",
        value=castgc,
        port=None,
        port_specified=False,
        domain=AUTH_HOST,
        domain_specified=True,
        domain_initial_dot=False,
        path="/authserver",
        path_specified=True,
        secure=True,
        expires=None,
        discard=True,
        comment=None,
        comment_url=None,
        rest={"HttpOnly": None},
        rfc2109=False,
    )
