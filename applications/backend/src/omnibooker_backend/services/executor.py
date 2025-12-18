from __future__ import annotations

import importlib
import logging
from datetime import datetime, timedelta, timezone
from typing import cast
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy.orm import Session, selectinload

from .. import models
from .booking_engine import (
    BookingContext,
    BookingProviderNotRegisteredError,
    BookingResult,
    ProviderContext,
    SlotContext,
    TaskContext,
    UserContext,
    run_booking,
)

importlib.import_module("omnibooker_backend.services.providers")

logger = logging.getLogger(__name__)


class BookingExecutionError(RuntimeError):
    """Raised when a booking task fails to execute successfully."""


def execute_booking_task(db: Session, task: models.BookingTask) -> models.BookingTask:
    """Execute a booking task and mark it successful when the provider confirms."""

    task = (
        db.query(models.BookingTask)
        .options(
            selectinload(models.BookingTask.booking_slot).selectinload(
                models.BookingSlot.provider
            ),
            selectinload(models.BookingTask.booking_slot).selectinload(
                models.BookingSlot.owner
            ),
        )
        .filter(models.BookingTask.id == task.id)
        .one()
    )

    slot = cast(models.BookingSlot | None, getattr(task, "booking_slot", None))
    provider = slot.provider if slot else None
    owner = slot.owner if slot else None

    if slot is None:
        raise BookingExecutionError("Booking slot no longer exists")
    if provider is None:
        raise BookingExecutionError("Provider no longer exists for booking slot")
    if owner is None:
        raise BookingExecutionError("Slot owner no longer exists")

    context = _build_context(task, slot, provider, owner)
    logger.info(
        "Executing booking task %s for provider %s (%s)",
        task.id,
        provider.name,
        provider.type,
    )

    try:
        result = run_booking(context)
    except BookingProviderNotRegisteredError as exc:
        raise BookingExecutionError(str(exc)) from exc

    if not result.success:
        raise BookingExecutionError(result.message or "Booking provider failed")

    task.status = models.TaskStatusEnum.success
    task.error_message = None
    if task.attempted_at is None:
        task.attempted_at = datetime.now(timezone.utc)

    db.add(task)
    db.commit()
    db.refresh(task)

    _log_success(task, result)
    return task


def _build_context(
    task: models.BookingTask,
    slot: models.BookingSlot,
    provider: models.Provider,
    owner: models.User,
) -> BookingContext:
    tz = _resolve_timezone(slot.timezone or "UTC")
    scheduled_start_utc = _ensure_utc(task.scheduled_date)
    duration = slot.duration_minutes or 60
    scheduled_end_utc = scheduled_start_utc + timedelta(minutes=duration)

    scheduled_start_local = scheduled_start_utc.astimezone(tz)
    scheduled_end_local = scheduled_end_utc.astimezone(tz)

    attempt_at_utc = _ensure_utc(task.attempt_at) if task.attempt_at else None
    attempt_at_local = attempt_at_utc.astimezone(tz) if attempt_at_utc else None

    provider_context = ProviderContext(
        id=provider.id,
        name=provider.name,
        type=provider.type,
        credentials=provider.credentials or {},
    )

    slot_context = SlotContext(
        id=slot.id,
        name=slot.name,
        facility=slot.facility,
        timezone=slot.timezone,
        frequency=slot.frequency.value,
        duration_minutes=duration,
        provider_options=slot.provider_options or {},
    )

    user_context = UserContext(
        id=owner.id,
        email=owner.email,
        full_name=owner.full_name,
    )

    task_context = TaskContext(
        id=task.id,
        scheduled_start_utc=scheduled_start_utc,
        scheduled_start_local=scheduled_start_local,
        scheduled_end_utc=scheduled_end_utc,
        scheduled_end_local=scheduled_end_local,
        attempt_at_utc=attempt_at_utc,
        attempt_at_local=attempt_at_local,
        target_date=scheduled_start_local.date(),
    )

    return BookingContext(
        provider=provider_context,
        slot=slot_context,
        task=task_context,
        user=user_context,
    )


def _ensure_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _resolve_timezone(name: str) -> ZoneInfo:
    try:
        return ZoneInfo(name)
    except ZoneInfoNotFoundError:  # pragma: no cover - depends on system tz db
        logger.warning("Unknown timezone '%s'; defaulting to UTC", name)
        return ZoneInfo("UTC")


def _log_success(task: models.BookingTask, result: BookingResult) -> None:
    if result.confirmation_code:
        logger.info("Task %s confirmed with code %s", task.id, result.confirmation_code)
    elif result.message:
        logger.info("Task %s completed: %s", task.id, result.message)
    else:
        logger.info("Task %s completed", task.id)
