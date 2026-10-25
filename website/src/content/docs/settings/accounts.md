---
title: Accounts and assets
description: Your bank accounts, savings, investments and the things you own.
---

Settings → **Accounts** holds your bank accounts and assets. Their balances feed your [net worth](/Arca/insights/net-worth/), the [forecast](/Arca/insights/forecast/) and [Safe to spend](/Arca/everyday/home/#safe-to-spend).

## Bank accounts

Accounts are usually created for you when you [import](/Arca/transactions/csv-import/) or [connect your bank](/Arca/transactions/bank-connection/). You can also add one yourself with **Add bank account**.

- **Type**: checking, savings, credit card or cash.
- **IBAN**: used to match imported rows to this account. Once set, it can't be changed.
- **Starting balance** and **Balance as of**: what was in the account on that date. Arca adds up your transactions from there, so the balance matches your bank.
- **Overdraft limit**: how far below zero your bank lets this account go. Leave it empty if it can't. See [Overdraft limits](/Arca/insights/forecast/#overdraft-limits).

:::tip[Balance doesn't match your bank?]
Open the account and correct the **Current balance**. Arca asks you to confirm, because it shifts every balance shown for that account.
:::

## Assets

Use **Add asset** for things that count towards your net worth but don't come from your bank: a savings account elsewhere, investments, or a possession such as a car. Switch off **Include in net worth** for anything you'd rather leave out of the total.

## Own accounts

Some of your accounts never come into Arca: an ING savings account, an investment account, a joint account you share, the card you top up Revolut with. Money to and from them is yours moving about, not income or spending. Add them under **Own accounts** and Arca treats every transaction to or from them as an [internal transfer](/Arca/everyday/activity/#transfers-between-your-own-accounts), on every screen.

- **Name**: what you call it.
- **Kind**: **Savings**, **Investments**, **Joint** or **Other**. Money going to a savings or investment account still counts as **Saved** on Home and in [Trends](/Arca/insights/trends/).
- **Account number**: the IBAN, or the number your bank shows in the description (like `M58896551` for an ING savings account).
- **Or match the description**: text that is in every transfer to it, like `Revolut**4527` for a card top-up. Use at least 4 characters.

Arca looks through your transactions for accounts like these and lists them under **Found in your transactions**, with how many payments and how much money each one covers. **Add** opens it filled in, so you can check the kind first; **✕** hides a suggestion that isn't yours.

:::note[Two accounts that are both in Arca]
You don't need to add those here. When the same amount leaves one of your accounts and arrives in another within two days, Arca pairs the two, such as a card payment from your checking account and the Revolut top-up it paid for, or a move between two Revolut accounts.
:::

## Count overdraft as spendable

Once an account has an overdraft limit, this switch appears. **Off**: your overdraft is a safety net, and the forecast warns as soon as you go below zero. **On**: it counts as money you can use, and the forecast only warns near the limit.
