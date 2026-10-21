from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class LoginResponse(BaseModel):
    status: str
    token: str
    user: dict[str, Any]

    model_config = ConfigDict(extra="ignore")


class ActivityTime(BaseModel):
    format_12_hour: str
    format_24_hour: str

    model_config = ConfigDict(extra="ignore")


class Activity(BaseModel):
    starts_at: ActivityTime
    ends_at: ActivityTime
    spaces: int
    composite_key: str
    venue_slug: str
    date: str
    category_slug: str

    model_config = ConfigDict(extra="ignore")


class ActivitiesResponse(BaseModel):
    data: list[Activity]

    model_config = ConfigDict(extra="ignore")


class SlotStatus(BaseModel):
    status: str | None
    reason: str | None = None

    model_config = ConfigDict(extra="ignore")


class SlotLocation(BaseModel):
    name: str

    model_config = ConfigDict(extra="ignore")


class SlotPrice(BaseModel):
    formatted: str
    raw: int  # pence

    model_config = ConfigDict(extra="ignore")


class Slot(BaseModel):
    id: str  # opaque string in the v2 API, e.g. "AQGeTphz4_EZ..."
    pricing_option_id: int
    cart_type: str = "activity"  # v2 slots report "purchasableOccurrence"
    price: SlotPrice | None = None
    starts_at: ActivityTime
    ends_at: ActivityTime | None = None
    location: SlotLocation
    action_to_show: SlotStatus

    model_config = ConfigDict(extra="ignore")


class SlotResponse(BaseModel):
    data: list[Slot]

    model_config = ConfigDict(extra="ignore")


class CartCredit(BaseModel):
    type: str
    total_available: int = 0
    max_applicable: int = 0

    model_config = ConfigDict(extra="ignore")


class CartItem(BaseModel):
    id: int

    model_config = ConfigDict(extra="ignore")


class CartResponse(BaseModel):
    itemHash: str
    credits: dict[Literal["membership", "general"], CartCredit] | None = None
    items: list["CartItem"] = Field(default_factory=list)
    total: float

    model_config = ConfigDict(extra="ignore")

    def general_credit(self) -> CartCredit | None:
        credits = self.credits or {}
        return credits.get("general")


class CreditResponse(BaseModel):
    reserved: bool
    amount: int

    model_config = ConfigDict(extra="ignore")


class SavedCard(BaseModel):
    external_identifier: str
    id: int

    model_config = ConfigDict(extra="ignore")


class PrepareCheckoutResponse(BaseModel):
    saved_card: SavedCard
    session_key: str

    model_config = ConfigDict(extra="ignore")


class AuthoriseCheckoutResponse(BaseModel):
    transaction_uuid: str
    transaction_status: str

    model_config = ConfigDict(extra="ignore")


class BookingCancellation(BaseModel):
    can_cancel: bool
    cannot_cancel_reason: str | None = None
    cut_off: datetime | None = None  # last moment a cancel is penalty-free
    cut_off_actions: list[str] = Field(default_factory=list)
    awards_credit: bool = False  # refunds are issued as Better credit

    model_config = ConfigDict(extra="ignore")


class BookingTime(BaseModel):
    utc: str  # "YYYY-MM-DD HH:MM:SS"
    local: str
    timezone: str

    model_config = ConfigDict(extra="ignore")


class BookingPrice(BaseModel):
    formatted: str
    value: int  # pence

    model_config = ConfigDict(extra="ignore")


class Booking(BaseModel):
    """A booking as listed by GET /v1/activities/bookings."""

    id: int  # pass to cancel_bookings
    order_id: int | None = None  # the checkout/complete order id
    occurrence_id: str | None = None  # the v2 slot id
    status: str
    starts_at: BookingTime
    location_name: str | None = None
    price: BookingPrice | None = None
    cancellation: BookingCancellation

    model_config = ConfigDict(extra="ignore")


class BookingsResponse(BaseModel):
    data: list[Booking]

    model_config = ConfigDict(extra="ignore")
