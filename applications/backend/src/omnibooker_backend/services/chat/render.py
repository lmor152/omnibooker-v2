"""Chat message text for booking notifications."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from ... import models
from ..scheduler import _slot_timezone
from .base import Button, ButtonStyle, OutgoingMessage

Status = models.ConfirmationStatusEnum

KEEP_PREFIX = "ob:keep:"
CANCEL_PREFIX = "ob:cancel:"
CANCEL_CONFIRM_PREFIX = "ob:cancel_confirm:"


def short_id(task: models.BookingTask) -> str:
    return f"#{task.id:04d}"


def decision_buttons(task: models.BookingTask) -> list[Button]:
    return [
        Button(f"{KEEP_PREFIX}{task.id}", "Keep it", ButtonStyle.success),
        Button(f"{CANCEL_PREFIX}{task.id}", "Cancel booking", ButtonStyle.danger),
    ]


def booking_message(task: models.BookingTask) -> OutgoingMessage:
    """The main booking post, rendered for the booking's current state."""

    status = task.confirmation_status
    header = f"🎾 **{short_id(task)} booked**: {describe(task)}"
    if status == Status.awaiting:
        return OutgoingMessage(
            f"{header}\nKeep it? Confirm by **{_when(task, task.confirm_deadline_at)}** "
            "or it will be cancelled while it can still be refunded.",
            decision_buttons(task),
        )
    return OutgoingMessage(f"{header}\n{status_line(task)}".rstrip())


def reminder_message(task: models.BookingTask, *, now: datetime | None = None) -> OutgoingMessage:
    now = now or datetime.now(timezone.utc)
    left = _duration(_utc(task.confirm_deadline_at) - now) if task.confirm_deadline_at else "soon"
    return OutgoingMessage(
        f"⏰ **{short_id(task)}** still needs confirming: {describe(task)}\n"
        f"It will be cancelled at **{_when(task, task.confirm_deadline_at)}** ({left} left) "
        "unless you keep it.",
        decision_buttons(task),
    )


def cancel_result_message(task: models.BookingTask) -> OutgoingMessage:
    status = task.confirmation_status
    what = f"**{short_id(task)}** ({describe(task)})"
    if status == Status.cancelled:
        return OutgoingMessage(f"❌ Cancelled {what}. {task.cancel_message or ''}".rstrip())
    if status == Status.manual_cancel_required:
        return OutgoingMessage(
            f"⚠️ Couldn't cancel {what} automatically: {task.cancel_message}.\n"
            f"Cancel it yourself in {_provider_name(task)} if you don't need it."
        )
    return OutgoingMessage(
        f"⚠️ Cancelling {what} may have failed: {task.cancel_message}.\n"
        f"Check your bookings in {_provider_name(task)}."
    )


def status_line(task: models.BookingTask) -> str:
    status = task.confirmation_status
    if status == Status.confirmed:
        return f"✅ Kept{_by(task.confirmed_by)}."
    if status == Status.auto_kept:
        return "Booked close to the deadline, so it's kept automatically."
    if status == Status.cancel_pending:
        return "⏳ Cancelling…"
    if status == Status.cancelled:
        return f"❌ Cancelled. {task.cancel_message or ''}".rstrip()
    if status == Status.manual_cancel_required:
        return f"⚠️ Needs cancelling by hand: {task.cancel_message}"
    if status == Status.cancel_failed:
        return f"⚠️ Cancel may have failed: {task.cancel_message}"
    return ""


def describe(task: models.BookingTask) -> str:
    slot = task.booking_slot
    start = _utc(task.scheduled_date).astimezone(_slot_timezone(slot))
    end = start + timedelta(minutes=slot.duration_minutes or 60)
    where = " · ".join(part for part in (slot.name, task.booked_resource) if part)
    when = f"{start:%a %-d %b} {task.booked_time or start.strftime('%H:%M')}–{end:%H:%M}"
    cost = f" (£{task.cost:.2f})" if task.cost is not None else ""
    return f"{where} · {when}{cost}"


def _when(task: models.BookingTask, moment: datetime | None) -> str:
    if moment is None:
        return "the deadline"
    return f"{_utc(moment).astimezone(_slot_timezone(task.booking_slot)):%a %-d %b %H:%M}"


def _duration(delta: timedelta) -> str:
    minutes = max(int(delta.total_seconds() // 60), 0)
    hours, minutes = divmod(minutes, 60)
    return f"{hours}h {minutes:02d}m" if hours else f"{minutes}m"


def _by(confirmed_by: str | None) -> str:
    if not confirmed_by or confirmed_by == "auto":
        return ""
    if confirmed_by.startswith("discord:"):
        return f" by <@{confirmed_by.split(':', 1)[1]}>"
    return " from the web app" if confirmed_by == "web" else f" ({confirmed_by})"


def _provider_name(task: models.BookingTask) -> str:
    return task.booking_slot.provider.type or "the provider's app"


def _utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)
