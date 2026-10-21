"""Booking confirmation: ask the owner to keep each booking, auto-cancel if they don't.

After a booking succeeds, `on_booking_success` decides whether it needs confirming
and queues the notification, reminders and deadline as ScheduledActions (run by
the worker, see services/actions.py). `confirm` and `request_cancel` are the
decisions, called from the web UI, the Discord bot and the deadline action.
"""

from __future__ import annotations

import importlib
import logging
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Iterable

from sqlalchemy.orm import Session, selectinload

from .. import models
from .booking_engine import CancelContext, CancelStatus, ProviderContext, run_cancel

# Provider modules register their booking/cancel handlers on import. Every process
# that can cancel (worker, bot, API) goes through here, so load them here too.
importlib.import_module("omnibooker_backend.services.providers")

logger = logging.getLogger(__name__)

Status = models.ConfirmationStatusEnum

# Used when neither the user nor the provider gives us a deadline.
FALLBACK_DEADLINE_HOURS = 24

KEEPABLE = {Status.awaiting, Status.auto_kept, Status.not_required}
CANCELLABLE = {
    Status.awaiting,
    Status.confirmed,
    Status.auto_kept,
    Status.not_required,
    Status.cancel_failed,
    # The handler re-checks the refund deadline, so retrying these is safe.
    Status.manual_cancel_required,
}
# Actions that only make sense while a booking is still awaiting a decision.
DECISION_ACTIONS = ("reminder", "deadline")


@dataclass(frozen=True)
class ConfirmationSettings:
    notifications_enabled: bool
    destination: models.ChatDestination | None
    auto_cancel: bool
    confirm_deadline_hours: int | None
    refund_buffer_hours: int
    reminder_hours: list[int]
    short_notice_min_hours: int
    policy: models.ConfirmationPolicyEnum


@dataclass(frozen=True)
class Actor:
    """Who is making a decision. user_id is None for unlinked chat users and the system."""

    label: str  # "web", "discord:<id>", "assistant", "auto"
    user_id: int | None = None
    is_system: bool = False


AUTO = Actor(label="auto", is_system=True)


class DecisionError(RuntimeError):
    """A confirm/cancel request that isn't allowed in the booking's current state."""


# --- settings -----------------------------------------------------------------


def get_preferences(db: Session, user_id: int) -> models.UserPreferences:
    prefs = db.get(models.UserPreferences, user_id)
    if prefs is None:
        prefs = models.UserPreferences(
            user_id=user_id,
            notifications_enabled=True,
            auto_cancel_default=False,
            refund_buffer_hours=2,
            reminder_hours=[12, 2],
            short_notice_min_hours=1,
        )
        db.add(prefs)
        db.flush()
    return prefs


def effective_settings(db: Session, slot: models.BookingSlot) -> ConfirmationSettings:
    prefs = get_preferences(db, slot.user_id)
    destination_id = slot.notify_destination_id or prefs.default_destination_id
    destination = db.get(models.ChatDestination, destination_id) if destination_id else None
    if destination is not None and destination.user_id != slot.user_id:
        destination = None
    return ConfirmationSettings(
        notifications_enabled=_first(slot.notifications_enabled, prefs.notifications_enabled),
        destination=destination,
        auto_cancel=_first(slot.auto_cancel_enabled, prefs.auto_cancel_default),
        confirm_deadline_hours=_first(slot.confirm_deadline_hours, prefs.confirm_deadline_hours),
        refund_buffer_hours=prefs.refund_buffer_hours,
        reminder_hours=list(_first(slot.reminder_hours, prefs.reminder_hours) or []),
        short_notice_min_hours=prefs.short_notice_min_hours,
        policy=slot.confirmation_policy or models.ConfirmationPolicyEnum.owner_only,
    )


def compute_deadline(
    start_utc: datetime,
    refund_deadline_utc: datetime | None,
    settings: ConfirmationSettings,
) -> datetime:
    """The confirm-by time: the earliest of the user's setting and the refund deadline
    minus a buffer, so an auto-cancel always lands while it is still refunded."""

    candidates: list[datetime] = []
    if settings.confirm_deadline_hours is not None:
        candidates.append(start_utc - timedelta(hours=settings.confirm_deadline_hours))
    if refund_deadline_utc is not None:
        candidates.append(refund_deadline_utc - timedelta(hours=settings.refund_buffer_hours))
    if not candidates:
        candidates.append(start_utc - timedelta(hours=FALLBACK_DEADLINE_HOURS))
    return min(candidates)


# --- after a booking ----------------------------------------------------------


def on_booking_success(
    db: Session, task: models.BookingTask, *, now: datetime | None = None
) -> None:
    """Set the booking's confirmation state and queue its messages and deadline."""

    now = _utc(now) if now else datetime.now(timezone.utc)
    slot = task.booking_slot
    settings = effective_settings(db, slot)
    start = _utc(task.scheduled_date)
    task.refund_deadline_at = _refund_deadline(task)

    if not settings.auto_cancel:
        task.confirmation_status = Status.not_required
    else:
        deadline = compute_deadline(start, task.refund_deadline_at, settings)
        task.confirm_deadline_at = deadline
        if deadline - now < timedelta(hours=settings.short_notice_min_hours):
            task.confirmation_status = Status.auto_kept
        else:
            task.confirmation_status = Status.awaiting
            for hours in sorted(set(settings.reminder_hours), reverse=True):
                remind_at = deadline - timedelta(hours=hours)
                if remind_at > now:
                    enqueue(db, task, "reminder", remind_at)
            enqueue(db, task, "deadline", deadline)

    enqueue(db, task, "notify_booked", now)
    db.add(task)
    db.commit()


def _refund_deadline(task: models.BookingTask) -> datetime | None:
    raw = (task.provider_booking_ref or {}).get("refund_deadline_utc")
    if not raw:
        return None
    try:
        return _utc(datetime.fromisoformat(raw))
    except ValueError:
        logger.warning("Task %s has an unparseable refund deadline %r", task.id, raw)
        return None


# --- decisions ----------------------------------------------------------------


def can_actor_decide(task: models.BookingTask, actor: Actor) -> bool:
    if actor.is_system:
        return True
    policy = task.booking_slot.confirmation_policy
    if policy == models.ConfirmationPolicyEnum.anyone:
        return True
    # owner_only (and quorum, until it is implemented)
    return actor.user_id is not None and actor.user_id == task.booking_slot.user_id


def confirm(
    db: Session, task_id: int, actor: Actor, *, now: datetime | None = None
) -> models.BookingTask:
    """Keep a booking. Idempotent for bookings that are already kept."""

    now = _utc(now) if now else datetime.now(timezone.utc)
    task = _lock_task(db, task_id)
    if not can_actor_decide(task, actor):
        db.rollback()
        raise PermissionError("Only the booking's owner can keep it")
    if task.confirmation_status == Status.confirmed:
        db.rollback()
        return task
    if task.status != models.TaskStatusEnum.success or task.confirmation_status not in KEEPABLE:
        state = task.confirmation_status.value.replace("_", " ")
        db.rollback()
        raise DecisionError(f"This booking can't be kept (it is {state})")

    task.confirmation_status = Status.confirmed
    task.confirmed_at = now
    task.confirmed_by = actor.label
    _skip_actions(db, task.id, DECISION_ACTIONS)
    enqueue(db, task, "refresh_message", now, unique=False)
    db.commit()
    return task


def request_cancel(
    db: Session, task_id: int, actor: Actor, *, now: datetime | None = None
) -> models.BookingTask:
    """Cancel a booking with its provider and record the outcome."""

    now = _utc(now) if now else datetime.now(timezone.utc)
    task = _lock_task(db, task_id)
    if not can_actor_decide(task, actor):
        db.rollback()
        raise PermissionError("Only the booking's owner can cancel it")
    if task.status != models.TaskStatusEnum.success or task.confirmation_status not in CANCELLABLE:
        state = task.confirmation_status.value.replace("_", " ")
        db.rollback()
        raise DecisionError(f"This booking can't be cancelled (it is {state})")

    task.confirmation_status = Status.cancel_pending
    task.cancel_requested_at = now
    _skip_actions(db, task.id, DECISION_ACTIONS)
    db.commit()  # release the row lock while we talk to the provider

    provider = task.booking_slot.provider
    result = run_cancel(
        CancelContext(
            provider=ProviderContext(
                id=provider.id,
                name=provider.name,
                type=provider.type,
                credentials=provider.credentials or {},
            ),
            booking_ref=task.provider_booking_ref or {},
            now_utc=now,
        )
    )
    logger.info("Cancel of task %s by %s: %s", task.id, actor.label, result)

    if result.status == CancelStatus.cancelled:
        task.confirmation_status = Status.cancelled
        task.cancelled_at = datetime.now(timezone.utc)
    elif result.status == CancelStatus.manual_required:
        task.confirmation_status = Status.manual_cancel_required
    else:
        task.confirmation_status = Status.cancel_failed
    task.cancel_message = _describe_cancel(result.message, result.refunded, result.refund_method)
    enqueue(
        db,
        task,
        "notify_cancel_result",
        now,
        payload={"actor": actor.label},
        unique=False,
    )
    enqueue(db, task, "refresh_message", now, unique=False)
    db.add(task)
    db.commit()
    return task


def _describe_cancel(message: str | None, refunded: bool, method: str | None) -> str | None:
    if refunded and method == "credit":
        return "Refunded as account credit"
    if refunded:
        return "Refunded to your card"
    return message


# --- scheduled actions ---------------------------------------------------------


def enqueue(
    db: Session,
    task: models.BookingTask,
    kind: str,
    due_at: datetime,
    *,
    payload: dict | None = None,
    unique: bool = True,
) -> models.ScheduledAction | None:
    """Queue an action for the worker. Unique actions are only queued once per task/time."""

    dedupe_key = f"task:{task.id}:{kind}:{_utc(due_at).isoformat()}" if unique else None
    if dedupe_key and (
        db.query(models.ScheduledAction.id)
        .filter(models.ScheduledAction.dedupe_key == dedupe_key)
        .first()
    ):
        return None
    action = models.ScheduledAction(
        user_id=task.booking_slot.user_id,
        booking_task_id=task.id,
        kind=kind,
        due_at=due_at,
        payload=payload or {},
        dedupe_key=dedupe_key,
        status=models.ActionStatusEnum.pending,
        attempts=0,
    )
    db.add(action)
    return action


def _skip_actions(db: Session, task_id: int, kinds: Iterable[str]) -> None:
    (
        db.query(models.ScheduledAction)
        .filter(
            models.ScheduledAction.booking_task_id == task_id,
            models.ScheduledAction.status == models.ActionStatusEnum.pending,
            models.ScheduledAction.kind.in_(list(kinds)),
        )
        .update({"status": models.ActionStatusEnum.skipped}, synchronize_session=False)
    )


# --- helpers -------------------------------------------------------------------


def _lock_task(db: Session, task_id: int) -> models.BookingTask:
    task = (
        db.query(models.BookingTask)
        .options(
            selectinload(models.BookingTask.booking_slot).selectinload(
                models.BookingSlot.provider
            )
        )
        .filter(models.BookingTask.id == task_id)
        .with_for_update(of=models.BookingTask)
        .one_or_none()
    )
    if task is None:
        raise LookupError(f"Booking #{task_id:04d} not found")
    return task


def _first(*values):
    return next((value for value in values if value is not None), None)


def _utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)
