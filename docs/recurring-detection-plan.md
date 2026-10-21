# Smarter recurring detection: plan

Why: `src/lib/detect-recurring.ts` groups transactions by the first three words of the
description and calls anything seen in three different months a monthly bill, as long as
the amounts stay within 60% of each other. That is how grocery trips, Tikkies and shop
visits end up as "bills" with "No fixed date", and why the Budget bills card gets long.
Everything it finds is created as an active item straight away, on every import.

## What "recurring" should mean

A payment is recurring when the **same counterparty** is paid **once per period** at a
**steady rhythm** with a **steady amount**. Each of the four is a test; the current code
only tests the last one, loosely.

1. **Same counterparty.** Group by merchant id (the merchant table and its patterns now
   exist), not by a description slug. Within a merchant, split by direction and by amount
   band (amounts within ±8% of each other form one band), so "Tikkie to Sanne €12,50" and
   "Tikkie to Mark €240" never merge, and a shop that also bills a subscription keeps the
   two apart.
2. **Once per period.** Sort the band's dates and look at the gaps. Two payments inside
   the same period (two Albert Heijn visits in a month) disqualify the band as a bill; it
   may still be a *variable spend*, which is a budget matter, not a recurring item.
3. **Steady rhythm.** Classify the median gap: weekly 6–8 days, four-weekly 26–30, monthly
   28–33 (and the day of month within ±3 of a fixed day), quarterly 85–95, yearly
   355–375. Require at least three occurrences (yearly: two), gap spread (median absolute
   deviation / median) under 0.2, and at most one missing period in the run. The last
   occurrence must be recent: no older than 1.5 periods, or the item is "stopped".
4. **Steady amount.** Fixed when the spread is under 5%. Variable (energy, water) when
   the amounts sit within 60% of the median *and* at least 70% of them are within 25% of it.
   A price change counts as fixed when the last three agree. Otherwise reject.

Each band that passes gets a confidence score (how many periods, how tight the rhythm and
amount). The curated `RECURRING_MERCHANTS` list becomes a boost to that score and a source
for the name and type, not a bypass that creates an item from one transaction.

## Proposals, not items

- Detected bands are written as **suggestions** (`recurring_items` with
  `status = 'suggested'`, or a small `recurring_suggestions` table) with name, type
  (bill / subscription / income / plan), frequency, due day, amount or range, pattern
  and confidence. Nothing is active until the user says so.
- A strip on Upcoming and on Settings › Recurring: "Arca found 4 regular payments" with
  one row per suggestion (icon, name, "€34,99 every month around the 22nd, 6 times
  since April", confidence chip) and Accept / Edit / Not a bill. Accept activates it and
  links the matched transactions; Edit opens the recurring editor prefilled; Not a bill
  records the signature so it never comes back. A tip introduces the strip.
- High-confidence suggestions from the curated list (Netflix, Spotify, energy companies)
  may auto-accept, as today, because the false-positive rate there is near zero. Keep
  them in the change log so undo still works.

## Right frequency, right month

- Quarterly and yearly items get their real frequency and an anchor date, so
  `bill-status` lists them only in the month they are due. "No fixed date" disappears
  from the bills card; an item the detector cannot place in a month is not a bill.
- Weekly and four-weekly items (a cleaner, a weekly transfer) count the right number of
  times per month in the forecast and the budget.

## Migration for existing data

On the first start after the change, every `source = 'auto'` item is re-tested against
the new rules. Items that pass stay active. Items that fail become suggestions with a
"was active" note, listed once on Upcoming: "12 earlier auto-detected bills look like
ordinary spending. Keep them or let them go?" with Keep all / Review / Remove all.
Nothing is deleted silently; the change log records the pass.

## When it runs

After each CSV import and each bank sync, only for the merchants that import touched
(incremental), plus a full pass from Settings › Data health ("Look for regular
payments"). Never on every page view.

## Tests (`tests/lib/detect-recurring.test.ts`, with fixtures)

- Groceries: 14 visits in 3 months → rejected (twice per period).
- Salary: 6 monthly incomes, same amount, day 25 ±1 → monthly income, due day 25.
- Energy: monthly, amounts €92–€138 → monthly variable bill with a range.
- Water: 4 payments 90 days apart → quarterly, anchored to the first date.
- Car insurance: 2 payments a year apart → yearly.
- Tikkie: 9 payments, amounts all over the place → rejected.
- Subscription with a price rise (€9,99 ×4 then €10,99 ×3) → monthly fixed at €10,99.
- Stopped gym: monthly until five months ago → not suggested (stopped).
- A merchant with both a subscription and shop purchases → one suggestion, the purchases
  left alone.

## Order of work

1. Pure detector (`lib/recurring-detect/`: grouping, rhythm, amount, scoring) with tests.
2. Suggestions storage and the review strip (Upcoming, Settings › Recurring), tip, en + nl.
3. Frequency-aware `bill-status` and the bills card.
4. Migration pass for existing auto items.
5. Incremental trigger from import and bank sync; Data health action.

AI item 5 in `ai-roadmap.md` ("Find recurring bills and payment plans") stays: it covers
the leftovers this deterministic pass cannot place (changing names, payment plans), and
it proposes into the same suggestions list.
