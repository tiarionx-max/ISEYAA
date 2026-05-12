#!/bin/sh
# Run from repo root with: bash backend/scripts/smoke-infra.sh
# Requires .env to be sourced or env vars set (DATABASE_URL, DIRECT_URL,
# REDIS_URL, CF_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET).
# This script is for developer use only — run BEFORE starting Wave 2 plans.
# It is NOT run in CI (requires actual cloud credentials).
set -e

echo "=== ISEYAA Infrastructure Smoke Tests ==="
echo ""

echo "1/3 Pinging Neon PostgreSQL..."
npx prisma db execute --stdin --schema=backend/prisma/schema.prisma <<< "SELECT 1 AS ok;"
echo "Neon OK"
echo ""

echo "2/3 Pinging Upstash Redis..."
node -e "
  const Redis = require('ioredis');
  const r = new Redis(process.env.REDIS_URL, { tls: {} });
  r.ping().then(v => {
    console.log('Redis ping:', v);
    r.quit();
  }).catch(e => {
    console.error('Redis FAILED:', e.message);
    process.exit(1);
  });
"
echo "Upstash Redis OK"
echo ""

echo "3/3 Testing Cloudflare R2 upload..."
node -e "
  const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
  const client = new S3Client({
    region: 'auto',
    endpoint: 'https://' + process.env.CF_ACCOUNT_ID + '.r2.cloudflarestorage.com',
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
  });
  client.send(new PutObjectCommand({
    Bucket: process.env.R2_BUCKET,
    Key: 'smoke-test/ping-' + Date.now() + '.txt',
    Body: 'smoke test',
    ContentType: 'text/plain',
  })).then(() => {
    console.log('R2 upload OK');
  }).catch(e => {
    console.error('R2 FAILED:', e.message);
    process.exit(1);
  });
"
echo "Cloudflare R2 OK"
echo ""

echo "=== All 3 infrastructure checks passed ==="
echo "Safe to proceed to Wave 2 plans."
