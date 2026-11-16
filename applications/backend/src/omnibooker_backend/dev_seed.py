"""Fill a LOCAL database with demo sessions and bookings in every state, for trying the UI.

    uv run --project applications/backend -- python -m omnibooker_backend.dev_seed [--email you@example.com] [--reset]

Log in to the local app once first so your user exists. With one user in the database it's picked
automatically. Seeded providers use the type "Demo", which has no booking handler, so the worker never
contacts a real provider: anything it tries to book or cancel just fails safely.

It refuses to run against anything but a local database.
"""

from __future__ import annotations

import argparse
import sys
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from urllib.parse import urlparse
from zoneinfo import ZoneInfo

from . import models
from .config import get_settings
from .database import SessionLocal

DEMO_TYPE = "Demo"
TZ = ZoneInfo("Europe/London")
Task = models.TaskStatusEnum
Conf = models.ConfirmationStatusEnum

# Only a database on this machine. Deliberately excludes "db" (the hostname inside the
# docker-compose stack, i.e. production) and socket connections.
LOCAL_HOSTS = {"localhost", "127.0.0.1", "::1"}


def _is_local(url: str) -> bool:
    if url.startswith("sqlite"):
        return True
    return (urlparse(url.replace("+psycopg", "")).hostname or "") in LOCAL_HOSTS


def _at(day: datetime, hhmm: str) -> datetime:
    hours, minutes = map(int, hhmm.split(":"))
    return day.replace(hour=hours, minute=minutes, second=0, microsecond=0)


def seed(db, user: models.User, *, now: datetime) -> int:
    better = models.Provider(user_id=user.id, name="Demo Better", type=DEMO_TYPE, credentials={"username": "demo@example.com", "password": "demo"})
    clubspark = models.Provider(user_id=user.id, name="Demo ClubSpark", type=DEMO_TYPE, credentials={"username": "demo@example.com", "password": "demo"})
    db.add_all([better, clubspark])
    db.flush()

    common = dict(user_id=user.id, timezone="Europe/London", duration_minutes=60, provider_options={}, attempt_strategy=models.AttemptStrategyEnum.release)
    slots = [
        # (slot, python weekday, every n weeks)
        (models.BookingSlot(**common, provider_id=clubspark.id, name="Monday evening tennis", frequency=models.FrequencyEnum.weekly, day_of_week=1, time="20:00", release_days_before=7, release_time="07:00", auto_cancel_enabled=True), 0, 1),
        (models.BookingSlot(**common, provider_id=better.id, name="Saturday doubles", frequency=models.FrequencyEnum.weekly, day_of_week=6, time="09:00", release_days_before=5, release_time="22:00"), 5, 1),
        (models.BookingSlot(**common, provider_id=better.id, name="Wednesday hit", frequency=models.FrequencyEnum.fortnightly, day_of_week=3, time="19:00", release_days_before=7, release_time="22:00"), 2, 2),
    ]
    paused = models.BookingSlot(**common, provider_id=clubspark.id, name="Sunday coaching (paused)", frequency=models.FrequencyEnum.weekly, day_of_week=0, time="10:00", release_days_before=7, release_time="07:00", is_active=False)
    db.add_all([s for s, _, _ in slots] + [paused])
    db.flush()

    today = datetime.now(TZ).replace(hour=0, minute=0, second=0, microsecond=0)
    created = 0
    past_states = [Conf.confirmed, Conf.auto_kept, "failed", Conf.not_required, "skipped", Conf.cancelled, Conf.confirmed]
    # Upcoming dates whose booking window has already opened, nearest first.
    attempted_future_states = [
        ("awaiting", timedelta(hours=5)),  # urgent: "confirm in 5h"
        (Conf.manual_cancel_required, None),
        ("failed", None),  # shows Retry
        ("awaiting", timedelta(days=2)),
        (Conf.confirmed, None),
    ]
    past_i = future_i = pending_i = 0
    court = 1

    for offset in range(-45, 36):
        day = today + timedelta(days=offset)
        for slot, weekday, every in slots:
            if day.weekday() != weekday or (every == 2 and (offset // 7) % 2):
                continue
            start = _at(day, slot.time).astimezone(timezone.utc)
            attempt_at = _at(day - timedelta(days=slot.release_days_before), slot.release_time).astimezone(timezone.utc)
            task = models.BookingTask(booking_slot_id=slot.id, scheduled_date=start, attempt_at=attempt_at, created_at=now - timedelta(days=50))

            if start > now and attempt_at > now:
                task.status = Task.pending
                task.confirmation_status = Conf.not_required
                pending_i += 1
                if pending_i == 4:
                    task.status = Task.cancelled  # one skipped date in the future (shows Undo)
            else:
                state = past_states[past_i % len(past_states)] if start <= now else None
                deadline = None
                if start > now:
                    state, deadline = attempted_future_states[min(future_i, len(attempted_future_states) - 1)]
                    future_i += 1
                else:
                    past_i += 1
                task.attempted_at = attempt_at + timedelta(seconds=4)
                if state == "failed":
                    task.status = Task.failed
                    task.error_message = "No courts were free at the requested times."
                    task.confirmation_status = Conf.not_required
                elif state == "skipped":
                    task.status = Task.cancelled
                    task.attempted_at = None
                    task.confirmation_status = Conf.not_required
                else:
                    court = court % 6 + 1
                    task.status = Task.success
                    task.booked_time = slot.time
                    task.booked_resource = f"Court {court}"
                    task.cost = Decimal("9.60") if slot.provider_id == clubspark.id else Decimal("14.10")
                    task.currency = "GBP"
                    task.confirmation_code = f"DEMO-{80000 + offset * 7 + court}"
                    task.refund_deadline_at = start - timedelta(hours=24)
                    task.provider_booking_ref = {"provider": "demo", "refund_deadline_utc": (start - timedelta(hours=24)).isoformat()}
                    if state == "awaiting":
                        task.confirmation_status = Conf.awaiting
                        task.confirm_deadline_at = min(now + deadline, start - timedelta(hours=1))
                    else:
                        task.confirmation_status = state
                        if state == Conf.confirmed:
                            task.confirmed_at = task.attempted_at + timedelta(hours=3)
                            task.confirmed_by = "web"
                        elif state == Conf.cancelled:
                            task.cancelled_at = task.attempted_at + timedelta(hours=5)
                            task.cancel_message = "Refunded as credit."
                        elif state == Conf.manual_cancel_required:
                            task.cancel_message = "The refund deadline has passed"
            db.add(task)
            created += 1
    db.commit()
    return created


def reset(db, user: models.User) -> int:
    providers = db.query(models.Provider).filter_by(user_id=user.id, type=DEMO_TYPE).all()
    for provider in providers:
        db.delete(provider)  # cascades to its sessions and their tasks
    db.commit()
    return len(providers)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--email", help="seed this user's account (defaults to the only user)")
    parser.add_argument("--reset", action="store_true", help="remove previously seeded demo data first")
    parser.add_argument("--remove", action="store_true", help="only remove seeded demo data")
    args = parser.parse_args(argv)

    url = get_settings().database_url
    if not _is_local(url):
        print("Refusing to seed: DATABASE_URL isn't a local database.", file=sys.stderr)
        return 1

    db = SessionLocal()
    try:
        if args.email:
            user = db.query(models.User).filter_by(email=args.email).first()
        else:
            users = db.query(models.User).all()
            user = users[0] if len(users) == 1 else None
            if len(users) > 1:
                print("Several users exist; pass --email.", file=sys.stderr)
                return 1
        if user is None:
            print("No user found. Log in to the local app once first.", file=sys.stderr)
            return 1
        if args.reset or args.remove:
            print(f"Removed {reset(db, user)} demo providers and their sessions.")
        if args.remove:
            return 0
        if db.query(models.Provider).filter_by(user_id=user.id, type=DEMO_TYPE).first():
            print("Demo data already exists; use --reset to recreate it.", file=sys.stderr)
            return 1
        count = seed(db, user, now=datetime.now(timezone.utc))
        print(f"Seeded 2 providers, 4 sessions and {count} bookings for user {user.id}.")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
