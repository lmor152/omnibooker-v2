from pathlib import Path

import pytest
from alembic import command
from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext
from sqlalchemy import create_engine, inspect, text

from omnibooker_backend import models  # type: ignore[import-not-found]  # noqa: F401
from omnibooker_backend.database import Base  # type: ignore[import-not-found]
from omnibooker_backend.migrate import (  # type: ignore[import-not-found]
    SchemaDriftError,
    _alembic_config,
    run_migrations,
)


@pytest.fixture()
def db_url(tmp_path: Path) -> str:
    return f"sqlite:///{tmp_path / 'migrations.db'}"


def test_migrations_match_models(db_url: str) -> None:
    run_migrations(db_url)

    engine = create_engine(db_url)
    with engine.connect() as connection:
        diff = compare_metadata(MigrationContext.configure(connection), Base.metadata)
    assert diff == []


def test_pre_alembic_database_is_stamped_then_upgraded(db_url: str) -> None:
    command.upgrade(_alembic_config(db_url), "0001")
    engine = create_engine(db_url)
    with engine.begin() as connection:
        # Simulate a database created by create_all before Alembic existed.
        connection.execute(text("DROP TABLE alembic_version"))

    run_migrations(db_url)

    columns = {c["name"] for c in inspect(engine).get_columns("booking_tasks")}
    assert {"provider_booking_ref", "cost", "currency"} <= columns
    with engine.connect() as connection:
        version = connection.execute(text("SELECT version_num FROM alembic_version")).scalar()
    assert version == "0002"


def test_pre_alembic_database_with_drift_is_rejected(db_url: str) -> None:
    command.upgrade(_alembic_config(db_url), "0001")
    engine = create_engine(db_url)
    with engine.begin() as connection:
        connection.execute(text("DROP TABLE alembic_version"))
        connection.execute(text("ALTER TABLE booking_tasks DROP COLUMN booked_resource"))

    with pytest.raises(SchemaDriftError, match="booking_tasks.booked_resource"):
        run_migrations(db_url)
