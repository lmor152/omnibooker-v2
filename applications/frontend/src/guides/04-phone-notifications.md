# Phone Notifications

Bookie Monster can notify your phone when a booking is made, needs confirming, fails or is cancelled. Tap a notification to open that booking, then keep or cancel it.

## iPhone and iPad

Notifications need iOS 16.4 or later and only work in the app added to your Home Screen.

1. Open Bookie Monster in **Safari**.
2. Tap **Share**, then **Add to Home Screen**.
3. Open Bookie Monster from your Home Screen and log in.
4. Open the account menu → **Settings** and tap **Turn on notifications**, then **Allow**.
5. Tap **Send a test** to check it works.

## Android and computers

Open **Settings** in Bookie Monster and tap **Turn on notifications**. Do this on each device you want notified.

:::tip
Booking updates for each session can be switched off under **Notifications & confirmation** when editing the session. That setting applies to both phone and Discord notifications.
:::

## Setting up the server

Push notifications need a key pair (VAPID) on the server. Generate one once:

```
uv run --project applications/backend -- python -m omnibooker_backend.services.push generate-keys
```

Add the three printed values (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`) to `.env`, and restart the backend and worker. Keep the same keys afterwards: changing them stops every device's notifications until it's turned on again.

The app must be served over **HTTPS** for phones to subscribe (localhost is fine on a computer).
