---
title: Accounts
description: All your accounts in one list, and what money to and from each one means.
---

Settings → **Accounts** holds every account you have: the ones Arca imports, the ones you keep up to date yourself, and the things you own. Their balances feed your [net worth](/Arca/insights/net-worth/), the [forecast](/Arca/insights/forecast/) and [Safe to spend](/Arca/everyday/home/#safe-to-spend). Arca also recognises each account in your transactions, so money moving between your own accounts is never counted as income or spending.

## One list

Accounts are grouped by type: **Checking**, **Savings**, **Investments**, **Joint accounts**, **Credit cards**, **Cash** and **Possessions**. Each row says where its balance comes from:

- **From your bank**: an imported account; the balance follows its transactions.
- **Updated 12 Oct**: an account you keep by hand, with the value you last entered.
- **No balance yet**: an account you keep by hand without a value. It still does its work in your transactions; add a value whenever you like.

**Add account** asks which kind you're adding.

## Imported from your bank

These are usually created for you when you [import](/Arca/transactions/csv-import/) or [connect your bank](/Arca/transactions/bank-connection/).

- **Type**: checking, savings, credit card or cash.
- **IBAN**: used to match imported rows to this account. Once set, it can't be changed.
- **Starting balance** and **Balance as of**: what was in the account on that date. Arca adds up your transactions from there, so the balance matches your bank.
- **Other names in transactions**: names this account goes by in your other accounts' transactions, like `Revolut**4527` for the card payment that tops it up.
- **Overdraft limit**: how far below zero your bank lets this account go. Leave it empty if it can't. See [Overdraft limits](/Arca/insights/forecast/#overdraft-limits).

:::tip[Balance doesn't match your bank?]
Open the account and correct the **Current balance**. Arca asks you to confirm, because it shifts every balance shown for that account.
:::

## Kept by hand

For accounts Arca doesn't import, and for things you own: a savings or investment account at another bank, a joint account, a car or a house. Pick the kind, give it a name and, if you know it, its current value. Switch off **Include in net worth** for anything you'd rather leave out of the total.

Accounts (not possessions) have **Recognise it in your transactions**:

- **Account number**: the IBAN, or the number your bank shows in descriptions, like `M58896551` for an ING savings account.
- **Other names in transactions**: other text it shows up under, like `Beleggingsrek.`. Use at least 4 characters.

If you later import the account itself (same number), Arca turns it into that imported account instead of keeping two.

## What money to and from an account means

| The other side is | Money to it | Money from it |
| --- | --- | --- |
| A **savings** or **investments** account | Saved | Taken from savings |
| A **checking** account, credit card or cash | A transfer | A transfer |
| A **joint account** kept by hand | Spending | Paid back to you |
| A **joint account** that is imported | A transfer | A transfer |

- **Saved** is net on Home and in [Trends](/Arca/insights/trends/): what you put into savings minus what you took back out. A month where you took more out than you put in shows a negative figure.
- A **transfer** is left out of income, spending, budgets and Insights. See [Transfers between your own accounts](/Arca/everyday/activity/#transfers-between-your-own-accounts).
- A **joint account** is where the household's money goes. While Arca doesn't import it, what you put in is your share of the household costs, so it counts as spending: file it under a household category. Money it pays back to you isn't income. Once you import the joint account, its own transactions show the real spending, and money between it and your account becomes a transfer.

Two of your imported accounts don't need anything extra: when the same amount leaves one and arrives in the other within two days, Arca pairs the two. That covers a card payment from your checking account and the Revolut top-up it paid for, or a move between two Revolut accounts.

## Found in your transactions

Arca looks through your transactions for accounts that money keeps going to or coming from, and lists them with how many payments and how much money each one covers: a savings or investment account, a joint account, or the card that tops up an account you already have. **Add** opens a new account kept by hand, filled in and with its type chosen, so you can check it before saving. A card top-up is added to the right account as another name straight away. **✕** hides a suggestion that isn't yours.

## Count overdraft as spendable

Once an account has an overdraft limit, this switch appears. **Off**: your overdraft is a safety net, and the forecast warns as soon as you go below zero. **On**: it counts as money you can use, and the forecast only warns near the limit.
