<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/logo-dark.svg">
    <img src="docs/logo-light.svg" alt="Arca" height="64">
  </picture>
</p>

<p align="center">
  <b>A calm, self-hosted personal finance app.</b><br>
  Know what's safe to spend, what's coming up, and where your money went, with your data on your own server.
</p>

<p align="center">
  <a href="https://github.com/damianeickhoff/Arca/releases/latest"><img alt="Release" src="https://img.shields.io/github/v/release/damianeickhoff/Arca"></a>
  <a href="https://hub.docker.com/r/damianeickhoff/arca"><img alt="Docker pulls" src="https://img.shields.io/docker/pulls/damianeickhoff/arca"></a>
  <a href="https://damianeickhoff.github.io/Arca/"><img alt="Documentation" src="https://img.shields.io/badge/docs-user%20guide-111113"></a>
</p>

<p align="center">📖 <b><a href="https://damianeickhoff.github.io/Arca/">Documentation</a></b>: install, first run, bank connection, budgets and more, in plain language.</p>

> **Updates are safe to take.** Arca backs up its database before the first start on every new version and keeps the last five copies in `/data/backups`. The database is brought up to date by itself; a breaking change only ever comes with a new major version and says so in the release notes.

## 📸 Screenshots

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/home-dark.png">
    <img src="docs/screenshots/home.png" alt="Arca Home: safe to spend, income and spending, the budget and money flow" width="100%">
  </picture>
  <br><sub><b>Home</b>: what's safe to spend, this month's money in and out, and the budget at a glance</sub>
</p>

<table>
  <tr>
    <td width="50%"><img src="docs/screenshots/activity.png" alt="Activity"><br><sub><b>Activity</b>: every transaction, searchable and grouped by day</sub></td>
    <td width="50%"><img src="docs/screenshots/plan.png" alt="Budget"><br><sub><b>Plan</b>: the budget per category, with needs, wants and savings</sub></td>
  </tr>
  <tr>
    <td width="50%"><img src="docs/screenshots/insights.png" alt="Insights overview"><br><sub><b>Insights</b>: any period in numbers, categories and merchants</sub></td>
    <td width="50%"><img src="docs/screenshots/forecast.png" alt="Cash-flow forecast"><br><sub><b>Forecast</b>: where your balance goes over the next 30 days</sub></td>
  </tr>
</table>

<p align="center">
  <img src="docs/screenshots/mobile.png" alt="Arca on a phone, light theme" width="260">
  &nbsp;&nbsp;
  <img src="docs/screenshots/mobile-dark.png" alt="Arca on a phone, dark theme" width="260">
  <br><sub>On your phone, in light and dark</sub>
</p>

<sub>Screenshots use the built-in demo data.</sub>

## ✨ Features

**See where you stand**
- **Home**: what's safe to spend today, what's coming up, money in versus out, your net worth, and all your accounts at a glance.
- **Insights**: an overview of any period, trends per category and group, net worth over time, a financial health score, and a cash-flow **forecast** that warns before you run short.

**Keep track without the busywork**
- **CSV import** for ING, Rabobank, ABN AMRO, bunq, Knab and Revolut out of the box, plus a column mapper for any other bank (remembered for next time).
- **Needs a category**: sort uncategorised transactions one by one, and turn each answer into a rule so the list stays short.
- **Activity**: search, filters, bulk edits, split transactions, receipts, shared costs and transfers between your own accounts.
- **Merchants** with logos, friendly names and category groups (Housing, Transport, …).

**Plan ahead**
- **Budget**: an overall or per-category budget with a needs / wants / savings strategy.
- **Recurring**: bills, subscriptions, income and savings, matched to transactions automatically, with an **Upcoming** calendar.
- **Notifications**: a bill due or overdue, the forecast running low, the payday check-in, bank consent and sync trouble, new transactions and new versions, in the app and as push to your phone or computer, each kind with its own switch.
- **Payment plans**: pay one cost in parts (the dentist in three instalments); each part counts in the month it's due.
- **Debts**: what you owe and what you're owed, with a payoff simulator.
- **Goals**: savings goals with contributions and suggestions.
- **Overdraft limits** per bank account; you choose whether the overdraft counts as money you can spend.

**Optional AI (Gemini or your own server)**
- Category suggestions in Needs a category, and a short written summary of any period on Insights.
- Off until you add your own Gemini API key, or point it at your own AI server (Ollama, LM Studio or anything OpenAI-compatible) so nothing leaves your network. Only merchant names, amounts, dates and category names are sent, never account numbers.

**Yours**
- Self-hosted: one SQLite file in `/data`, no cloud account. **Settings › About** lists every connection Arca can make (bank, AI, receipts, map) with its state and shows the release notes offline; there is no telemetry, and the update check is a switch that is off until you turn it on.
- **Backups**: a copy of the database before every update, plus manual backups you can download, all in Settings › Data health.
- Several users, two-factor sign-in, an app lock (PIN or passkey) and a privacy mode that hides amounts.
- Light and dark theme, English and Dutch, works on desktop and phone, installable as an app (PWA).

## 🚀 Getting started

### Docker

```bash
docker run -d \
  --name arca \
  -p 3000:3000 \
  -v /path/to/arca-data:/data \
  --restart unless-stopped \
  damianeickhoff/arca:latest
```

Open `http://localhost:3000`. The first start creates the database and opens the onboarding.

### Docker Compose

```yaml
services:
  arca:
    image: damianeickhoff/arca:latest
    container_name: arca
    ports:
      - "3000:3000"
    volumes:
      - ./data:/data
    environment:
      # Set to "true" only behind a reverse proxy that serves HTTPS.
      - COOKIE_SECURE=false
    restart: unless-stopped
```

### Unraid

Use the template in [`unraid/arca.xml`](unraid/arca.xml): copy it to
`/boot/config/plugins/dockerMan/templates-user/`, then **Docker → Add Container → Template → User templates → Arca**.
Map `/data` to `/mnt/user/appdata/arca`.

### Your data

Everything lives in `/data`: the SQLite database (`finance.db`), uploaded logos, avatars and receipts, and the `backups/` folder with the copies Arca makes before updates. Back up that folder; nothing else needs to persist.

## 🔄 Updating

Images are published to [Docker Hub](https://hub.docker.com/r/damianeickhoff/arca) (and mirrored to `ghcr.io/damianeickhoff/arca`):

| Tag | What it is |
| --- | --- |
| `latest` | The current release (the `master` branch) |
| `v1.3.0`, … | A specific release |
| `<branch>` | A test build of a branch, never `latest` |

```bash
docker pull damianeickhoff/arca:latest
```

Then recreate the container, keeping `/data`. On the first start of a new version Arca copies the database to `/data/backups/`, then adds any new tables and columns by itself. On Unraid, **Check for updates** in the Docker tab picks up a new `latest`. What changed is in **Settings › About** and in [CHANGELOG.md](CHANGELOG.md).

## 🆘 Support

Start with the [user guide](https://damianeickhoff.github.io/Arca/): it covers installing and updating, every page of the app, and [common questions](https://damianeickhoff.github.io/Arca/help/faq/). See the [roadmap](https://damianeickhoff.github.io/Arca/roadmap/) for what's coming.

Issues and feature requests: <https://github.com/damianeickhoff/Arca/issues>

## 📄 License

Arca is free software under the [GNU Affero General Public License v3.0](LICENSE). You may run it, study it, change it and share it. If you distribute a changed version, or run one as a service for others, you must share your changes under the same licence. Running it at home for yourself and your household carries no obligation at all.
