from __future__ import annotations

import logging
from contextlib import AbstractContextManager
from typing import Any, Callable

import httpx

from .models import (
    ActivitiesResponse,
    AuthoriseCheckoutResponse,
    CartResponse,
    CreditResponse,
    LoginResponse,
    PrepareCheckoutResponse,
    Slot,
    SlotResponse,
)

logger = logging.getLogger(__name__)


class BetterAPIError(RuntimeError):
    """Raised when the Better API rejects a request."""


class BetterClient(AbstractContextManager["BetterClient"]):
    BASE_URL = "https://better-admin.org.uk/api"
    OPAYO_BASE_URL = "https://live.opayo.eu.elavon.com/api/v1"
    USER_AGENT = (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36"
    )

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
    def __enter__(self) -> "BetterClient":
        return self

    def __exit__(self, *exc_info: Any) -> None:
        self.close()

    def close(self) -> None:
        self._http.close()

    # Public API ---------------------------------------------------------------
    def list_activity_times(
        self,
        venue_slug: str,
        activity_slug: str,
        *,
        date: str,
    ) -> ActivitiesResponse:
        path = f"/activities/venue/{venue_slug}/activity/{activity_slug}/times"
        data = self._get(path, params={"date": date})
        return ActivitiesResponse.model_validate(data)

    def list_slots(
        self,
        venue_slug: str,
        activity_slug: str,
        *,
        date: str,
        start_time: str,
        end_time: str,
        composite_key: str,
    ) -> list[Slot]:
        path = f"/activities/venue/{venue_slug}/activity/{activity_slug}/slots"
        params = {
            "date": date,
            "start_time": start_time,
            "end_time": end_time,
            "composite_key": composite_key,
        }
        data = self._get(path, params=params)
        return SlotResponse.model_validate(data).data

    def get_cart(self) -> CartResponse:
        data = self._get("/activities/cart")
        return CartResponse.model_validate(data)

    def clear_cart(self) -> CartResponse:
        cart = self.get_cart()
        if not cart.items:
            return cart
        payload = {"cart_item_ids": [item.id for item in cart.items]}
        data = self._post("/activities/cart/remove", json=payload)
        return CartResponse.model_validate(data)

    def add_slot_to_cart(self, slot: Slot) -> CartResponse:
        payload = {
            "items": [
                {
                    "id": slot.id,
                    "type": "activity",
                    "pricing_option_id": slot.pricing_option_id,
                    "apply_benefit": True,
                    "activity_restriction_ids": [],
                }
            ],
            "membership_user_id": None,
            "selected_user_id": None,
        }
        data = self._post("/activities/cart/add", json=payload)
        return CartResponse.model_validate(data)

    def apply_credits(self, amount: int) -> CreditResponse:
        payload = {
            "credits_to_reserve": [{"amount": amount, "type": "general"}],
            "cart_source": "activity-booking",
            "selected_user_id": None,
        }
        data = self._post("/activities/cart/apply-credits", json=payload)
        return CreditResponse.model_validate(data)

    def prepare_checkout(self) -> PrepareCheckoutResponse:
        data = self._get("/checkout/prepare")
        return PrepareCheckoutResponse.model_validate(data)

    def validate_cvc(self, *, opayo_card_id: str, cvc: str, session_key: str) -> None:
        url = f"{self.OPAYO_BASE_URL}/card-identifiers/{opayo_card_id}/security-code"
        headers = {"Authorization": f"Bearer {session_key}"}
        payload = {"securityCode": cvc}
        response = self._raw_request("POST", url, json=payload, headers=headers)
        try:
            response.raise_for_status()
        except httpx.HTTPStatusError as exc:  # pragma: no cover - network failure
            raise BetterAPIError("CVC validation failed") from exc

    def authorise_checkout(
        self,
        *,
        better_card_id: str,
        credits_to_use: int,
        cart_hash: str,
        session_key: str,
        card_holder_name: str,
    ) -> AuthoriseCheckoutResponse:
        payload: dict[str, Any] = {
            "billing_address_line_one": "",
            "billing_address_line_two": "",
            "billing_city": "",
            "billing_first_name": "",
            "billing_last_name": "",
            "billing_postcode": "",
            "browser_colour_depth": 30,
            "browser_java_enabled": 0,
            "browser_javascript_enabled": 1,
            "browser_language": "en-GB",
            "browser_screen_height": 1080,
            "browser_screen_width": 1920,
            "browser_timezone_offset": 0,
            "card_identifier": better_card_id,
            "card_holder_name": card_holder_name,
            "completed_waivers": [],
            "payments": [{"tender_type": "credit", "amount": credits_to_use}],
            "session_key": session_key,
            "source": "activity-booking",
            "terms": [1],
            "save_card": False,
            "item_hash": cart_hash,
            "saved_card_id": better_card_id,
        }
        data = self._post("/checkout/authorise", json=payload)
        return AuthoriseCheckoutResponse.model_validate(data)

    def complete_booking(
        self,
        *,
        transaction_id: str,
        credits_to_use: int,
        cart_hash: str,
    ) -> None:
        payments: list[dict[str, Any]] = []
        if credits_to_use:
            payments.append({"tender_type": "credit", "amount": credits_to_use})
        payload: dict[str, Any] = {
            "completed_waivers": [],
            "payments": payments,
            "terms": [1],
            "transaction_uuid": transaction_id or None,
            "source": "activity-booking",
            "item_hash": cart_hash,
        }
        self._post("/checkout/complete", json=payload)

    # Internal helpers ---------------------------------------------------------
    def _get(self, path: str, *, params: dict[str, Any] | None = None) -> Any:
        return self._request("GET", f"{self.BASE_URL}{path}", params=params)

    def _post(self, path: str, *, json: dict[str, Any]) -> Any:
        return self._request("POST", f"{self.BASE_URL}{path}", json=json)

    def _request(self, method: str, url: str, **kwargs: Any) -> Any:
        headers = kwargs.pop("headers", self._api_headers())
        response = self._raw_request(method, url, headers=headers, **kwargs)
        try:
            response.raise_for_status()
        except httpx.HTTPStatusError as exc:  # pragma: no cover - network failure
            raise BetterAPIError(str(exc)) from exc
        if response.status_code == 204:
            return None
        return response.json()

    def _raw_request(
        self,
        method: str,
        url: str,
        *,
        headers: dict[str, str] | None = None,
        **kwargs: Any,
    ) -> httpx.Response:
        prepared_headers = headers or {}
        logger.debug("Better %s %s", method, url)
        response = self._http.request(method, url, headers=prepared_headers, **kwargs)
        logger.debug("Better response %s %s -> %s", method, url, response.status_code)
        return response

    def _api_headers(self) -> dict[str, str]:
        if not self._token:
            self._authenticate()
        return {
            "Authorization": f"Bearer {self._token}",
            "User-Agent": self.USER_AGENT,
            "Origin": "https://bookings.better.org.uk",
            "Accept": "application/json",
        }

    def _authenticate(self) -> None:
        payload = {"username": self._username, "password": self._password}
        headers = {
            "User-Agent": self.USER_AGENT,
            "Origin": "https://bookings.better.org.uk",
            "Accept": "application/json",
        }
        url = f"{self.BASE_URL}/auth/customer/login"
        response = self._raw_request("POST", url, headers=headers, json=payload)
        try:
            response.raise_for_status()
        except httpx.HTTPStatusError as exc:  # pragma: no cover - network failure
            logger.error(
                "Better login failed status=%s body=%s",
                exc.response.status_code if exc.response else "?",
                exc.response.text if exc.response else "<no body>",
            )
            raise BetterAPIError("Unable to authenticate with Better") from exc
        login = LoginResponse.model_validate(response.json())
        if not login.token:
            raise BetterAPIError("Better auth response missing token")
        self._token = login.token
