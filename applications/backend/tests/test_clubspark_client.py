import json
from datetime import datetime

import httpx

from omnibooker_backend.integrations.clubspark.client import (  # type: ignore[import-not-found]
    ClubsparkClient,
)


def _client(requests: list[httpx.Request], body: object) -> ClubsparkClient:
    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        if request.url.host == "account.lta.org.uk":
            return httpx.Response(200, json={"access_token": "token"})
        return httpx.Response(200, content=json.dumps(body))

    return ClubsparkClient(
        "user",
        "pw",
        http_factory=lambda: httpx.Client(transport=httpx.MockTransport(handler)),
    )


# Trimmed from a real GetUserSessions response (2026-10-21).
USER_SESSION = {
    "ID": "fbcd1474-03fb-466a-9e3c-d1a9f27f48fd",
    "Date": "2026-10-25T00:00:00",
    "StartTime": "17:00:00",
    "EndTime": "18:00:00",
    "Duration": 60,
    "PaymentPrice": 14.1,
    "PaymentTransactionID": "0b53307f-e4fe-45a9-8133-077042533a51",
    "RefundDeadline": "2026-10-24T17:00:00",
    "Refunded": False,
    "Refundable": True,
    "IsDeleted": False,
    "CanCancel": True,
    "PaymentStatus": 2,
    "CurrentStatus": 0,
    "PaymentMethodDescription": "Credit / Debit Card",
    "Venue": {
        "ID": "venue",
        "Name": "Clissold Park",
        "UrlSegment": "ClissoldParkHackney",
        "TimeZone": "Europe/London",
        "BookingRefundWindow": 24,
    },
    "Resource": {"ID": "resource", "Name": "Court 2", "Surface": 6},
}


def test_get_user_sessions_parses_bookings() -> None:
    requests: list[httpx.Request] = []
    with _client(requests, {"Sessions": [USER_SESSION]}) as client:
        result = client.get_user_sessions("2026-10-01")

    assert requests[-1].url.path == "/v0/Booking/GetUserSessions"
    assert requests[-1].url.params["startDate"] == "2026-10-01"
    session = result.Sessions[0]
    assert session.ID == "fbcd1474-03fb-466a-9e3c-d1a9f27f48fd"
    assert session.CanCancel is True
    assert session.RefundDeadline == datetime(2026, 10, 24, 17, 0)
    assert session.Resource.Name == "Court 2"


def test_cancel_user_session_calls_cancel_endpoint() -> None:
    requests: list[httpx.Request] = []
    client = _client(
        requests, {"Refunded": True, "IsCompletedEarly": False, "Duration": 0.0}
    )
    with client:
        result = client.cancel_user_session("3f12055f-79f8-467b-bd93-f9892e61ce18")

    assert result.Refunded is True
    cancel = requests[-1]
    assert cancel.method == "GET"
    assert cancel.url.host == "api.clubspark.uk"
    assert cancel.url.path == "/v0/Booking/CancelUserSession/3f12055f-79f8-467b-bd93-f9892e61ce18"
    assert cancel.headers["Authorization"].endswith("token")
