---
title: Install
description: Run Arca with Docker, Docker Compose or Unraid.
---

Arca runs as a single Docker container. Pick the way you usually add containers; each one takes a few minutes.

:::tip[What you need]
A machine that runs Docker (a NAS, an Unraid server, a mini PC or your own computer) and a folder where Arca can keep its data.
:::

## Docker

```bash
docker run -d \
  --name arca \
  -p 3000:3000 \
  -v /path/to/arca-data:/data \
  --restart unless-stopped \
  damianeickhoff/arca:latest
```

Replace `/path/to/arca-data` with a folder on your machine. Then open `http://localhost:3000` (or `http://<your-server-ip>:3000` from another device). The first start creates the database and opens the [setup](/Arca/getting-started/first-run/).

## Docker Compose

Save this as `docker-compose.yml` in an empty folder:

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

Then start it:

```bash
docker compose up -d
```

To use another port, change the left number, for example `"8080:3000"`.

## Unraid

1. Download the template [`arca.xml`](https://github.com/damianeickhoff/Arca/blob/master/unraid/arca.xml) and copy it to `/boot/config/plugins/dockerMan/templates-user/` on your server.
2. In Unraid, go to **Docker → Add Container**, choose **Template → User templates → Arca**.
3. Map **Data** (`/data`) to `/mnt/user/appdata/arca`.
4. Apply, then open the **WebUI** from the Docker tab.

## Where your data lives

Everything Arca needs to keep is in the `/data` folder you mapped:

| What | Where |
| --- | --- |
| The database (all your transactions, budgets and settings) | `finance.db` (plus `finance.db-wal` and `finance.db-shm` while it runs) |
| Logos you uploaded for merchants | `brand-icons/` |
| Profile photos | `avatars/` |
| Receipt photos | `receipts/` |
| Backups Arca made before updates, and the ones you made | `backups/` |

Back up that folder and you have everything. See [Updating and backups](/Arca/getting-started/updating-and-backups/).

:::caution[Map /data to a real folder]
If you don't map `/data` to a folder on your server, Docker keeps it in a temporary volume and your data is gone when the container is recreated.
:::

## Opening Arca from outside your home

Arca works fine on your home network over plain `http://`. If you want to reach it from outside, put it behind a reverse proxy that serves HTTPS (Nginx Proxy Manager, Caddy, Traefik, SWAG and so on) or use a VPN such as Tailscale or WireGuard.

When Arca sits behind a proxy that serves **HTTPS**, set this on the container:

```text
COOKIE_SECURE=true
```

This marks the sign-in cookie as secure. Leave it at `false` (the default) when you open Arca over plain `http://`, otherwise signing in won't stick.

:::note[Who can create an account]
Only the very first visitor can create an account by themselves; that account becomes the admin. After that, new people need an [invite link](/Arca/settings/security/#inviting-someone) from an admin. Still, keep Arca behind HTTPS or a VPN before you expose it to the internet.
:::

## Settings you can change

| Variable | Default | What it does |
| --- | --- | --- |
| `COOKIE_SECURE` | `false` | `true` only when a reverse proxy serves Arca over HTTPS. |
| `DB_PATH` | `/data/finance.db` | Where the database lives. Logos and photos go next to it. |
| `ALLOW_OPEN_SIGNUP` | not set | Set to `true` to let anyone create an account again, without an [invite link](/Arca/settings/security/#inviting-someone). Only for getting back into a household whose admin is locked out: set it, restart Arca, create a new account on the sign-in page (it becomes an admin) and remove the setting again. |
| `BANK_SYNC_DISABLED` | not set | Set to `1` to switch off the automatic daily [bank sync](/Arca/transactions/bank-connection/#the-daily-sync). |
| `BANK_SYNC_TOKEN` | not set | A long random string, only if you want to [start the bank sync from your own scheduler](#start-the-bank-sync-from-your-own-scheduler). |
| `OLLAMA_HOST` | not set | Older way to set up **Scan receipt**: now set in [Settings → AI](/Arca/settings/ai/#receipt-scanning). Still read as the default address of your local AI server until you save one there, for example `http://192.168.1.20:11434`. |
| `OLLAMA_VISION_MODEL` | `llava` when `OLLAMA_HOST` is set | Older way to pick the model that reads receipts; the default **Vision model** in Settings → AI until you save one there. |

## Install it on your phone

Open Arca in your phone's browser and use **Add to Home Screen** (Safari: the share button; Chrome: the ⋮ menu). It then opens full screen, like an app. You still need a connection to your server: Arca doesn't keep your data on the phone.

## Start the bank sync from your own scheduler

Arca syncs connected banks once a day by itself. If you'd rather choose the moment yourself (for example with Unraid's User Scripts plugin or cron):

1. Set `BANK_SYNC_TOKEN` on the container to a long random string, for example the output of `openssl rand -hex 32`.
2. Set `BANK_SYNC_DISABLED=1` too if the built-in daily sync shouldn't run next to it.
3. Call Arca from your scheduler:

   ```bash
   curl -fsS -X POST -H "Authorization: Bearer $BANK_SYNC_TOKEN" https://arca.example.com/api/bank/cron
   ```

It answers with the result per bank, or an error when an import or sync is already running. Banks only allow a few syncs a day, so there's no point running it more than a few times a day.
