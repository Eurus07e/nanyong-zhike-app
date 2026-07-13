from __future__ import annotations

import base64
import hashlib
import secrets
from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


ROOT = Path(__file__).resolve().parents[2]

PRODUCTION_SECRET_PLACEHOLDERS = frozenset(
    {
        "replace-with-at-least-32-random-characters",
        "replace-with-a-random-secret",
        "change-me-to-a-random-secret",
    }
)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=ROOT / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_env: str = "development"
    app_secret: str = ""
    session_ttl_hours: int = Field(default=24 * 7, ge=1)
    session_cleanup_interval_seconds: int = Field(default=15 * 60, ge=30)
    cookie_secure: bool = False
    database_path: Path = ROOT / "data" / "nanyong.db"
    review_data_path: Path = ROOT / "data" / "reviews" / "merged_data.json"
    nju_cli_bin: str = ""
    nju_cli_global_concurrency: int = Field(default=8, ge=1, le=64)
    nju_cli_user_concurrency: int = Field(default=2, ge=1, le=16)
    login_body_max_bytes: int = Field(default=4 * 1024, ge=512, le=64 * 1024)
    login_ip_attempts: int = Field(default=60, ge=1)
    login_username_attempts: int = Field(default=5, ge=1)
    login_rate_window_seconds: int = Field(default=15 * 60, ge=30)
    login_rate_max_ip_entries: int = Field(default=10_000, ge=100)
    login_rate_max_username_entries: int = Field(default=50_000, ge=100)
    frontend_dist: Path = ROOT / "frontend" / "dist"

    @property
    def production(self) -> bool:
        return self.app_env.lower() == "production"

    def resolved_secret(self) -> str:
        if self.app_secret:
            secret = self.app_secret.strip()
            if self.production:
                if len(secret) < 32:
                    raise RuntimeError("APP_SECRET must contain at least 32 characters in production")
                if secret.casefold() in PRODUCTION_SECRET_PLACEHOLDERS:
                    raise RuntimeError("APP_SECRET must not use an example placeholder in production")
            return secret
        if self.production:
            raise RuntimeError("APP_SECRET is required in production")

        key_file = ROOT / "data" / ".dev-secret"
        key_file.parent.mkdir(parents=True, exist_ok=True)
        if not key_file.exists():
            key_file.write_text(secrets.token_urlsafe(48), encoding="ascii")
            key_file.chmod(0o600)
        return key_file.read_text(encoding="ascii").strip()

    @property
    def fernet_key(self) -> bytes:
        digest = hashlib.sha256(self.resolved_secret().encode("utf-8")).digest()
        return base64.urlsafe_b64encode(digest)


@lru_cache
def get_settings() -> Settings:
    return Settings()
