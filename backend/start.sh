#!/bin/sh
set -e
cd /app/backend
echo "Running Prisma migrations..."
npx prisma migrate deploy
echo "Starting ISEYAA backend..."
exec node --require ./dist/src/instrumentation.js ./dist/src/main.js
