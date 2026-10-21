from datetime import date, datetime
from typing import Annotated, Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from .models import (
    AttemptStrategyEnum,
    ConfirmationPolicyEnum,
    ConfirmationStatusEnum,
    FrequencyEnum,
    TaskStatusEnum,
)


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class TokenData(BaseModel):
    email: Optional[str] = None


class UserBase(BaseModel):
    email: EmailStr
    full_name: Optional[str] = None


class UserCreate(UserBase):
    password: Annotated[str, Field(min_length=8)]


class UserRead(UserBase):
    id: int
    is_active: bool
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class PaymentCardDetails(BaseModel):
    cardNumber: str
    expiryDate: str  # MM/YY format
    cvc: str


class ProviderCredentials(BaseModel):
    username: str
    password: str
    additionalInfo: Optional[str] = None
    cardDetails: Optional[PaymentCardDetails] = None
    cardCvc: Optional[str] = Field(None, min_length=3, max_length=4)


class ProviderBase(BaseModel):
    name: str
    type: str
    credentials: ProviderCredentials


class ProviderCreate(ProviderBase):
    pass


class ProviderUpdate(BaseModel):
    name: Optional[str] = None
    type: Optional[str] = None
    credentials: Optional[ProviderCredentials] = None


class ProviderRead(ProviderBase):
    id: int
    user_id: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ProviderTestRequest(BaseModel):
    type: str
    credentials: ProviderCredentials


class ProviderTestResult(BaseModel):
    success: bool
    message: str


class BookingSlotBase(BaseModel):
    name: str
    provider_id: int
    frequency: FrequencyEnum
    time: str
    timezone: str = "UTC"
    duration_minutes: Optional[int] = 60
    facility: Optional[str] = None
    is_active: bool = True
    attempt_strategy: AttemptStrategyEnum = AttemptStrategyEnum.offset
    attempt_offset_days: int = 0
    attempt_offset_hours: int = 0
    attempt_offset_minutes: int = 0
    release_days_before: int = 0
    release_time: Optional[str] = None
    provider_options: dict[
        str, str | int | float | bool | None | list[str] | list[int]
    ] = Field(default_factory=dict)
    day_of_week: Optional[int] = Field(None, ge=0, le=6)
    day_of_month: Optional[int] = Field(None, ge=1, le=31)
    one_off_date: Optional[date] = None
    # Notifications / confirmation; None means "use my default".
    notifications_enabled: Optional[bool] = None
    notify_destination_id: Optional[int] = None
    auto_cancel_enabled: Optional[bool] = None
    confirm_deadline_hours: Optional[int] = Field(None, ge=0, le=24 * 14)
    reminder_hours: Optional[list[Annotated[int, Field(ge=0, le=24 * 14)]]] = None
    confirmation_policy: ConfirmationPolicyEnum = ConfirmationPolicyEnum.owner_only

    @field_validator("confirmation_policy")
    @classmethod
    def _policy_supported(cls, value: ConfirmationPolicyEnum) -> ConfirmationPolicyEnum:
        if value == ConfirmationPolicyEnum.quorum:
            raise ValueError("Quorum confirmation is not supported yet")
        return value


class BookingSlotCreate(BookingSlotBase):
    pass


class BookingSlotUpdate(BaseModel):
    name: Optional[str] = None
    provider_id: Optional[int] = None
    frequency: Optional[FrequencyEnum] = None
    time: Optional[str] = None
    timezone: Optional[str] = None
    duration_minutes: Optional[int] = None
    facility: Optional[str] = None
    is_active: Optional[bool] = None
    attempt_strategy: Optional[AttemptStrategyEnum] = None
    attempt_offset_days: Optional[int] = None
    attempt_offset_hours: Optional[int] = None
    attempt_offset_minutes: Optional[int] = None
    release_days_before: Optional[int] = None
    release_time: Optional[str] = None
    provider_options: Optional[
        dict[str, str | int | float | bool | None | list[str] | list[int]]
    ] = None
    day_of_week: Optional[int] = Field(None, ge=0, le=6)
    day_of_month: Optional[int] = Field(None, ge=1, le=31)
    one_off_date: Optional[date] = None
    # Notifications / confirmation; None means "use my default".
    notifications_enabled: Optional[bool] = None
    notify_destination_id: Optional[int] = None
    auto_cancel_enabled: Optional[bool] = None
    confirm_deadline_hours: Optional[int] = Field(None, ge=0, le=24 * 14)
    reminder_hours: Optional[list[Annotated[int, Field(ge=0, le=24 * 14)]]] = None
    confirmation_policy: Optional[ConfirmationPolicyEnum] = None

    @field_validator("confirmation_policy")
    @classmethod
    def _policy_supported(
        cls, value: Optional[ConfirmationPolicyEnum]
    ) -> Optional[ConfirmationPolicyEnum]:
        if value == ConfirmationPolicyEnum.quorum:
            raise ValueError("Quorum confirmation is not supported yet")
        return value


class BookingSlotTestRequest(BaseModel):
    provider_id: int
    provider_options: dict[str, str | int | float | bool | None | list[str] | list[int]] = Field(
        default_factory=dict
    )


class BookingSlotRead(BookingSlotBase):
    id: int
    user_id: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class BookingTaskBase(BaseModel):
    booking_slot_id: int
    scheduled_date: datetime
    status: TaskStatusEnum = TaskStatusEnum.pending
    attempt_at: Optional[datetime] = None
    error_message: Optional[str] = None


class BookingTaskCreate(BookingTaskBase):
    pass


class BookingTaskUpdate(BaseModel):
    status: Optional[TaskStatusEnum] = None
    error_message: Optional[str] = None
    scheduled_date: Optional[datetime] = None
    attempt_at: Optional[datetime] = None


class BookingTaskRead(BookingTaskBase):
    id: int
    attempted_at: Optional[datetime] = None
    booked_time: Optional[str] = None
    booked_resource: Optional[str] = None
    confirmation_code: Optional[str] = None
    cost: Optional[float] = None
    currency: Optional[str] = None
    confirmation_status: ConfirmationStatusEnum = ConfirmationStatusEnum.not_required
    confirm_deadline_at: Optional[datetime] = None
    refund_deadline_at: Optional[datetime] = None
    confirmed_at: Optional[datetime] = None
    confirmed_by: Optional[str] = None
    cancelled_at: Optional[datetime] = None
    cancel_message: Optional[str] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class UserPreferencesRead(BaseModel):
    notifications_enabled: bool
    auto_cancel_default: bool
    confirm_deadline_hours: Optional[int] = None
    refund_buffer_hours: int
    reminder_hours: list[int]
    short_notice_min_hours: int
    default_destination_id: Optional[int] = None

    model_config = ConfigDict(from_attributes=True)


class UserPreferencesUpdate(BaseModel):
    notifications_enabled: Optional[bool] = None
    auto_cancel_default: Optional[bool] = None
    confirm_deadline_hours: Optional[int] = Field(None, ge=0, le=24 * 14)
    refund_buffer_hours: Optional[int] = Field(None, ge=0, le=48)
    reminder_hours: Optional[list[Annotated[int, Field(ge=0, le=24 * 14)]]] = None
    short_notice_min_hours: Optional[int] = Field(None, ge=0, le=48)
    default_destination_id: Optional[int] = None


class ChatLinkCodeRead(BaseModel):
    code: str
    expires_at: datetime
    bot_invite_url: Optional[str] = None


class ChatIdentityRead(BaseModel):
    id: int
    platform: str
    external_username: Optional[str] = None
    linked_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ChatDestinationRead(BaseModel):
    id: int
    platform: str
    name: str
    discord_guild_id: Optional[str] = None
    discord_channel_id: Optional[str] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
