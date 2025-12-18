from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import uuid4
from zoneinfo import ZoneInfo

from omnibooker_backend import models  # type: ignore[import-not-found]
from omnibooker_backend.services.scheduler import (  # type: ignore[import-not-found]
    sync_pending_tasks,
)
from sqlalchemy.orm import Session


def _create_user(db: Session) -> models.User:
    user = models.User(
        email=f"user-{uuid4()}@example.com",
        full_name="Test User",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _create_provider(db: Session, user: models.User) -> models.Provider:
    provider = models.Provider(
        user_id=user.id,
        name="ClubSpark",
        type="clubspark",
        credentials={"username": "demo", "password": "secret"},
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
        name="Weekly Tennis",
        frequency=models.FrequencyEnum.weekly,
        day_of_week=0,
        time="09:00",
        timezone="Europe/London",
        is_active=True,
    )
    db.add(slot)
    db.commit()
    db.refresh(slot)
    return slot


def _pending_task_count(db: Session, slot_id: int) -> int:
    return (
        db.query(models.BookingTask)
        .filter(
            models.BookingTask.booking_slot_id == slot_id,
            models.BookingTask.status == models.TaskStatusEnum.pending,
        )
        .count()
    )


def _list_pending_tasks(db: Session, slot_id: int) -> list[models.BookingTask]:
    return (
        db.query(models.BookingTask)
        .filter(
            models.BookingTask.booking_slot_id == slot_id,
            models.BookingTask.status == models.TaskStatusEnum.pending,
        )
        .order_by(models.BookingTask.scheduled_date.asc())
        .all()
    )


def _naive_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value
    return value.astimezone(timezone.utc).replace(tzinfo=None)


def test_sync_pending_tasks_top_up_queue(db_session: Session) -> None:
    user = _create_user(db_session)
    provider = _create_provider(db_session, user)
    slot = _create_slot(db_session, user, provider)

    sync_pending_tasks(db_session, slot, count=3, reset_existing=True)
    assert _pending_task_count(db_session, slot.id) == 3

    task = (
        db_session.query(models.BookingTask)
        .filter(models.BookingTask.booking_slot_id == slot.id)
        .first()
    )
    assert task is not None
    task.status = models.TaskStatusEnum.success
    task.attempted_at = datetime.now(timezone.utc)
    db_session.add(task)
    db_session.commit()

    sync_pending_tasks(db_session, slot, count=3)
    assert _pending_task_count(db_session, slot.id) == 3


def test_sync_pending_tasks_does_not_requeue_failed_occurrence(
    db_session: Session,
) -> None:
    user = _create_user(db_session)
    provider = _create_provider(db_session, user)
    slot = _create_slot(db_session, user, provider)

    sync_pending_tasks(db_session, slot, count=3, reset_existing=True)
    pending = _list_pending_tasks(db_session, slot.id)
    assert len(pending) == 3

    first_task = pending[0]
    first_scheduled = first_task.scheduled_date
    first_task.status = models.TaskStatusEnum.failed
    first_task.attempted_at = datetime.now(timezone.utc)
    db_session.add(first_task)
    db_session.commit()

    sync_pending_tasks(db_session, slot, count=3)

    refreshed_pending = _list_pending_tasks(db_session, slot.id)
    assert len(refreshed_pending) == 3
    assert all(task.scheduled_date != first_scheduled for task in refreshed_pending)
    assert min(task.scheduled_date for task in refreshed_pending) > first_scheduled


def test_sync_pending_tasks_skip_past_attempt_times(db_session: Session) -> None:
    user = _create_user(db_session)
    provider = _create_provider(db_session, user)
    slot = _create_slot(db_session, user, provider)

    now = datetime.now(timezone.utc)
    slot.day_of_week = now.weekday()
    future_time = (now + timedelta(minutes=5)).strftime("%H:%M")
    slot.time = str(future_time)
    slot.attempt_strategy = models.AttemptStrategyEnum.offset
    slot.attempt_offset_days = 0
    slot.attempt_offset_hours = 0
    slot.attempt_offset_minutes = 60
    db_session.add(slot)
    db_session.commit()
    db_session.refresh(slot)

    sync_pending_tasks(db_session, slot, count=3, reset_existing=True)
    pending = _list_pending_tasks(db_session, slot.id)
    assert pending, "Expected scheduler to create future tasks"

    observed_now = datetime.now(timezone.utc)
    for task in pending:
        assert task.attempt_at is not None
        assert _naive_utc(task.attempt_at) > _naive_utc(observed_now)


def test_weekly_slot_uses_local_day_of_week(db_session: Session) -> None:
    user = _create_user(db_session)
    provider = _create_provider(db_session, user)
    slot = _create_slot(db_session, user, provider)
    slot.day_of_week = 0  # Sunday in UI
    slot.time = "18:30"
    slot.timezone = "Europe/London"
    db_session.add(slot)
    db_session.commit()
    db_session.refresh(slot)

    sync_pending_tasks(db_session, slot, count=1, reset_existing=True)
    pending = _list_pending_tasks(db_session, slot.id)
    assert pending, "Expected at least one pending task"

    task = pending[0]
    local_time = task.scheduled_date.astimezone(ZoneInfo(slot.timezone))
    assert local_time.weekday() == 6  # Sunday in Python weekday
    assert (local_time.hour, local_time.minute) == (18, 30)


def test_release_attempt_respects_slot_timezone(db_session: Session) -> None:
    user = _create_user(db_session)
    provider = _create_provider(db_session, user)
    slot = _create_slot(db_session, user, provider)
    slot.day_of_week = 0  # Sunday
    slot.time = "10:00"
    slot.timezone = "Australia/Sydney"
    slot.attempt_strategy = models.AttemptStrategyEnum.release
    slot.release_days_before = 1
    slot.release_time = "07:15"
    db_session.add(slot)
    db_session.commit()
    db_session.refresh(slot)

    sync_pending_tasks(db_session, slot, count=1, reset_existing=True)
    pending = _list_pending_tasks(db_session, slot.id)
    assert pending, "Expected at least one pending task"

    task = pending[0]
    scheduled_local = task.scheduled_date.astimezone(ZoneInfo(slot.timezone))
    assert task.attempt_at is not None
    attempt_local = task.attempt_at.astimezone(ZoneInfo(slot.timezone))
    expected_attempt = (scheduled_local - timedelta(days=1)).replace(
        hour=7, minute=15, second=0, microsecond=0
    )

    assert attempt_local == expected_attempt
