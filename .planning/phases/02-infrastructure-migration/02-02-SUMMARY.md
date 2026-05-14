---
plan: 02-02
phase: 02-infrastructure-migration
status: complete
wave: 1
requirements: [INFRA-03]
completed: 2026-05-12
---

# Plan 02-02 — Cloudflare R2 Migration Summary

## What Was Built

Migrated all file storage from AWS S3 + CloudFront to Cloudflare R2 (zero egress fees). Change was surgical — only the S3Client constructor in S3Service changed. All upload/presign method signatures are unchanged.

## Key Changes

### backend/src/common/services/s3.service.ts
- `region: 'auto'` (R2 literal requirement)
- `endpoint: https://<CF_ACCOUNT_ID>.r2.cloudflarestorage.com`
- Credentials: `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY`
- Bucket: `R2_BUCKET`, CDN base: `R2_PUBLIC_URL`
- Upload fallback URL now uses `r2.cloudflarestorage.com` (was `amazonaws.com`)
- Removed `this.region` field (not needed — R2 always uses 'auto')

### backend/src/common/services/__tests__/s3.service.spec.ts (NEW)
6 unit tests covering:
- Test 1: S3Client initialized with `region: 'auto'`
- Test 2: endpoint contains `r2.cloudflarestorage.com` and `CF_ACCOUNT_ID`
- Test 3: reads `R2_BUCKET` (not `AWS_S3_BUCKET`)
- Test 4: reads `R2_PUBLIC_URL` (not `AWS_CLOUDFRONT_URL`)
- Test 5: `upload()` returns URL starting with `R2_PUBLIC_URL`
- Test 6: `upload()` falls back to `r2.cloudflarestorage.com` URL when `R2_PUBLIC_URL` is empty

### .env.example
- Removed: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_S3_BUCKET`, `AWS_REGION`, `AWS_CLOUDFRONT_URL`
- Added: `CF_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_URL`
- Added: `SENDGRID_FROM_EMAIL`, `TERMII_SENDER_ID` (previously missing per CONCERNS.md)
- Added: `TYPESENSE_HOST`, `TYPESENSE_API_KEY`, `TYPESENSE_PROTOCOL`, `TYPESENSE_PORT=8108` (pre-emptively for plan 02-03)

## Verification

| Check | Result |
|-------|--------|
| S3Service unit tests (6) | ✅ All passing |
| Full test suite | ✅ 167 tests, 13 suites, 0 failures |
| TypeScript | ✅ No errors |
| r2.cloudflarestorage.com in s3.service.ts | ✅ Present |
| AWS vars removed from .env.example | ✅ Confirmed |

## Self-Check: PASSED

## Notes

- Commits deferred — user will sign into correct git account before committing
- .env.example also updated with Typesense vars (plan 02-03 pre-emptively) to avoid double-edit on same file
- No call sites changed — @aws-sdk/client-s3 import unchanged; only constructor args differ
