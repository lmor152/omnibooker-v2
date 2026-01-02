from __future__ import annotations

import logging
from typing import Any, Sequence, cast

from pydantic import BaseModel, Field, ValidationError, model_validator

from ...integrations.better.client import BetterAPIError, BetterClient
from ...integrations.better.models import Activity, Slot
from ...integrations.better.utils import RankedSlot, rank_slot
from ...services.booking_engine import (
    BookingContext,
    BookingResult,
    register_provider_handler,
)

logger = logging.getLogger(__name__)

MAX_SLOT_ATTEMPTS = 5


class _BetterCredentials(BaseModel):
    username: str
    password: str
    cardCvc: str = Field(min_length=3, max_length=4)

    @classmethod
    def from_raw(cls, raw: dict[str, Any]) -> "_BetterCredentials":
        data = dict(raw or {})
        if not data.get("cardCvc"):
            card_payload: Any = data.get("cardDetails")
            if isinstance(card_payload, dict):
                card_map = cast(dict[str, Any], card_payload)
                cvc_value = card_map.get("cvc")
                if isinstance(cvc_value, str):
                    data["cardCvc"] = cvc_value
                elif cvc_value is not None:
                    data["cardCvc"] = str(cvc_value)
        return cls.model_validate(data)


class _BetterSlotOptions(BaseModel):
    venueSlug: str
    activitySlug: str
    useCredits: bool = True
    targetTimes: list[str] = Field(default_factory=list)
    targetCourts: list[str] = Field(default_factory=list)

    @model_validator(mode="before")
    @classmethod
    def _coerce_courts(cls, data: Any) -> Any:
        if isinstance(data, dict) and "targetCourts" in data:
            data_dict = cast(dict[str, Any], data)
            raw_courts = data_dict.get("targetCourts")
            if isinstance(raw_courts, list):
                raw_list = cast(list[Any], raw_courts)
                coerced: list[str] = []
                for item in raw_list:
                    text = str(item).strip()
                    if text:
                        coerced.append(text)
                data_dict["targetCourts"] = coerced
            return data_dict
        return cast(Any, data)


def _normalize_courts(values: Sequence[str]) -> list[str]:
    normalized: list[str] = []
    seen: set[str] = set()
    for value in values:
        text = value.strip()
        if not text:
            continue
        key = text.lower()
        if key in seen:
            continue
        seen.add(key)
        normalized.append(text)
    return normalized


def _preferred_times(options: _BetterSlotOptions, fallback: str) -> list[str]:
    return options.targetTimes or [fallback]


def _select_activities(
    activities: Sequence[Activity],
    *,
    preferred_times: Sequence[str],
) -> list[Activity]:
    selected: list[Activity] = []
    preferred_lookup = set(preferred_times)
    for activity in activities:
        if activity.spaces <= 0:
            continue
        if (
            preferred_lookup
            and activity.starts_at.format_24_hour not in preferred_lookup
        ):
            continue
        selected.append(activity)
    return selected


def _rank_slots_for_activities(
    client: BetterClient,
    activity_slug: str,
    activities: Sequence[Activity],
    *,
    preferred_times: Sequence[str],
    preferred_courts: Sequence[str],
) -> list[RankedSlot]:
    ranked: list[RankedSlot] = []
    for activity in activities:
        try:
            slots = client.list_slots(
                activity.venue_slug,
                activity_slug,
                date=activity.date,
                start_time=activity.starts_at.format_24_hour,
                end_time=activity.ends_at.format_24_hour,
                composite_key=activity.composite_key,
            )
        except BetterAPIError as exc:
            logger.debug(
                "Better slot fetch failed for %s: %s", activity.composite_key, exc
            )
            continue
        for slot in slots:
            if slot.action_to_show.status != "BOOK":
                continue
            ranked.append(
                RankedSlot(
                    slot=slot,
                    activity=activity,
                    rank=rank_slot(
                        slot,
                        preferred_times=preferred_times,
                        preferred_courts=preferred_courts,
                    ),
                )
            )
    ranked.sort(key=lambda candidate: candidate.rank)
    return ranked


def _card_holder_name(context: BookingContext) -> str:
    creds = context.provider.credentials or {}
    return (
        context.user.full_name or context.user.email or creds.get("username", "Member")
    )


def _book_better(context: BookingContext) -> BookingResult:
    slot_options_raw = context.slot.provider_options or {}
    try:
        credentials = _BetterCredentials.from_raw(context.provider.credentials)
        options = _BetterSlotOptions.model_validate(slot_options_raw)
    except ValidationError as exc:
        logger.warning("Better configuration error: %s", exc)
        return BookingResult(
            success=False, message="Invalid Better provider configuration"
        )

    fallback_time = context.task.scheduled_start_local.strftime("%H:%M")
    preferred_times = _preferred_times(options, fallback_time)
    preferred_courts = _normalize_courts(options.targetCourts)
    target_date = context.task.target_date.isoformat()

    logger.info(
        "Starting Better booking task=%s slot=%s provider=%s target_date=%s",
        context.task.id,
        context.slot.id,
        context.provider.name,
        target_date,
    )

    with BetterClient(credentials.username, credentials.password) as better_client:
        try:
            activities_response = better_client.list_activity_times(
                options.venueSlug,
                options.activitySlug,
                date=target_date,
            )
        except BetterAPIError as exc:
            logger.warning("Better activity lookup failed: %s", exc)
            return BookingResult(success=False, message=str(exc))

        candidates = _select_activities(
            activities_response.data,
            preferred_times=preferred_times,
        )
        if not candidates:
            return BookingResult(
                success=False,
                message="No matching Better activities available",
            )

        ranked_slots = _rank_slots_for_activities(
            better_client,
            options.activitySlug,
            candidates,
            preferred_times=preferred_times,
            preferred_courts=preferred_courts,
        )
        if not ranked_slots:
            return BookingResult(
                success=False,
                message="No bookable Better slots found",
            )

        card_name = _card_holder_name(context)

        for attempt, ranked in enumerate(ranked_slots[:MAX_SLOT_ATTEMPTS], start=1):
            logger.info(
                "Attempt %s booking Better slot %s",
                attempt,
                ranked.slot.starts_at.format_24_hour,
            )
            confirmation = _attempt_better_booking(
                better_client,
                ranked.slot,
                credits_allowed=options.useCredits,
                card_cvc=credentials.cardCvc,
                card_holder_name=card_name,
            )
            if confirmation:
                return BookingResult(
                    success=True,
                    confirmation_code=confirmation,
                    message=(
                        f"Booked {options.venueSlug} at {ranked.slot.starts_at.format_24_hour}"
                    ),
                )

    logger.error(
        "Better booking failed after %s attempts (task=%s)",
        MAX_SLOT_ATTEMPTS,
        context.task.id,
    )
    return BookingResult(
        success=False,
        message="Unable to confirm booking with Better",
    )


def _attempt_better_booking(
    client: BetterClient,
    slot: Slot,
    *,
    credits_allowed: bool,
    card_cvc: str,
    card_holder_name: str,
) -> str | None:
    try:
        client.clear_cart()
        cart = client.add_slot_to_cart(slot)
    except BetterAPIError as exc:
        logger.warning("Better cart operation failed: %s", exc)
        return None

    general_credit = cart.general_credit()
    credits_to_use = 0
    if general_credit and credits_allowed:
        try:
            credits_to_use = int(general_credit.max_applicable)
        except (TypeError, ValueError):
            credits_to_use = 0

    if credits_to_use:
        try:
            client.apply_credits(credits_to_use)
        except BetterAPIError as exc:
            logger.warning("Better credit application failed: %s", exc)
            credits_to_use = 0

    total_raw = cart.total or 0
    if isinstance(total_raw, str):
        try:
            total_cost = int(float(total_raw))
        except ValueError:
            total_cost = 0
    else:
        try:
            total_cost = int(total_raw)
        except (TypeError, ValueError):
            total_cost = 0
    needs_card = total_cost > credits_to_use
    transaction_id = ""

    if needs_card:
        try:
            prepare = client.prepare_checkout()
            client.validate_cvc(
                opayo_card_id=prepare.saved_card.external_identifier,
                cvc=card_cvc,
                session_key=prepare.session_key,
            )
            auth = client.authorise_checkout(
                better_card_id=prepare.saved_card.id,
                credits_to_use=credits_to_use,
                cart_hash=cart.itemHash,
                session_key=prepare.session_key,
                card_holder_name=card_holder_name,
            )
            if auth.transaction_status.lower() != "authorised":
                logger.warning(
                    "Better checkout not authorised: %s",
                    auth.transaction_status,
                )
                return None
            transaction_id = auth.transaction_uuid
        except BetterAPIError as exc:
            logger.warning("Better checkout authorisation failed: %s", exc)
            return None

    try:
        client.complete_booking(
            transaction_id=transaction_id,
            credits_to_use=credits_to_use,
            cart_hash=cart.itemHash,
        )
    except BetterAPIError as exc:
        logger.warning("Better booking completion failed: %s", exc)
        return None

    return transaction_id or cart.itemHash


register_provider_handler("better", _book_better)
