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
from omnibooker_backend.integrations.clubspark.utils import (  # type: ignore[import-not-found]
    rank_slots,
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
        time_slot = SimpleNamespace(Time=540, Resources=[resource])
        return SimpleNamespace(Result=0, Times=[time_slot])

    def get_app_settings(self, *_args: Any, **_kwargs: Any):
        venue = SimpleNamespace(
            ID="venue", StripeAccountID="acct_123", BookingRefundWindow=24
        )
        return SimpleNamespace(Venue=venue, StripePublishableKey="pk_test")

    def create_payment(self, **kwargs: Any):
        self.payments.append(kwargs)
        return SimpleNamespace(ID="pay_123")

    def request_session(self, **_kwargs: Any):
        return SimpleNamespace(
            Result=1,
            TransactionID="txn_123",
            ResourceID="resource",
            SessionID="session",
        )


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
    assert result.booked_time == "09:00"
    assert result.booked_resource == "Court 1"
    assert result.cost == 12.5
    assert result.currency == "GBP"
    assert result.metadata["provider"] == "clubspark"
    assert result.metadata["venue_id"] == "venue"
    assert result.metadata["resource_id"] == "resource"
    assert result.metadata["session_id"] == "session"
    assert result.metadata["payment_id"] == "pay_123"
    assert result.metadata["transaction_id"] == "txn_123"
    assert result.metadata["refund_window"] == 24


def test_clubspark_provider_skips_non_target_times(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client = _FakeClubsparkClient()
    monkeypatch.setattr(clubspark, "ClubsparkClient", lambda *_a, **_k: client)
    monkeypatch.setattr(clubspark, "StripeClient", _stripe_factory)

    # Only a 09:00 slot is available; asking for evening times must not book it.
    context = _make_context(
        {
            "courtSlug": "clissold",
            "targetTimes": ["18:00", "19:00"],
            "targetCourts": [1],
        }
    )

    result = clubspark._book_clubspark(context)  # type: ignore[attr-defined]

    assert result.success is False
    assert "preferred times" in (result.message or "")
    assert client.payments == []


def test_rank_slots_only_returns_target_times() -> None:
    def court(name: str) -> SimpleNamespace:
        return SimpleNamespace(Name=name)

    times = [
        SimpleNamespace(Time=420, Resources=[court("Court 1")]),
        SimpleNamespace(
            Time=1080,
            Resources=[court("Court 2"), court("Court 3"), court("Mini Court 1")],
        ),
        SimpleNamespace(Time=1140, Resources=[court("Court 3"), court("Court 4")]),
    ]

    ranked = rank_slots(times, [1080, 1140], ["Court 3", "Court 2"])  # type: ignore[arg-type]

    assert [(r.start_time, r.resource.Name) for r in ranked] == [
        (1080, "Court 3"),
        (1080, "Court 2"),
        (1140, "Court 3"),
    ]


def test_rank_slots_without_preferences_returns_everything() -> None:
    times = [
        SimpleNamespace(Time=420, Resources=[SimpleNamespace(Name="Court 1")]),
        SimpleNamespace(Time=1080, Resources=[SimpleNamespace(Name="Court 2")]),
    ]

    ranked = rank_slots(times, [], [])  # type: ignore[arg-type]

    assert [(r.start_time, r.resource.Name) for r in ranked] == [
        (420, "Court 1"),
        (1080, "Court 2"),
    ]


def test_clubspark_provider_requires_slug(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(clubspark, "ClubsparkClient", _clubspark_factory)
    monkeypatch.setattr(clubspark, "StripeClient", _stripe_factory)

    context = _make_context({}, facility=None)

    result = clubspark._book_clubspark(context)  # type: ignore[attr-defined]

    assert result.success is False
    assert "court slug" in (result.message or "").lower()


def test_clubspark_explains_refused_availability(monkeypatch: pytest.MonkeyPatch) -> None:
    class _AtDailyLimit(_FakeClubsparkClient):
        def get_availability_times(self, *_args: Any, **_kwargs: Any):
            # What ClubSpark returns once the account holds the venue's MaximumBookings.
            return SimpleNamespace(Result=-1, Times=[])

    monkeypatch.setattr(clubspark, "ClubsparkClient", _AtDailyLimit)
    monkeypatch.setattr(clubspark, "StripeClient", _stripe_factory)

    result = clubspark._book_clubspark(_make_context({"courtSlug": "finsburypark"}))

    assert result.success is False
    assert "maximum bookings" in (result.message or "")


# --- unclear outcomes ---------------------------------------------------------------

import httpx  # noqa: E402

from omnibooker_backend.integrations.clubspark.models import (  # type: ignore[import-not-found]  # noqa: E402
    GetAvailabilityTimesResponse,
    RequestSessionResponse,
)


def test_empty_availability_reply_is_parsed() -> None:
    # The reply ClubSpark sends when nothing is free (no SessionID at all).
    reply = GetAvailabilityTimesResponse.model_validate({"Result": 0, "Times": []})
    assert reply.Times == [] and reply.SessionID is None
    assert RequestSessionResponse.model_validate({"Result": 1}).SessionID is None


def test_no_courts_available_has_a_clear_message(monkeypatch: pytest.MonkeyPatch) -> None:
    class _Empty(_FakeClubsparkClient):
        def get_availability_times(self, *_a: Any, **_k: Any):
            return GetAvailabilityTimesResponse.model_validate({"Result": 0, "Times": []})

    monkeypatch.setattr(clubspark, "ClubsparkClient", _Empty)
    monkeypatch.setattr(clubspark, "StripeClient", _stripe_factory)

    result = clubspark._book_clubspark(_make_context({"courtSlug": "clissold"}))  # type: ignore[attr-defined]

    assert result.success is False
    assert result.message == "No courts available at clissold on 2025-01-01"


def _two_courts_client(**overrides: Any) -> type[_FakeClubsparkClient]:
    class _Client(_FakeClubsparkClient):
        sessions_calls = 0

        def get_availability_times(self, *_a: Any, **_k: Any):
            courts = [
                SimpleNamespace(Cost=12.5, SessionID=f"slot{n}", ID=f"res{n}", Name=f"Court {n}")
                for n in (1, 2)
            ]
            return SimpleNamespace(Result=0, Times=[SimpleNamespace(Time=540, Resources=courts)])

        def request_session(self, **kwargs: Any):
            raise httpx.ReadTimeout("The read operation timed out")

        def get_user_sessions(self, start_date: str, end_date: str | None = None):
            type(self).sessions_calls += 1
            return SimpleNamespace(Sessions=overrides.get("sessions", []))

    for name, value in overrides.items():
        if callable(value):
            setattr(_Client, name, value)
    return _Client


def _user_session(resource_id: str, *, deleted: bool = False) -> SimpleNamespace:
    return SimpleNamespace(
        ID="booked-session",
        Date=datetime(2025, 1, 1),
        StartTime="09:00:00",
        PaymentTransactionID="txn_found",
        IsDeleted=deleted,
        CurrentStatus=0,
        Venue=SimpleNamespace(UrlSegment="clissold"),
        Resource=SimpleNamespace(ID=resource_id),
    )


def test_booking_that_timed_out_but_went_through_is_recorded(monkeypatch: pytest.MonkeyPatch) -> None:
    client_cls = _two_courts_client(sessions=[_user_session("res1")])
    client = client_cls()
    monkeypatch.setattr(clubspark, "ClubsparkClient", lambda *_a, **_k: client)
    monkeypatch.setattr(clubspark, "StripeClient", _stripe_factory)

    result = clubspark._book_clubspark(_make_context({"courtSlug": "clissold", "targetTimes": ["09:00"]}))  # type: ignore[attr-defined]

    assert result.success is True
    assert result.booked_resource == "Court 1"
    assert result.confirmation_code == "txn_found"
    assert result.metadata["session_id"] == "booked-session"
    assert len(client.payments) == 1  # never tried a second court


def test_unclear_outcome_stops_without_trying_other_courts(monkeypatch: pytest.MonkeyPatch) -> None:
    def broken_lookup(self, start_date: str, end_date: str | None = None):
        raise httpx.ConnectError("down")

    client = _two_courts_client(get_user_sessions=broken_lookup)()
    monkeypatch.setattr(clubspark, "ClubsparkClient", lambda *_a, **_k: client)
    monkeypatch.setattr(clubspark, "StripeClient", _stripe_factory)

    result = clubspark._book_clubspark(_make_context({"courtSlug": "clissold", "targetTimes": ["09:00"]}))  # type: ignore[attr-defined]

    assert result.success is False
    assert "may have gone through" in (result.message or "")
    assert len(client.payments) == 1


def test_failed_request_with_no_booking_tries_the_next_court(monkeypatch: pytest.MonkeyPatch) -> None:
    # A cancelled booking of court 1 at that time doesn't count.
    client = _two_courts_client(sessions=[_user_session("res1", deleted=True)])()
    monkeypatch.setattr(clubspark, "ClubsparkClient", lambda *_a, **_k: client)
    monkeypatch.setattr(clubspark, "StripeClient", _stripe_factory)

    result = clubspark._book_clubspark(_make_context({"courtSlug": "clissold", "targetTimes": ["09:00"]}))  # type: ignore[attr-defined]

    assert result.success is False
    assert len(client.payments) == 2  # moved on to court 2 after checking
