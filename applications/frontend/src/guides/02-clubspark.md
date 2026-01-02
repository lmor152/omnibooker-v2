# Clubspark

Clubspark is used by most Hackney tennis courts in London but is popular in some other areas too. The Clubspark provider has been set up with tennis in mind, but if it's used for other things it should be fairly easy to extend it.

## Providers
Bookie Monster will replicate the entire flow for making a booking, since most users will only need one account and card, these are set at the provider level 
- **username** - the username or email for your Clubspark account
- **password** - the password to your Clubspark account
- **card details** - since Clubspark doesn't let you save card details to your account, Bookie Monster has to enter these on your behalf when making bookings

:::tip
If you want to use multiple accounts or multiple cards for payments, you can create additional providers with Clubspark
:::

:::warning
It's a good idea to use a card with limited spend on it for this. If you can, set up a virtual card or pot to limit the spending in case anything goes wrong.
:::

## Booking Sessions

Clubspark releases court bookings using a schedule - typically about a week ahead, but this is different for each park.

These options are needed to automate bookings with Clubspark
- **Park/court slug** - e.g. finsburypark
- **Double session**
- **Target times**
- **Target courts**

You can find the court/park slug by looking at the URL when you're preparing to make a booking in your browser, e.g.:
- https://clubspark.lta.org.uk/FinsburyPark/Booking/BookByDate#
- https://clubspark.lta.org.uk/clissoldparkhackney/Booking/BookByDate#

Clubspark allows you to book a one hour session or a two hour session. Use the `double session` toggle to tell Bookie Monster to book two hour slots.

Target times are prioritised over target courts, and both are listed in order of preference. 

:::important
Different parks release their court bookings at different times, you have to tune the release schedule for the park you want to book to ensure your booking is made as soon as courts become available.
:::

**Some known release times:**
- Finsbury Park: **7d before at 00\:00**
- Clissold Park: **7d before at 22\:00**

:::caution
Different parks have different refund policies, check their site to be sure you can get your money back when cancelling a booking. If not, Bookie Monster might not make sense for you.
:::
