#!/bin/sh
set -e
cd /app/backend
echo "Running Prisma migrations..."
npx prisma migrate deploy
echo "Starting ISEYAA backend..."
exec node --require /app/backend/dist/instrumentation.js /app/backend/dist/main.js
