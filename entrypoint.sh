#!/bin/sh
set -e

if [ ! -f "$DB_PATH" ]; then
  echo "Initializing database at $DB_PATH..."
  npm run db:init
fi

exec npm start
