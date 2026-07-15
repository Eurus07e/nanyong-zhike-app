from __future__ import annotations

import asyncio
import os
import threading
import time
from contextlib import asynccontextmanager, suppress
from pathlib import Path
from typing import Annotated, Any, Literal
from urllib.parse import quote, urlencode

from fastapi import Cookie, Depends, FastAPI, HTTPException, Query, Request, Response
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, ConfigDict, Field

from .academic import passed_course_detail_requests, summarize_grades
from .academic_snapshots import AcademicSnapshotRepository, count_graded_courses
from .config import get_settings
from .database import Database
from .exchange_system import ExchangeSystemClient, ExchangeSystemError
from .five_education import FiveEducationClient, FiveEducationError
from .memos import MemoRepository
from .nju_cli import NjuCli, NjuCliError
from .notices import NoticeService
from .portal_snapshots import PortalSnapshotRepository
from .reviews import ReviewRepository
from .schedule import merge_schedule_details
from .security import (
    LoginBodyLimitMiddleware,
    LoginRateLimiter,
    SESSION_COOKIE,
    Session,
    SessionStore,
)
from .student_profile import StudentProfileClient, StudentProfileError
from .version import APP_VERSION


settings = get_settings()
database = Database(settings.database_path)
sessions = SessionStore(database, settings)
reviews = ReviewRepository(database, settings.review_data_path)
memo_repository = MemoRepository(database)
academic_snapshots = AcademicSnapshotRepository(database, settings)
portal_snapshots = PortalSnapshotRepository(database, settings)
rate_limiter = LoginRateLimiter(
    ip_attempts=settings.login_ip_attempts,
    username_attempts=settings.login_username_attempts,
    window_seconds=settings.login_rate_window_seconds,
    max_ip_entries=settings.login_rate_max_ip_entries,
    max_username_entries=settings.login_rate_max_username_entries,
)
nju = NjuCli(settings)
notices = NoticeService(nju)
exchange_system = ExchangeSystemClient()
student_profiles = StudentProfileClient()
five_education = FiveEducationClient()


@asynccontextmanager
async def lifespan(_: FastAPI):
    database.initialize()
    sessions.purge_expired()
    await asyncio.to_thread(reviews.sync)
    cleanup_task = asyncio.create_task(_purge_expired_sessions())
    try:
        yield
    finally:
        cleanup_task.cancel()
        with suppress(asyncio.CancelledError):
            await cleanup_task


async def _purge_expired_sessions() -> None:
    while True:
        await asyncio.sleep(settings.session_cleanup_interval_seconds)
        await asyncio.to_thread(sessions.purge_expired)


app = FastAPI(title="南雍知课 API", version=APP_VERSION, lifespan=lifespan)
app.add_middleware(
    LoginBodyLimitMiddleware, max_body_bytes=settings.login_body_max_bytes
)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    if (
        request.url.path.startswith("/api/")
        and request.method not in {"GET", "HEAD", "OPTIONS"}
        and request.headers.get("sec-fetch-site") == "cross-site"
    ):
        response = Response(status_code=403, content="Cross-site request rejected")
    else:
        response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    response.headers["Cross-Origin-Opener-Policy"] = "same-origin"
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; img-src 'self' data:; style-src 'self'; "
        "script-src 'self'; connect-src 'self'; font-src 'self'; "
        "frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
    )
    if settings.production:
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    if request.url.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store"
    return response


class LoginBody(BaseModel):
    username: str = Field(min_length=8, max_length=32, pattern=r"^[A-Za-z0-9]+$")
    password: str = Field(min_length=1, max_length=128)


class MemoCreateBody(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    content: str = Field(min_length=1, max_length=10_000)
    link_url: str | None = Field(default=None, alias="linkUrl", max_length=2048)
    link_label: str | None = Field(default=None, alias="linkLabel", max_length=80)


class MemoUpdateBody(BaseModel):
    content: str | None = Field(default=None, min_length=1, max_length=10_000)
    pinned: bool | None = None


def current_session(
    token: Annotated[str | None, Cookie(alias=SESSION_COOKIE)] = None,
) -> Session:
    session = sessions.get(token)
    if not session:
        raise HTTPException(status_code=401, detail="请先登录南京大学统一身份认证")
    return session


async def run_cli(session: Session, args: list[str], *, timeout: int = 45) -> Any:
    try:
        return await nju.json(
            session.castgc, args, owner=session.username, timeout=timeout
        )
    except NjuCliError as error:
        raise HTTPException(
            status_code=401 if error.auth_expired else 502,
            detail=str(error),
        ) from error


async def enrich_passed_course_details(session: Session, payload: dict[str, Any]) -> dict[str, Any]:
    """Attach official course classifications to passed grades."""
    requests = passed_course_detail_requests(payload)
    if not requests:
        return payload

    limiter = asyncio.Semaphore(settings.nju_cli_user_concurrency)
    auth_error: HTTPException | None = None

    async def fetch(term: str, course_ids: list[str]) -> list[Any]:
        nonlocal auth_error
        async with limiter:
            if auth_error is not None:
                return []
            try:
                detail = await run_cli(
                    session,
                    [
                        "ehall",
                        "my-course-schedule",
                        "detail",
                        *course_ids,
                        "--term",
                        term,
                    ],
                    timeout=45 if len(course_ids) == 1 else 90,
                )
                return [detail]
            except HTTPException as error:
                if error.status_code == 401 and auth_error is None:
                    auth_error = error
                    return []
                if len(course_ids) == 1:
                    return []

        # A failed batch should not hide every other course in that term.
        fallback = await asyncio.gather(
            *(fetch(term, [course_id]) for course_id in course_ids)
        )
        return [detail for group in fallback for detail in group]

    detail_groups = await asyncio.gather(
        *(fetch(term, course_ids) for term, course_ids in requests.items())
    )
    if auth_error is not None:
        raise auth_error
    for detail in (item for group in detail_groups for item in group):
        merge_schedule_details(payload, detail)
    return payload


async def fresh_academic_overview(session: Session) -> dict[str, Any]:
    grades = await run_cli(
        session, ["ehall", "grades", "list", "--json", "--page-size", "500"]
    )
    grades = await enrich_passed_course_details(session, grades)
    return {"grades": grades, "summary": summarize_grades(grades)}


@app.get("/api/health")
async def health() -> dict[str, str]:
    return {
        "status": "ok",
        "service": "南雍知课",
        "version": APP_VERSION,
        "deployment": settings.app_env,
    }


def _schedule_desktop_exit() -> None:
    timer = threading.Timer(0.25, os._exit, args=(0,))
    timer.daemon = True
    timer.start()


@app.post("/api/desktop/quit")
async def quit_desktop(request: Request) -> dict[str, bool]:
    client_host = request.client.host if request.client else ""
    if settings.app_env != "desktop":
        raise HTTPException(status_code=404, detail="仅本地桌面版支持退出应用")
    if client_host not in {"127.0.0.1", "::1"}:
        raise HTTPException(status_code=403, detail="仅允许从本机退出应用")
    _schedule_desktop_exit()
    return {"ok": True}


@app.get("/api/notices")
async def important_notices(
    limit: int = Query(default=8, ge=1, le=20),
    refresh: bool = False,
) -> dict[str, Any]:
    try:
        return await notices.list(limit=limit, force=refresh)
    except NjuCliError as error:
        raise HTTPException(status_code=502, detail=str(error)) from error


async def save_portal_snapshot(session: Session, cache_key: str, value: Any) -> Any:
    await asyncio.to_thread(portal_snapshots.save, session.username, cache_key, value)
    return value


async def portal_cache_first(
    session: Session,
    cache_key: str,
    refresh: bool,
    loader: Any,
) -> Any:
    if not refresh:
        cached = await asyncio.to_thread(
            portal_snapshots.get, session.username, cache_key
        )
        if cached is not None:
            return cached["value"]
    value = await loader()
    return await save_portal_snapshot(session, cache_key, value)


@app.get("/api/notices/{notice_id}")
async def important_notice_detail(notice_id: int) -> dict[str, str]:
    try:
        detail = await notices.detail(str(notice_id))
    except NjuCliError as error:
        raise HTTPException(status_code=502, detail=str(error)) from error
    if detail is None:
        raise HTTPException(status_code=404, detail="未找到该通知")
    return detail


@app.get("/api/five-education/overview")
async def five_education_overview(
    session: Annotated[Session, Depends(current_session)],
) -> dict[str, Any]:
    try:
        return await five_education.overview(session.castgc)
    except FiveEducationError as error:
        raise HTTPException(
            status_code=401 if error.auth_expired else 502,
            detail=str(error),
        ) from error


@app.get("/api/five-education/activities")
async def five_education_activities(
    session: Annotated[Session, Depends(current_session)],
) -> dict[str, Any]:
    try:
        return await five_education.activities(session.castgc)
    except FiveEducationError as error:
        raise HTTPException(
            status_code=401 if error.auth_expired else 502,
            detail=str(error),
        ) from error


@app.post("/api/auth/login")
async def login(body: LoginBody, request: Request, response: Response) -> dict[str, Any]:
    client_ip = request.client.host if request.client else "unknown"
    if not rate_limiter.allow(client_ip, body.username):
        raise HTTPException(status_code=429, detail="登录尝试过多，请 15 分钟后再试")
    try:
        castgc = await nju.login(body.username, body.password)
    except NjuCliError as error:
        raise HTTPException(status_code=401, detail=str(error)) from error
    finally:
        body.password = ""
    rate_limiter.clear_username(body.username)
    token, session = sessions.create(body.username, castgc)
    response.set_cookie(
        SESSION_COOKIE,
        token,
        max_age=settings.session_ttl_hours * 3600,
        httponly=True,
        secure=settings.cookie_secure or settings.production,
        samesite="lax",
        path="/",
    )
    return {"username": session.username, "expiresAt": session.expires_at}


@app.get("/api/auth/session")
async def auth_session(session: Annotated[Session, Depends(current_session)]) -> dict[str, Any]:
    return {"username": session.username, "expiresAt": session.expires_at}


@app.get("/api/bootstrap")
async def bootstrap_cache(
    session: Annotated[Session, Depends(current_session)],
) -> dict[str, Any]:
    entries = await asyncio.to_thread(portal_snapshots.list, session.username)
    academic = await asyncio.to_thread(academic_snapshots.get, session.username)
    if academic is not None:
        entries["/api/academic/overview"] = {
            "value": {
                **academic["payload"],
                "source": "cache",
                "cachedAt": academic["updatedAt"],
                "newGradeCount": 0,
            },
            "updatedAt": academic["updatedAt"],
        }
    return {"entries": entries}


@app.post("/api/auth/logout")
async def logout(
    response: Response,
    token: Annotated[str | None, Cookie(alias=SESSION_COOKIE)] = None,
) -> dict[str, bool]:
    sessions.delete(token)
    response.delete_cookie(SESSION_COOKIE, path="/", samesite="lax")
    return {"ok": True}


@app.get("/api/grades")
async def grades(
    session: Annotated[Session, Depends(current_session)],
    term: str | None = Query(default=None, pattern=r"^\d{4}-\d{4}-[123]$"),
) -> dict[str, Any]:
    args = ["ehall", "grades", "list", "--json", "--page-size", "500"]
    if term:
        args.extend(["--term", term])
    payload = await run_cli(session, args)
    return await enrich_passed_course_details(session, payload)


@app.get("/api/grades/summary")
async def grade_summary(
    session: Annotated[Session, Depends(current_session)],
) -> dict[str, Any]:
    payload = await run_cli(
        session, ["ehall", "grades", "list", "--json", "--page-size", "500"]
    )
    return summarize_grades(payload)


@app.get("/api/academic/overview")
async def academic_overview(
    session: Annotated[Session, Depends(current_session)],
    refresh: bool = False,
) -> dict[str, Any]:
    if not refresh:
        cached = await asyncio.to_thread(academic_snapshots.get, session.username)
        if cached is not None:
            return {
                **cached["payload"],
                "source": "cache",
                "cachedAt": cached["updatedAt"],
                "newGradeCount": 0,
            }

    payload = await fresh_academic_overview(session)
    grade_count = count_graded_courses(payload["grades"])
    previous_count = await asyncio.to_thread(
        academic_snapshots.save, session.username, payload, grade_count
    )
    return {
        **payload,
        "source": "fresh",
        "cachedAt": int(time.time()),
        "newGradeCount": (
            max(grade_count - previous_count, 0)
            if previous_count is not None
            else 0
        ),
    }


@app.get("/api/academic/ranking")
async def academic_ranking(
    session: Annotated[Session, Depends(current_session)],
    refresh: bool = False,
) -> dict[str, float | int]:
    if not settings.allow_insecure_exchange_system:
        raise HTTPException(
            status_code=503,
            detail="学校排名服务暂不可安全连接",
        )

    async def load() -> dict[str, float | int]:
        try:
            return await exchange_system.academic_ranking(session.castgc)
        except ExchangeSystemError as error:
            raise HTTPException(
                status_code=401 if error.auth_expired else 502,
                detail=str(error),
            ) from error

    return await portal_cache_first(
        session, "/api/academic/ranking", refresh, load
    )


@app.get("/api/academic/profile")
async def academic_profile(
    session: Annotated[Session, Depends(current_session)],
    refresh: bool = False,
) -> dict[str, str]:
    async def load() -> dict[str, str]:
        try:
            return await student_profiles.profile(session.castgc)
        except StudentProfileError as error:
            raise HTTPException(
                status_code=401 if error.auth_expired else 502,
                detail=str(error),
            ) from error

    return await portal_cache_first(
        session, "/api/academic/profile", refresh, load
    )


@app.get("/api/grades/terms")
async def grade_terms(session: Annotated[Session, Depends(current_session)]) -> Any:
    return await run_cli(session, ["ehall", "grades", "terms", "--json"])


@app.get("/api/schedule/terms")
async def schedule_terms(
    session: Annotated[Session, Depends(current_session)],
    refresh: bool = False,
) -> Any:
    return await portal_cache_first(
        session,
        "/api/schedule/terms",
        refresh,
        lambda: run_cli(
            session, ["ehall", "my-course-schedule", "terms", "--json"]
        ),
    )


@app.get("/api/schedule")
async def schedule(
    session: Annotated[Session, Depends(current_session)],
    term: str | None = Query(default=None, pattern=r"^\d{4}-\d{4}-[123]$"),
    refresh: bool = False,
) -> Any:
    cache_key = f"/api/schedule?{urlencode({'term': term})}" if term else "/api/schedule"

    async def load() -> Any:
        args = [
            "ehall", "my-course-schedule", "list", "--json", "--page-size", "200"
        ]
        if term:
            args.extend(["--term", term])
        payload = await run_cli(session, args)
        rows = payload.get("rows") if isinstance(payload, dict) else None
        course_ids = list(
            dict.fromkeys(
                str(row.get("JXBID") or row.get("KCH"))
                for row in rows or []
                if isinstance(row, dict) and (row.get("JXBID") or row.get("KCH"))
            )
        )
        if not course_ids:
            return payload

        detail_args = ["ehall", "my-course-schedule", "detail", *course_ids]
        if term:
            detail_args.extend(["--term", term])
        try:
            details = await run_cli(session, detail_args, timeout=90)
        except HTTPException as error:
            if error.status_code == 401:
                raise
            return payload
        return merge_schedule_details(payload, details)

    return await portal_cache_first(session, cache_key, refresh, load)


@app.get("/api/programs")
async def programs(
    session: Annotated[Session, Depends(current_session)],
    name: str | None = Query(default=None, max_length=80),
    grade: str | None = Query(default=None, pattern=r"^\d{4}$"),
    department: str | None = Query(default=None, max_length=24),
    refresh: bool = False,
) -> Any:
    args = ["ehall", "training-program", "list", "--json"]
    if name and name.strip():
        args.extend(["--name", name.strip()])
    if grade:
        args.extend(["--grade", grade])
    if department:
        args.extend(["--department", department])
    params = [("name", name.strip())] if name and name.strip() else []
    if grade:
        params.append(("grade", grade))
    if department:
        params.append(("department", department))
    cache_key = f"/api/programs?{urlencode(params)}" if params else "/api/programs"
    return await portal_cache_first(
        session,
        cache_key,
        refresh,
        lambda: run_cli(session, args, timeout=60),
    )


@app.get("/api/programs/{program_id}")
async def program_detail(
    program_id: str,
    session: Annotated[Session, Depends(current_session)],
    refresh: bool = False,
) -> Any:
    cache_key = f"/api/programs/{quote(program_id, safe='')}"
    return await portal_cache_first(
        session,
        cache_key,
        refresh,
        lambda: run_cli(
            session, ["ehall", "training-program", "detail", program_id, "--json"]
        ),
    )


@app.get("/api/programs/{program_id}/nodes")
async def program_nodes(
    program_id: str,
    session: Annotated[Session, Depends(current_session)],
    refresh: bool = False,
) -> Any:
    cache_key = f"/api/programs/{quote(program_id, safe='')}/nodes"
    return await portal_cache_first(
        session,
        cache_key,
        refresh,
        lambda: run_cli(
            session, ["ehall", "training-program", "nodes", program_id, "--json"]
        ),
    )


@app.get("/api/programs/{program_id}/nodes/{node_id}/courses")
async def program_courses(
    program_id: str,
    node_id: str,
    session: Annotated[Session, Depends(current_session)],
    refresh: bool = False,
) -> Any:
    cache_key = (
        f"/api/programs/{quote(program_id, safe='')}/nodes/"
        f"{quote(node_id, safe='')}/courses"
    )
    return await portal_cache_first(
        session,
        cache_key,
        refresh,
        lambda: run_cli(
            session,
            ["ehall", "training-program", "courses", program_id, node_id, "--json"],
            timeout=60,
        ),
    )


@app.get("/api/reviews/search")
async def review_search(
    q: str = Query(min_length=1, max_length=80),
    field: Literal["all", "course", "teacher"] = "all",
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0, le=100_000),
) -> dict[str, Any]:
    return await asyncio.to_thread(reviews.search, q, field, limit, offset)


@app.get("/api/memos")
async def list_memos(
    session: Annotated[Session, Depends(current_session)],
    q: str = Query(default="", max_length=100),
) -> dict[str, Any]:
    items = await asyncio.to_thread(memo_repository.list, session.username, q)
    return {"items": items}


@app.post("/api/memos", status_code=201)
async def create_memo(
    body: MemoCreateBody,
    session: Annotated[Session, Depends(current_session)],
) -> dict[str, Any]:
    if not body.content.strip():
        raise HTTPException(status_code=422, detail="备忘录内容不能为空")
    try:
        return await asyncio.to_thread(
            memo_repository.create,
            session.username,
            body.content,
            link_url=body.link_url,
            link_label=body.link_label,
        )
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


@app.patch("/api/memos/{memo_id}")
async def update_memo(
    memo_id: int,
    body: MemoUpdateBody,
    session: Annotated[Session, Depends(current_session)],
) -> dict[str, Any]:
    fields = body.model_fields_set
    if not fields:
        raise HTTPException(status_code=422, detail="没有需要更新的内容")
    if "content" in fields and (body.content is None or not body.content.strip()):
        raise HTTPException(status_code=422, detail="备忘录内容不能为空")
    if "pinned" in fields and body.pinned is None:
        raise HTTPException(status_code=422, detail="置顶状态无效")
    item = await asyncio.to_thread(
        memo_repository.update,
        session.username,
        memo_id,
        content=body.content if "content" in fields else None,
        pinned=body.pinned if "pinned" in fields else None,
    )
    if item is None:
        raise HTTPException(status_code=404, detail="未找到该备忘录")
    return item


@app.delete("/api/memos/{memo_id}", status_code=204)
async def delete_memo(
    memo_id: int,
    session: Annotated[Session, Depends(current_session)],
) -> Response:
    deleted = await asyncio.to_thread(
        memo_repository.delete, session.username, memo_id
    )
    if not deleted:
        raise HTTPException(status_code=404, detail="未找到该备忘录")
    return Response(status_code=204)


if settings.frontend_dist.exists():
    assets = settings.frontend_dist / "assets"
    if assets.exists():
        app.mount("/assets", StaticFiles(directory=assets), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def frontend(full_path: str):
        candidate = (settings.frontend_dist / full_path).resolve()
        root = settings.frontend_dist.resolve()
        if candidate.is_relative_to(root) and candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(root / "index.html")
