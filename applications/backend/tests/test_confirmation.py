import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal

import httpx
import pytest
from sqlalchemy.orm import Session

from omnibooker_backend import models  # type: ignore[import-not-found]
from omnibooker_backend.services import actions, confirmation  # type: ignore[import-not-found]
from omnibooker_backend.services.booking_engine import (  # type: ignore[import-not-found]
    CancelResult,
    CancelStatus,
    register_cancel_handler,
)
from omnibooker_backend.services.chat.base import (  # type: ignore[import-not-found]
    ChatError,
    OutgoingMessage,
    PostedMessage,
)
from omnibooker_backend.services.chat.discord import (  # type: ignore[import-not-found]
    DiscordClient,
)

Status = models.ConfirmationStatusEnum
NOW = datetime(2026, 10, 21, 12, 0, tzinfo=timezone.utc)
START = datetime(2026, 10, 25, 17, 0, tzinfo=timezone.utc)


def _aware(value: datetime) -> datetime:
    """SQLite returns naive datetimes; Postgres returns aware ones."""
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


@pytest.fixture(autouse=True)
def _empty_action_queue(db_session: Session):
    db_session.query(models.ScheduledAction).delete()
    db_session.commit()


class FakeChat:
    def __init__(self, fail: bool = False) -> None:
        self.sent: list[tuple[str, OutgoingMessage]] = []
        self.edits: list[tuple[PostedMessage, OutgoingMessage]] = []
        self.fail = fail

    def send(self, channel_id: str, message: OutgoingMessage) -> PostedMessage:
        if self.fail:
            raise ChatError("discord down")
        self.sent.append((channel_id, message))
        return PostedMessage(channel_id, f"m{len(self.sent)}")

    def edit(self, posted: PostedMessage, message: OutgoingMessage) -> None:
        self.edits.append((posted, message))


def _booking(
    db: Session,
    *,
    auto_cancel: bool = True,
    refund_deadline: datetime | None = START - timedelta(hours=24),
    with_destination: bool = True,
    start: datetime = START,
) -> models.BookingTask:
    user = models.User(email=f"{uuid.uuid4()}@example.com")
    db.add(user)
    db.flush()
    provider = models.Provider(user_id=user.id, name="Test", type="test-provider", credentials={})
    db.add(provider)
    db.flush()
    destination = None
    if with_destination:
        destination = models.ChatDestination(
            user_id=user.id, platform="discord_channel", name="#bookings",
            discord_guild_id="g1", discord_channel_id="c1",
        )
        db.add(destination)
        db.flush()
    slot = models.BookingSlot(
        user_id=user.id, provider_id=provider.id, name="Sunday Tennis",
        frequency=models.FrequencyEnum.one_off, time="17:00", timezone="Europe/London",
        duration_minutes=60, provider_options={}, auto_cancel_enabled=auto_cancel,
        notify_destination_id=destination.id if destination else None,
    )
    db.add(slot)
    db.flush()
    ref = {"provider": "test"}
    if refund_deadline:
        ref["refund_deadline_utc"] = refund_deadline.isoformat()
    task = models.BookingTask(
        booking_slot_id=slot.id, scheduled_date=start, status=models.TaskStatusEnum.success,
        booked_time="17:00", booked_resource="Court 2", cost=Decimal("14.10"),
        provider_booking_ref=ref,
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    return task


def _actions(db: Session, task: models.BookingTask, status=None) -> list[models.ScheduledAction]:
    query = db.query(models.ScheduledAction).filter_by(booking_task_id=task.id)
    if status:
        query = query.filter_by(status=status)
    return query.order_by(models.ScheduledAction.due_at).all()


def _settings(**overrides) -> confirmation.ConfirmationSettings:
    values = dict(
        notifications_enabled=True, destination=None, auto_cancel=True,
        confirm_deadline_hours=None, refund_buffer_hours=2, reminder_hours=[12, 2],
        short_notice_min_hours=1, policy=models.ConfirmationPolicyEnum.owner_only,
    )
    values.update(overrides)
    return confirmation.ConfirmationSettings(**values)


# --- deadlines -------------------------------------------------------------------


def test_deadline_defaults_to_refund_deadline_minus_buffer() -> None:
    refund = START - timedelta(hours=24)
    assert confirmation.compute_deadline(START, refund, _settings()) == refund - timedelta(hours=2)


def test_deadline_uses_the_earlier_of_setting_and_refund_deadline() -> None:
    refund = START - timedelta(hours=6)
    settings = _settings(confirm_deadline_hours=48)
    assert confirmation.compute_deadline(START, refund, settings) == START - timedelta(hours=48)
    settings = _settings(confirm_deadline_hours=2)
    assert confirmation.compute_deadline(START, refund, settings) == refund - timedelta(hours=2)


def test_deadline_falls_back_without_any_information() -> None:
    assert confirmation.compute_deadline(START, None, _settings()) == START - timedelta(hours=24)


def test_deadline_is_absolute_time_across_dst_change() -> None:
    # Clocks go forward at 01:00 UTC on 29 Mar 2026; 10:00 BST is 09:00 UTC.
    start = datetime(2026, 3, 29, 9, 0, tzinfo=timezone.utc)
    deadline = confirmation.compute_deadline(start, None, _settings(confirm_deadline_hours=24))
    assert (start - deadline).total_seconds() == 24 * 3600


# --- after a booking ---------------------------------------------------------------


def test_without_auto_cancel_only_notifies(db_session: Session) -> None:
    task = _booking(db_session, auto_cancel=False)

    confirmation.on_booking_success(db_session, task, now=NOW)

    assert task.confirmation_status == Status.not_required
    assert [a.kind for a in _actions(db_session, task)] == ["notify_booked"]


def test_awaiting_queues_reminders_and_deadline(db_session: Session) -> None:
    task = _booking(db_session)

    confirmation.on_booking_success(db_session, task, now=NOW)

    deadline = START - timedelta(hours=26)  # refund deadline (24h) minus 2h buffer
    assert task.confirmation_status == Status.awaiting
    assert _aware(task.confirm_deadline_at) == deadline
    assert [(a.kind, _aware(a.due_at)) for a in _actions(db_session, task)] == [
        ("notify_booked", NOW),
        ("reminder", deadline - timedelta(hours=12)),
        ("reminder", deadline - timedelta(hours=2)),
        ("deadline", deadline),
    ]


def test_past_reminders_are_skipped(db_session: Session) -> None:
    task = _booking(db_session, start=NOW + timedelta(hours=36), refund_deadline=None)

    confirmation.on_booking_success(db_session, task, now=NOW)

    # deadline = start - 24h = NOW + 12h, so the 12h-before reminder is already due
    kinds = [a.kind for a in _actions(db_session, task)]
    assert kinds == ["notify_booked", "reminder", "deadline"]


def test_short_notice_booking_is_kept_automatically(db_session: Session) -> None:
    task = _booking(db_session, start=NOW + timedelta(hours=4), refund_deadline=None)

    confirmation.on_booking_success(db_session, task, now=NOW)

    assert task.confirmation_status == Status.auto_kept
    assert [a.kind for a in _actions(db_session, task)] == ["notify_booked"]


def test_success_hook_is_idempotent(db_session: Session) -> None:
    task = _booking(db_session)

    confirmation.on_booking_success(db_session, task, now=NOW)
    confirmation.on_booking_success(db_session, task, now=NOW)

    assert len(_actions(db_session, task)) == 4


# --- decisions -----------------------------------------------------------------------


def _owner(task: models.BookingTask) -> confirmation.Actor:
    return confirmation.Actor(label="web", user_id=task.booking_slot.user_id)


def test_owner_can_keep_booking(db_session: Session) -> None:
    task = _booking(db_session)
    confirmation.on_booking_success(db_session, task, now=NOW)

    confirmation.confirm(db_session, task.id, _owner(task), now=NOW)

    assert task.confirmation_status == Status.confirmed
    assert task.confirmed_by == "web"
    pending = {a.kind for a in _actions(db_session, task, models.ActionStatusEnum.pending)}
    assert pending == {"notify_booked", "refresh_message"}
    # Keeping again is harmless
    confirmation.confirm(db_session, task.id, _owner(task), now=NOW)


def test_other_users_cannot_decide(db_session: Session) -> None:
    task = _booking(db_session)
    confirmation.on_booking_success(db_session, task, now=NOW)
    stranger = confirmation.Actor(label="discord:999", user_id=None)

    with pytest.raises(PermissionError):
        confirmation.confirm(db_session, task.id, stranger)
    with pytest.raises(PermissionError):
        confirmation.request_cancel(db_session, task.id, stranger)
    db_session.refresh(task)
    assert task.confirmation_status == Status.awaiting


def test_cancel_records_provider_outcome(db_session: Session) -> None:
    register_cancel_handler(
        "test-provider",
        lambda ctx: CancelResult(CancelStatus.cancelled, refunded=True, refund_method="card"),
    )
    task = _booking(db_session)
    confirmation.on_booking_success(db_session, task, now=NOW)

    confirmation.request_cancel(db_session, task.id, _owner(task), now=NOW)

    assert task.confirmation_status == Status.cancelled
    assert task.status == models.TaskStatusEnum.success  # never re-booked by /reactivate
    assert task.cancel_message == "Refunded to your card"
    pending = {a.kind for a in _actions(db_session, task, models.ActionStatusEnum.pending)}
    assert pending == {"notify_booked", "notify_cancel_result", "refresh_message"}
    with pytest.raises(confirmation.DecisionError):
        confirmation.confirm(db_session, task.id, _owner(task))


def test_provider_without_cancel_support_needs_manual_cancel(db_session: Session) -> None:
    task = _booking(db_session)
    confirmation.on_booking_success(db_session, task, now=NOW)

    confirmation.request_cancel(db_session, task.id, _owner(task), now=NOW)

    assert task.confirmation_status == Status.manual_cancel_required
    assert "not supported" in (task.cancel_message or "")


# --- worker actions -------------------------------------------------------------------


def _run_due(db: Session, chat, now: datetime) -> int:
    return actions.process_due_actions(db, now=now, limit=50, chat_factory=lambda: chat)


def test_booking_notification_posts_with_buttons(db_session: Session) -> None:
    task = _booking(db_session)
    confirmation.on_booking_success(db_session, task, now=NOW)
    chat = FakeChat()

    _run_due(db_session, chat, NOW)

    channel, message = chat.sent[0]
    assert channel == "c1"
    assert f"#{task.id:04d} booked" in message.content
    assert "Court 2" in message.content and "£14.10" in message.content
    assert [b.custom_id for b in message.buttons] == [f"ob:keep:{task.id}", f"ob:cancel:{task.id}"]
    posted = db_session.query(models.ChatMessage).filter_by(booking_task_id=task.id).one()
    assert posted.purpose == "booking"


def test_deadline_cancels_unconfirmed_booking(db_session: Session) -> None:
    register_cancel_handler(
        "test-provider",
        lambda ctx: CancelResult(CancelStatus.cancelled, refunded=True, refund_method="credit"),
    )
    task = _booking(db_session)
    confirmation.on_booking_success(db_session, task, now=NOW)
    chat = FakeChat()

    _run_due(db_session, chat, _aware(task.confirm_deadline_at) + timedelta(seconds=1))
    _run_due(db_session, chat, _aware(task.confirm_deadline_at) + timedelta(seconds=2))

    db_session.refresh(task)
    assert task.confirmation_status == Status.cancelled
    texts = [m.content for _, m in chat.sent]
    assert sum("still needs confirming" in t for t in texts) == 2  # both reminders
    assert any(t.startswith("❌ Cancelled") and "account credit" in t for t in texts)
    assert chat.edits  # booking message updated, buttons removed
    assert all(not m.buttons for _, m in chat.edits)


def test_kept_booking_skips_reminders_and_deadline(db_session: Session) -> None:
    task = _booking(db_session)
    confirmation.on_booking_success(db_session, task, now=NOW)
    confirmation.confirm(db_session, task.id, _owner(task), now=NOW)
    chat = FakeChat()

    _run_due(db_session, chat, _aware(task.confirm_deadline_at) + timedelta(hours=1))

    db_session.refresh(task)
    assert task.confirmation_status == Status.confirmed
    assert not any("still needs confirming" in m.content for _, m in chat.sent)


def test_without_destination_messages_are_skipped(db_session: Session) -> None:
    task = _booking(db_session, with_destination=False)
    confirmation.on_booking_success(db_session, task, now=NOW)

    _run_due(db_session, FakeChat(), NOW)

    (action,) = _actions(db_session, task)[:1]
    assert action.status == models.ActionStatusEnum.skipped
    assert action.last_error == "no chat destination"


def test_failed_send_is_retried_with_backoff(db_session: Session) -> None:
    task = _booking(db_session, auto_cancel=False)
    confirmation.on_booking_success(db_session, task, now=NOW)

    _run_due(db_session, FakeChat(fail=True), NOW)

    (action,) = _actions(db_session, task)
    assert action.status == models.ActionStatusEnum.pending
    assert action.attempts == 1
    assert _aware(action.due_at) == NOW + timedelta(minutes=2)


# --- Discord REST client --------------------------------------------------------------


def test_discord_client_posts_buttons_and_retries_rate_limit() -> None:
    calls: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        if len(calls) == 1:
            return httpx.Response(429, json={"retry_after": 0.5})
        return httpx.Response(200, json={"id": "123"})

    slept: list[float] = []
    client = DiscordClient(
        "tok",
        http_factory=lambda: httpx.Client(transport=httpx.MockTransport(handler)),
        sleep=slept.append,
    )
    from omnibooker_backend.services.chat.base import Button, ButtonStyle  # type: ignore

    posted = client.send(
        "c1", OutgoingMessage("hi", [Button("ob:keep:1", "Keep it", ButtonStyle.success)])
    )

    assert posted == PostedMessage("c1", "123")
    assert slept == [0.5]
    request = calls[-1]
    assert request.url.path == "/api/v10/channels/c1/messages"
    assert request.headers["Authorization"] == "Bot tok"
    body = httpx.Response(200, content=request.content).json()
    assert body["allowed_mentions"] == {"parse": []}
    assert body["components"][0]["components"][0] == {
        "type": 2, "style": 3, "label": "Keep it", "custom_id": "ob:keep:1",
    }


def test_cancel_handlers_are_registered_wherever_confirmation_is_used() -> None:
    """Regression: the bot/worker never imported the providers, so no cancel handlers."""
    import subprocess
    import sys

    code = (
        "from omnibooker_backend.services import confirmation, booking_engine; "
        "assert {'clubspark', 'better'} <= set(booking_engine._cancel_registry), "
        "booking_engine._cancel_registry"
    )
    subprocess.run([sys.executable, "-c", code], check=True)
