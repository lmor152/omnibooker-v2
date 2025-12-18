import json
from functools import lru_cache
from pathlib import Path
from typing import TYPE_CHECKING, Any, Callable, cast

if TYPE_CHECKING:  # pragma: no cover - used only for static analysis

    def field_validator(
        *args: Any, **kwargs: Any
    ) -> Callable[[Callable[..., Any]], Callable[..., Any]]:
        def decorator(func: Callable[..., Any]) -> Callable[..., Any]:
            return func

        return decorator

    class BaseSettings:  # pylint: disable=too-few-public-methods
        model_config: Any

    class SettingsConfigDict(dict[str, Any]): ...
else:
    from pydantic import field_validator  # type: ignore[import-not-found]
    from pydantic_settings import (  # type: ignore[import-not-found]
        BaseSettings,
        SettingsConfigDict,
    )


BASE_DIR = Path(__file__).resolve().parents[2]
ENV_FILE = BASE_DIR / ".env"


class Settings(BaseSettings):
    """Application configuration loaded from environment variables or defaults."""

    model_config = SettingsConfigDict(
        env_file=str(ENV_FILE),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "Omnibooker API"
    api_prefix: str = "/api"
    backend_cors_origins: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]
    database_url: str = "sqlite:///./omnibooker.db"
    access_token_expire_minutes: int = 60 * 24
    auth0_domain: str | None = None
    auth0_audience: str | None = None
    auth0_algorithm: str = "RS256"
    auth0_required_role: str | None = None
    auth0_roles_claim: str | None = "permissions"

    @field_validator("backend_cors_origins", mode="before")
    @classmethod
    def parse_cors_origins(cls, value: Any) -> list[str]:
        if isinstance(value, str):
            value = value.strip()
            if value.startswith("[") and value.endswith("]"):
                return json.loads(value)
            separators = ";" if ";" in value else ","
            return [
                origin.strip() for origin in value.split(separators) if origin.strip()
            ]
        if isinstance(value, list):
            return [item for item in cast(list[str], value) if item]
        raise ValueError("Invalid BACKEND_CORS_ORIGINS format")


@lru_cache
def get_settings() -> Settings:
    return Settings()
