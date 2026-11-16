import json
import uuid
from pathlib import Path

from alembic import command
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session

from omnibooker_backend import crypto, models  # type: ignore[import-not-found]
from omnibooker_backend.database import SessionLocal, get_db  # type: ignore[import-not-found]
from omnibooker_backend.main import create_app  # type: ignore[import-not-found]
from omnibooker_backend.migrate import _alembic_config, run_migrations  # type: ignore[import-not-found]
from omnibooker_backend.security import get_current_active_user  # type: ignore[import-not-found]

SECRETS = {
    "username": "me@example.com",
    "password": "hunter2-secret",
    "additionalInfo": "member 42",
    "cardDetails": {"cardNumber": "4111111111116767", "expiryDate": "08/27", "cvc": "987"},
    "cardCvc": "321",
}


def _client(db: Session) -> tuple[TestClient, models.User]:
    user = models.User(email=f"{uuid.uuid4()}@example.com")
    db.add(user)
    db.commit()
    db.refresh(user)
    app = create_app()

    def override_db():
        session = SessionLocal()
        try:
            yield session
        finally:
            session.close()

    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[get_current_active_user] = lambda: user
    return TestClient(app), user


def _assert_no_secrets(body) -> None:
    dumped = json.dumps(body)
    for secret in ("hunter2-secret", "4111111111116767", "987", "321"):
        assert secret not in dumped, f"{secret} leaked"


def test_api_never_returns_passwords_or_card_details(db_session: Session) -> None:
    client, _ = _client(db_session)

    created = client.post("/api/providers/", json={"name": "Club", "type": "Clubspark", "credentials": SECRETS})
    listed = client.get("/api/providers/")

    assert created.status_code == 201
    _assert_no_secrets(created.json())
    _assert_no_secrets(listed.json())
    assert created.json()["credentials"] == {
        "username": "me@example.com",
        "additionalInfo": "member 42",
        "hasPassword": True,
        "card": {"last4": "6767", "expiryDate": "08/27"},
        "hasCardCvc": True,
    }


def test_blank_secrets_keep_stored_values_on_update(db_session: Session) -> None:
    client, user = _client(db_session)
    provider_id = client.post("/api/providers/", json={"name": "Club", "type": "Better", "credentials": SECRETS}).json()["id"]

    response = client.put(
        f"/api/providers/{provider_id}",
        json={"name": "Renamed", "credentials": {"username": "new@example.com", "password": "", "cardCvc": ""}},
    )

    assert response.status_code == 200
    _assert_no_secrets(response.json())
    stored = db_session.get(models.Provider, provider_id)
    db_session.refresh(stored)
    assert stored.name == "Renamed"
    assert stored.credentials["username"] == "new@example.com"
    assert stored.credentials["password"] == "hunter2-secret"
    assert stored.credentials["cardCvc"] == "321"
    assert stored.credentials["cardDetails"]["cardNumber"] == "4111111111116767"

    client.put(f"/api/providers/{provider_id}", json={"credentials": {"password": "changed", "removeCard": True}})
    db_session.refresh(stored)
    assert stored.credentials["password"] == "changed"
    assert stored.credentials["cardDetails"] is None and stored.credentials["cardCvc"] is None


def test_creating_without_a_password_is_rejected(db_session: Session) -> None:
    client, _ = _client(db_session)
    response = client.post(
        "/api/providers/", json={"name": "Club", "type": "Better", "credentials": {"username": "a", "password": ""}}
    )
    assert response.status_code == 422


def test_credentials_are_encrypted_in_the_database(db_session: Session) -> None:
    client, _ = _client(db_session)
    provider_id = client.post("/api/providers/", json={"name": "Club", "type": "Better", "credentials": SECRETS}).json()["id"]

    raw = db_session.execute(text("SELECT credentials FROM providers WHERE id = :id"), {"id": provider_id}).scalar()

    assert crypto.is_encrypted(raw)
    assert "hunter2-secret" not in raw and "4111" not in raw
    assert db_session.get(models.Provider, provider_id).credentials["password"] == "hunter2-secret"


def test_migration_encrypts_existing_plaintext_credentials(tmp_path: Path) -> None:
    url = f"sqlite:///{tmp_path / 'm.db'}"
    command.upgrade(_alembic_config(url), "0004")
    engine = create_engine(url)
    with engine.begin() as connection:
        connection.execute(text("INSERT INTO users (id, email, is_active, created_at) VALUES (1, 'a@b.c', 1, CURRENT_TIMESTAMP)"))
        connection.execute(
            text("INSERT INTO providers (id, user_id, name, type, credentials, created_at) VALUES (1, 1, 'P', 'Better', :c, CURRENT_TIMESTAMP)"),
            {"c": json.dumps(SECRETS)},
        )

    run_migrations(url)

    with engine.connect() as connection:
        raw = connection.execute(text("SELECT credentials FROM providers WHERE id = 1")).scalar()
    assert crypto.is_encrypted(raw)
    assert json.loads(crypto.decrypt_str(raw)) == SECRETS

    command.downgrade(_alembic_config(url), "0004")
    with engine.connect() as connection:
        restored = connection.execute(text("SELECT credentials FROM providers WHERE id = 1")).scalar()
    assert json.loads(restored) == SECRETS
