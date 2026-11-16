import uuid
from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from omnibooker_backend import models  # type: ignore[import-not-found]
from omnibooker_backend.database import SessionLocal, get_db  # type: ignore[import-not-found]
from omnibooker_backend.main import create_app  # type: ignore[import-not-found]
from omnibooker_backend.security import get_current_active_user  # type: ignore[import-not-found]

Task = models.TaskStatusEnum


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


def _slot(db: Session, *, active: bool = True) -> models.BookingSlot:
    user = models.User(email=f"{uuid.uuid4()}@example.com")
    db.add(user)
    db.flush()
    provider = models.Provider(user_id=user.id, name="P", type="Better", credentials={})
    db.add(provider)
    db.flush()
    slot = models.BookingSlot(
        user_id=user.id, provider_id=provider.id, name="Tennis",
        frequency=models.FrequencyEnum.weekly, day_of_week=1, time="18:00",
        timezone="Europe/London", provider_options={}, is_active=active,
        attempt_strategy=models.AttemptStrategyEnum.offset, attempt_offset_days=7,
    )
    db.add(slot)
    db.commit()
    db.refresh(slot)
    return slot


def _task(db: Session, slot: models.BookingSlot, when: datetime, status: Task, **extra):
    task = models.BookingTask(
        booking_slot_id=slot.id, scheduled_date=when, status=status, **extra
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    return task


def test_list_filters_by_date_status_and_session(db_session: Session) -> None:
    slot = _slot(db_session)
    other_slot = _slot(db_session)
    now = datetime.now(timezone.utc).replace(microsecond=0)
    old = _task(db_session, slot, now - timedelta(days=30), Task.success)
    soon = _task(db_session, slot, now + timedelta(days=2), Task.pending)
    later = _task(db_session, slot, now + timedelta(days=20), Task.failed)
    client = _client_for(slot.owner)

    def ids(**params):
        response = client.get("/api/booking-tasks/", params=params)
        assert response.status_code == 200
        return [t["id"] for t in response.json()]

    assert ids() == [old.id, soon.id, later.id]
    assert ids(**{"from": (now - timedelta(days=7)).isoformat()}) == [soon.id, later.id]
    assert ids(**{"to": (now + timedelta(days=7)).isoformat()}) == [old.id, soon.id]
    assert ids(status=["success", "failed"]) == [old.id, later.id]
    assert ids(slot_id=slot.id) == [old.id, soon.id, later.id]
    assert ids(slot_id=other_slot.id) == []


def test_failed_future_task_can_be_retried(db_session: Session) -> None:
    slot = _slot(db_session)
    now = datetime.now(timezone.utc)
    # Its booking window (7 days before) has already opened, so it retries straight away.
    task = _task(
        db_session, slot, now + timedelta(days=3), Task.failed,
        error_message="No courts", attempted_at=now - timedelta(hours=1),
        attempt_at=now - timedelta(hours=1),
    )

    response = _client_for(slot.owner).post(f"/api/booking-tasks/{task.id}/reactivate")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "pending"
    assert body["error_message"] is None
    assert body["attempted_at"] is None
    attempt_at = datetime.fromisoformat(body["attempt_at"])
    if attempt_at.tzinfo is None:
        attempt_at = attempt_at.replace(tzinfo=timezone.utc)
    assert now < attempt_at <= now + timedelta(minutes=2)


def test_past_or_paused_tasks_cannot_be_retried(db_session: Session) -> None:
    slot = _slot(db_session)
    paused = _slot(db_session, active=False)
    now = datetime.now(timezone.utc)
    past = _task(db_session, slot, now - timedelta(days=1), Task.failed)
    on_paused = _task(db_session, paused, now + timedelta(days=3), Task.failed)
    booked = _task(db_session, slot, now + timedelta(days=3), Task.success)

    assert _client_for(slot.owner).post(f"/api/booking-tasks/{past.id}/reactivate").status_code == 400
    assert _client_for(slot.owner).post(f"/api/booking-tasks/{booked.id}/reactivate").status_code == 400
    response = _client_for(paused.owner).post(f"/api/booking-tasks/{on_paused.id}/reactivate")
    assert response.status_code == 400
    assert "Resume the session" in response.json()["detail"]
