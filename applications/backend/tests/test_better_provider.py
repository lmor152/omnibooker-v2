from __future__ import annotations

from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from typing import Any

import pytest
from omnibooker_backend.services.booking_engine import (  # type: ignore[import-not-found]
    BookingContext,
    ProviderContext,
    SlotContext,
    TaskContext,
    UserContext,
)
from omnibooker_backend.services.providers import (  # type: ignore[import-not-found]
    better,
)


def _better_client_factory(*_args: Any, **_kwargs: Any) -> "_FakeBetterClient":
    return _FakeBetterClient()


class _FakeCart:
    def __init__(self, total: int) -> None:
        self.total = total
        self.itemHash = "cart-hash"

    def general_credit(self):  # pragma: no cover - simple stub
        return None


class _FakeBetterClient:
    def __init__(self, *_args: Any, **_kwargs: Any) -> None:
        self.authorised = False
        self.completed = False

    def __enter__(self) -> "_FakeBetterClient":  # pragma: no cover - context helper
        return self

    def __exit__(self, *_exc_info: Any) -> None:  # pragma: no cover - context helper
        return None

    def list_activity_times(self, *_args: Any, **_kwargs: Any):
        activity = SimpleNamespace(
            venue_slug="venue",
            activitySlug="session",
            date="2025-01-01",
            starts_at=SimpleNamespace(format_24_hour="09:00"),
            ends_at=SimpleNamespace(format_24_hour="10:00"),
            spaces=1,
            composite_key="comp-key",
        )
        return SimpleNamespace(data=[activity])

    def list_slots(self, *_args: Any, **_kwargs: Any):
        slot = SimpleNamespace(
            id=1,
            pricing_option_id=10,
            starts_at=SimpleNamespace(format_24_hour="09:00"),
            ends_at=SimpleNamespace(format_24_hour="10:00"),
            location=SimpleNamespace(name="Court 1"),
            action_to_show=SimpleNamespace(status="BOOK"),
        )
        return [slot]

    def clear_cart(self) -> _FakeCart:
        return _FakeCart(total=20)

    def add_slot_to_cart(self, *_args: Any, **_kwargs: Any) -> _FakeCart:
        return _FakeCart(total=20)

    def apply_credits(self, *_args: Any, **_kwargs: Any) -> None:  # pragma: no cover
        return None

    def prepare_checkout(self):
        return SimpleNamespace(
            saved_card=SimpleNamespace(
                external_identifier="opayo-card", id="saved-card"
            ),
            session_key="session-key",
        )

    def validate_cvc(self, *_args: Any, **_kwargs: Any) -> None:  # pragma: no cover
        return None

    def authorise_checkout(self, *_args: Any, **_kwargs: Any):
        self.authorised = True
        return SimpleNamespace(
            transaction_status="authorised", transaction_uuid="txn-123"
        )

    def complete_booking(self, *_args: Any, **_kwargs: Any) -> None:
        self.completed = True


def _make_context(provider_options: dict[str, Any]) -> BookingContext:
    provider = ProviderContext(
        id=1,
        name="Better",
        type="better",
        credentials={
            "username": "member",
            "password": "secret",
            "cardCvc": "123",
        },
    )
    slot = SlotContext(
        id=2,
        name="Weekly Tennis",
        facility="islington",
        timezone="Europe/London",
        frequency="weekly",
        duration_minutes=60,
        provider_options=provider_options,
    )
    start = datetime(2025, 1, 1, 9, 0, tzinfo=timezone.utc)
    task = TaskContext(
        id=3,
        scheduled_start_utc=start,
        scheduled_start_local=start,
        scheduled_end_utc=start + timedelta(hours=1),
        scheduled_end_local=start + timedelta(hours=1),
        attempt_at_utc=start - timedelta(days=1),
        attempt_at_local=start - timedelta(days=1),
        target_date=start.date(),
    )
    user = UserContext(id=4, email="user@example.com", full_name="Test User")
    return BookingContext(provider=provider, slot=slot, task=task, user=user)


def test_better_provider_happy_path(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(better, "BetterClient", _better_client_factory)
    context = _make_context(
        {
            "venueSlug": "islington-tennis-centre",
            "activitySlug": "highbury-tennis",
            "targetTimes": ["09:00"],
            "targetCourts": ["Court 1"],
            "useCredits": False,
        }
    )

    result = better._book_better(context)  # type: ignore[attr-defined]

    assert result.success is True
    assert result.confirmation_code == "txn-123"
    assert "Booked" in (result.message or "")


def test_better_provider_requires_options(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(better, "BetterClient", _better_client_factory)
    context = _make_context({})

    result = better._book_better(context)  # type: ignore[attr-defined]

    assert result.success is False
    assert "invalid" in (result.message or "").lower()
