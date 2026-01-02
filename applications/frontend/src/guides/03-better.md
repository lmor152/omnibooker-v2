# Better

Better is another popular booking platform for health and wellness, used by lots of gyms and activity centeres for managing bookings.

## Providers
Bookie Monster will replicate the entire flow for making a booking, since most users will only need one account and card, these are set at the provider level 
- **username** - the username or email for your Better account
- **password** - the password to your Better account
- **card cvc** - since Better allows you to save a card to your account, Bookie Monster only needs to know your cards CVC to make bookings on your behalf

:::tip
If you want to use multiple accounts or different cards for payments, you can create additional providers with Better
:::

## Booking Sessions

Better releases court bookings using a schedule - typically about a week ahead, but this is different for each facility.

These options are needed to automate bookings with Better
- **Venue and activity slugs** 
- **Use account credit**
- **Target times**
- **Target courts**

You can find the venue and activity slugs by looking at the URL when you're preparing to make a booking in your browser, e.g.:
- https://bookings.better.org.uk/location/hammersmith-fitness-squash-centre/squash-court-40min/
- https://bookings.better.org.uk/location/islington-tennis-centre/highbury-tennis/

Better typically refunds bookings as account credit, Bookie Monster allows you to make bookings using available credit if you toggle `use account credit` to on in the booking session.

Target times are prioritised over target courts, and both are listed in order of preference. 

:::caution
Different parks have different refund policies, check their site to be sure you can get your money back when cancelling a booking. If not, Bookie Monster might not make sense for you.
:::
