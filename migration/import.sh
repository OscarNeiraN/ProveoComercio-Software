#!/bin/sh
set -eu

: "${DB_HOST:?DB_HOST is required}"
: "${DB_USER:?DB_USER is required}"
: "${DB_PASSWORD:?DB_PASSWORD is required}"
: "${DB_NAME:?DB_NAME is required}"

DB_PORT="${DB_PORT:-3306}"
DUMP_FILE="${DUMP_FILE:-/migration/dump.sql}"

if [ ! -f "$DUMP_FILE" ]; then
  echo "Dump file not found: $DUMP_FILE" >&2
  exit 1
fi

echo "Waiting for MySQL at ${DB_HOST}:${DB_PORT}..."
for attempt in $(seq 1 30); do
  if mysqladmin ping \
    --host="$DB_HOST" \
    --port="$DB_PORT" \
    --user="$DB_USER" \
    --password="$DB_PASSWORD" \
    --silent; then
    break
  fi

  if [ "$attempt" -eq 30 ]; then
    echo "MySQL did not become available in time." >&2
    exit 1
  fi

  sleep 10
done

echo "Importing ${DUMP_FILE} into ${DB_NAME}..."
mysql \
  --host="$DB_HOST" \
  --port="$DB_PORT" \
  --user="$DB_USER" \
  --password="$DB_PASSWORD" \
  "$DB_NAME" < "$DUMP_FILE"

echo "Import finished."
