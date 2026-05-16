---
phase: 05-ai-concierge-kyc
plan: "01"
subsystem: backend/schema + mobile/deps
tags: [schema, kyc, vector, sse, seed, prisma]
dependency_graph:
  requires: []
  provides: [User-kyc-columns, kyc-platformconfig-rows, upstash-vector-dep, react-native-sse-dep, phase5-env-docs]
  affects: [backend/prisma/schema.prisma, backend/prisma/seed.ts, backend/package.json, mobile/package.json, .env.example]
tech_stack:
  added: ["@upstash/vector@1.2.3", "react-native-sse@1.2.1"]
  patterns: [prisma-db-push, platformconfig-upsert-seed]
key_files:
  created: []
  modified:
    - backend/prisma/schema.prisma
    - backend/prisma/seed.ts
    - backend/package.json
    - mobile/package.json
    - .env.example
decisions:
  - "Used prisma db push (not migrate) for dev schema addition — columns are nullable so no data loss risk"
  - "Kept existing nin/bvn @unique constraints — ciphertext uniqueness is acceptable per RESEARCH.md assumption A2"
  - "bvnHash/ninHash added for duplicate-lookup without exposing plaintext (bcrypt hash)"
  - "react-native-sse deferred @smile_identity/react-native-expo until Wave 6 (Expo Go incompatible)"
  - "Auto-fixed missing yn dependency for ts-node seed runner (Rule 3)"
metrics:
  duration: "12m"
  completed: "2026-05-16"
  tasks: 1
  files: 6
---

# Phase 5 Plan 01: Schema + Seed + Dependencies Summary

Wave 1 foundation for AI Concierge + KYC: five User KYC columns added to PostgreSQL, three wallet-tier PlatformConfig rows seeded, @upstash/vector and react-native-sse installed, and all Phase 5 env vars documented in .env.example.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add Phase 5 User columns + seed rows + npm deps | 1138b8b | schema.prisma, seed.ts, package.json (x2), .env.example, package-lock.json |

## Schema Changes

### New User Model Fields (backend/prisma/schema.prisma)

Added immediately after existing `bvn String? @unique` line:

```prisma
bvnHash               String?    // bcrypt hash of BVN for duplicate lookup
ninHash               String?    // bcrypt hash of NIN for duplicate lookup
kycBvnVerifiedAt      DateTime?
kycNinVerifiedAt      DateTime?
kycLivenessVerifiedAt DateTime?
```

All five fields are nullable — no migration required for existing rows. Confirmed applied via `prisma db pull --print`:

```
bvnHash               String?
kycBvnVerifiedAt      DateTime?
kycLivenessVerifiedAt DateTime?
kycNinVerifiedAt      DateTime?
ninHash               String?
```

## Seed Rows Applied

Three new PlatformConfig rows (key/value), upserted via `prisma db seed`:

| Key | Value (kobo) | Purpose |
|-----|-------------|---------|
| kyc_bvn_daily_limit | 200,000 | Tier 1 (BVN-only) daily wallet limit |
| kyc_nin_daily_limit | 1,000,000 | Tier 2 (NIN-verified) daily wallet limit |
| kyc_smile_daily_limit | 5,000,000 | Tier 3 (liveness-verified) daily wallet limit |

Total PlatformConfig rows after seed: **19**

## npm Dependencies Installed

| Package | Version | Workspace | Purpose |
|---------|---------|-----------|---------|
| @upstash/vector | 1.2.3 | backend | Vector index for AI personalisation (BAAI/bge-m3 1024d) |
| react-native-sse | 1.2.1 | mobile | Server-Sent Events client for AI streaming on iOS/Android |

## Environment Variables Documented (.env.example)

New Phase 5 section appended:

- `ENCRYPTION_KEY` — AES-256-GCM 32-byte master key (64 hex chars; placeholder is all-zeros)
- `UPSTASH_VECTOR_REST_URL` — Upstash Vector REST endpoint
- `UPSTASH_VECTOR_REST_TOKEN` — Upstash Vector auth token
- `DOJAH_API_KEY` + `DOJAH_APP_ID` — NIN verification (stub mode if absent)
- `SMILE_IDENTITY_PARTNER_ID` + `SMILE_IDENTITY_API_KEY` — Tier 3 liveness (stub if absent)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed missing yn module for ts-node**
- **Found during:** Task 1, step 8 (seed execution)
- **Issue:** `ts-node` could not load due to missing peer dependency `yn` — `Error: Cannot find module 'yn'`
- **Fix:** `npm install yn --save-dev` in backend workspace
- **Files modified:** backend/package.json (also captured in the task commit via package-lock.json)
- **Commit:** 1138b8b

## Test Results

All 226 existing backend tests passed after schema and dependency changes:

```
Test Suites: 19 passed, 19 total
Tests:       226 passed, 226 total
```

Schema additions are all nullable — no existing test broke.

## Threat Surface Scan

No new network endpoints, auth paths, or trust-boundary-crossing file access patterns introduced. Changes are limited to:
- DB schema additions (nullable columns, no data loss)
- Seed upserts (idempotent)
- npm dependency additions (no runtime network calls in this plan)
- Documentation-only `.env.example` change (placeholder values, no real secrets)

## Known Stubs

None — this plan adds schema and dependencies only; no UI or service logic with stubs.

## Self-Check: PASSED

- [x] backend/prisma/schema.prisma modified with 5 new fields
- [x] backend/prisma/seed.ts contains kyc_bvn_daily_limit, kyc_nin_daily_limit, kyc_smile_daily_limit
- [x] @upstash/vector@1.2.3 in backend/package.json
- [x] react-native-sse@1.2.1 in mobile/package.json
- [x] .env.example contains ENCRYPTION_KEY, UPSTASH_VECTOR_REST_URL, DOJAH_API_KEY, SMILE_IDENTITY_PARTNER_ID
- [x] Commit 1138b8b verified in git log
- [x] 226 backend tests pass
