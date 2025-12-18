from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class WorkerSettings(BaseSettings):
    """Configuration for the Omnibooker background worker."""

    model_config = SettingsConfigDict(
        env_file=(".env", ".env.local"), env_file_encoding="utf-8", extra="ignore"
    )

    poll_interval_seconds: float = 1.0
    batch_size: int = 5


@lru_cache
def get_worker_settings() -> WorkerSettings:
    return WorkerSettings()
