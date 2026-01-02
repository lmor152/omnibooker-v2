from datetime import datetime
from typing import Annotated, Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from .models import AttemptStrategyEnum, FrequencyEnum, TaskStatusEnum


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
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
