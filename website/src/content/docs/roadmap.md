---
title: Roadmap
description: Where Arca is heading. A direction, not a promise.
---

What we're working on and what we'd like to build next.

:::note[A direction, not a promise]
This page shows where Arca is heading. Plans change: items can move between groups, change shape, or be dropped. Have an idea or a favourite? Say so on [GitHub](https://github.com/damianeickhoff/Arca/issues).
:::

## Ground rules for AI

Every AI feature in Arca follows the same rules:

- **AI explains, the app computes.** Every number on screen comes from Arca itself: the forecast, budgets and totals. The AI writes sentences and picks from your own lists. It never makes up an amount or a date.
- **Opt-in, per feature.** AI is off until you add your own key and switch it on, and each AI feature will get its own switch, so you can keep one and refuse another.
- **The minimum leaves your server.** Only what a feature needs (cleaned-up descriptions, amounts, dates, category names), never account numbers and never your whole history when a total will do.
- **You confirm.** Nothing is saved without a tap.
- **Everything keeps working without it.**

## <span class="status-chip status-chip--progress">In progress</span> Now

- **Documentation.** This guide, with every page explained step by step.

## <span class="status-chip status-chip--planned">Planned</span> Next

- **AI picks become rules.** When you file a merchant with the AI's suggestion, Arca offers to make it a rule straight away, so next month it's sorted without asking the AI again.
- **Ask AI during import.** Get category suggestions for new merchants while you check an import, before anything lands in Needs a category.
- **Merchant cleanup.** For cryptic bank descriptions, the AI suggests a readable name, the patterns to recognise it, a likely category and a fitting logo. You review the suggestions; nothing changes by itself.
- **Rules from examples.** Select a few transactions ("these are all groceries") and Arca suggests the simplest rule that catches them all. Without AI, it suggests the shared name, as today.
- **Find recurring bills and payment plans.** Spot regular payments the current detection misses, like bills whose amount or name changes. Each one becomes a suggestion you can accept.
- **Explain an odd month.** "Why is this month different?" The two or three categories that moved most, with the real numbers, and a short reason for each.
- **The forecast in words.** Two plain sentences about what's coming, like "You dip below zero on the 27th because the insurance and the gym land before payday." The forecast and its warnings themselves stay calculated by Arca.
- **Missing bill check.** Arca asks the AI which regular payments seem to be missing from your forecast, like a yearly premium or a quarterly water bill, and offers to add them.
- **Receipt line items.** Read a receipt photo into separate lines, so a supermarket receipt becomes a split with groceries and household items, ready for you to check.
- **Payday check-in.** When your salary lands, a short note about the month ahead: bills still to come, the forecast's low point and what's left in your budget, with one suggestion.
- **Import column mapping.** For a bank Arca doesn't know, the AI suggests which column is the date, the amount and the description, and you confirm.
- **Ask Arca.** Ask a question like "How much did I spend on takeaway since summer?" The AI only turns your question into a search; Arca does the counting itself and shows the transactions behind the answer. The AI never sees your transactions.
- **Notifications.** A heads-up for upcoming bills, a shortfall in the forecast, and the payday check-in, by push notification or email.
- **More banks in the bank connection.** More banks, and more countries than the Netherlands.
- **Dutch documentation.** This guide in Dutch too.

## <span class="status-chip status-chip--idea">Ideas we like</span> Later

- **Automatic backups** from Settings, on a schedule, to a folder of your choice.
- **Exports and printable reports**: a year overview or a month on paper, or your transactions as a file.
- **Widgets and home-screen shortcuts** for Safe to spend and quick add on your phone.
- **Household views per person**: who spent what, and personal budgets next to the shared ones.
- **Multi-currency**: accounts in different currencies, converted for your totals.
- **Investments in net worth**: follow the value of your investments over time.
- **Password reset** for the person who runs the server.

## <span class="status-chip status-chip--no">Not planned</span> Deliberately not

- **A free-form AI chat with access to all your transactions.** Too much data leaving your server, and too much for a free key.
- **AI-made budgets or investment advice.** Wrong answers here cost real money.
- **AI-calculated forecasts, balances or totals.** These stay calculated by Arca, so they're exact, work offline and cost nothing.
- **AI deciding your rules.** Rules stay predictable, so they run on every import, offline and for free.
