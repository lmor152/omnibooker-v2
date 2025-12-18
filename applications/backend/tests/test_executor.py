from datetime import datetime, timedelta, timezone

from omnibooker_backend import models  # type: ignore[import-not-found]
from omnibooker_backend.services.booking_engine import (  # type: ignore[import-not-found]
    BookingContext,
    BookingResult,
    register_provider_handler,
)
from omnibooker_backend.services.executor import (  # type: ignore[import-not-found]
    execute_booking_task,
)
from sqlalchemy.orm import Session


def _create_user(db: Session) -> models.User:
    user = models.User(email="runner@example.com", full_name="Runner")
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _create_provider(db: Session, user: models.User) -> models.Provider:
    provider = models.Provider(
        user_id=user.id,
        name="Automation",
        type="test-provider",
        credentials={"username": "runner", "password": "pw"},
    )
    db.add(provider)
    db.commit()
    db.refresh(provider)
    return provider


def _create_slot(
    db: Session, user: models.User, provider: models.Provider
) -> models.BookingSlot:
    slot = models.BookingSlot(
        user_id=user.id,
        provider_id=provider.id,
        name="Demo Slot",
        frequency=models.FrequencyEnum.weekly,
        day_of_week=2,
        time="06:30",
        timezone="UTC",
        is_active=True,
        duration_minutes=90,
        provider_options={"facility": "Center"},
    )
    db.add(slot)
    db.commit()
    db.refresh(slot)
    return slot


def test_execute_booking_task_builds_context(db_session: Session) -> None:
    user = _create_user(db_session)
    provider = _create_provider(db_session, user)
    slot = _create_slot(db_session, user, provider)

    scheduled = datetime(2025, 1, 1, 6, 30, tzinfo=timezone.utc)
    attempt_time = scheduled - timedelta(days=1)

    task = models.BookingTask(
        booking_slot_id=slot.id,
        scheduled_date=scheduled,
        status=models.TaskStatusEnum.processing,
        attempt_at=attempt_time,
    )
    db_session.add(task)
    db_session.commit()
    db_session.refresh(task)

    captured: dict[str, BookingContext] = {}

    def handler(context: BookingContext) -> BookingResult:
        captured["context"] = context
        return BookingResult(success=True, confirmation_code="CONF123")

    register_provider_handler(provider.type, handler)

    updated_task = execute_booking_task(db_session, task)

    assert updated_task.status == models.TaskStatusEnum.success
    assert "context" in captured
    context = captured["context"]
    assert context.provider.credentials["username"] == "runner"
    assert context.slot.duration_minutes == 90
    assert context.task.scheduled_start_utc == scheduled
    assert context.task.attempt_at_utc == attempt_time
    assert context.task.target_date == scheduled.date()
    assert context.user.email == "runner@example.com"
