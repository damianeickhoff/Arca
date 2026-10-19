---
title: Questions and fixes
description: Answers to the questions people run into most.
---

Short answers to common questions. Didn't find yours? See [Get help](/Arca/help/get-help/).

## Amounts look wrong after an import

Usually the file was read with the wrong settings.

- **Amounts ten or a hundred times too big or small?** The decimal separator is wrong. Delete the import (Settings → Data health → Recent changes → **Undo**), then import again and choose the right **Decimal separator** in the column mapper: a comma for 1.234,56, a dot for 1,234.56.
- **Expenses showing as income?** Your bank puts "Debit" / "Credit" in a separate column. Pick it as the **Direction column** in the mapper.
- **A saved profile reads the file wrong?** Delete it in Settings → **Import profiles**, and map the file again.

See [CSV import](/Arca/transactions/csv-import/#map-columns-for-any-other-bank).

## I see duplicate transactions

Arca skips rows it already has, so importing overlapping files is safe. Duplicates can still slip in when the same payment comes in two different ways, for example from two different export formats of the same bank, or when you added it by hand as well.

- Select the extra ones in [Activity](/Arca/everyday/activity/#select-several-at-once) and choose **Delete**.
- If a whole import was doubled, undo it in Settings → Data health → **Recent changes**.

## My balance doesn't match my bank

Set a starting balance: open the account in Settings → **Accounts** and fill in the balance on a given date, or correct the **Current balance**. See [Accounts and assets](/Arca/settings/accounts/).

## The forecast shows a shortfall

The forecast warns when your balance is expected to drop below your safety line or below zero. Check:

1. **Is your balance right?** The forecast starts from your account balances. If they're off, so is the forecast.
2. **Are your bills and income right?** A recurring item with the wrong amount or date, or one that has ended, moves the whole line. Fix it in Settings → **Recurring**.
3. **Is it timing?** Often a few bills land just before payday. Look under **Coming up** for what lands just before the low point.
4. **Do you have an overdraft?** Set the **Overdraft limit** on the account, and choose whether it counts as spendable. See [Overdraft limits](/Arca/insights/forecast/#overdraft-limits).

## Safe to spend shows a dash

Safe to spend needs a budget. Set one in [Plan → Budget](/Arca/plan/budget/).

## A bill isn't ticked off as paid

The recurring item's **Match pattern** or **Match amount** doesn't match the payment. Open the item, check the chart of past charges it picks up, and adjust the pattern or allow an amount range. Or tick it off yourself in [Upcoming](/Arca/everyday/upcoming/#paid-or-not).

## Transactions keep landing in Needs a category

Teach Arca: pick the category and choose **Always**. Use **Worth teaching** to sort the busiest merchants first. See [Needs a category](/Arca/everyday/needs-a-category/).

## I forgot my app lock PIN

The lock screen has no reset option. Whoever runs your server can switch the app lock off with one command: see [Reset a forgotten app lock PIN](/Arca/getting-started/updating-and-backups/#reset-a-forgotten-app-lock-pin). Then set a new PIN in Settings → **App lock**.

## I lost my phone with the authenticator app

Sign in with one of your **backup codes** (choose **Use a backup code instead** when asked for the code). Then, in Settings → **Password & 2FA**, turn two-factor sign-in off and on again with your new phone, and make new backup codes.

## I forgot my password

There's no reset email yet. Ask for help on [GitHub](/Arca/help/get-help/).

## How do I back up?

Copy the `/data` folder. See [Updating and backups](/Arca/getting-started/updating-and-backups/#back-up-your-data).

## My bank connection stopped syncing

Your bank's permission lasts up to 180 days. When it ends, the bank shows **Consent expired**: choose **Reconnect**. See [Bank connection](/Arca/transactions/bank-connection/#reconnect-when-the-permission-runs-out).

## Signing in doesn't stick

If you open Arca over plain `http://`, make sure `COOKIE_SECURE` is `false` (the default). Set it to `true` only when Arca is behind a reverse proxy with HTTPS. See [Install](/Arca/getting-started/install/#opening-arca-from-outside-your-home).

## Can I use Arca offline?

Arca needs a connection to your server to load your data. Without one, you see a page saying you're offline.
