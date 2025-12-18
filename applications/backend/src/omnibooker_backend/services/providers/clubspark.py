from __future__ import annotations

import logging
from typing import Any

from pydantic import BaseModel, Field, ValidationError

from ...integrations.clubspark.client import ClubsparkAPIError, ClubsparkClient
from ...integrations.clubspark.utils import parse_time_to_minutes, rank_slots
from ...integrations.stripe.client import StripeAPIError, StripeClient
from ...services.booking_engine import (
    BookingContext,
    BookingResult,
    register_provider_handler,
)

logger = logging.getLogger(__name__)

MAX_SLOT_ATTEMPTS = 3


class _ProviderCardDetails(BaseModel):
    cardNumber: str
    expiryDate: str  # MM/YY
    cvc: str


class _ProviderCredentials(BaseModel):
    username: str
    password: str
    cardDetails: _ProviderCardDetails


class _SlotOptions(BaseModel):
    courtSlug: str
    doubleSession: bool = False
    targetTimes: list[str] = Field(default_factory=list)
    targetCourts: list[Any] = Field(default_factory=list)


def _resolve_credentials(raw: dict[str, Any]) -> _ProviderCredentials:
    try:
        return _ProviderCredentials.model_validate(raw)
    except ValidationError as exc:  # pragma: no cover - exercised in tests
        raise ValueError("Missing or invalid Clubspark credentials") from exc


def _resolve_slot_options(
    raw: dict[str, Any], fallback_slug: str | None
) -> _SlotOptions:
    data: dict[str, Any] = dict(raw or {})
    if fallback_slug and not data.get("courtSlug"):
        data["courtSlug"] = fallback_slug
    if not data.get("courtSlug"):
        raise ValueError("Clubspark booking slots must specify a court slug")
    try:
        return _SlotOptions.model_validate(data)
    except ValidationError as exc:  # pragma: no cover - exercised in tests
        raise ValueError("Invalid Clubspark provider options") from exc


def _card_expiry_parts(expiry: str) -> tuple[str, str]:
    parts = expiry.split("/")
    if len(parts) != 2:
        raise ValueError("Card expiry must use MM/YY format")
    month_raw, year_raw = parts
    month = str(int(month_raw)).zfill(2)
    year_val = int(year_raw)
    year = str(year_val if year_val > 99 else 2000 + year_val)
    return month, year


def _preferred_times(options: _SlotOptions, fallback_time: str) -> list[str]:
    return options.targetTimes or [fallback_time]


def _preferred_courts(options: _SlotOptions) -> list[str]:
    courts: list[str] = []
    for entry in options.targetCourts:
        if isinstance(entry, str):
            if entry.lower().startswith("court"):
                courts.append(entry)
            else:
                courts.append(f"Court {entry}")
        else:
            courts.append(f"Court {entry}")
    return courts


def _minutes_to_label(value: int) -> str:
    hours = value // 60
    minutes = value % 60
    return f"{hours:02d}:{minutes:02d}"


def _book_clubspark(context: BookingContext) -> BookingResult:
    slot_options_raw = context.slot.provider_options or {}
    fallback_slug = slot_options_raw.get("courtSlug") or context.slot.facility

    try:
        credentials = _resolve_credentials(context.provider.credentials)
        options = _resolve_slot_options(slot_options_raw, fallback_slug)
    except ValueError as exc:
        logger.warning("Clubspark configuration error: %s", exc)
        return BookingResult(success=False, message=str(exc))

    logger.info(
        "Initiating Clubspark booking task=%s slot=%s provider=%s user=%s target=%s",
        context.task.id,
        context.slot.id,
        context.provider.name,
        context.user.email,
        context.task.target_date,
    )

    fallback_time = context.task.scheduled_start_local.strftime("%H:%M")
    preferred_time_strings = _preferred_times(options, fallback_time)
    try:
        preferred_time_minutes = [
            parse_time_to_minutes(t) for t in preferred_time_strings
        ]
    except ValueError as exc:
        return BookingResult(success=False, message=str(exc))
    preferred_courts = _preferred_courts(options)
    duration = 120 if options.doubleSession else (context.slot.duration_minutes or 60)
    target_date = context.task.target_date.isoformat()

    with (
        ClubsparkClient(credentials.username, credentials.password) as cs_client,
        StripeClient() as stripe_client,
    ):
        try:
            logger.info(
                "Fetching Clubspark user + availability for slug=%s date=%s duration=%s",
                options.courtSlug,
                target_date,
                duration,
            )
            current_user = cs_client.get_current_user()
            availability = cs_client.get_availability_times(
                options.courtSlug,
                target_date,
                duration=duration,
            )
        except ClubsparkAPIError as exc:
            logger.warning("Clubspark API failure: %s", exc)
            return BookingResult(success=False, message=str(exc))

        if not availability.Times:
            return BookingResult(
                success=False, message="No availability returned by Clubspark"
            )

        logger.info(
            "Received %s availability windows for slug=%s",
            len(availability.Times or []),
            options.courtSlug,
        )

        ranked_slots = rank_slots(
            availability.Times,
            preferred_time_minutes,
            preferred_courts,
        )

        if not ranked_slots:
            return BookingResult(
                success=False,
                message="No slots match the preferred times/courts",
            )

        try:
            logger.info(
                "Fetching Clubspark venue settings for slug=%s", options.courtSlug
            )
            venue_settings = cs_client.get_app_settings(options.courtSlug)
        except ClubsparkAPIError as exc:
            logger.warning("Clubspark settings lookup failed: %s", exc)
            return BookingResult(success=False, message=str(exc))

        month, year = _card_expiry_parts(credentials.cardDetails.expiryDate)

        try:
            logger.info(
                "Creating Stripe payment method for Clubspark venue=%s",
                venue_settings.Venue.ID,
            )
            payment_method = stripe_client.create_payment_method(
                publishable_key=venue_settings.StripePublishableKey,
                stripe_account=venue_settings.Venue.StripeAccountID,
                email=current_user.EmailAddress,
                card_number=credentials.cardDetails.cardNumber,
                card_exp_month=month,
                card_exp_year=year,
                card_cvc=credentials.cardDetails.cvc,
            )
        except StripeAPIError as exc:
            logger.warning("Stripe payment method error: %s", exc)
            return BookingResult(success=False, message=str(exc))

        for attempt, ranked in enumerate(ranked_slots[:MAX_SLOT_ATTEMPTS], start=1):
            logger.info(
                "Attempt %s to book Clubspark slot %s on %s",
                attempt,
                _minutes_to_label(ranked.start_time),
                options.courtSlug,
            )
            try:
                payment = cs_client.create_payment(
                    user_name=f"{current_user.FirstName} {current_user.LastName}",
                    cost=ranked.resource.Cost,
                    scope=ranked.resource.SessionID,
                    payment_method_id=payment_method.id,
                    venue_id=venue_settings.Venue.ID,
                )
            except ClubsparkAPIError as exc:
                logger.warning("Payment attempt failed: %s", exc)
                continue

            if not payment.ID:
                logger.warning("Payment response missing ID: %s", payment)
                continue

            try:
                session = cs_client.request_session(
                    venue_slug=options.courtSlug,
                    payment_token=payment.ID,
                    duration=duration,
                    date=target_date,
                    total_paid=ranked.resource.Cost,
                    start_time=ranked.start_time,
                    resource_id=ranked.resource.ID,
                    session_id=ranked.resource.SessionID,
                )
            except ClubsparkAPIError as exc:
                logger.warning("Session request failed: %s", exc)
                continue

            if session.Result < 0:
                logger.warning("Session request negative result: %s", session.Result)
                continue

            confirmation = session.TransactionID or payment.ID
            return BookingResult(
                success=True,
                confirmation_code=confirmation,
                message=(
                    f"Booked {options.courtSlug} at {_minutes_to_label(ranked.start_time)}"
                ),
            )

    logger.error(
        "Clubspark booking exhausted attempts without success (task=%s)",
        context.task.id,
    )
    return BookingResult(
        success=False,
        message="Unable to confirm booking with Clubspark after multiple attempts",
    )


register_provider_handler("clubspark", _book_clubspark)
