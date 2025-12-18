from __future__ import annotations

import base64
import logging
from contextlib import AbstractContextManager
from typing import Any, Callable

import httpx

from .models import (
    AppSettingsResponse,
    CreatePaymentResponse,
    GetAvailabilityTimesResponse,
    GetCurrentUserResponse,
    GetUserVenuesResponse,
    RequestSessionResponse,
)

logger = logging.getLogger(__name__)


class ClubsparkAPIError(RuntimeError):
    """Raised when the ClubSpark API rejects a request."""


class ClubsparkClient(AbstractContextManager["ClubsparkClient"]):
    TOKEN_URL = "https://account.lta.org.uk/issue/oauth2/token"
    BASE_URL = "https://api.clubspark.uk"
    CLIENT_ID = "clubspark-app"
    CLIENT_SECRET = "VA7VqUK4DTECuy9vcDEdzFZZx/rl6iD8eEfL+yfbr1U="

    def __init__(
        self,
        username: str,
        password: str,
        *,
        http_factory: Callable[[], httpx.Client] | None = None,
    ) -> None:
        self._username = username
        self._password = password
        self._token: str | None = None
        self._http_factory = http_factory or (lambda: httpx.Client(timeout=30.0))
        self._http = self._http_factory()

    # Context manager protocol -------------------------------------------------
    def __enter__(self) -> "ClubsparkClient":
        return self

    def __exit__(self, *exc_info: Any) -> None:
        self.close()

    def close(self) -> None:
        self._http.close()

    # Public API ---------------------------------------------------------------
    def get_current_user(self) -> GetCurrentUserResponse:
        data = self._get("/v2/User/GetCurrentUser")
        return GetCurrentUserResponse.model_validate(data)

    def get_user_venues(self) -> GetUserVenuesResponse:
        data = self._get("/v0/Booking/GetUserVenues")
        return GetUserVenuesResponse.model_validate(data)

    def get_app_settings(self, venue_slug: str) -> AppSettingsResponse:
        data = self._get(f"/v0/VenueBooking/{venue_slug}/GetAppSettings")
        return AppSettingsResponse.model_validate(data)

    def get_availability_times(
        self,
        venue_slug: str,
        date: str,
        *,
        duration: int,
        resource_category: int = 1,
    ) -> GetAvailabilityTimesResponse:
        path = (
            f"/v1/VenueBooking/{venue_slug}/GetAvailabilityTimes"
            f"?Duration={duration}&Date={date}&resourceCategory={resource_category}"
        )
        data = self._get(path)
        return GetAvailabilityTimesResponse.model_validate(data)

    def create_payment(
        self,
        *,
        user_name: str,
        cost: float,
        scope: str,
        payment_method_id: str,
        venue_id: str,
    ) -> CreatePaymentResponse:
        payload: dict[str, Any] = {
            "Description": user_name,
            "Cost": cost,
            "PaymentParams": '["booking-default"]',
            "PaymentMethodID": payment_method_id,
            "ScopeID": scope,
            "VenueID": venue_id,
        }
        data = self._post("/Payment/CreatePayment", payload)
        return CreatePaymentResponse.model_validate(data)

    def request_session(
        self,
        *,
        venue_slug: str,
        payment_token: str,
        duration: int,
        date: str,
        total_paid: float,
        start_time: int,
        resource_id: str,
        session_id: str,
    ) -> RequestSessionResponse:
        payload: dict[str, Any] = {
            "CreditsApplied": "0",
            "PaymentToken": payment_token,
            "Date": date,
            "Duration": duration,
            "Source": "iOS",
            "TotalPaid": str(total_paid),
            "StartTime": start_time,
            "GrossAmount": str(total_paid),
            "ResourceID": resource_id,
            "SessionID": session_id,
            "NetAmount": str(total_paid),
        }
        data = self._post(
            f"/v0/VenueBooking/{venue_slug}/RequestSession",
            payload,
        )
        return RequestSessionResponse.model_validate(data)

    # Internal helpers ---------------------------------------------------------
    def _get(self, path: str) -> Any:
        return self._request("GET", path)

    def _post(self, path: str, payload: dict[str, Any]) -> Any:
        return self._request("POST", path, json=payload)

    def _request(self, method: str, path: str, **kwargs: Any) -> Any:
        if not self._token:
            self._token = self._fetch_token()

        headers = self._clubspark_headers()
        url = self.BASE_URL + path
        logger.debug("ClubSpark %s %s", method, url)
        response = self._http.request(method, url, headers=headers, **kwargs)
        logger.debug(
            "ClubSpark response %s %s -> %s",
            method,
            url,
            response.status_code,
        )
        try:
            response.raise_for_status()
        except httpx.HTTPStatusError as exc:  # pragma: no cover - network failure
            raise ClubsparkAPIError(str(exc)) from exc
        return response.json()

    def _fetch_token(self) -> str:
        headers = {
            "accept": "*/*",
            "content-type": "application/json",
            "accept-encoding": "gzip, deflate, br",
            "authorization": self._basic_auth_header(),
            "user-agent": "ClubSpark Booker/1.0",
            "accept-language": "en-GB,en;q=0.9",
        }
        payload = {
            "password": self._password,
            "scope": "https://api.clubspark.uk/token/",
            "grant_type": "password",
            "username": self._username,
        }
        logger.info("Requesting Clubspark auth token for user=%s", self._username)
        response = self._http.post(self.TOKEN_URL, json=payload, headers=headers)
        try:
            response.raise_for_status()
        except httpx.HTTPStatusError as exc:  # pragma: no cover - network failure
            logger.error(
                "Clubspark token request failed (status=%s body=%s)",
                exc.response.status_code if exc.response else "?",
                exc.response.text if exc.response else "<no body>",
            )
            raise ClubsparkAPIError("Unable to authenticate with ClubSpark") from exc
        token = response.json().get("access_token")
        if not token:
            logger.error(
                "Clubspark token response missing access_token: %s", response.text
            )
            raise ClubsparkAPIError("ClubSpark token response missing access_token")
        return token

    def _basic_auth_header(self) -> str:
        creds = f"{self.CLIENT_ID}:{self.CLIENT_SECRET}".encode()
        return "Basic " + base64.b64encode(creds).decode()

    def _clubspark_headers(self) -> dict[str, str]:
        if not self._token:
            raise ClubsparkAPIError("Auth token not available")
        return {
            "accept": "*/*",
            "appname": "cspl",
            "appversion": "2.0",
            "accept-language": "en-NZ,en-AU;q=0.9,en;q=0.8",
            "user-agent": "ClubSparkPlayers/3.7.0",
            "authorization": f"Lta-Auth {self._token}",
            "accept-encoding": "gzip, deflate, br",
        }
