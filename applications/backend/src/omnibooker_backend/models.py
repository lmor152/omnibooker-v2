import enum
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import JSON, Boolean, DateTime, Enum, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


class FrequencyEnum(str, enum.Enum):
    weekly = "weekly"
    fortnightly = "fortnightly"
    monthly = "monthly"


class TaskStatusEnum(str, enum.Enum):
    pending = "pending"
    processing = "processing"
    success = "success"
    failed = "failed"
    cancelled = "cancelled"


class AttemptStrategyEnum(str, enum.Enum):
    offset = "offset"
    release = "release"


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    email: Mapped[str] = mapped_column(
        String(255), unique=True, index=True, nullable=False
    )
    hashed_password: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    full_name: Mapped[Optional[str]] = mapped_column(String(255))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc)
    )

    providers: Mapped[list["Provider"]] = relationship(
        "Provider", back_populates="owner", cascade="all, delete-orphan"
    )
    booking_slots: Mapped[list["BookingSlot"]] = relationship(
        "BookingSlot", back_populates="owner", cascade="all, delete-orphan"
    )


class Provider(Base):
    __tablename__ = "providers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    type: Mapped[str] = mapped_column(String(50), nullable=False, default="Other")
    credentials: Mapped[dict[str, Optional[str]]] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc)
    )

    owner: Mapped["User"] = relationship("User", back_populates="providers")
    booking_slots: Mapped[list["BookingSlot"]] = relationship(
        "BookingSlot", back_populates="provider", cascade="all, delete-orphan"
    )


class BookingSlot(Base):
    __tablename__ = "booking_slots"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    provider_id: Mapped[int] = mapped_column(
        ForeignKey("providers.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    frequency: Mapped[FrequencyEnum] = mapped_column(
        Enum(FrequencyEnum), nullable=False
    )
    day_of_week: Mapped[Optional[int]] = mapped_column(Integer)
    day_of_month: Mapped[Optional[int]] = mapped_column(Integer)
    time: Mapped[str] = mapped_column(String(5), nullable=False)  # HH:MM
    timezone: Mapped[str] = mapped_column(
        String(50), nullable=False, server_default="UTC"
    )
    duration_minutes: Mapped[Optional[int]] = mapped_column(Integer, default=60)
    facility: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    attempt_strategy: Mapped[AttemptStrategyEnum] = mapped_column(
        Enum(AttemptStrategyEnum), default=AttemptStrategyEnum.offset, nullable=False
    )
    attempt_offset_days: Mapped[int] = mapped_column(Integer, default=0)
    attempt_offset_hours: Mapped[int] = mapped_column(Integer, default=0)
    attempt_offset_minutes: Mapped[int] = mapped_column(Integer, default=0)
    release_days_before: Mapped[int] = mapped_column(Integer, default=0)
    release_time: Mapped[Optional[str]] = mapped_column(String(5), nullable=True)
    provider_options: Mapped[dict[str, str | int | float | bool | None]] = (
        mapped_column(JSON, default=dict)
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc)
    )

    owner: Mapped["User"] = relationship("User", back_populates="booking_slots")
    provider: Mapped["Provider"] = relationship(
        "Provider", back_populates="booking_slots"
    )
    booking_tasks: Mapped[list["BookingTask"]] = relationship(
        "BookingTask", back_populates="booking_slot", cascade="all, delete-orphan"
    )


class BookingTask(Base):
    __tablename__ = "booking_tasks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    booking_slot_id: Mapped[int] = mapped_column(
        ForeignKey("booking_slots.id", ondelete="CASCADE"), nullable=False, index=True
    )
    scheduled_date: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    status: Mapped[TaskStatusEnum] = mapped_column(
        Enum(TaskStatusEnum), default=TaskStatusEnum.pending, nullable=False
    )
    attempt_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    error_message: Mapped[Optional[str]] = mapped_column(Text)
    attempted_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc)
    )

    booking_slot: Mapped["BookingSlot"] = relationship(
        "BookingSlot", back_populates="booking_tasks"
    )
