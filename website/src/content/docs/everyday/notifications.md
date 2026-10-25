---
title: Notifications
description: What Arca lets you know about, how to get it on your phone, and how to switch things off.
---

Arca keeps an eye on your money between visits and collects what it notices on the **Notifications** page. On a computer it sits in the sidebar under Home, with the number of unread notices beside it. On a phone, tap the bell at the top of Home; a dot on it means something is unread.

## What you get notified about

| Notice | When |
| --- | --- |
| Bill due soon | Three days before a bill or subscription is due, while it is unpaid |
| Bill overdue | The day after a bill's date, when Arca knows it has not been paid yet (for up to a week) |
| Forecast runs low | When the [forecast](/Arca/insights/forecast/) drops under your warning line. Once a month, unless it recovers and drops again |
| Payday check-in | The day your main income comes in, with what is safe to spend this month (needs a [budget](/Arca/plan/budget/)) |
| Bank consent ending | A week before a [bank connection](/Arca/transactions/bank-connection/) has to be renewed |
| Bank sync failed | When a bank sync fails, at most once a day per bank |
| New transactions | After a bank sync or CSV import: how many came in and how many wait for a category. One notice per day that grows with every import |
| New version | When the [update check](/Arca/settings/about/#updates) is on and finds a newer Arca |

Arca checks once an hour, and right after every import or sync. The same thing is never announced twice. Each notice is written in your language when you read it.

Tap a notice to open the page it is about; that also marks it read. **Mark all as read** marks the lot read, **Clear all** empties the list (after asking; Arca doesn't send the cleared ones again, only new ones), and **Older** loads earlier notices.

## Push to your phone or computer

Notices can also arrive as a push notification, even when Arca is closed. Push is off until you turn it on, separately for each device:

1. Open Settings → **Notifications** on the device.
2. Tap **Turn on push for this device** and allow notifications when your browser asks.
3. Tap **Send a test** to check it arrives.

The list of devices under it shows every phone and computer that gets your pushes. **Remove** stops them for that device.

On **iPhone and iPad**, add Arca to your home screen first (Share → **Add to Home Screen**, iOS 16.4 or later), open it from the home screen and turn push on there. Safari in a normal tab cannot receive pushes.

Push needs Arca on https (or on `localhost`). A push goes through your browser's push service (Apple, Google or Mozilla), encrypted with keys only your device has, so the service cannot read it. Nothing else is sent. Settings → [About](/Arca/settings/about/) shows push as on once one of your devices gets them.

## Switching kinds off

Every kind has its own switch in Settings → **Notifications**, and all are on to begin with. The switches are yours alone: someone else on the same Arca chooses their own. A kind you switch off neither shows on the Notifications page nor arrives as a push.
