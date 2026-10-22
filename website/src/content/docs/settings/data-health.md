---
title: Data health, backups and undo
description: Fix transactions that came in broken, keep backups of your database, and undo imports and bulk changes.
---

Settings → **Data health** is where you repair things: transactions that came in broken, backups of your database, and changes you'd like to take back.

## Broken transactions

Data health finds transactions with a date Arca can't read. That's usually the result of an import with the wrong date column or format. These transactions don't show up in Activity, so you wouldn't notice them otherwise.

For each one, choose **Fix** and enter the correct date, or delete it.

:::tip[Prevent it next time]
In the [column mapper](/Arca/transactions/csv-import/#map-columns-for-any-other-bank), check **How your dates will be read** before importing. If it says "not a date", change the date column or format.
:::

## Backups

Arca copies its database before the first start on a new version, so an update can always be undone. The copies live in `backups/` inside your data folder, and the newest five are kept.

**Back up now** makes a copy on the spot. Those stay until you delete them. Each backup in the list shows when it was made, which version made it and how big it is, with a **Download** button to keep a copy somewhere else and a **Delete** button.

Only an admin can make, download or delete backups: a backup holds every user's data.

A backup is the database only. Uploaded logos, profile photos and receipts live next to it in the data folder; a copy of the whole folder covers those too. See [Updating and backups](/Arca/getting-started/updating-and-backups/#restore-a-backup) for how to put a backup back.

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
