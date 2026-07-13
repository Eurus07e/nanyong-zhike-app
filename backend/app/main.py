from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager, suppress
from pathlib import Path
from typing import Annotated, Any, Literal

from fastapi import Cookie, Depends, FastAPI, HTTPException, Query, Request, Response
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from .academic import summarize_grades
from .config import get_settings
from .database import Database
from .exchange_system import ExchangeSystemClient, ExchangeSystemError
from .nju_cli import NjuCli, NjuCliError
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


settings = get_settings()
database = Database(settings.database_path)
sessions = SessionStore(database, settings)
reviews = ReviewRepository(database, settings.review_data_path)
rate_limiter = LoginRateLimiter(
    ip_attempts=settings.login_ip_attempts,
    username_attempts=settings.login_username_attempts,
    window_seconds=settings.login_rate_window_seconds,
    max_ip_entries=settings.login_rate_max_ip_entries,
    max_username_entries=settings.login_rate_max_username_entries,
)
nju = NjuCli(settings)
exchange_system = ExchangeSystemClient()
student_profiles = StudentProfileClient()


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


app = FastAPI(title="南雍知课 API", version="0.1.0", lifespan=lifespan)
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


@app.get("/api/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "service": "南雍知课"}


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
    return await run_cli(session, args)


@app.get("/api/grades/summary")
async def grade_summary(
    session: Annotated[Session, Depends(current_session)],
) -> dict[str, Any]:
    payload = await run_cli(
        session, ["ehall", "grades", "list", "--json", "--page-size", "500"]
    )
    return summarize_grades(payload)


@app.get("/api/academic/ranking")
async def academic_ranking(
    session: Annotated[Session, Depends(current_session)],
) -> dict[str, float | int]:
    try:
        return await exchange_system.academic_ranking(session.castgc)
    except ExchangeSystemError as error:
        raise HTTPException(
            status_code=401 if error.auth_expired else 502,
            detail=str(error),
        ) from error


@app.get("/api/academic/profile")
async def academic_profile(
    session: Annotated[Session, Depends(current_session)],
) -> dict[str, str]:
    try:
        return await student_profiles.profile(session.castgc)
    except StudentProfileError as error:
        raise HTTPException(
            status_code=401 if error.auth_expired else 502,
            detail=str(error),
        ) from error


@app.get("/api/grades/terms")
async def grade_terms(session: Annotated[Session, Depends(current_session)]) -> Any:
    return await run_cli(session, ["ehall", "grades", "terms", "--json"])


@app.get("/api/schedule/terms")
async def schedule_terms(session: Annotated[Session, Depends(current_session)]) -> Any:
    return await run_cli(
        session, ["ehall", "my-course-schedule", "terms", "--json"]
    )


@app.get("/api/schedule")
async def schedule(
    session: Annotated[Session, Depends(current_session)],
    term: str | None = Query(default=None, pattern=r"^\d{4}-\d{4}-[123]$"),
) -> Any:
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


@app.get("/api/programs")
async def programs(
    session: Annotated[Session, Depends(current_session)],
    name: str | None = Query(default=None, max_length=80),
    grade: str | None = Query(default=None, pattern=r"^\d{4}$"),
    department: str | None = Query(default=None, max_length=24),
) -> Any:
    args = ["ehall", "training-program", "list", "--json"]
    if name and name.strip():
        args.extend(["--name", name.strip()])
    if grade:
        args.extend(["--grade", grade])
    if department:
        args.extend(["--department", department])
    return await run_cli(session, args, timeout=60)


@app.get("/api/programs/{program_id}")
async def program_detail(
    program_id: str, session: Annotated[Session, Depends(current_session)]
) -> Any:
    return await run_cli(
        session, ["ehall", "training-program", "detail", program_id, "--json"]
    )


@app.get("/api/programs/{program_id}/nodes")
async def program_nodes(
    program_id: str, session: Annotated[Session, Depends(current_session)]
) -> Any:
    return await run_cli(
        session, ["ehall", "training-program", "nodes", program_id, "--json"]
    )


@app.get("/api/programs/{program_id}/nodes/{node_id}/courses")
async def program_courses(
    program_id: str,
    node_id: str,
    session: Annotated[Session, Depends(current_session)],
) -> Any:
    return await run_cli(
        session,
        ["ehall", "training-program", "courses", program_id, node_id, "--json"],
        timeout=60,
    )


@app.get("/api/reviews/search")
async def review_search(
    q: str = Query(min_length=1, max_length=80),
    field: Literal["all", "course", "teacher"] = "all",
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0, le=100_000),
) -> dict[str, Any]:
    return await asyncio.to_thread(reviews.search, q, field, limit, offset)


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
