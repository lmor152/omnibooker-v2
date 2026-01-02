from __future__ import annotations

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


class Slot(BaseModel):
    id: int
    pricing_option_id: int
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
    total: int

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
    id: str

    model_config = ConfigDict(extra="ignore")


class PrepareCheckoutResponse(BaseModel):
    saved_card: SavedCard
    session_key: str

    model_config = ConfigDict(extra="ignore")


class AuthoriseCheckoutResponse(BaseModel):
    transaction_uuid: str
    transaction_status: str

    model_config = ConfigDict(extra="ignore")
