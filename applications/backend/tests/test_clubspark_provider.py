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
from omnibooker_backend.services.providers import (
    clubspark,  # type: ignore[import-not-found]
)


def _clubspark_factory(*_args: Any, **_kwargs: Any) -> _FakeClubsparkClient:
    return _FakeClubsparkClient()


def _stripe_factory(*_args: Any, **_kwargs: Any) -> _FakeStripeClient:
    return _FakeStripeClient()


class _FakeClubsparkClient:
    def __init__(self, *_args: Any, **_kwargs: Any):
        self.payments: list[dict[str, Any]] = []

    def __enter__(self) -> "_FakeClubsparkClient":
        return self

    def __exit__(self, *_exc_info: Any) -> None:
        return None

    def get_current_user(self):  # pragma: no cover - simple namespace container
        return SimpleNamespace(
            FirstName="Test", LastName="User", EmailAddress="user@example.com"
        )

    def get_availability_times(self, *_args: Any, **_kwargs: Any):
        resource = SimpleNamespace(
            Cost=12.5,
            SessionID="session",
            ID="resource",
            Name="Court 1",
        )
        time_slot = SimpleNamespace(Time=600, Resources=[resource])
        return SimpleNamespace(Times=[time_slot])

    def get_app_settings(self, *_args: Any, **_kwargs: Any):
        venue = SimpleNamespace(ID="venue", StripeAccountID="acct_123")
        return SimpleNamespace(Venue=venue, StripePublishableKey="pk_test")

    def create_payment(self, **kwargs: Any):
        self.payments.append(kwargs)
        return SimpleNamespace(ID="pay_123")

    def request_session(self, **_kwargs: Any):
        return SimpleNamespace(Result=1, TransactionID="txn_123")


class _FakeStripeClient:
    def __enter__(self) -> "_FakeStripeClient":
        return self

    def __exit__(self, *_exc_info: Any) -> None:
        return None

    def create_payment_method(self, **_kwargs: Any):
        return SimpleNamespace(id="pm_123")


def _make_context(
    provider_opts: dict[str, object], *, facility: str | None = "clissold"
) -> BookingContext:
    provider = ProviderContext(
        id=1,
        name="ClubSpark",
        type="clubspark",
        credentials={
            "username": "person",
            "password": "secret",
            "cardDetails": {
                "cardNumber": "4242424242424242",
                "expiryDate": "08/26",
                "cvc": "123",
            },
        },
    )
    slot = SlotContext(
        id=10,
        name="Weekly Tennis",
        facility=facility,
        timezone="Europe/London",
        frequency="weekly",
        duration_minutes=60,
        provider_options=provider_opts,
    )
    start = datetime(2025, 1, 1, 9, 0, tzinfo=timezone.utc)
    task = TaskContext(
        id=5,
        scheduled_start_utc=start,
        scheduled_start_local=start,
        scheduled_end_utc=start + timedelta(hours=1),
        scheduled_end_local=start + timedelta(hours=1),
        attempt_at_utc=start - timedelta(days=1),
        attempt_at_local=start - timedelta(days=1),
        target_date=start.date(),
    )
    user = UserContext(id=7, email="runner@example.com", full_name="Runner")
    return BookingContext(provider=provider, slot=slot, task=task, user=user)


def test_clubspark_provider_happy_path(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(clubspark, "ClubsparkClient", _clubspark_factory)
    monkeypatch.setattr(clubspark, "StripeClient", _stripe_factory)

    context = _make_context(
        {
            "courtSlug": "clissold",
            "targetTimes": ["09:00"],
            "targetCourts": [1],
        }
    )

    result = clubspark._book_clubspark(context)  # type: ignore[attr-defined]

    assert result.success is True
    assert "Booked clissold" in (result.message or "")
    assert result.confirmation_code == "txn_123"


def test_clubspark_provider_requires_slug(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(clubspark, "ClubsparkClient", _clubspark_factory)
    monkeypatch.setattr(clubspark, "StripeClient", _stripe_factory)

    context = _make_context({}, facility=None)

    result = clubspark._book_clubspark(context)  # type: ignore[attr-defined]

    assert result.success is False
    assert "court slug" in (result.message or "").lower()
