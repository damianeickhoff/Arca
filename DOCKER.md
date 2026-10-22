# Running Arca in Docker

The app ships with a `Dockerfile` (Node 22-alpine, two stages) and a `docker-compose.yml`
that wires up the one thing that has to survive container recreation: the `/data`
folder, which holds the database, the uploads and the backups.

Most people do not build the image themselves: `damianeickhoff/arca:latest` on Docker
Hub (mirrored to `ghcr.io/damianeickhoff/arca`) is what the user guide installs. This file
is for building from source.

## Prerequisites

- Docker Engine with the Compose plugin (`docker compose version` should work).
  On Unraid/Synology-style NAS setups, any Docker Compose-capable UI works too.

## First run

```bash
git clone https://github.com/damianeickhoff/Arca.git
cd Arca
docker compose up -d --build
```

This builds the image, creates a `./data` folder next to `docker-compose.yml` on the
host, and starts the app on <http://localhost:3000>. On first boot (no `finance.db` yet)
Arca creates and seeds a fresh database and shows the onboarding flow.

## How the image is built

- The builder stage installs every dependency and runs `next build` with
  `output: "standalone"` (`next.config.ts`), so Next.js traces the files the server
  really needs into `.next/standalone`.
- The runner stage copies only that: the traced `node_modules` (a few tens of MB, as its
  own layer so an update reuses it when the dependencies did not change), `server.js`,
  the build output, `public/` and `CHANGELOG.md` (Settings › About reads it). No full
  `node_modules`, no `src/`, no build cache.
- `docker-entrypoint.sh` sets `DB_PATH`, makes sure its folder exists and runs
  `node server.js`. Schema creation, migrations and the pre-update backup happen inside
  the app on start (`src/db/index.ts`, `src/instrumentation.ts`).

## Where your data lives

Everything persistent is bind-mounted from `./data` on the host to `/data` in the
container:

- `./data/finance.db` (+ `-wal`/`-shm`) — the SQLite database.
- `./data/brand-icons/`, `avatars/`, `receipts/` — uploads.
- `./data/backups/` — the copies Arca makes before the first start on a new version
  (the newest five are kept) and the manual backups from Settings › Data health.
- `./data/.arca-version` — the version that last ran, so the next start knows whether to
  back up first.

Nothing else needs to persist. Back up by copying the `./data` folder, or download a
backup from Settings › Data health.

## Updating to a new version

```bash
git pull
docker compose up -d --build
```

The container recreates on the new image; `./data` is untouched. Arca backs the database
up to `./data/backups/`, then applies any new tables and columns by itself.

## Configuration

Set these via the `environment:` block in `docker-compose.yml`:

| Variable        | Default              | Purpose                                                                 |
| --------------- | --------------------- | ------------------------------------------------------------------------ |
| `DB_PATH`       | `/data/finance.db`    | Where the SQLite file lives. Its folder is the data dir (uploads, backups). |
| `COOKIE_SECURE` | `false`               | Set to `true` only if a reverse proxy in front of the container terminates TLS. Leave `false` for plain-HTTP/LAN access, otherwise login sessions won't work. |
| `PORT`          | `3000`                | The port the server listens on inside the container. |
| `ALLOW_OPEN_SIGNUP` | unset             | `true` reopens the sign-up page after the first user (normally new people join by invite link). |

Change the published port by editing the `ports:` mapping, e.g. `"8080:3000"` to expose
the app on port 8080 instead.

## Useful commands

```bash
docker compose logs -f arca   # tail app logs
docker compose down             # stop (keeps ./data)
docker compose up -d            # start again without rebuilding
```
