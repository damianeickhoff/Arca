---
title: About and release notes
description: Which version you run, what leaves your server, and what changed in every release.
---

Settings → **About** answers three questions without leaving the app: which version is this, what does Arca send where, and what changed.

## Your version

The top of the panel shows the version you are running, the licence (Arca is free software under the GNU Affero General Public License v3) and buttons to this guide, the source code and the place to report a problem.

## What leaves your server

Arca is built to keep your data at home, so the About panel lists every connection it can make, each with its state right now: **On**, **Off** or **On tap**. A tile is only highlighted when that connection is actually on.

| Connection | When | What goes out |
| --- | --- | --- |
| Bank connection | Only after you [connect a bank](/Arca/transactions/bank-connection/) | The consent you give at your bank; Arca fetches your accounts and transactions |
| AI (Gemini) | Only with [your own key](/Arca/settings/ai/), per feature | Cleaned descriptions, amounts, dates and your category names; never account numbers |
| Receipt scanning | Only when the server is configured with an Ollama host of your own | Receipt photos |
| Map and merchant lookup | Only when you press the button on a transaction | Your browser asks OpenStreetMap for the place by name, or opens Google in a new tab |

Nothing else: no telemetry, no analytics, no crash reports and no update checks. The release notes on this panel ship inside the image, so opening About makes no request anywhere.

## What changed

The bottom of the panel lists every release, newest first, with the same notes as the [releases page on GitHub](https://github.com/damianeickhoff/Arca/releases). The version you run is marked. Open an older release to read its notes.

After an update, Home shows a one-time card that names the new version and points here.

## Backups

The panel links to [Data health](/Arca/settings/data-health/#backups), where Arca keeps the backups it makes before every update and where you can make one yourself.
