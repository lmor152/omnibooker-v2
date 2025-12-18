from __future__ import annotations

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
    metadata: dict[str, Any] = field(default_factory=dict)


class BookingProvider(Protocol):
    def __call__(self, context: BookingContext) -> BookingResult: ...


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
    """Testing helper to reset the provider registry."""
    _provider_registry.clear()


def run_booking(context: BookingContext) -> BookingResult:
    handler = _lookup_handler(context.provider.type)
    return handler(context)


def _lookup_handler(provider_type: str) -> BookingProvider:
    provider_key = provider_type.lower()
    handler = _provider_registry.get(provider_key)
    if handler is None:
        raise BookingProviderNotRegisteredError(provider_type)
    return handler
