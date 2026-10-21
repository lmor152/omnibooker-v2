# Better: booking changes and cancelling

Verified on 2026-10-21 against Islington Tennis Centre / Highbury Fields Tennis (`highbury-tennis`).

## Booking API changes (the venue moved to Better's "v2" activities)

The app's Better booking flow was failing on three calls. All are fixed in `BetterClient`:

| Step | Old (broken) | Now |
| --- | --- | --- |
| Times | `GET /activities/venue/{venue}/activity/{slug}/times` → 422 "date should be within the valid days" | `GET …/{slug}/v2/times?date=` |
| Slots | `GET …/{slug}/slots` | `GET …/{slug}/v2/slots?date=&start_time=&end_time=&composite_key=` |
| Apply credit | `POST /activities/cart/apply-credits` → 405 | `POST /credits/apply` (same body/response) |

- v2 slot `id`s are opaque strings, and adding a slot to the cart uses the slot's
  `cart_type` (`purchasableOccurrence`).
- Amounts are in **pence**: slot `price.raw`, cart `total`, credits.
- `POST /checkout/complete` returns `{"complete_order_id": N}`, stored as
  `provider_booking_ref.order_id`.

## Listing bookings

```
GET /api/v1/activities/bookings?user_id={id}&starts_after={iso8601}&cancellation_source=my-account&page=1
```

- `user_id` comes from the login response's `user.id`. Implemented as `BetterClient.list_bookings`.
- Each booking has `id` (used to cancel) and `order_id` (matches `complete_order_id`).
  `occurrence_id` is the v2 slot id.
- Each booking also has a `cancellation` object:
  - `can_cancel`, `cannot_cancel_reason`
  - `cut_off` (UTC): the last moment to cancel without penalty. It was 4h before the start.
  - `cut_off_actions`, e.g. `charge_fee`, `disable_booking`
  - `awards_credit`: refunds are paid as Better account credit, not to the card
- Cancelled bookings disappear from this list.

## Cancel

```
PATCH /api/v1/activities/bookings
{"data": {"cancellation_source": "my-account", "update_type": "cancellation", "booking_ids": [id]}}
```

- The `data` wrapper is required. Without it Better returns 422.
- The response is 200 with an empty body.
- Verified: cancelling a £12.85 credit-paid booking returned the £12.85 as account credit.
- Implemented as `BetterClient.cancel_bookings` and the `_cancel_better` handler. The handler
  refuses to cancel past `cut_off`, never retries, and re-checks the list after an error.
