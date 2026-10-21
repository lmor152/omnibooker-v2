import json
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx
import pytest

from omnibooker_backend.integrations.better.client import (  # type: ignore[import-not-found]
    BetterAPIError,
    BetterClient,
)
from omnibooker_backend.integrations.better.models import Booking  # type: ignore[import-not-found]
from omnibooker_backend.services.booking_engine import (  # type: ignore[import-not-found]
    CancelContext,
    CancelStatus,
    ProviderContext,
)
from omnibooker_backend.services.providers import better  # type: ignore[import-not-found]

ORDER_ID = 117941331
CUT_OFF = datetime(2026, 10, 25, 4, 0, tzinfo=timezone.utc)


# Trimmed from a real GET /v1/activities/bookings response (2026-10-21).
def _booking(**cancellation: Any) -> dict[str, Any]:
    return {
        "id": 14895206,
        "order_id": ORDER_ID,
        "occurrence_id": "AQGeTpot7PQmgsd2JnT4inwFS7bll0tEkA",
        "status": "settled",
        "starts_at": {
            "utc": "2026-10-25 08:00:00",
            "local": "2026-10-25 08:00:00",
            "timezone": "Europe/London",
        },
        "location_name": "Highbury Fields Court 5",
        "price": {"formatted": "£12.85", "value": 1285, "currency": "GBP"},
        "cancellation": {
            "can_cancel": True,
            "cannot_cancel_reason": None,
            "cut_off": "2026-10-25T04:00:00+00:00",
            "cut_off_actions": ["charge_fee", "disable_booking", "disable_access"],
            "awards_credit": True,
            **cancellation,
        },
    }


# --- client -------------------------------------------------------------------


def _client(requests: list[httpx.Request], responses: dict[str, httpx.Response]) -> BetterClient:
    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        if request.url.path.endswith("/auth/customer/login"):
            return httpx.Response(
                200, json={"status": "ok", "token": "tok", "user": {"id": 7227715}}
            )
        return responses[request.method]

    return BetterClient(
        "user", "pw", http_factory=lambda: httpx.Client(transport=httpx.MockTransport(handler))
    )


def test_list_bookings_uses_logged_in_user_id() -> None:
    requests: list[httpx.Request] = []
    with _client(requests, {"GET": httpx.Response(200, json={"data": [_booking()]})}) as client:
        bookings = client.list_bookings(datetime(2026, 10, 21, 12, 0, tzinfo=timezone.utc))

    listing = requests[-1]
    assert listing.url.path == "/api/v1/activities/bookings"
    assert listing.url.params["user_id"] == "7227715"
    assert listing.url.params["starts_after"] == "2026-10-21T12:00:00+00:00"
    assert bookings[0].id == 14895206
    assert bookings[0].cancellation.cut_off == CUT_OFF


def test_cancel_bookings_wraps_payload_and_accepts_empty_response() -> None:
    requests: list[httpx.Request] = []
    with _client(requests, {"PATCH": httpx.Response(200, content=b"")}) as client:
        assert client.cancel_bookings([14895206]) is None

    cancel = requests[-1]
    assert cancel.method == "PATCH"
    assert json.loads(cancel.content) == {
        "data": {
            "cancellation_source": "my-account",
            "update_type": "cancellation",
            "booking_ids": [14895206],
        }
    }


# --- handler ------------------------------------------------------------------


class _FakeClient:
    def __init__(self, listings: list[list[dict[str, Any]]], cancel_error: Exception | None = None):
        self.listings = listings
        self.cancel_error = cancel_error
        self.cancelled: list[list[int]] = []

    def __call__(self, *_a: Any, **_k: Any) -> "_FakeClient":
        return self

    def __enter__(self) -> "_FakeClient":
        return self

    def __exit__(self, *_exc: Any) -> None:
        return None

    def list_bookings(self, starts_after: datetime) -> list[Booking]:
        data = self.listings.pop(0) if len(self.listings) > 1 else self.listings[0]
        return [Booking.model_validate(b) for b in data]

    def cancel_bookings(self, booking_ids: list[int]) -> None:
        self.cancelled.append(booking_ids)
        if self.cancel_error:
            raise self.cancel_error


def _install(monkeypatch: pytest.MonkeyPatch, *listings: list[dict[str, Any]], error=None) -> _FakeClient:
    fake = _FakeClient(list(listings), error)
    monkeypatch.setattr(better, "BetterClient", fake)
    return fake


def _context(now: datetime = CUT_OFF - timedelta(days=1), ref: dict[str, Any] | None = None) -> CancelContext:
    return CancelContext(
        provider=ProviderContext(
            id=2,
            name="Better",
            type="Better",
            credentials={"username": "u", "password": "p", "cardCvc": "123"},
        ),
        booking_ref={"provider": "better", "order_id": ORDER_ID} if ref is None else ref,
        now_utc=now,
    )


def test_cancels_before_cut_off_with_credit_refund(monkeypatch: pytest.MonkeyPatch) -> None:
    fake = _install(monkeypatch, [_booking()])

    result = better._cancel_better(_context())

    assert result.status == CancelStatus.cancelled
    assert result.refunded is True
    assert result.refund_method == "credit"
    assert result.refund_deadline_utc == CUT_OFF
    assert fake.cancelled == [[14895206]]


def test_matches_by_slot_id_when_order_id_missing(monkeypatch: pytest.MonkeyPatch) -> None:
    fake = _install(monkeypatch, [_booking()])

    result = better._cancel_better(
        _context(ref={"slot_id": "AQGeTpot7PQmgsd2JnT4inwFS7bll0tEkA"})
    )

    assert result.status == CancelStatus.cancelled
    assert fake.cancelled == [[14895206]]


@pytest.mark.parametrize(
    "now", [CUT_OFF, CUT_OFF + timedelta(hours=1), CUT_OFF - better.CANCEL_SAFETY_MARGIN]
)
def test_refuses_after_cut_off(monkeypatch: pytest.MonkeyPatch, now: datetime) -> None:
    fake = _install(monkeypatch, [_booking()])

    result = better._cancel_better(_context(now=now))

    assert result.status == CancelStatus.manual_required
    assert "fee" in (result.message or "")
    assert fake.cancelled == []


def test_refuses_when_better_disallows_cancel(monkeypatch: pytest.MonkeyPatch) -> None:
    fake = _install(
        monkeypatch, [_booking(can_cancel=False, cannot_cancel_reason="Session started")]
    )

    result = better._cancel_better(_context())

    assert result.status == CancelStatus.manual_required
    assert result.message == "Session started"
    assert fake.cancelled == []


def test_missing_booking_needs_manual_check(monkeypatch: pytest.MonkeyPatch) -> None:
    fake = _install(monkeypatch, [])

    result = better._cancel_better(_context())

    assert result.status == CancelStatus.manual_required
    assert fake.cancelled == []


def test_missing_ids_need_manual_cancel(monkeypatch: pytest.MonkeyPatch) -> None:
    fake = _install(monkeypatch, [_booking()])

    result = better._cancel_better(_context(ref={}))

    assert result.status == CancelStatus.manual_required
    assert fake.cancelled == []


def test_error_then_gone_is_cancelled(monkeypatch: pytest.MonkeyPatch) -> None:
    fake = _install(monkeypatch, [_booking()], [], error=BetterAPIError("timeout"))

    result = better._cancel_better(_context())

    assert result.status == CancelStatus.cancelled
    assert result.refund_method == "credit"
    assert fake.cancelled == [[14895206]]


def test_error_and_still_booked_is_not_retried(monkeypatch: pytest.MonkeyPatch) -> None:
    fake = _install(monkeypatch, [_booking()], [_booking()], error=BetterAPIError("boom"))

    result = better._cancel_better(_context())

    assert result.status == CancelStatus.failed
    assert fake.cancelled == [[14895206]]
