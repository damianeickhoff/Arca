---
title: Updating and backups
description: Get the newest version of Arca and keep a copy of your data.
---

Updating Arca means pulling the newest image and recreating the container. Your data stays in `/data`. On the first start of a new version Arca copies its database to `/data/backups/` and then brings the database up to date by itself.

:::tip[Every update is covered]
Arca keeps the last five of those automatic copies. Settings → **Data health** lists them, lets you make one by hand and download it. See [Back up your data](#back-up-your-data).
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

Everything is in the `/data` folder: the database, uploaded logos, profile photos, receipts and the `backups/` folder. There are three layers:

**Arca's own backups.** Before the first start on a new version, Arca writes a copy of the database to `/data/backups/` and keeps the newest five. In Settings → **Data health** you can also press **Back up now** for a copy on the spot, and download any backup to keep it somewhere else. These copies are made with SQLite's own backup method, so they are consistent even while Arca runs.

**A copy of the whole folder** (a few seconds of downtime) covers the uploads too:

1. Stop the container: `docker stop arca`
2. Copy the whole data folder somewhere safe, for example to another disk or your backup tool.
3. Start it again: `docker start arca`

On Unraid, the **Appdata Backup** plugin can do this on a schedule for you.

**A live copy from the command line**, when you do not want to open the app:

```bash
docker exec arca node -e "require('better-sqlite3')('/data/finance.db').backup('/data/finance-backup.db').then(() => console.log('Backup written'))"
```

This writes `finance-backup.db` next to the database.

## Restore a backup

1. Stop the container.
2. In your data folder, remove `finance.db`, `finance.db-wal` and `finance.db-shm`. Copy the backup you want (from `backups/`, or one you downloaded) into the folder and name it `finance.db`.
3. Start the container again. Arca brings the restored database up to date if it came from an older version.

To go back to an older version of Arca as well, run that version's image tag (`damianeickhoff/arca:1.5.1`, for example) with the matching backup.

## Reset a forgotten app lock PIN

The lock screen has no "forgot PIN" option. Whoever runs the server can switch the app lock off; afterwards, set a new PIN in **Settings → App lock**.

```bash
docker exec arca node -e "require('better-sqlite3')('/data/finance.db').prepare(\"UPDATE app_settings SET value = '0' WHERE key = 'app_lock_enabled'\").run()"
```

Reload Arca and it opens without asking for the PIN.
