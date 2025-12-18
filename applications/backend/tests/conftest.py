import os
from pathlib import Path
from typing import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session, close_all_sessions

os.environ.setdefault("DATABASE_URL", "sqlite:///./test_omnibooker.db")

from omnibooker_backend.database import (  # type: ignore[import-not-found]
    Base,
    SessionLocal,
    engine,
    get_db,
)
from omnibooker_backend.main import create_app  # type: ignore[import-not-found]
from omnibooker_backend.services.booking_engine import (  # type: ignore[import-not-found]
    clear_provider_handlers,
)

TEST_DB_PATH = Path("test_omnibooker.db")


@pytest.fixture(scope="session", autouse=True)
def setup_database() -> Generator[None, None, None]:
    if TEST_DB_PATH.exists():
        TEST_DB_PATH.unlink()
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield
    close_all_sessions()
    Base.metadata.drop_all(bind=engine)
    if TEST_DB_PATH.exists():
        TEST_DB_PATH.unlink()


@pytest.fixture(autouse=True)
def reset_booking_registry() -> Generator[None, None, None]:
    clear_provider_handlers()
    yield
    clear_provider_handlers()


@pytest.fixture()
def db_session() -> Generator[Session, None, None]:
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture()
def client() -> Generator[TestClient, None, None]:
    app = create_app()

    def override_get_db():
        db = SessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db

    with TestClient(app) as test_client:
        yield test_client
