from __future__ import annotations

import asyncio
import json
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from html.parser import HTMLParser
from http.cookiejar import Cookie, CookieJar
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, urlencode, urlparse
from urllib.request import HTTPCookieProcessor, Request, build_opener


BASE_URL = "http://elite.nju.edu.cn/exchangesystem/"
SUMMARY_URL = f"{BASE_URL}index/create?pid=4"
AUTH_PROVIDER = "cn.xht100.skylake.modules.cas.CasAuthProvider"
AUTH_HOST = "authserver.nju.edu.cn"
ELITE_HOST = "elite.nju.edu.cn"


class ExchangeSystemError(RuntimeError):
    def __init__(self, message: str, *, auth_expired: bool = False):
        super().__init__(message)
        self.auth_expired = auth_expired


def _connection_error(
    error: HTTPError | URLError | TimeoutError,
) -> ExchangeSystemError:
    if isinstance(error, HTTPError):
        if error.code in {403, 483}:
            return ExchangeSystemError(
                "交换生系统仅支持校园网访问，请连接南京大学 VPN 或校园网后重试"
            )
        return ExchangeSystemError("交换生系统暂时不可用，请稍后重试")
    return ExchangeSystemError(
        "交换生系统仅支持校园网访问，请连接南京大学 VPN 或校园网后重试"
    )


@dataclass(frozen=True)
class AcademicRanking:
    average_score: float
    rank: int
    major_total: int
    rank_percent: float

    def as_dict(self) -> dict[str, float | int]:
        return {
            "averageScore": self.average_score,
            "rank": self.rank,
            "majorTotal": self.major_total,
            "rankPercent": self.rank_percent,
        }


class _SummaryHTMLParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.values: dict[str, str] = {}
        self._div_depth = 0
        self._span_depth = 0
        self._label_depth: int | None = None
        self._label_parts: list[str] = []
        self._pending_label = ""
        self._value_span_depth: int | None = None
        self._value_parts: list[str] = []

    def handle_starttag(
        self, tag: str, attrs: list[tuple[str, str | None]]
    ) -> None:
        attributes = {name: value or "" for name, value in attrs}
        if tag == "div":
            self._div_depth += 1
            classes = set(attributes.get("class", "").split())
            if "xm_label" in classes:
                self._label_depth = self._div_depth
                self._label_parts = []
            return

        if tag == "span":
            self._span_depth += 1
            if self._pending_label == "平均学分绩":
                self._value_span_depth = self._span_depth
                self._value_parts = []
            return

        if tag == "input":
            field = attributes.get("name")
            if field == "data.zyzrs":
                self.values["major_total"] = attributes.get("value", "").strip()
            elif field == "data.pmbfb":
                self.values["rank_percent"] = attributes.get("value", "").strip()

    def handle_endtag(self, tag: str) -> None:
        if tag == "div":
            if self._label_depth == self._div_depth:
                self._pending_label = "".join(self._label_parts).strip()
                self._label_depth = None
                self._label_parts = []
            self._div_depth = max(0, self._div_depth - 1)
            return

        if tag == "span":
            if self._value_span_depth == self._span_depth:
                self.values["average_score"] = "".join(self._value_parts).strip()
                self._value_span_depth = None
                self._value_parts = []
                self._pending_label = ""
            self._span_depth = max(0, self._span_depth - 1)

    def handle_data(self, data: str) -> None:
        if self._label_depth is not None:
            self._label_parts.append(data)
        if self._value_span_depth is not None:
            self._value_parts.append(data)


def parse_academic_ranking(page: str) -> AcademicRanking:
    parser = _SummaryHTMLParser()
    parser.feed(page)

    try:
        average_score = Decimal(parser.values["average_score"])
        major_total = int(parser.values["major_total"])
        percent_text = parser.values["rank_percent"].rstrip("% ")
        rank_percent = Decimal(percent_text)
    except (KeyError, InvalidOperation, ValueError) as error:
        raise ExchangeSystemError("交换生系统暂未返回学分绩或排名数据") from error

    if major_total <= 0 or not Decimal("0") <= rank_percent <= Decimal("100"):
        raise ExchangeSystemError("交换生系统返回的排名数据格式异常")

    # The legacy page comments out the rank field, but exposes its percentage to
    # two decimal places. For current major sizes this round-trip identifies the
    # original integer rank exactly.
    rank = int(
        (Decimal(major_total) * rank_percent / Decimal("100")).quantize(
            Decimal("1"), rounding=ROUND_HALF_UP
        )
    )
    rank = max(1, min(rank, major_total))
    return AcademicRanking(
        average_score=float(average_score),
        rank=rank,
        major_total=major_total,
        rank_percent=float(rank_percent),
    )


class ExchangeSystemClient:
    async def academic_ranking(self, castgc: str) -> dict[str, float | int]:
        return await asyncio.to_thread(self._academic_ranking, castgc)

    def _academic_ranking(self, castgc: str) -> dict[str, float | int]:
        cookies = CookieJar()
        cookies.set_cookie(_castgc_cookie(castgc))
        opener = build_opener(HTTPCookieProcessor(cookies))

        try:
            self._read(opener, BASE_URL)
            login_payload = json.loads(
                self._read(
                    opener,
                    f"{BASE_URL}login/getLoginUrl?{urlencode(_login_parameters())}",
                )
            )
            login_url = login_payload.get("data") if isinstance(login_payload, dict) else None
            if not isinstance(login_url, str) or not _valid_login_url(login_url):
                raise ExchangeSystemError("交换生系统未返回有效的统一身份认证地址")

            page, final_url = self._read(opener, login_url, include_final_url=True)
        except ExchangeSystemError:
            raise
        except (HTTPError, URLError, TimeoutError, json.JSONDecodeError) as error:
            if isinstance(error, json.JSONDecodeError):
                raise ExchangeSystemError(
                    "交换生系统返回了无法解析的数据，请稍后重试"
                ) from error
            raise _connection_error(error) from error

        final = urlparse(final_url)
        if final.hostname != ELITE_HOST:
            raise ExchangeSystemError(
                "统一身份认证登录已过期，请重新登录", auth_expired=True
            )
        if final.path != "/exchangesystem/index/create":
            raise ExchangeSystemError("交换生系统返回了异常页面，请稍后重试")
        return parse_academic_ranking(page).as_dict()

    @staticmethod
    def _read(
        opener: Any, url: str, *, include_final_url: bool = False
    ) -> str | tuple[str, str]:
        request = Request(url, headers={"User-Agent": "NanyongZhike/0.1 read-only"})
        with opener.open(request, timeout=20) as response:
            charset = response.headers.get_content_charset() or "utf-8"
            body = response.read().decode(charset, errors="replace")
            if include_final_url:
                return body, response.geturl()
            return body


def _login_parameters() -> dict[str, str]:
    return {
        "returnUrl": SUMMARY_URL,
        "_auth_provider_": AUTH_PROVIDER,
    }


def _valid_login_url(url: str) -> bool:
    parsed = urlparse(url)
    services = parse_qs(parsed.query).get("service", [])
    service = urlparse(services[0]) if len(services) == 1 else None
    return (
        parsed.scheme == "https"
        and parsed.hostname == AUTH_HOST
        and parsed.path == "/authserver/login"
        and service is not None
        and service.scheme == "http"
        and service.hostname == ELITE_HOST
        and service.path == "/exchangesystem/index/create"
    )


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
