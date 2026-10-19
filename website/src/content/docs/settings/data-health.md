---
title: Data health and undo
description: Fix transactions that came in broken, and undo imports and bulk changes.
---

Settings → **Data health** is where you repair things: transactions that came in broken, and changes you'd like to take back.

## Broken transactions

Data health finds transactions with a date Arca can't read. That's usually the result of an import with the wrong date column or format. These transactions don't show up in Activity, so you wouldn't notice them otherwise.

For each one, choose **Fix** and enter the correct date, or delete it.

:::tip[Prevent it next time]
In the [column mapper](/Arca/transactions/csv-import/#map-columns-for-any-other-bank), check **How your dates will be read** before importing. If it says "not a date", change the date column or format.
:::

## Recent changes

**Recent changes** lists the big changes, newest first:

- CSV imports and bank syncs,
- rule runs and rules added or deleted,
- bulk category changes,
- deleted merchants and categories,
- recurring payments Arca found by itself.

The newest eight are shown; **Show all** opens the rest.

### Undo

Choose **Undo** on a change to put things back the way they were.

- Transactions you've edited since are left as they are.
- If a later change touched the same transactions, undo that one first; Arca tells you which.
- Deleting a single transaction by hand isn't listed, so it can't be undone here.
