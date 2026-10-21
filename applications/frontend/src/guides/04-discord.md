# Discord Notifications

Bookie Monster can post your bookings to a Discord channel and ask you to confirm them. Any booking you don't confirm by its deadline is cancelled while it can still be refunded.

## Add the bot to your server

1. Open the **Notifications** page in Bookie Monster and click **Generate link code**.
2. Click **Add Bookie Monster to a server**, pick your server and click **Authorize**. (You need to be an admin of the server; skip this if the bot is already there.)
3. In Discord, type `/bookie link` followed by the code from step 1, e.g. `/bookie link ABCD2345`.
4. Go to the channel where updates should go and run `/bookie channel`.
5. Back on the **Notifications** page, click **Refresh**. Your channel appears under **Channels**; click **Test** to check it works.

## Turn on confirmations

1. On the **Notifications** page, switch on **Ask me to confirm bookings**, or switch it on for a single session under **Notifications & confirmation** when editing it.
2. Pick the deadline. **Automatic** uses the provider's refund deadline minus a buffer, which is the safest choice.
3. When a booking is made, press **Keep it** in Discord (or react with ✅). Press **Cancel booking** if you don't need it.

## Commands

- `/bookie bookings`: list your upcoming bookings.
- `/bookie channel`: send updates to the current channel.
- `/bookie unlink`: disconnect your Discord account.

:::tip
Only you can keep or cancel your bookings, even in a shared channel. Different sessions can post to different channels.
:::
