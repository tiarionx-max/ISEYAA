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

# Seed reference data on first deploy — skips if LGAs already exist
LGA_COUNT=$(node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.lGA.count().then(n => { console.log(n); p.\$disconnect(); }).catch(() => { console.log(0); p.\$disconnect(); });
" 2>/dev/null || echo "0")

if [ "$LGA_COUNT" = "0" ]; then
  echo "Database is empty — running seed..."
  node dist/prisma/seed.js || npx ts-node prisma/seed.ts || echo "WARN: seed failed, continuing startup"
else
  echo "Database already seeded (${LGA_COUNT} LGAs) — skipping seed"
fi

echo "Starting ISEYAA backend..."
exec node --require ./dist/src/instrumentation.js ./dist/src/main.js
