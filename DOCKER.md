# Running Arca in Docker

The app ships with a `Dockerfile` (Node 22-alpine, multi-stage build) and a
`docker-compose.yml` that wires up the one thing that has to survive
container recreation: the `/data` folder, which holds `finance.db` and the
`brand-icons/` folder of uploaded logos.

## Prerequisites

- Docker Engine with the Compose plugin (`docker compose version` should work).
  On Unraid/Synology-style NAS setups, any Docker Compose-capable UI works too.

## First run

```bash
git clone <this repo>
cd Arca
docker compose up -d --build
```

This builds the image, creates a `./data` folder next to `docker-compose.yml`
on the host, and starts the app on <http://localhost:3000>. On first boot
(no `finance.db` yet), the container runs `npm run db:init` automatically to
create and seed a fresh database — you'll land on the onboarding flow.

## Where your data lives

Everything persistent is bind-mounted from `./data` on the host to `/data`
in the container:

- `./data/finance.db` (+ `-wal`/`-shm`) — the SQLite database.
- `./data/brand-icons/` — custom logos uploaded through the brand-icon picker.

Nothing else needs to persist — the app code and `node_modules` are baked
into the image and rebuilt on every update.

**Back up by copying the `./data` folder** while the container is stopped
(or use `sqlite3 .backup` for a live backup if you want zero downtime).

## Updating to a new version

```bash
git pull
docker compose up -d --build
```

The container recreates on the new image; `./data` is untouched. Any new
database columns/tables are applied automatically on boot (see the
"Auto-migrate" comments in `src/db/index.ts`) — no manual migration step.

## Configuration

Set these via the `environment:` block in `docker-compose.yml`:

| Variable        | Default              | Purpose                                                                 |
| --------------- | --------------------- | ------------------------------------------------------------------------ |
| `DB_PATH`       | `/data/finance.db`    | Where the SQLite file lives. Also determines where `brand-icons/` goes (same directory). |
| `COOKIE_SECURE` | `false`               | Set to `true` only if a reverse proxy in front of the container terminates TLS. Leave `false` for plain-HTTP/LAN access, otherwise login sessions won't work. |

Change the published port by editing the `ports:` mapping, e.g. `"8080:3000"`
to expose the app on port 8080 instead.

## Useful commands

```bash
docker compose logs -f arca   # tail app logs
docker compose down             # stop (keeps ./data)
docker compose up -d            # start again without rebuilding
```

## Note on `entrypoint.sh`

The repo root has both `docker-entrypoint.sh` (used by the `Dockerfile`'s
`ENTRYPOINT`) and an older, unused `entrypoint.sh`. Only
`docker-entrypoint.sh` runs in the container — `entrypoint.sh` is dead and
can be deleted whenever you're doing repo cleanup; it wasn't touched here to
keep this change focused.
