---
title: CSV import
description: Bring in transactions from your bank's export file, from any bank.
---

Every bank lets you download your transactions as a CSV file. Drop that file into Arca, check what's new, and import.

## Banks Arca recognises

These exports are recognised automatically; you don't have to set anything up:

- **ING**
- **Rabobank**
- **ABN AMRO**
- **bunq**
- **Knab**
- **Revolut**

Any other bank works too: you point out the columns once, and Arca remembers them. See [Map columns](#map-columns-for-any-other-bank).

:::tip[Getting the file]
In your bank's website or app, look for "Download transactions", "Export" or "Af- en bijschrijvingen downloaden", and choose **CSV**. Pick a period that overlaps a little with what you imported last time: duplicates are skipped.
:::

## Import a file

1. Open Settings → **Import**. The **Import** item in the sidebar and **Import CSV** in search take you there too. The **CSV file** tab is open.
2. **Upload**: drop the file on the card or choose **Choose file**. Nothing is imported yet.
3. **Check**: see what Arca found before anything changes (below).
4. Choose **Import**. The **Done** step shows how many were imported, how many were categorised, and how many duplicates were skipped.

From there, **Categorise** takes you straight to [Needs a category](/Arca/everyday/needs-a-category/) for whatever is left.

## The Check step

**Check your import** shows:

- which bank (or which of your saved profiles) the file was recognised as,
- the date range and the accounts in the file,
- a preview of the first rows, each marked **New**, **Duplicate · skipped** or **Unreadable date · skipped**,
- how many rows are new and how many duplicates will be skipped.

Choose **Import** to bring in the new ones, or **Cancel** to stop.

## Duplicates

You can import overlapping files safely. Arca recognises a row it already has (by its date, amount and description) and skips it, also when the same row appears twice in one file. Rows that came in through the [bank connection](/Arca/transactions/bank-connection/) are recognised too.

## Accounts

Each row lands on the account with the same account number (IBAN). If the file has an account Arca doesn't know yet, it's added for you and Arca asks for a name and a **starting balance**, so your balance matches your bank. You can do this **Later** in [Accounts](/Arca/settings/accounts/).

If your file has a balance column, Arca keeps your bank's own balance next to each row.

## Map columns (for any other bank)

When Arca doesn't recognise a file, it asks you to **Map columns**: tell it which column is which.

- **Column names are in**: the row with the column names. Some banks (DKB, for example) start the file with a few lines about the account; Arca finds the real column names by itself and skips those lines. If it picks the wrong row, choose another one here.
- **Bank name**: so you recognise the profile later (optional).
- **Date column** and its **Date format**, for example DD-MM-YYYY.
- **Description column**.
- **Amount column** and the **Decimal separator**: a comma (1.234,56) or a dot (1,234.56).
- **Direction column**, if your bank puts "Debit" / "Credit" in its own column. Otherwise Arca uses the sign of the amount.
- Optional: **Account column**, **Counter-account** and **Resulting balance**.

While you choose, Arca shows **how your dates will be read** and **how your amounts will be read**, so you can see straight away if something is off.

When you choose **Import** in the mapper, the file is imported right away and the mapping is saved as an **import profile**. Next time, a file with the same columns is recognised by itself. Your saved profiles are in Settings → **Import profiles**; delete one to map that file again.

:::caution[Dates matter]
If a date says "not a date", you've picked the wrong column or format. Fix it before importing: Arca won't import a file with unreadable dates.
:::

## What happens to new transactions

Each new transaction, in this order:

1. is matched to a [recurring item](/Arca/plan/recurring/) (and gets its category),
2. otherwise gets a category from your [rules](/Arca/transactions/rules-and-merchants/), or from how you filed the same description before,
3. is linked to a merchant, with its logo,
4. is recognised as a transfer between your own accounts, or a Tikkie paying you back, where it applies.

What's still without a category goes to [Needs a category](/Arca/everyday/needs-a-category/).

## Undo an import

Imported the wrong file? Settings → **Data health** → **Recent changes** lists every import. **Undo** removes it again. Transactions you've edited since are kept. See [Data health and undo](/Arca/settings/data-health/).
