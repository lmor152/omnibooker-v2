from datetime import datetime, timedelta, timezone
from typing import Any

import pytest

from omnibooker_backend.integrations.clubspark.client import (  # type: ignore[import-not-found]
    ClubsparkAPIError,
)
from omnibooker_backend.integrations.clubspark.models import (  # type: ignore[import-not-found]
    CancelUserSessionResponse,
    GetUserSessionsResponse,
)
from omnibooker_backend.services.booking_engine import (  # type: ignore[import-not-found]
    CancelContext,
    CancelStatus,
    ProviderContext,
    run_cancel,
)
from omnibooker_backend.services.providers import clubspark  # type: ignore[import-not-found]

SESSION_ID = "fbcd1474-03fb-466a-9e3c-d1a9f27f48fd"
# RefundDeadline is venue-local: 17:00 BST on 24 Oct 2026 is 16:00 UTC.
DEADLINE_UTC = datetime(2026, 10, 24, 16, 0, tzinfo=timezone.utc)


def _session(**overrides: Any) -> dict[str, Any]:
    session = {
        "ID": SESSION_ID,
        "Date": "2026-10-25T00:00:00",
        "StartTime": "17:00:00",
        "EndTime": "18:00:00",
        "Duration": 60,
        "PaymentPrice": 14.1,
        "RefundDeadline": "2026-10-24T17:00:00",
        "Refunded": False,
        "Refundable": True,
        "IsDeleted": False,
        "CanCancel": True,
        "PaymentStatus": 2,
        "CurrentStatus": 0,
        "Venue": {
            "ID": "venue",
            "Name": "Clissold Park",
            "UrlSegment": "ClissoldParkHackney",
            "TimeZone": "Europe/London",
        },
        "Resource": {"ID": "resource", "Name": "Court 2"},
    }
    session.update(overrides)
    return session


class _FakeClient:
    """Stands in for ClubsparkClient; `listings` is returned by successive lookups."""

    instances: list["_FakeClient"] = []

    def __init__(
        self,
        listings: list[list[dict[str, Any]]],
        cancel: CancelUserSessionResponse | Exception,
    ) -> None:
        self.listings = listings
        self.cancel = cancel
        self.cancel_calls: list[str] = []
        self.lookup_dates: list[str] = []

    def __call__(self, *_args: Any, **_kwargs: Any) -> "_FakeClient":
        _FakeClient.instances.append(self)
        return self

    def __enter__(self) -> "_FakeClient":
        return self

    def __exit__(self, *_exc: Any) -> None:
        return None

    def get_user_sessions(self, start_date: str, end_date: str | None = None):
        self.lookup_dates.append(start_date)
        sessions = self.listings.pop(0) if len(self.listings) > 1 else self.listings[0]
        return GetUserSessionsResponse.model_validate({"Sessions": sessions})

    def cancel_user_session(self, session_id: str) -> CancelUserSessionResponse:
        self.cancel_calls.append(session_id)
        if isinstance(self.cancel, Exception):
            raise self.cancel
        return self.cancel


def _install(
    monkeypatch: pytest.MonkeyPatch,
    listings: list[list[dict[str, Any]]],
    cancel: CancelUserSessionResponse | Exception | None = None,
) -> _FakeClient:
    fake = _FakeClient(
        listings, cancel or CancelUserSessionResponse(Refunded=True)
    )
    monkeypatch.setattr(clubspark, "ClubsparkClient", fake)
    return fake


def _context(
    now: datetime = DEADLINE_UTC - timedelta(hours=3),
    ref: dict[str, Any] | None = None,
) -> CancelContext:
    return CancelContext(
        provider=ProviderContext(
            id=1,
            name="ClubSpark",
            type="Clubspark",
            credentials={
                "username": "person",
                "password": "secret",
                "cardDetails": {"cardNumber": "4242", "expiryDate": "08/27", "cvc": "123"},
            },
        ),
        booking_ref=ref
        if ref is not None
        else {"provider": "clubspark", "session_id": SESSION_ID, "date": "2026-10-25"},
        now_utc=now,
    )


def test_cancels_before_refund_deadline(monkeypatch: pytest.MonkeyPatch) -> None:
    fake = _install(monkeypatch, [[_session()]])

    result = clubspark._cancel_clubspark(_context())

    assert result.status == CancelStatus.cancelled
    assert result.refunded is True
    assert result.refund_deadline_utc == DEADLINE_UTC
    assert fake.cancel_calls == [SESSION_ID]
    assert fake.lookup_dates == ["2026-10-25"]


@pytest.mark.parametrize(
    "now",
    [
        DEADLINE_UTC + timedelta(minutes=1),
        DEADLINE_UTC,
        DEADLINE_UTC - clubspark.CANCEL_SAFETY_MARGIN,
        # 16:30 UTC is before 17:00 *local* but after the deadline in BST.
        datetime(2026, 10, 24, 16, 30, tzinfo=timezone.utc),
    ],
)
def test_refuses_at_or_after_refund_deadline(
    monkeypatch: pytest.MonkeyPatch, now: datetime
) -> None:
    fake = _install(monkeypatch, [[_session()]])

    result = clubspark._cancel_clubspark(_context(now=now))

    assert result.status == CancelStatus.manual_required
    assert "refund deadline" in (result.message or "")
    assert fake.cancel_calls == []


def test_refuses_without_refund_deadline(monkeypatch: pytest.MonkeyPatch) -> None:
    fake = _install(monkeypatch, [[_session(RefundDeadline=None, Refundable=False)]])

    result = clubspark._cancel_clubspark(_context())

    assert result.status == CancelStatus.manual_required
    assert fake.cancel_calls == []


def test_refuses_when_clubspark_disallows_cancel(monkeypatch: pytest.MonkeyPatch) -> None:
    fake = _install(monkeypatch, [[_session(CanCancel=False)]])

    result = clubspark._cancel_clubspark(_context())

    assert result.status == CancelStatus.manual_required
    assert fake.cancel_calls == []


def test_already_cancelled_booking_is_reported_not_recancelled(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    fake = _install(
        monkeypatch,
        [[_session(IsDeleted=True, Refunded=True, CanCancel=False, RefundDeadline=None)]],
    )

    result = clubspark._cancel_clubspark(_context())

    assert result.status == CancelStatus.cancelled
    assert result.refunded is True
    assert fake.cancel_calls == []


def test_booking_missing_from_clubspark(monkeypatch: pytest.MonkeyPatch) -> None:
    fake = _install(monkeypatch, [[_session(ID="someone-else")]])

    result = clubspark._cancel_clubspark(_context())

    assert result.status == CancelStatus.manual_required
    assert fake.cancel_calls == []


def test_booking_without_session_id_needs_manual_cancel(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    fake = _install(monkeypatch, [[_session()]])

    result = clubspark._cancel_clubspark(_context(ref={}))

    assert result.status == CancelStatus.manual_required
    assert _FakeClient.instances.count(fake) == 0


def test_cancel_without_refund_is_flagged(monkeypatch: pytest.MonkeyPatch) -> None:
    _install(monkeypatch, [[_session()]], CancelUserSessionResponse(Refunded=False))

    result = clubspark._cancel_clubspark(_context())

    assert result.status == CancelStatus.cancelled
    assert result.refunded is False


def test_cancel_error_then_confirmed_cancelled(monkeypatch: pytest.MonkeyPatch) -> None:
    fake = _install(
        monkeypatch,
        [[_session()], [_session(IsDeleted=True, Refunded=True, CanCancel=False)]],
        ClubsparkAPIError("timeout"),
    )

    result = clubspark._cancel_clubspark(_context())

    assert result.status == CancelStatus.cancelled
    assert result.refunded is True
    assert fake.cancel_calls == [SESSION_ID]


def test_cancel_error_and_still_active_is_not_retried(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    fake = _install(
        monkeypatch, [[_session()], [_session()]], ClubsparkAPIError("boom")
    )

    result = clubspark._cancel_clubspark(_context())

    assert result.status == CancelStatus.failed
    assert fake.cancel_calls == [SESSION_ID]


def test_lookup_failure_does_not_cancel(monkeypatch: pytest.MonkeyPatch) -> None:
    fake = _install(monkeypatch, [[_session()]])

    def broken_lookup(*_args: Any, **_kwargs: Any):
        raise ClubsparkAPIError("down")

    monkeypatch.setattr(fake, "get_user_sessions", broken_lookup)

    result = clubspark._cancel_clubspark(_context())

    assert result.status == CancelStatus.failed
    assert fake.cancel_calls == []


def test_run_cancel_without_handler_requires_manual_cancel() -> None:
    result = run_cancel(_context())

    assert result.status == CancelStatus.manual_required
    assert "not supported" in (result.message or "")
