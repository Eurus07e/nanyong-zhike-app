from __future__ import annotations

import asyncio
import json
import time
from http.cookiejar import Cookie, CookieJar
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlparse
from urllib.request import HTTPRedirectHandler, HTTPCookieProcessor, Request, build_opener


AUTH_HOST = "authserver.nju.edu.cn"
FIVE_EDUCATION_HOST = "ndwy.nju.edu.cn"
SERVICE_URL = "https://ndwy.nju.edu.cn/dztml/"
SYSTEM_URL = "https://ndwy.nju.edu.cn/dztml/#/"
OVERVIEW_URL = "https://ndwy.nju.edu.cn/dztml/wdwy"
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

    def _overview(self, castgc: str) -> dict[str, Any]:
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
            raise FiveEducationError("南京大学五育系统暂时不可用，请稍后重试") from error

        if not isinstance(payload, dict):
            raise FiveEducationError("五育系统返回的数据格式异常")
        return normalize_five_education(payload, fetched_at=int(time.time()))

    @staticmethod
    def _read(opener: Any, url: str, *, accept: str = "text/html") -> tuple[str, str]:
        if not _allowed_url(url):
            raise FiveEducationError("五育系统请求地址不安全")
        request = Request(
            url,
            headers={
                "Accept": accept,
                "User-Agent": "NanyongZhike/1.2 read-only",
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
