from __future__ import annotations

from typing import Any

from pydantic import BaseModel


class PaymentMethodResponse(BaseModel):
    id: str
    object: str
    allow_redisplay: str | None = None
    billing_details: dict[str, Any]
    card: dict[str, Any]
    created: int
    customer: str | None
    livemode: bool
    type: str
