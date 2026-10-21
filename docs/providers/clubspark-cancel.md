# ClubSpark: cancelling a booking

Verified on 2026-10-21 by booking and then cancelling Finsbury Park Court 1, 07:00 on 2026-10-25 (£7), entirely through the API.

## Cancel

```
GET https://api.clubspark.uk/v0/Booking/CancelUserSession/{session_id}?currentVenueContactID=
```

- Uses the same OAuth Bearer token as booking, so no website cookies are needed. Implemented as `ClubsparkClient.cancel_user_session`.
- `{session_id}` is the `SessionID` from the `RequestSession` response, stored as
  `provider_booking_ref.session_id`. It is *not* the `SessionID` from the availability slot (`slot_session_id`).
- It is a GET that changes state. Never retry it or let anything prefetch it.
- Response:

  ```json
  {"Refunded": true, "IsCompletedEarly": false, "Duration": 0.0}
  ```

- After the cancel, the court shows as available again in `GetAvailabilityTimes`.
- The website sends the same request from `clubspark.lta.org.uk` with a jQuery `_=` cache-buster.

## Listing bookings

```
GET https://api.clubspark.uk/v0/Booking/GetUserSessions?endDate=&startDate=YYYY-MM-DD
```

Found by MITM on the mobile app. Implemented as `ClubsparkClient.get_user_sessions`. It returns
`{"Sessions": [...]}`, including cancelled bookings. Useful fields:

| Field | Meaning |
| --- | --- |
| `ID` | The session ID, the same one `CancelUserSession` takes |
| `PaymentTransactionID` | Matches the transaction ID stored at booking time |
| `RefundDeadline` | Venue-local time. Null once refunded or no longer refundable |
| `CanCancel` | True only for active, upcoming bookings |
| `Refunded`, `IsDeleted` | Whether the booking was refunded / cancelled |
| `PaymentStatus` | 2 = paid, 3 = refunded |
| `CurrentStatus` | 0 = upcoming, 2 = played, 3 = cancelled |

## Refund window

`Venue.BookingRefundWindow` is in **hours**: `RefundDeadline` = start − window, which is 24h at
Clissold Park and 6h at Finsbury Park. Refunds go back to the card that paid
(`PaymentStatus` 3, `CreditAmount` 0).

**Cancelling after the deadline cancels the booking without a refund.** In the account history,
seven Clissold bookings were cancelled after their `RefundDeadline` and all stayed `Refunded: false`,
`PaymentStatus: 2`. Auto-cancel must:

1. Re-check the session with `GetUserSessions` before cancelling.
2. Only cancel if `CanCancel` is true and now is before `RefundDeadline`.
3. Otherwise send a manual alert.
4. Afterwards, confirm the result from the response's `Refunded`, or by listing the sessions again.
