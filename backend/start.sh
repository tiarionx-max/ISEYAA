#!/bin/sh
set -e
cd /app/backend

# Validate required env vars before doing anything
if [ -z "$DATABASE_URL" ]; then
  echo "ERROR: DATABASE_URL is not set. Set it in Railway → service → Variables." >&2
  exit 1
fi

if [ -z "$JWT_SECRET" ]; then
  echo "ERROR: JWT_SECRET is not set. Set it in Railway → service → Variables." >&2
  exit 1
fi

if [ -z "$JWT_REFRESH_SECRET" ]; then
  echo "ERROR: JWT_REFRESH_SECRET is not set. Set it in Railway → service → Variables." >&2
  exit 1
fi

# DIRECT_URL is required by prisma migrate deploy (bypasses pgBouncer on Neon).
# Fall back to DATABASE_URL for standard Postgres deployments without connection pooling.
if [ -z "$DIRECT_URL" ]; then
  export DIRECT_URL="$DATABASE_URL"
  echo "INFO: DIRECT_URL not set — using DATABASE_URL for migrations"
fi

echo "Running Prisma migrations..."
npx prisma migrate deploy

echo "Starting ISEYAA backend..."
exec node --require ./dist/src/instrumentation.js ./dist/src/main.js
