import enum
from datetime import date, datetime, timezone
from typing import Optional

from decimal import Decimal

from sqlalchemy import (
    JSON,
    Boolean,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


class FrequencyEnum(str, enum.Enum):
    weekly = "weekly"
    fortnightly = "fortnightly"
    monthly = "monthly"
    one_off = "one_off"


class TaskStatusEnum(str, enum.Enum):
    pending = "pending"
    processing = "processing"
    success = "success"
    failed = "failed"
    cancelled = "cancelled"


class AttemptStrategyEnum(str, enum.Enum):
    offset = "offset"
    release = "release"


class ConfirmationStatusEnum(str, enum.Enum):
    not_required = "not_required"  # auto-cancel off for this booking
    awaiting = "awaiting"  # waiting for the owner to keep it before the deadline
    confirmed = "confirmed"
    auto_kept = "auto_kept"  # booked too close to the deadline to ask
    cancel_pending = "cancel_pending"
    cancelled = "cancelled"  # cancelled with the provider
    cancel_failed = "cancel_failed"  # outcome unknown; needs checking
    manual_cancel_required = "manual_cancel_required"


class ConfirmationPolicyEnum(str, enum.Enum):
    owner_only = "owner_only"
    anyone = "anyone"
    quorum = "quorum"


class ActionStatusEnum(str, enum.Enum):
    pending = "pending"
    done = "done"
    skipped = "skipped"
    failed = "failed"


def _str_enum(enum_cls: type[enum.Enum]) -> Enum:
    """VARCHAR-backed enum, so new values never need ALTER TYPE."""

    return Enum(
        enum_cls,
        native_enum=False,
        length=32,
        values_callable=lambda members: [m.value for m in members],
    )


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
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
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
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
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
    one_off_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
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
    # Notification / confirmation overrides; None means "use the user's default".
    notifications_enabled: Mapped[Optional[bool]] = mapped_column(Boolean)
    notify_destination_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("chat_destinations.id", ondelete="SET NULL")
    )
    auto_cancel_enabled: Mapped[Optional[bool]] = mapped_column(Boolean)
    confirm_deadline_hours: Mapped[Optional[int]] = mapped_column(Integer)
    reminder_hours: Mapped[Optional[list[int]]] = mapped_column(JSON)
    confirmation_policy: Mapped[ConfirmationPolicyEnum] = mapped_column(
        _str_enum(ConfirmationPolicyEnum),
        default=ConfirmationPolicyEnum.owner_only,
        server_default=ConfirmationPolicyEnum.owner_only.value,
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
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
    scheduled_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    status: Mapped[TaskStatusEnum] = mapped_column(
        Enum(TaskStatusEnum), default=TaskStatusEnum.pending, nullable=False
    )
    attempt_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    error_message: Mapped[Optional[str]] = mapped_column(Text)
    booked_time: Mapped[Optional[str]] = mapped_column(String(5))
    booked_resource: Mapped[Optional[str]] = mapped_column(String(255))
    confirmation_code: Mapped[Optional[str]] = mapped_column(String(255))
    # Provider-specific identifiers needed to look up or cancel the booking later.
    provider_booking_ref: Mapped[Optional[dict]] = mapped_column(JSON)
    cost: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 2))
    currency: Mapped[Optional[str]] = mapped_column(String(3))
    confirmation_status: Mapped[ConfirmationStatusEnum] = mapped_column(
        _str_enum(ConfirmationStatusEnum),
        default=ConfirmationStatusEnum.not_required,
        server_default=ConfirmationStatusEnum.not_required.value,
        nullable=False,
    )
    confirm_deadline_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    # When cancelling stops being refundable (provider refund deadline / cut-off).
    refund_deadline_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    confirmed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    confirmed_by: Mapped[Optional[str]] = mapped_column(String(64))
    cancel_requested_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    cancelled_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    cancel_message: Mapped[Optional[str]] = mapped_column(Text)
    attempted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    booking_slot: Mapped["BookingSlot"] = relationship(
        "BookingSlot", back_populates="booking_tasks"
    )


class UserPreferences(Base):
    __tablename__ = "user_preferences"

    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    notifications_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    auto_cancel_default: Mapped[bool] = mapped_column(Boolean, default=False)
    # Hours before the session start. None: derive from the provider's refund deadline.
    confirm_deadline_hours: Mapped[Optional[int]] = mapped_column(Integer)
    # Keep the confirm deadline at least this far before the refund deadline.
    refund_buffer_hours: Mapped[int] = mapped_column(Integer, default=2)
    # Reminders, in hours before the confirm deadline.
    reminder_hours: Mapped[list[int]] = mapped_column(JSON, default=lambda: [12, 2])
    # Bookings made closer than this to their deadline are kept without asking.
    short_notice_min_hours: Mapped[int] = mapped_column(Integer, default=1)
    default_destination_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("chat_destinations.id", ondelete="SET NULL")
    )


class ChatIdentity(Base):
    """A chat account (e.g. a Discord user) linked to an app user."""

    __tablename__ = "chat_identities"
    __table_args__ = (UniqueConstraint("platform", "external_user_id"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    platform: Mapped[str] = mapped_column(String(32), nullable=False)
    external_user_id: Mapped[str] = mapped_column(String(64), nullable=False)
    external_username: Mapped[Optional[str]] = mapped_column(String(255))
    linked_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )


class ChatLinkCode(Base):
    __tablename__ = "chat_link_codes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    code_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))


class ChatDestination(Base):
    """Somewhere notifications can be posted, e.g. a Discord channel."""

    __tablename__ = "chat_destinations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    platform: Mapped[str] = mapped_column(String(32), nullable=False)  # discord_channel
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    discord_guild_id: Mapped[Optional[str]] = mapped_column(String(64))
    discord_channel_id: Mapped[Optional[str]] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )


class ScheduledAction(Base):
    """A delayed job run by the worker (notifications, reminders, deadlines)."""

    __tablename__ = "scheduled_actions"
    __table_args__ = (Index("ix_scheduled_actions_status_due", "status", "due_at"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    booking_task_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("booking_tasks.id", ondelete="CASCADE"), index=True
    )
    kind: Mapped[str] = mapped_column(String(32), nullable=False)
    due_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    status: Mapped[ActionStatusEnum] = mapped_column(
        _str_enum(ActionStatusEnum), default=ActionStatusEnum.pending, nullable=False
    )
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    last_error: Mapped[Optional[str]] = mapped_column(Text)
    payload: Mapped[dict] = mapped_column(JSON, default=dict)
    dedupe_key: Mapped[Optional[str]] = mapped_column(String(255), unique=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    executed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))


class ChatMessage(Base):
    """A message the app posted, so it can be edited or matched to reactions."""

    __tablename__ = "chat_messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    booking_task_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("booking_tasks.id", ondelete="CASCADE"), index=True
    )
    destination_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("chat_destinations.id", ondelete="SET NULL")
    )
    platform: Mapped[str] = mapped_column(String(32), nullable=False)
    channel_id: Mapped[str] = mapped_column(String(64), nullable=False)
    message_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    purpose: Mapped[str] = mapped_column(String(32), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
