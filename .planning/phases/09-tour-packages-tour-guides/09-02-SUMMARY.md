---
phase: 09-tour-packages-tour-guides
plan: 02
subsystem: common
tags: [backend, common, infrastructure, paystack, s3, refund, upload, reference]
requires: []
provides:
  - ReferenceService (ISY-<PREFIX>-<12char> + ISY-ESC-<8char> generator)
  - RefundService (idempotent Paystack refund + REFUND Transaction ledger row)
  - UploadService (presigned PUT URL generator — AWS S3 + Cloudflare R2)
  - UploadController (POST /api/v1/uploads/presigned, JwtAuthGuard)
  - PaystackService.refundCharge (wraps POST /transaction/refund)
  - S3Service public accessors (getMode / getBucket / getClient / getCdnBase)
affects:
  - 09-03 (cert upload UX consumes /uploads/presigned)
  - 09-05 (tour booking will inject ReferenceService.generate('TOUR'))
  - 09-06 (settlement engine rollback path will inject RefundService)
  - 09-08 (review photo upload consumes /uploads/presigned)
  - 09-09 (cover image upload consumes /uploads/presigned)
tech-stack:
  added:
    - "@aws-sdk/s3-request-presigner@^3.1075.0 — sibling of installed @aws-sdk/client-s3 3.1045.x"
  patterns:
    - "Common @Global services injectable everywhere without per-module imports"
    - "Idempotency via deterministic reference suffix (<paystackReference>-RFND)"
    - "Server-controlled object keys: ${prefix}/${userId}/${uuid}.${ext} — userId from JWT, never body"
    - "Defense-in-depth: contentType allowlist enforced in both DTO validator AND service"
key-files:
  created:
    - backend/src/common/services/reference.service.ts
    - backend/src/common/services/refund.service.ts
    - backend/src/common/services/upload.service.ts
    - backend/src/common/dto/create-presigned-upload.dto.ts
    - backend/src/common/controllers/upload.controller.ts
    - backend/src/common/services/__tests__/reference.service.spec.ts
    - backend/src/common/services/__tests__/refund.service.spec.ts
    - backend/src/common/services/__tests__/upload.service.spec.ts
  modified:
    - backend/src/common/common.module.ts (registered 3 services + 1 controller)
    - backend/src/common/services/paystack.service.ts (added refundCharge)
    - backend/src/common/services/s3.service.ts (added 4 public accessors)
    - backend/package.json (+ @aws-sdk/s3-request-presigner)
decisions:
  - "Refund-reference format: `${paystackReference}-RFND` — deterministic, idempotent, no extra UUID needed"
  - "REFUND Transaction row is balance-neutral (Paystack returns money to card, not wallet ledger)"
  - "maxBytes is silently capped at HARD_CAP (25MB) instead of rejected — better UX, allowlist still enforces types"
  - "Presigned URLs valid for 15 minutes — clients re-request on timeout, no server-side renewal"
  - "Use SELECT FOR UPDATE on buyer wallet during REFUND write even though balance is unchanged (defense-in-depth aligned with CLAUDE.md wallet-locking convention)"
  - "Refactor of 6 inline ISY reference generators in wallet/marketplace/stays/studio/events is OUT of scope — separate cleanup pass"
metrics:
  duration_minutes: 35
  completed: 2026-06-24
---

# Phase 9 Plan 02: Common Infrastructure — Reference/Refund/Upload Summary

Three shared backend primitives shipped together for Wave 2–4 consumption: a centralized ISY reference generator, an idempotent Paystack refund + ledger wrapper, and a presigned-PUT upload pipeline (service + controller + DTO) that works against both AWS S3 and Cloudflare R2.

## Tasks Executed

| Task | Name                                                                          | Commit  |
| ---- | ----------------------------------------------------------------------------- | ------- |
| 1    | ReferenceService — central ISY-PREFIX-12char generator                        | f2e04b0 |
| 2    | RefundService — idempotent Paystack refund + REFUND Transaction row            | ce6498e |
| 3    | UploadService + UploadController + presigner dep + S3Service accessors        | 4d2ccae |
| 4    | Register services + controller in CommonModule (@Global)                       | 1cd12dd |

## Key Contracts

### ReferenceService

- `generate(prefix: ReferencePrefix): string` → `ISY-<PREFIX>-<12char uppercase hex>` matching CLAUDE.md naming convention. Supports all 7 known prefixes: FUND / TKT / STY / ORD / ESC / SBO / TOUR.
- `generateEscrow(): string` → `ISY-ESC-<8char>` (escrow uses an 8-char tail per CLAUDE.md).
- Pure helper — no DB, no I/O. Tested with regex assertions on tail length + uppercase hex.

### RefundService

**Idempotency contract:** The refund reference is `${input.paystackReference}-RFND` (deterministic suffix). The Prisma `Transaction.reference` column is `@unique`, so a duplicate insert is impossible. A second invocation with the same `paystackReference` short-circuits at the `findUnique` check, returns the existing record, and does NOT call Paystack again.

**Balance neutrality:** The REFUND ledger row is written with `balanceBefore === balanceAfter`. Paystack returns the money to the original card, not the in-app wallet, so no wallet mutation occurs. The row exists purely as an audit + idempotency marker. (If a future flow needs to credit the wallet instead — e.g. promo refund — that is a separate `creditWallet` call, NOT this service.)

**SELECT FOR UPDATE:** We still take the wallet row lock inside the `$transaction` block even though the balance is unchanged. This keeps us aligned with CLAUDE.md's wallet-locking convention and is defense-in-depth for any future code that might decide to toggle this row to also credit the wallet.

### UploadService / POST /api/v1/uploads/presigned

**Request body** (`CreatePresignedUploadDto`):
- `keyPrefix`: enum (`tour-certifications` | `review-photos` | `tour-covers` | `avatars` | `misc`) — prevents arbitrary-path uploads
- `contentType`: enum (`image/jpeg` | `image/png` | `image/webp` | `application/pdf`)
- `maxBytes`: optional int 1..25 MB (silently capped at 25 MB; default 5 MB)

**Response** (`PresignedUploadResult`): `{ uploadUrl, key, publicUrl, expiresIn: 900, maxBytes }`

**Security**:
- Object key is server-generated as `${keyPrefix}/${userId}/${uuid}.${ext}` — `userId` comes from the JWT via `@CurrentUser()`, never from the request body. Users cannot overwrite other users' files.
- 15-minute URL expiry (constant). Clients re-request a new URL on timeout — no server-side renewal.
- Defense-in-depth: contentType allowlist is enforced in both the DTO validator AND the service itself, so direct service calls from other modules cannot bypass the check.

**Two-step client flow** (Wave 2–4 consumers use this):
1. POST `/uploads/presigned` with `{ keyPrefix, contentType, maxBytes? }` → receive `{ uploadUrl, publicUrl, ... }`.
2. PUT the file bytes to `uploadUrl` with `Content-Type: <same contentType>` (direct to S3/R2, bytes never traverse the NestJS process).
3. POST the resulting `publicUrl` back to the resource-create endpoint (e.g. `PATCH /tour-guides` with `certifications: [publicUrl]`).

**S3 vs R2 compatibility:** Uses the same `S3Client` + `PutObjectCommand` + `getSignedUrl` pattern for both providers via the new public accessors on `S3Service` (`getMode/getBucket/getClient/getCdnBase`). No code branching — S3Service already auto-detects from env vars.

## Verification Truths Confirmed

- `cd backend && npx tsc --noEmit` → clean (no errors).
- All 3 new specs pass: **18 tests green** total (4 ReferenceService + 5 RefundService + 9 UploadService).
- `grep -c "ReferenceService\|RefundService\|UploadService" backend/src/common/common.module.ts` → 9 (3 names × 3 occurrences each: import + providers + exports).
- `grep -c "UploadController" backend/src/common/common.module.ts` → 2 (import + controllers[]).
- `grep -c "@aws-sdk/s3-request-presigner" backend/package.json` → 1 (dep installed at ^3.1075.0).
- `grep -c "/transaction/refund" backend/src/common/services/paystack.service.ts` → 2 (URL + JSDoc).
- Reference regex matches CLAUDE.md: spec verifies `/^ISY-TOUR-[A-F0-9]{12}$/` and `/^ISY-ESC-[A-F0-9]{8}$/`.

## Deviations from Plan

### Out-of-scope environment recovery (not deviations but worth noting)

- **Worktree had no `node_modules`** — fresh checkout required `npm install` at the workspace root and `npx prisma generate` in `backend/` before `tsc`/`jest` could run. Done as Rule 3 (blocking issue). Did not modify any source.
- **Pre-existing test-suite breakage NOT touched:** `cd backend && npx jest` reports ~22 of 24 test suites failing with `Cannot find module '@nestjs/testing'`. Root cause: `package.json` declares `@nestjs/testing@^11.1.20` (Nest 11) while `@nestjs/core` is `^10.3.0` — npm silently skips the install on peer mismatch. This is a pre-existing repo health issue, NOT caused by this plan, and is explicitly out of scope (deviation rules: only auto-fix issues directly caused by current task changes). My 3 new specs do NOT import `@nestjs/testing` and pass cleanly in isolation. Logged for follow-up.

### Intentional adjustments

- **`uuid` literal used in RefundService refund reference (no UUID tail):** The plan's interface comment suggested `ISY-FUND-RFND-<12char>`. I implemented the simpler deterministic `${paystackReference}-RFND` (e.g. `ISY-TOUR-ABC123DEF456-RFND`) because:
  1. Idempotency via `findUnique` requires a deterministic key derived from the input — adding a fresh UUID tail would break replay-safety.
  2. It directly ties the refund record to the original charge in any log or query, no JOIN needed.
  3. The plan's spec acceptance criterion ("idempotent: replay returns existing record") is only satisfiable with a deterministic reference.
- **Spec count is 5 (not 4) for RefundService:** Added an extra `NotFoundException when buyer wallet does not exist` test for the defense-in-depth path inside `$transaction`. The plan called for 4 tests minimum.
- **Spec count is 9 (not 7) for UploadService:** Added two extra tests for non-positive `maxBytes` rejection and CDN-base happy path, covering both branches of the publicUrl construction.
- **JSDoc & ApiProperty annotations added** to controller/DTO beyond the bare-bones plan template, matching the rest of the codebase's NestJS Swagger conventions.

## Known Stubs

None. PaystackService.refundCharge has a development stub when `PAYSTACK_SECRET_KEY` is missing (returns `{ id: 'stub_<reference>', status: 'pending' }`) — this is intentional, matches the existing `resolveBvn` stub pattern, and lets RefundService still write the audit row in dev/CI environments without requiring live Paystack credentials. Production must set the env var.

## Threat Flags

None. New surface is restricted to the existing common services boundary; the one new endpoint (POST /api/v1/uploads/presigned) is JwtAuthGuard-protected, takes a strictly validated DTO, and produces server-controlled object keys scoped to the authenticated user's ID — no new trust-boundary surface beyond what Phase 9 already plans for.

## Downstream Consumers

The two-step upload flow (presign → PUT → submit publicUrl) is consumed by:
- **09-03** TourGuide certifications (`certifications: [publicUrl]` on profile PATCH)
- **09-08** Review photos (`photos: [publicUrl]` on review create)
- **09-09** Tour cover image upload

`ReferenceService.generate('TOUR')` is consumed by **09-05** tour booking. `RefundService.refund(...)` is consumed by **09-06** settlement engine rollback path.

## Out-of-Scope Follow-Up

Consolidating the 6 inline `uuidv4().replace(/-/g, '').slice(0, 12).toUpperCase()` references in wallet / marketplace / stays / studio / events to use the new `ReferenceService` is **not** part of this plan. The helper is opt-in; existing call sites continue to work. A future cleanup pass should refactor them to remove the duplication.

## Self-Check: PASSED

- `backend/src/common/services/reference.service.ts` — FOUND
- `backend/src/common/services/refund.service.ts` — FOUND
- `backend/src/common/services/upload.service.ts` — FOUND
- `backend/src/common/controllers/upload.controller.ts` — FOUND
- `backend/src/common/dto/create-presigned-upload.dto.ts` — FOUND
- `backend/src/common/services/__tests__/reference.service.spec.ts` — FOUND
- `backend/src/common/services/__tests__/refund.service.spec.ts` — FOUND
- `backend/src/common/services/__tests__/upload.service.spec.ts` — FOUND
- Commit f2e04b0 — FOUND
- Commit ce6498e — FOUND
- Commit 4d2ccae — FOUND
- Commit 1cd12dd — FOUND
