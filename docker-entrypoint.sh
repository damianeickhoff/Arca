#!/bin/sh
set -e

# Where the SQLite database lives. Defaults to the mounted /data volume so it
# survives container restarts and is never baked into the image.
: "${DB_PATH:=/data/finance.db}"
export DB_PATH

# First spin-up: no database yet → create + seed a brand-new one.
if [ ! -f "$DB_PATH" ]; then
  echo "No database found at $DB_PATH — initialising a fresh finance.db..."
  mkdir -p "$(dirname "$DB_PATH")"
  npm run db:init
else
  echo "Using existing database at $DB_PATH."
fi

exec npm start
