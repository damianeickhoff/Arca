---
title: Rules and merchants
description: How Arca files transactions by itself, and how to teach it.
---

Arca files most transactions by itself, with two tools: **merchants** (the places you pay) and **rules** (if the description looks like this, use that category). You teach both as you go.

## Merchants

Every shop, company or person you pay becomes a **merchant**. Arca creates them from your bank's descriptions when you import, so "ALBERT HEIJN 1234 AMSTERDAM" and "AH to go 5678" can both be **Albert Heijn**.

Open a merchant (tap its name on a transaction, or Settings → **Merchants**) to change:

- **Name**: the friendly name you see everywhere. Renaming updates every transaction linked to it.
- **Icon**: a brand logo, an icon, or your own uploaded image. Many well-known brands get their logo automatically.
- **Recognised by**: the bits of bank text that belong to this merchant (see below).
- **Category**: where this merchant's transactions go when no rule says otherwise.

The merchant's **profile** shows what you spend there: total spent, number of visits, the average, your largest purchase, first and last visit, and a bar per month or year.

:::tip[Find merchants without a logo]
In Settings → Merchants, switch to **Without icon** to see only the merchants that still need one.
:::

### Recognised by

Banks write the same shop in different ways. Add each way under **Recognised by** and Arca links all of them to the one merchant, with its name, logo and category. Each pattern can match as:

- **Contains**: the text appears anywhere in the description.
- **Whole word**: the text stands on its own, so "AH" doesn't match "MAHLER".
- **Exact**: the description is exactly this text.

## Rules

A rule says: *transactions that look like this go to that category*. Rules live with their category in Settings → **Categories**; open a category to see, add or change its rules.

A rule can look at:

- the **description**: contains, whole word or exact (capitals don't matter),
- the **amount**: exactly an amount, or between two amounts,
- the **direction**: money in only or money out only,
- the **account**: one account only.

Every part is optional, so "everything from my savings account" or "exactly €12.99" are rules too.

### Which rule wins

- The first rule that matches decides. When two rules catch the same recent transactions, the category shows which one comes first.
- A [recurring item](/Arca/plan/recurring/) that matches always decides the category, before any rule.
- Rules never overwrite a category you picked by hand, and never clear a category.

## Teach it once

Whenever you pick a category for a transaction, Arca asks **Always file … as …?**

- **Always**: from now on, every transaction from this merchant is filed this way, on every import. Earlier ones move too.
- **Just this one**: only this transaction.
- **Edit match**: change what Arca looks for before saving.

This is the easiest way to build up your rules: just sort your transactions, and say **Always** for the ones that are always the same.

## Check a rule before you save

While you edit a rule, Arca shows which earlier transactions it picks up. **Test on the last 90 days** goes further: it lists every transaction that would change ("… becomes …"). Saving the rule applies those changes.

When you delete a rule, Arca asks what to do with the transactions it filed: **Keep them as they are**, or send them back to Needs a category. Transactions you categorised by hand always stay as they are.

:::note[Undo]
Every rule run and every bulk change is listed in Settings → Data health → **Recent changes**, with an **Undo** button. See [Data health and undo](/Arca/settings/data-health/).
:::
