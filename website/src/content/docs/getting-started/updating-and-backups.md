---
title: Updating and backups
description: Get the newest version of Arca and keep a copy of your data.
---

Updating Arca means pulling the newest image and recreating the container. Your data stays in `/data`, and the database is brought up to date by itself when Arca starts.

:::caution[Back up first]
Arca is still changing quickly. Make a backup of your `/data` folder before every update, so you can always go back.
:::

## Which version to use

Images are published to [Docker Hub](https://hub.docker.com/r/damianeickhoff/arca) (and mirrored to `ghcr.io/damianeickhoff/arca`).

| Tag | What it is |
| --- | --- |
| `latest` | The current release. Use this one. |
| `v1.3.0`, … | A specific release, if you want to stay on one version. |
| a branch name | A test build of work in progress. Never `latest`. |

## Update with Docker

```bash
docker pull damianeickhoff/arca:latest
docker stop arca && docker rm arca
```

Then run the same `docker run` command you used to [install](/Arca/getting-started/install/#docker) it, with the same `/data` folder.

## Update with Docker Compose

In the folder with your `docker-compose.yml`:

```bash
docker compose pull
docker compose up -d
```

## Update on Unraid

In the **Docker** tab, choose **Check for updates**. When Arca shows an update, choose **apply update**. Your `/mnt/user/appdata/arca` folder is kept.

## Back up your data

Everything is in the `/data` folder: the database, uploaded logos and profile photos. A backup is simply a copy of that folder.

**The simple way** (a few seconds of downtime):

1. Stop the container: `docker stop arca`
2. Copy the whole data folder somewhere safe, for example to another disk or your backup tool.
3. Start it again: `docker start arca`

On Unraid, the **Appdata Backup** plugin can do this on a schedule for you.

**Without stopping Arca**, ask the database to write a copy of itself:

```bash
docker exec arca node -e "require('better-sqlite3')('/data/finance.db').backup('/data/finance-backup.db').then(() => console.log('Backup written'))"
```

This writes `finance-backup.db` next to the database. Copy it off the server along with `brand-icons/`, `avatars/` and `receipts/`.

## Restore a backup

1. Stop the container.
2. Replace the contents of your data folder with the backup. If you used the live backup, rename `finance-backup.db` to `finance.db` and remove any old `finance.db-wal` and `finance.db-shm` files.
3. Start the container again.

## Reset a forgotten app lock PIN

The lock screen has no "forgot PIN" option. Whoever runs the server can switch the app lock off; afterwards, set a new PIN in **Settings → App lock**.

```bash
docker exec arca node -e "require('better-sqlite3')('/data/finance.db').prepare(\"UPDATE app_settings SET value = '0' WHERE key = 'app_lock_enabled'\").run()"
```

Reload Arca and it opens without asking for the PIN.
