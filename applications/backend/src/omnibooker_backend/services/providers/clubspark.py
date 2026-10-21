from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any
from zoneinfo import ZoneInfo

from pydantic import BaseModel, Field, ValidationError

from ...integrations.clubspark.client import ClubsparkAPIError, ClubsparkClient
from ...integrations.clubspark.models import UserSession
from ...integrations.clubspark.utils import parse_time_to_minutes, rank_slots
from ...integrations.stripe.client import StripeAPIError, StripeClient
from ...services.booking_engine import (
    BookingContext,
    BookingResult,
    CancelContext,
    CancelResult,
    CancelStatus,
    register_cancel_handler,
    register_provider_handler,
)

logger = logging.getLogger(__name__)

MAX_SLOT_ATTEMPTS = 3
# Don't start a cancel this close to the refund deadline: it might land after it.
CANCEL_SAFETY_MARGIN = timedelta(minutes=5)


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
                booked_time=_minutes_to_label(ranked.start_time),
                booked_resource=ranked.resource.Name,
                cost=ranked.resource.Cost,
                currency="GBP",
                message=(
                    f"Booked {options.courtSlug} {ranked.resource.Name} "
                    f"at {_minutes_to_label(ranked.start_time)}"
                ),
                metadata={
                    "provider": "clubspark",
                    "venue_slug": options.courtSlug,
                    "venue_id": venue_settings.Venue.ID,
                    "resource_id": session.ResourceID or ranked.resource.ID,
                    # RequestSession's SessionID is the ID CancelUserSession expects.
                    "session_id": session.SessionID,
                    "slot_session_id": ranked.resource.SessionID,
                    "payment_id": payment.ID,
                    "transaction_id": session.TransactionID,
                    "date": target_date,
                    "start_minutes": ranked.start_time,
                    "duration": duration,
                    "refund_window": venue_settings.Venue.BookingRefundWindow,
                },
            )

    logger.error(
        "Clubspark booking exhausted attempts without success (task=%s)",
        context.task.id,
    )
    return BookingResult(
        success=False,
        message="Unable to confirm booking with Clubspark after multiple attempts",
    )


def _cancel_clubspark(context: CancelContext) -> CancelResult:
    """Cancel a ClubSpark booking, but only while it will still be refunded.

    Cancelling after the venue's RefundDeadline cancels without a refund, so the
    booking is re-checked first and anything outside the window is left for the
    user. CancelUserSession is never retried; after an error the booking is
    looked up again to find out what happened.
    """

    ref = context.booking_ref or {}
    session_id = ref.get("session_id")
    booking_date = ref.get("date")
    if not session_id or not booking_date:
        return CancelResult(
            status=CancelStatus.manual_required,
            message="Booking has no ClubSpark session id; cancel it in ClubSpark",
        )

    try:
        credentials = _resolve_credentials(context.provider.credentials)
    except ValueError as exc:
        return CancelResult(status=CancelStatus.manual_required, message=str(exc))

    with ClubsparkClient(credentials.username, credentials.password) as cs_client:
        try:
            session = _find_user_session(cs_client, session_id, booking_date)
        except ClubsparkAPIError as exc:
            logger.warning("Clubspark booking lookup failed: %s", exc)
            return CancelResult(
                status=CancelStatus.failed,
                message=f"Could not look up the booking: {exc}",
            )

        if session is None:
            return CancelResult(
                status=CancelStatus.manual_required,
                message="Booking not found in ClubSpark; check it in ClubSpark",
            )
        if session.IsDeleted:
            return CancelResult(
                status=CancelStatus.cancelled,
                refunded=session.Refunded,
                message="Booking was already cancelled",
            )

        deadline = _refund_deadline_utc(session)
        if not session.CanCancel:
            return CancelResult(
                status=CancelStatus.manual_required,
                message="ClubSpark does not allow this booking to be cancelled",
                refund_deadline_utc=deadline,
            )
        if deadline is None or context.now_utc >= deadline - CANCEL_SAFETY_MARGIN:
            return CancelResult(
                status=CancelStatus.manual_required,
                message=(
                    "Past the refund deadline; cancelling now would not be refunded"
                ),
                refund_deadline_utc=deadline,
            )

        logger.info("Cancelling Clubspark session %s", session_id)
        try:
            response = cs_client.cancel_user_session(session_id)
        except Exception as exc:  # pylint: disable=broad-except
            logger.warning("Clubspark cancel errored, re-checking booking: %s", exc)
            return _confirm_cancel_after_error(
                cs_client, session_id, booking_date, deadline, exc
            )

    if not response.Refunded:
        logger.error("Clubspark cancelled session %s without a refund", session_id)
    return CancelResult(
        status=CancelStatus.cancelled,
        refunded=response.Refunded,
        refund_method="card" if response.Refunded else None,
        message="Cancelled and refunded" if response.Refunded else "Cancelled without refund",
        refund_deadline_utc=deadline,
    )


def _find_user_session(
    cs_client: ClubsparkClient, session_id: str, booking_date: str
) -> UserSession | None:
    sessions = cs_client.get_user_sessions(start_date=booking_date).Sessions
    return next((s for s in sessions if s.ID == session_id), None)


def _refund_deadline_utc(session: UserSession) -> datetime | None:
    if session.RefundDeadline is None:
        return None
    deadline = session.RefundDeadline
    if deadline.tzinfo is None:
        # Ambiguous local times (clocks going back) resolve to the earlier
        # instant (fold=0), so we err on stopping auto-cancel too early.
        deadline = deadline.replace(tzinfo=ZoneInfo(session.Venue.TimeZone))
    return deadline.astimezone(timezone.utc)


def _confirm_cancel_after_error(
    cs_client: ClubsparkClient,
    session_id: str,
    booking_date: str,
    deadline: datetime | None,
    error: Exception,
) -> CancelResult:
    try:
        session = _find_user_session(cs_client, session_id, booking_date)
    except Exception as exc:  # pylint: disable=broad-except
        logger.warning("Clubspark re-check failed: %s", exc)
        session = None
    if session is not None and session.IsDeleted:
        return CancelResult(
            status=CancelStatus.cancelled,
            refunded=session.Refunded,
            message="Cancelled (confirmed after an error)",
            refund_deadline_utc=deadline,
        )
    return CancelResult(
        status=CancelStatus.failed,
        message=f"Cancel request failed and the booking may still be active: {error}",
        refund_deadline_utc=deadline,
    )


register_provider_handler("clubspark", _book_clubspark)
register_cancel_handler("clubspark", _cancel_clubspark)
