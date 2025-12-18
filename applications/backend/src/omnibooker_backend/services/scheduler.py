from __future__ import annotations

import calendar
import logging
from datetime import datetime, timedelta, timezone, tzinfo
from typing import Iterable, List
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy.orm import Session

from .. import models

logger = logging.getLogger(__name__)


def _calculate_next_occurrence(
    slot: models.BookingSlot, base_date: datetime, offset: int
) -> datetime:
    tz = _slot_timezone(slot)
    base_local = base_date.astimezone(tz)
    result = base_local.replace(second=0, microsecond=0)
    hours, minutes = map(int, slot.time.split(":"))
    result = result.replace(hour=hours, minute=minutes)

    if slot.frequency in (
        models.FrequencyEnum.weekly,
        models.FrequencyEnum.fortnightly,
    ):
        target_day = _slot_day_of_week(slot) or 0
        days_until_next = (target_day - base_local.weekday() + 7) % 7
        increment = 7 if slot.frequency == models.FrequencyEnum.weekly else 14
        result = result + timedelta(days=days_until_next + offset * increment)
        if result <= base_local:
            result = result + timedelta(days=increment)
    elif slot.frequency == models.FrequencyEnum.monthly:
        desired_day = slot.day_of_month or 1
        current_days = calendar.monthrange(base_local.year, base_local.month)[1]
        safe_day = min(desired_day, current_days)
        candidate = result.replace(day=safe_day)

        month_delta = offset
        if candidate <= base_local:
            month_delta += 1

        total_months = (base_local.year * 12 + base_local.month - 1) + month_delta
        year = total_months // 12
        month = total_months % 12 + 1
        target_days = calendar.monthrange(year, month)[1]
        safe_day = min(desired_day, target_days)
        result = result.replace(year=year, month=month, day=safe_day)

    return result.astimezone(timezone.utc)


def generate_upcoming_tasks(
    slot: models.BookingSlot, count: int = 6
) -> Iterable[models.BookingTask]:
    now = datetime.now(timezone.utc)
    for offset in range(count):
        scheduled_at = _calculate_next_occurrence(slot, now, offset)
        if scheduled_at <= now:
            continue

        attempt_at = _calculate_attempt_at(slot, scheduled_at, reference=now)
        yield models.BookingTask(
            booking_slot_id=slot.id,
            scheduled_date=scheduled_at,
            attempt_at=attempt_at,
            status=models.TaskStatusEnum.pending,
        )


def _calculate_attempt_at(
    slot: models.BookingSlot,
    scheduled_at: datetime,
    *,
    reference: datetime | None = None,
) -> datetime:
    tz = _slot_timezone(slot)
    scheduled_local = scheduled_at.astimezone(tz)

    if slot.attempt_strategy == models.AttemptStrategyEnum.release:
        release_time = slot.release_time or "00:00"
        hours, minutes = map(int, release_time.split(":"))
        candidate = scheduled_local - timedelta(days=slot.release_days_before)
        attempt_local = candidate.replace(
            hour=hours, minute=minutes, second=0, microsecond=0
        )
        attempt_at = attempt_local.astimezone(timezone.utc)
    else:
        total_offset = (
            (slot.attempt_offset_days or 0) * 24 * 60
            + (slot.attempt_offset_hours or 0) * 60
            + (slot.attempt_offset_minutes or 0)
        )
        attempt_local = scheduled_local - timedelta(minutes=total_offset)
        attempt_at = attempt_local.astimezone(timezone.utc)

    if reference is not None:
        min_allowed = reference + timedelta(minutes=1)
        normalized_attempt = _normalize_datetime(attempt_at)
        normalized_reference = _normalize_datetime(reference)
        if normalized_attempt <= normalized_reference:
            attempt_at = min_allowed

    return attempt_at


def _existing_future_pending(
    db: Session, slot: models.BookingSlot
) -> List[models.BookingTask]:
    now = datetime.now(timezone.utc)
    return (
        db.query(models.BookingTask)
        .filter(models.BookingTask.booking_slot_id == slot.id)
        .filter(models.BookingTask.status == models.TaskStatusEnum.pending)
        .filter(models.BookingTask.scheduled_date >= now)
        .order_by(models.BookingTask.scheduled_date.asc())
        .all()
    )


def sync_pending_tasks(
    db: Session, slot: models.BookingSlot, count: int = 6, reset_existing: bool = False
) -> None:
    """Ensure there are at least `count` upcoming pending tasks for the slot.

    Existing future pending tasks are preserved; missing future occurrences are appended.
    """

    if not slot.is_active:
        return

    if reset_existing:
        db.query(models.BookingTask).filter(
            models.BookingTask.booking_slot_id == slot.id,
            models.BookingTask.status == models.TaskStatusEnum.pending,
        ).delete(synchronize_session=False)
        db.commit()

    existing = _existing_future_pending(db, slot)
    now = datetime.now(timezone.utc)

    # Keep attempt_at aligned with current slot settings
    for task in existing:
        task.attempt_at = _calculate_attempt_at(
            slot, task.scheduled_date, reference=now
        )
        db.add(task)

    existing_dates = {_normalize_datetime(task.scheduled_date) for task in existing}

    previously_processed_dates = (
        db.query(models.BookingTask.scheduled_date)
        .filter(models.BookingTask.booking_slot_id == slot.id)
        .filter(models.BookingTask.status != models.TaskStatusEnum.pending)
        .filter(models.BookingTask.scheduled_date >= now)
        .all()
    )
    for (scheduled_at,) in previously_processed_dates:
        existing_dates.add(_normalize_datetime(scheduled_at))

    offset = 0
    added = 0
    while len(existing) + added < count:
        scheduled_at = _calculate_next_occurrence(slot, now, offset)
        offset += 1
        normalized_candidate = _normalize_datetime(scheduled_at)
        if scheduled_at <= now or normalized_candidate in existing_dates:
            continue

        attempt_at = _calculate_attempt_at(slot, scheduled_at, reference=now)
        db.add(
            models.BookingTask(
                booking_slot_id=slot.id,
                scheduled_date=scheduled_at,
                attempt_at=attempt_at,
                status=models.TaskStatusEnum.pending,
            )
        )
        added += 1

        existing_dates.add(normalized_candidate)

    db.commit()


def _normalize_datetime(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value
    return value.astimezone(timezone.utc).replace(tzinfo=None)


def _slot_day_of_week(slot: models.BookingSlot) -> int | None:
    if slot.day_of_week is None:
        return None

    normalized = slot.day_of_week % 7
    python_weekday = (normalized + 6) % 7
    return python_weekday


def _slot_timezone(slot: models.BookingSlot) -> tzinfo:
    tz_name = slot.timezone or "UTC"
    try:
        return ZoneInfo(tz_name)
    except ZoneInfoNotFoundError:
        logger.warning(
            "Unknown timezone '%s' on booking slot %s; defaulting to UTC",
            tz_name,
            slot.id,
        )
        return timezone.utc
