"""Runs due ScheduledActions: booking notifications, reminders and confirm deadlines."""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Callable

from sqlalchemy.orm import Session

from .. import models
from ..config import get_settings
from . import confirmation
from .chat import render
from .chat.base import ChatAdapter, OutgoingMessage, PostedMessage
from .chat.discord import DiscordClient

logger = logging.getLogger(__name__)

MAX_ATTEMPTS = 5
# A deadline action this late (e.g. the worker was down) is still run, but logged.
LATE_WARNING = timedelta(minutes=30)

Status = models.ConfirmationStatusEnum


class _Skip(Exception):
    """The action no longer applies (e.g. the booking was already kept)."""


def default_chat_adapter() -> ChatAdapter | None:
    token = get_settings().discord_bot_token
    return DiscordClient(token) if token else None


def process_due_actions(
    db: Session,
    *,
    now: datetime | None = None,
    limit: int = 10,
    chat_factory: Callable[[], ChatAdapter | None] = default_chat_adapter,
) -> int:
    """Run up to `limit` due actions. Returns how many were processed."""

    now = _utc(now) if now else datetime.now(timezone.utc)
    actions = (
        db.query(models.ScheduledAction)
        .filter(
            models.ScheduledAction.status == models.ActionStatusEnum.pending,
            models.ScheduledAction.due_at <= now,
        )
        .order_by(models.ScheduledAction.due_at.asc(), models.ScheduledAction.id.asc())
        .limit(limit)
        .with_for_update(skip_locked=True)
        .all()
    )
    if not actions:
        db.rollback()
        return 0

    chat = chat_factory()
    for action in actions:
        _run(db, action, chat, now)
    return len(actions)


def _run(
    db: Session, action: models.ScheduledAction, chat: ChatAdapter | None, now: datetime
) -> None:
    action_id = action.id
    try:
        handler = _HANDLERS[action.kind]
        handler(db, action, chat, now)
    except _Skip as reason:
        db.rollback()
        action = db.get(models.ScheduledAction, action_id)
        action.status = models.ActionStatusEnum.skipped
        action.last_error = str(reason) or None
        action.executed_at = now
    except Exception as exc:  # pylint: disable=broad-except
        logger.warning("Action %s (%s) failed: %s", action_id, action.kind, exc)
        db.rollback()
        action = db.get(models.ScheduledAction, action_id)
        action.attempts = (action.attempts or 0) + 1
        action.last_error = str(exc)[:2000]
        if action.attempts >= MAX_ATTEMPTS:
            action.status = models.ActionStatusEnum.failed
        else:
            action.due_at = now + timedelta(minutes=2**action.attempts)
    else:
        action = db.get(models.ScheduledAction, action_id)
        action.status = models.ActionStatusEnum.done
        action.executed_at = now
    db.commit()


# --- handlers ------------------------------------------------------------------


def _notify_booked(db, action, chat, now) -> None:
    task = _task(db, action)
    _post(db, task, render.booking_message(task), chat, purpose="booking")


def _reminder(db, action, chat, now) -> None:
    task = _task(db, action)
    if task.confirmation_status != Status.awaiting:
        raise _Skip(f"booking is {task.confirmation_status.value}")
    _post(db, task, render.reminder_message(task, now=now), chat, purpose="reminder")


def _deadline(db, action, chat, now) -> None:
    task = _task(db, action)
    if task.confirmation_status != Status.awaiting:
        raise _Skip(f"booking is {task.confirmation_status.value}")
    if now - _utc(action.due_at) > LATE_WARNING:
        logger.warning("Deadline for task %s is running late (due %s)", task.id, action.due_at)
    db.commit()  # request_cancel takes its own lock
    confirmation.request_cancel(db, task.id, confirmation.AUTO, now=now)


def _notify_cancel_result(db, action, chat, now) -> None:
    task = _task(db, action)
    _post(db, task, render.cancel_result_message(task), chat, purpose="cancel_result")


def _refresh_message(db, action, chat, now) -> None:
    """Re-render posted booking messages (e.g. remove buttons once decided)."""

    task = _task(db, action)
    posted = (
        db.query(models.ChatMessage)
        .filter(
            models.ChatMessage.booking_task_id == task.id,
            models.ChatMessage.purpose.in_(["booking", "reminder"]),
        )
        .all()
    )
    if not posted:
        raise _Skip("nothing posted")
    if chat is None:
        raise _Skip("chat not configured")
    for message in posted:
        if message.purpose == "booking":
            content = render.booking_message(task)
        else:
            content = OutgoingMessage(
                f"⏰ Reminder for **{render.short_id(task)}**: {render.status_line(task)}"
            )
        chat.edit(PostedMessage(message.channel_id, message.message_id), content)


_HANDLERS = {
    "notify_booked": _notify_booked,
    "reminder": _reminder,
    "deadline": _deadline,
    "notify_cancel_result": _notify_cancel_result,
    "refresh_message": _refresh_message,
}


# --- helpers -------------------------------------------------------------------


def _task(db: Session, action: models.ScheduledAction) -> models.BookingTask:
    task = db.get(models.BookingTask, action.booking_task_id) if action.booking_task_id else None
    if task is None:
        raise _Skip("booking no longer exists")
    return task


def _post(
    db: Session,
    task: models.BookingTask,
    message: OutgoingMessage,
    chat: ChatAdapter | None,
    *,
    purpose: str,
) -> None:
    settings = confirmation.effective_settings(db, task.booking_slot)
    destination = settings.destination
    if not settings.notifications_enabled:
        raise _Skip("notifications disabled")
    if destination is None or not destination.discord_channel_id:
        raise _Skip("no chat destination")
    if chat is None:
        raise _Skip("chat not configured")
    posted = chat.send(destination.discord_channel_id, message)
    db.add(
        models.ChatMessage(
            booking_task_id=task.id,
            destination_id=destination.id,
            platform="discord",
            channel_id=posted.channel_id,
            message_id=posted.message_id,
            purpose=purpose,
        )
    )


def _utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)
