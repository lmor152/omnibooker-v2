import uuid
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from omnibooker_backend import models  # type: ignore[import-not-found]
from omnibooker_backend.database import SessionLocal, get_db  # type: ignore[import-not-found]
from omnibooker_backend.main import create_app  # type: ignore[import-not-found]
from omnibooker_backend.security import get_current_active_user  # type: ignore[import-not-found]
from omnibooker_backend.services import chat_links, confirmation  # type: ignore[import-not-found]
from omnibooker_backend.services.booking_engine import (  # type: ignore[import-not-found]
    CancelResult,
    CancelStatus,
    register_cancel_handler,
)


def _user(db: Session) -> models.User:
    user = models.User(email=f"{uuid.uuid4()}@example.com")
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _client_for(user: models.User) -> TestClient:
    app = create_app()

    def override_db():
        db = SessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[get_current_active_user] = lambda: user
    return TestClient(app)


def _awaiting_task(db: Session, user: models.User) -> models.BookingTask:
    provider = models.Provider(user_id=user.id, name="P", type="route-provider", credentials={})
    db.add(provider)
    db.flush()
    slot = models.BookingSlot(
        user_id=user.id, provider_id=provider.id, name="Tennis",
        frequency=models.FrequencyEnum.one_off, time="17:00", timezone="Europe/London",
        provider_options={}, auto_cancel_enabled=True,
    )
    db.add(slot)
    db.flush()
    task = models.BookingTask(
        booking_slot_id=slot.id,
        scheduled_date=datetime.now(timezone.utc) + timedelta(days=4),
        status=models.TaskStatusEnum.success,
        provider_booking_ref={},
    )
    db.add(task)
    db.commit()
    confirmation.on_booking_success(db, task)
    return task


def test_link_code_links_discord_account_once(db_session: Session) -> None:
    user = _user(db_session)
    response = _client_for(user).post("/api/chat/discord/link-code")
    assert response.status_code == 200
    code = response.json()["code"]

    identity = chat_links.consume_link_code(
        db_session, code.lower(), platform="discord", external_user_id="42",
        external_username="liam",
    )

    assert identity.user_id == user.id
    with pytest.raises(chat_links.LinkError):
        chat_links.consume_link_code(
            db_session, code, platform="discord", external_user_id="43", external_username=None
        )
    listed = _client_for(user).get("/api/chat/identities").json()
    assert [i["external_username"] for i in listed] == ["liam"]


def test_expired_link_code_is_rejected(db_session: Session) -> None:
    user = _user(db_session)
    code, _ = chat_links.create_link_code(
        db_session, user.id, now=datetime.now(timezone.utc) - timedelta(minutes=11)
    )

    with pytest.raises(chat_links.LinkError):
        chat_links.consume_link_code(
            db_session, code, platform="discord", external_user_id="44", external_username=None
        )


def test_first_channel_becomes_default_and_preferences_update(db_session: Session) -> None:
    user = _user(db_session)
    destination = chat_links.add_discord_destination(
        db_session, user.id, guild_id="g", channel_id="c-default", name="#bookings"
    )
    client = _client_for(user)

    prefs = client.get("/api/me/preferences").json()
    assert prefs["default_destination_id"] == destination.id
    assert prefs["auto_cancel_default"] is False

    updated = client.put(
        "/api/me/preferences", json={"auto_cancel_default": True, "reminder_hours": [6]}
    ).json()
    assert updated["auto_cancel_default"] is True
    assert updated["reminder_hours"] == [6]


def test_users_cannot_touch_each_others_bookings_or_channels(db_session: Session) -> None:
    owner, other = _user(db_session), _user(db_session)
    task = _awaiting_task(db_session, owner)
    destination = chat_links.add_discord_destination(
        db_session, owner.id, guild_id="g", channel_id="c-owner", name="#owner"
    )
    client = _client_for(other)

    assert client.post(f"/api/booking-tasks/{task.id}/confirm").status_code == 404
    assert client.post(f"/api/booking-tasks/{task.id}/cancel-booking").status_code == 404
    assert client.delete(f"/api/chat/destinations/{destination.id}").status_code == 404
    response = client.put("/api/me/preferences", json={"default_destination_id": destination.id})
    assert response.status_code == 400


def test_confirm_and_cancel_endpoints(db_session: Session) -> None:
    register_cancel_handler(
        "route-provider",
        lambda ctx: CancelResult(CancelStatus.cancelled, refunded=True, refund_method="card"),
    )
    user = _user(db_session)
    client = _client_for(user)
    kept = _awaiting_task(db_session, user)
    cancelled = _awaiting_task(db_session, user)

    response = client.post(f"/api/booking-tasks/{kept.id}/confirm")
    assert response.status_code == 200
    assert response.json()["confirmation_status"] == "confirmed"

    response = client.post(f"/api/booking-tasks/{cancelled.id}/cancel-booking")
    assert response.status_code == 200
    body = response.json()
    assert body["confirmation_status"] == "cancelled"
    assert body["cancel_message"] == "Refunded to your card"

    # A cancelled booking can't then be kept
    assert client.post(f"/api/booking-tasks/{cancelled.id}/confirm").status_code == 409
