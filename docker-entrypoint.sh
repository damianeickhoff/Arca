#!/bin/sh
set -e

# Where the SQLite database lives. Defaults to the mounted /data volume so it
# survives container restarts and is never baked into the image.
: "${DB_PATH:=/data/finance.db}"
export DB_PATH
mkdir -p "$(dirname "$DB_PATH")"

if [ -f "$DB_PATH" ]; then
  echo "Using existing database at $DB_PATH."
else
  echo "No database at $DB_PATH yet: Arca creates and seeds it on first start."
fi

# The app itself creates the schema on an empty database, applies new columns and
# tables to an existing one, and makes a backup in /data/backups before the first
# start on a new version (src/instrumentation.ts).
exec node server.js
