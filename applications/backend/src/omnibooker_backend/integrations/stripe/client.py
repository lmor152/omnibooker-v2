from __future__ import annotations

import logging
from typing import Any, Callable

import httpx

from .models import PaymentMethodResponse

logger = logging.getLogger(__name__)


class StripeAPIError(RuntimeError):
    """Raised when Stripe rejects a payment method creation request."""


class StripeClient:
    BASE_URL = "https://api.stripe.com"

    def __init__(
        self, *, http_factory: Callable[[], httpx.Client] | None = None
    ) -> None:
        self._http_factory = http_factory or (lambda: httpx.Client(timeout=30.0))
        self._http = self._http_factory()

    def close(self) -> None:
        self._http.close()

    def create_payment_method(
        self,
        *,
        publishable_key: str,
        stripe_account: str,
        email: str,
        card_number: str,
        card_exp_month: str,
        card_exp_year: str,
        card_cvc: str,
    ) -> PaymentMethodResponse:
        url = f"{self.BASE_URL}/v1/payment_methods"
        headers = {
            "Authorization": f"Bearer {publishable_key}",
            "Content-Type": "application/x-www-form-urlencoded",
            "Stripe-Account": stripe_account,
        }
        payload: dict[str, Any] = {
            "allow_redisplay": "unspecified",
            "billing_details[email]": email,
            "card[cvc]": card_cvc,
            "card[exp_month]": card_exp_month,
            "card[exp_year]": card_exp_year,
            "card[number]": card_number,
            "payment_user_agent": "stripe-ios/24.0.0",
            "type": "card",
        }
        logger.debug("Stripe POST %s", url)
        response = self._http.post(url, data=payload, headers=headers)
        try:
            response.raise_for_status()
        except httpx.HTTPStatusError as exc:  # pragma: no cover - network failure
            raise StripeAPIError(str(exc)) from exc
        return PaymentMethodResponse.model_validate(response.json())

    def __enter__(self) -> "StripeClient":
        return self

    def __exit__(self, *exc_info: Any) -> None:
        self.close()
