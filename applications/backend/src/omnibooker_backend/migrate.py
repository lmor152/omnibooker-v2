"""Apply database migrations: ``python -m omnibooker_backend.migrate``.

Databases created before Alembic was introduced (via ``create_all``) have the
baseline tables but no ``alembic_version`` table. For those, the existing
columns are checked against the baseline revision and, if they match, the
database is stamped at the baseline before upgrading.
"""

from __future__ import annotations

import logging
import sys
from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect

from .config import get_settings

logger = logging.getLogger(__name__)

BASELINE_REVISION = "0001"
ALEMBIC_INI = Path(__file__).resolve().parents[2] / "alembic.ini"


class SchemaDriftError(RuntimeError):
    """Raised when a pre-Alembic database does not match the baseline schema."""


def _alembic_config(database_url: str) -> Config:
    config = Config(str(ALEMBIC_INI))
    config.set_main_option("sqlalchemy.url", database_url)
    config.attributes["configure_logger"] = False
    return config


def _baseline_columns() -> dict[str, set[str]]:
    """Build the baseline schema in memory and return its columns per table."""

    engine = create_engine("sqlite://")
    with engine.begin() as connection:
        config = _alembic_config("sqlite://")
        config.attributes["connection"] = connection
        command.upgrade(config, BASELINE_REVISION)
        inspector = inspect(connection)
        return {
            table: {column["name"] for column in inspector.get_columns(table)}
            for table in inspector.get_table_names()
            if table != "alembic_version"
        }


def _missing_baseline_columns(database_url: str) -> list[str]:
    inspector = inspect(create_engine(database_url))
    existing_tables = set(inspector.get_table_names())
    missing: list[str] = []
    for table, columns in _baseline_columns().items():
        if table not in existing_tables:
            missing.append(table)
            continue
        present = {column["name"] for column in inspector.get_columns(table)}
        missing.extend(f"{table}.{name}" for name in sorted(columns - present))
    return missing


def run_migrations(database_url: str | None = None) -> None:
    database_url = database_url or get_settings().database_url
    config = _alembic_config(database_url)
    tables = set(inspect(create_engine(database_url)).get_table_names())

    if "alembic_version" not in tables and "booking_tasks" in tables:
        missing = _missing_baseline_columns(database_url)
        if missing:
            raise SchemaDriftError(
                "Existing database does not match the baseline schema; missing: "
                + ", ".join(missing)
            )
        logger.info("Stamping pre-Alembic database at baseline %s", BASELINE_REVISION)
        command.stamp(config, BASELINE_REVISION)

    command.upgrade(config, "head")
    logger.info("Database is at the latest migration")


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    try:
        run_migrations()
    except SchemaDriftError as exc:
        logger.error("%s", exc)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
