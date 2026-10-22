# Changelog

Every release of Arca, newest first. The same notes are on the GitHub releases page
and in the app under Settings › About. Format: `## version — date`, one line with the
release title, an intro paragraph, then `###` sections with bullets.

## 1.6.0 — 2026-10-22
Net worth on Home, and free software under the AGPL

Arca 1.6.0 puts your net worth on Home and makes Arca free software under the AGPL.

### 🏠 Home
- A **Net worth** card takes the place of the Budget card: what you own minus what you owe today, how much it moved since the budget month started, a bar of own against owe, the last six months as a line, and the **Accounts**, **Savings goals** and **Debts** sums behind the number, each opening its own page. It uses the same figures as Insights › Net worth.
- The Budget card is gone: **Safe to spend** already shows the budget, spent, reserved and pace. Tap the budget figure on the black card to open the Budget page.
- Money flow is one column narrower to make room. Two tips point out the new card and the moved link; the Home guide page follows.

### 📄 Licence
- Arca is now licensed under the **GNU Affero General Public License v3.0**. You may run it, study it, change it and share it. Running it at home carries no obligation; whoever distributes a changed version, or runs one as a service for others, must share their changes under the same licence.

### 📖 Guide
- The roadmap's **Just shipped** block is current again, and the recurring detection tile left the board now that it has shipped.

### 🐳 Installing and updating
Image: `damianeickhoff/arca:latest` (also `1.6.0`) on Docker Hub, mirrored to `ghcr.io/damianeickhoff/arca`. On Unraid, **Check for updates** in the Docker tab. No new tables or columns in this release.

As always: **back up `/data` before updating.**

## 1.5.1 — 2026-10-22
CSV files with an account summary on top

Arca 1.5.1 fixes importing CSV files from banks that put a few lines about the account above the column names.

### 📥 CSV import
- Some banks (DKB, for example) start their export with lines like "Girokonto", "Zeitraum:" and "Kontostand vom …" before the real column names. Those files could not be mapped: Arca always took the first line as the header. Arca now finds the row with the column names by itself and skips everything above it. (#23)
- **Map columns** has a new **Column names are in** picker, for when the guess is wrong. It shows each row's contents and how many lines above it are skipped.
- A saved import profile is now recognised even when the summary lines change with every export (a new date range or balance).

Thanks to @moarsmokes for reporting this.

## 1.5.0 — 2026-10-21
Smarter recurring bills, new Plan and Insights, invites

Arca 1.5.0 redesigns the planning and insights screens, finds your regular bills by their rhythm instead of their name, and closes the sign-up page.

### 🔁 Smarter recurring detection
- Bills are found by **rhythm**: the same counterparty, once per period, at a steady interval (weekly, four-weekly, monthly, quarterly, yearly) and a steady amount. Grocery trips and Tikkies no longer turn into "bills".
- Arca **suggests** instead of deciding: Upcoming and Settings › Recurring show "found regular payments" with Accept, Edit or Not a bill. Only well-known subscriptions are accepted on their own, and those go in the change log so you can undo them.
- Quarterly and yearly bills appear in the month they are due. "No fixed date" rows are gone.
- On the first start after updating, the earlier auto-detected items are re-tested once; the ones that look like ordinary spending are listed for you to keep or remove. Nothing is deleted silently.
- Detection runs after each import and bank sync; Settings › Data health has "Look for regular payments" for a full pass.

### 🧾 Plan › Budget and Upcoming
- **Budget bills card**: overdue first, then coming up, then everything paid folded into one row. Per bill either an "auto" chip (Arca ticks it off), a black **Paid** button, or **Paid?** for a bill Arca cannot recognise, with "Teach Arca the pattern". A small Needs a category card sits under it.
- **Upcoming** opens with what still has to leave the account before payday, a running balance through the month with its lowest point, one bills list grouped Overdue / This week / Later this month with income on its day, payment-plan parts ("part 8 of 10"), **Skip this month** for savings transfers, a compact month grid, and a preview of next month.
- "Overdue" now means the due date has passed; a bill due today is just due.

### 💳 Plan › Debts
- A full-width **What if I pay extra** simulator with a three-way order: **Quickest win first**, **Highest interest first** or **Spread over all debts**. Whatever a debt cannot absorb in a month flows to the next debt in that same month.
- **Where the extra goes**: a plan table per debt (minimum, extra now, what you pay, until when, and what rolls on next).
- **This month's payments** per debt, **Log a payment** for an extra or lump sum, interest still to come in the summary, and a payoff timeline with every debt as its own area and a Balance · Interest paid switch.

### 📊 Insights
- **Overview**: a black "so far this month" card with the running total against last month, a **This month against last** chart with the budget line, Where it went as a block map, Top merchants with the by-account split, Week by week and Calendar side by side.
- **Trends**: key figures over finished months, one spending chart with group chips, **Biggest movers**, a category table that scrolls inside its card, and a 3 · 6 · 12 months · Custom control.
- **Net worth**: today's figure with the change over the range, assets above and debts below the line, every account with a sparkline, **What changed this month**, and **Update balances** for values you keep by hand (they now keep a history).

### ✨ Activity and the guide
- **Select mode** instead of checkboxes: tap Select, hold a row, or Shift-click. The bulk bar gains Merchant and Select all.
- The guide at https://damianeickhoff.github.io/Arca/ has a wider reading column and a four-column **Roadmap**.

### 🔒 Security and data
- **Sign-up is closed** after the first user. Admins create single-use invite links in Settings › Users (seven days). `ALLOW_OPEN_SIGNUP=true` reopens it if you ever lock yourself out.
- **Receipt photos** now live in `/data` with everything else and survive updates; existing ones are moved on first start.
- The settings API no longer returns secrets, transaction updates accept only known fields, and merchant statistics require a sign-in.

### 🐳 Installing and updating
Image: `damianeickhoff/arca:latest` (also `1.5.0`) on Docker Hub, mirrored to `ghcr.io/damianeickhoff/arca`. On Unraid, **Check for updates** in the Docker tab. New tables (recurring suggestions, bill skips, debt payments, manual balance history) are created automatically on start.

As always: **back up `/data` before updating.**

## 1.4.0 — 2026-10-19
Bank connection and the Arca guide

Arca 1.4.0 connects to your bank. Transactions now arrive on their own, every day, without a CSV in between. It also comes with the first version of the Arca guide.

### 🏦 Bank connection
- **Connect your bank** through Enable Banking and Arca pulls your transactions daily. Supported: ING, ABN AMRO, Rabobank, ASN, RegioBank, SNS, Triodos and Van Lanschot. For your own accounts the Enable Banking account is free.
- **Import starts with your bank.** The Import page (the sidebar item is now "Import") opens with the Bank connection card; the CSV import sits under it for banks that are not covered yet. The sidebar shows when the last sync ran, and warns in orange when a consent has run out so you can reconnect in one tap.
- **Link accounts the way you want.** Each bank account goes to an existing Arca account, a new one, or is skipped. Reconnecting keeps your links and sync history.
- **No duplicates.** Rows you already imported from a CSV are recognised and skipped; transfers between your own accounts are detected for bank rows too.
- Sync runs once a day by itself. Sync now and Sync all are in Settings › Import, and an external scheduler can trigger it with `BANK_SYNC_TOKEN` if you prefer.
- Set-up walkthrough: [Bank connection](https://damianeickhoff.github.io/Arca/transactions/bank-connection/) in the guide.

### 📖 The Arca guide
- Documentation for everything in the app, in plain language, at **https://damianeickhoff.github.io/Arca/**: installing, importing, planning, insights, settings, an FAQ and the roadmap.
- Settings › Help now opens the guide and the place to report a problem or idea.

### ✨ New
- **Add anything from anywhere.** A round black "+" beside the search field (desktop) and the orange button on the phone tab bar open one menu: Transaction, Recurring bill, Debt, Goal or Category. Ctrl/Cmd+N opens it too.
- **Recent changes with undo** in Settings › Data health: every import, rule pass, bulk move, deleted rule, merchant or category, and auto-detected recurring item is listed, and most can be undone with one tap as long as nothing touched the same rows since.
- **Rules where you need them.** The Automations panel is gone. Needs a category shows a "Worth teaching" strip for merchants that keep coming back; the category editor shows how many transactions each rule files and warns when another rule fires first; the rule dialog can test a rule on the last 90 days before you save it.
- **Teach moment.** After you pick a category in Needs a category or the Activity detail panel, Arca asks "Always file {merchant} as {category}?" and shows exactly what would move.
- **Merchants with their own category and patterns.** A merchant card now lists the patterns it is recognised by and the category it files to. Brand icon rules merged into merchants.
- **One icon picker** for categories, merchants, goals, debts and accounts: search across icons, brands and your own uploads, a live preview on a real transaction, colours and a size stepper for logos.
- **Debts show when they are paid off.** Each debt card says "Free in Mar 2028", updates live as you move the extra-payment slider and tells you how many months sooner that is.
- **Insights overview rebuilt.** A structured summary (headline, three facts and a tip) with or without AI, spending by group as bars instead of the donut, week-by-week with bills still due hatched on top, and a nudge when "Other" grows past 30%.

### 🛠 Fixes and polish
- Rules: saving a rule that already files under another category asks first; deleting a rule lets you keep its transactions or send them back to Needs a category.
- Categories: a name that already exists is flagged while you type instead of a generic save error.
- Default categories are seeded on the first run only (and on reset), not on every start.
- A brand-new installation now gets its category groups (Housing, Transport, …) from the start. Before, a first run without a prepared database ended up with every default category flat under "Other categories".
- Dialogs: a calm fade-and-settle on desktop instead of the slide from the bottom, sticky header and footer with a hairline, and headers that stay put when a dialog opens from a scrolled page.
- Settings sub-panels crossfade on desktop.

### 🐳 Installing and updating
Image: `damianeickhoff/arca:latest` (also `1.4.0`) on Docker Hub, mirrored to `ghcr.io/damianeickhoff/arca`. On Unraid, **Check for updates** in the Docker tab. New database tables for the bank connection and the change log are created automatically on start.

As always: **back up `/data` before updating.**

## 1.3.2 — 2026-10-19
Releases on Docker Hub

Same app as [1.3.1](https://github.com/damianeickhoff/Arca/releases/tag/v1.3.1), now published to Docker Hub automatically.

### 🐳 Releases
- Every release is built by GitHub Actions and pushed to Docker Hub as `damianeickhoff/arca:latest` and `damianeickhoff/arca:<version>` (this one: `1.3.2`), and mirrored to `ghcr.io/damianeickhoff/arca`.
- On Unraid nothing changes: Docker tab → **Check for updates** → apply.

### 📄 README
- The logo shows again, with screenshots of Home, Activity, Plan, Insights, Forecast and the phone in light and dark.

As always: **back up `/data` before updating.**

## 1.3.1 — 2026-10-16
Smoother onboarding

A small follow-up to [1.3.0](https://github.com/damianeickhoff/Arca/releases/tag/v1.3.0).

### ✨ Onboarding
- The step buttons stay in view in a strip under the card, instead of covering the last field on small screens.
- The final check now grows into the finish animation.
- The welcome screen shows what's ready: transactions sorted, your needs / wants / savings plan, and the bills on Upcoming.

### 🛠 Housekeeping
- The README no longer shows broken screenshot images; the shots to add are listed in `docs/screenshots`.
- Uploaded profile photos are kept out of the repository.

### 🐳 Updating
`damianeickhoff/arca:latest` on Docker Hub. On Unraid, **Check for updates** in the Docker tab, then apply. Back up `/data` first.

## 1.3.0 — 2026-10-16
A new design, payment plans, overdraft limits and AI

Arca 1.3.0 is the biggest update so far: a completely new look, and new ways to plan ahead.

### ✨ A new design
- Every screen is redesigned: a calm light-grey layout with clear cards, one black "answer" card per page, and a full dark mode.
- New logo, a full-height sidebar on desktop and a floating tab bar on phones.
- Home shows what's safe to spend, what's coming up and your accounts at a glance.
- Activity opens every transaction in a new detail panel, with search, filters and bulk edits.
- Plan brings Budget, Debts and Goals together; Insights has Overview, Trends, Net worth, Forecast and Health.
- Settings is one page, with editors as dialogs and category groups (Housing, Transport, …) that add up their categories.

### 🆕 New features
- **Payment plans**: pay one cost in parts, like the dentist in three instalments. Each part shows up in the month it's due, with progress ("2 of 3 paid, €150 left"). Add one from the recurring editor or with "Add payment plan" on Debts.
- **Overdraft limits**: give a bank account the limit your bank allows. The forecast only calls it a shortfall past that limit, draws the limit on the chart, and you choose whether the overdraft counts as money you can spend.
- **AI with Gemini (optional)**: add a free Gemini API key in Settings › AI for category suggestions in Needs a category and a written summary on Insights. Off until you switch it on; only merchant names, amounts, dates and category names are sent, never account numbers.
- Needs a category: sort transactions one at a time, and its progress now counts up as you go.

### 🛠 Fixes
- Recurring items with a future start date now appear in the forecast and in later months of Upcoming.
- The forecast's monthly plan no longer counts a recurrence outside its start and end dates.
- Bank CSV parsing (Rabobank, amounts, empty last columns), amount matching and 31st-day debt end dates.
- A new installation creates its database on first start.

### 🐳 Installing and updating
The image stays on Docker Hub: `damianeickhoff/arca:latest`. On Unraid, **Check for updates** in the Docker tab picks it up; nothing to change. New database columns are added automatically on start.

As always: **back up `/data` before updating.**

## 1.2.2 — 2026-08-01
Two fixes in the transaction editor

### 🐛 Bug fixes

- Fixed the auto-create recurring bill from transaction detail dialog to show the old dialog.
- Fixed the account balance in the editor to show a lot of decimals behind the comma.

## 1.2.1 — 2026-07-30
Financial health, onboarding tips and a desktop view

### ✨ New features

- **Financial Health**
  - Get insights into your financial situation based on transactions, debts, savings, and spending patterns.
  - Receive suggestions on how you can improve your financial health.

- **Onboarding Tips**
  - New users are now welcomed with helpful tips explaining where to find important features.
  - Many pages now include contextual tips to help you discover functionality.
  - New features will include tips to make them easier to discover.

- **Improved Balance Tracking**
  - If your bank import contains a balance column after each transaction, Arca will use this data for more accurate reports and calculations.
  - If no balance information is available, Arca will continue using other available data sources.

- **Data Health & Mapping Overview**
  - Review imported data issues directly from the Data Health section.
  - Check your column mappings to identify incorrect or unexpected imports.

- **WIP: Multi-Transaction Selection**
  - Select multiple transactions at once to edit or delete them in bulk.
  - Currently available on desktop only.

- **Desktop View**
  - Arca now includes a dedicated desktop experience.
  - The interface uses the same familiar layout as mobile, optimized for larger screens.

### 💫 Improvements

- **WIP: Dutch Language Support**
  - More parts of Arca are now available in Dutch.
  - New features will include translations from release.
  - Existing components will continue to be translated in upcoming updates.
  - See #12 for progress.

### 🐛 Bug Fixes

- Fixed the mapping import dropdown.
- Improved automatic column mapping for bank imports (for example ING exports).
- Fixed various styling issues and smaller bugs.

## 1.1.0 — 2026-07-29
Merchants, recurrence cards and a cash-flow forecast

### 🎉 What's new

- Replaced the Brand Icons with Merchants and added Merchant profiles to track the transactions per merchant
- Added a recurrence card on the bottom of each transaction that is linked to a recurrence
- You can now auto create a recurrence from within a transaction, button is gone when there is already a linked recurrence
- Added a cash flow forecast card that predicts how you're cashflow will go this period and gives warnings when you're reaching a negative so you can take action beforehand. Also added some useful graphs to the forecast analytics page.

### ✅ Improvements
- Fixed a wrong button color after a csv import
- Changed the gradient from 50% to 100% height on the onboarding page so text is better readable.
- Replaced the 'swipe to commit' to 'press and commit' to match the desktop view better
