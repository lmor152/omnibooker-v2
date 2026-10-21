from __future__ import annotations

import enum
import logging
from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Any, Protocol

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class ProviderContext:
    id: int
    name: str
    type: str
    credentials: dict[str, Any]


@dataclass(frozen=True)
class SlotContext:
    id: int
    name: str
    facility: str | None
    timezone: str
    frequency: str
    duration_minutes: int
    provider_options: dict[str, Any]


@dataclass(frozen=True)
class UserContext:
    id: int
    email: str
    full_name: str | None


@dataclass(frozen=True)
class TaskContext:
    id: int
    scheduled_start_utc: datetime
    scheduled_start_local: datetime
    scheduled_end_utc: datetime
    scheduled_end_local: datetime
    attempt_at_utc: datetime | None
    attempt_at_local: datetime | None
    target_date: date


@dataclass(frozen=True)
class BookingContext:
    provider: ProviderContext
    slot: SlotContext
    task: TaskContext
    user: UserContext


@dataclass(frozen=True)
class BookingResult:
    success: bool
    message: str | None = None
    confirmation_code: str | None = None
    booked_time: str | None = None  # HH:MM local to the venue
    booked_resource: str | None = None  # e.g. court name
    cost: float | None = None
    currency: str | None = None
    # Provider-specific identifiers persisted as BookingTask.provider_booking_ref
    metadata: dict[str, Any] = field(default_factory=dict)


class BookingProvider(Protocol):
    def __call__(self, context: BookingContext) -> BookingResult: ...


class CancelStatus(str, enum.Enum):
    cancelled = "cancelled"  # cancelled with the provider (see CancelResult.refunded)
    manual_required = "manual_required"  # not safe/possible to cancel automatically
    failed = "failed"  # cancel attempted but the outcome could not be confirmed


@dataclass(frozen=True)
class CancelContext:
    provider: ProviderContext
    # BookingTask.provider_booking_ref, i.e. BookingResult.metadata from the booking
    booking_ref: dict[str, Any]
    now_utc: datetime


@dataclass(frozen=True)
class CancelResult:
    status: CancelStatus
    refunded: bool = False
    refund_method: str | None = None  # "card" or "credit"
    message: str | None = None
    refund_deadline_utc: datetime | None = None


class CancelProvider(Protocol):
    def __call__(self, context: CancelContext) -> CancelResult: ...


class BookingProviderNotRegisteredError(RuntimeError):
    def __init__(self, provider_type: str):
        super().__init__(f"No booking provider registered for type '{provider_type}'")
        self.provider_type = provider_type


_provider_registry: dict[str, BookingProvider] = {}


def register_provider_handler(provider_type: str, handler: BookingProvider) -> None:
    if not provider_type:
        raise ValueError("provider_type must be a non-empty string")
    provider_key = provider_type.lower()
    _provider_registry[provider_key] = handler
    logger.debug("Registered booking handler for provider type '%s'", provider_key)


def unregister_provider_handler(provider_type: str) -> None:
    provider_key = provider_type.lower()
    _provider_registry.pop(provider_key, None)


def registered_provider_types() -> list[str]:
    return sorted(_provider_registry.keys())


def clear_provider_handlers() -> None:
    """Testing helper to reset the provider registries."""
    _provider_registry.clear()
    _cancel_registry.clear()


def run_booking(context: BookingContext) -> BookingResult:
    handler = _lookup_handler(context.provider.type)
    return handler(context)


def _lookup_handler(provider_type: str) -> BookingProvider:
    provider_key = provider_type.lower()
    handler = _provider_registry.get(provider_key)
    if handler is None:
        raise BookingProviderNotRegisteredError(provider_type)
    return handler


_cancel_registry: dict[str, CancelProvider] = {}


def register_cancel_handler(provider_type: str, handler: CancelProvider) -> None:
    if not provider_type:
        raise ValueError("provider_type must be a non-empty string")
    _cancel_registry[provider_type.lower()] = handler
    logger.debug("Registered cancel handler for provider type '%s'", provider_type.lower())


def run_cancel(context: CancelContext) -> CancelResult:
    """Cancel a booking with its provider; providers without support need a manual cancel."""

    handler = _cancel_registry.get(context.provider.type.lower())
    if handler is None:
        return CancelResult(
            status=CancelStatus.manual_required,
            message=f"Automatic cancellation is not supported for {context.provider.type}",
        )
    return handler(context)
