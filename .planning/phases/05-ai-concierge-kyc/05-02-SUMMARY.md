---
phase: 05-ai-concierge-kyc
plan: "02"
subsystem: backend/common + backend/users
tags: [encryption, kyc, vector, aes-256-gcm, dojah, paystack, upstash]
dependency_graph:
  requires: [05-01]
  provides: [EncryptionService, VectorService, DojahService, PaystackService.resolveBvn, KycService-skeleton]
  affects:
    - backend/src/common/services/encryption.service.ts
    - backend/src/common/services/vector.service.ts
    - backend/src/common/services/dojah.service.ts
    - backend/src/common/services/paystack.service.ts
    - backend/src/common/common.module.ts
    - backend/src/modules/users/kyc.service.ts
    - backend/src/modules/users/users.module.ts
    - backend/src/common/services/__tests__/encryption.service.spec.ts
tech_stack:
  added: []
  patterns: [aes-256-gcm-encrypt-decrypt, upstash-vector-stub-fallback, dojah-nin-stub-fallback, tdd-red-green]
key_files:
  created:
    - backend/src/common/services/encryption.service.ts
    - backend/src/common/services/vector.service.ts
    - backend/src/common/services/dojah.service.ts
    - backend/src/modules/users/kyc.service.ts
    - backend/src/common/services/__tests__/encryption.service.spec.ts
  modified:
    - backend/src/common/services/paystack.service.ts
    - backend/src/common/common.module.ts
    - backend/src/modules/users/users.module.ts
decisions:
  - "EncryptionService throws on startup rather than logging a warning — cryptographic errors must halt, not degrade silently"
  - "VectorService.upsertInteraction is fire-and-forget (try/catch, never throws) — vector downtime must not take down the SSE chat path"
  - "KycService methods throw NotImplementedException with explicit plan reference — clear seam for 05-03"
  - "PaystackService.resolveBvn re-throws BadRequestException (not the raw axios error) so callers get a clean HTTP 400"
metrics:
  duration: "18m"
  completed: "2026-05-16"
  tasks: 2
  files: 8
---

# Phase 5 Plan 02: Foundational Services (Encryption, Vector, Dojah, KYC Skeleton) Summary

AES-256-GCM encryption, Upstash Vector client, Dojah NIN client, and PaystackService BVN extension implemented and globally registered. All external dependencies fall back to clearly-tagged stubs when env vars are absent. KycService skeleton wired into UsersModule as the seam for 05-03.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 (RED) | EncryptionService failing tests | d7d3a86 | encryption.service.spec.ts |
| 1 (GREEN) | EncryptionService implementation | 3bddb4e | encryption.service.ts |
| 2 | VectorService + DojahService + PaystackService.resolveBvn + KycService + module wiring | 59c17af | vector.service.ts, dojah.service.ts, paystack.service.ts, common.module.ts, kyc.service.ts, users.module.ts |

## Services Created

### EncryptionService (`backend/src/common/services/encryption.service.ts`)

AES-256-GCM symmetric encryption for BVN/NIN PII storage.

- Storage format: `iv_hex:authTag_hex:ciphertext_hex` (all hex-encoded)
- Random 12-byte IV per `encrypt()` call — identical plaintexts produce different ciphertexts
- `decrypt()` throws on GCM auth-tag mismatch (tamper-evident)
- Constructor throws `Error('ENCRYPTION_KEY must be 64 hex chars (32 bytes)')` if key is missing or wrong length
- No logger — cryptographic failures always throw, never swallowed

### VectorService (`backend/src/common/services/vector.service.ts`)

Upstash Vector client for AI chat personalisation.

- Stub log: `[UPSTASH VECTOR STUB] vector personalisation disabled — set UPSTASH_VECTOR_REST_URL/TOKEN to enable`
- `upsertInteraction(userId, message, response)` — fire-and-forget, catches all errors, never throws
- `getPersonalisedContext(userId, currentMessage)` — returns `''` when index is null or on error
- Namespace: `'user-interactions'` on all calls
- Filter injection guard comment: userId comes from JWT, never user input

### DojahService (`backend/src/common/services/dojah.service.ts`)

NIN verification via Dojah API with stub fallback.

- Stub log: `[DOJAH STUB] NIN verification stub mode (no DOJAH_API_KEY) — returning verified:true`
- Stub return: `{ verified: true, name: 'Stub User' }`
- Live path: `GET https://api.dojah.io/api/v1/kyc/nin` with `AppId` + `Authorization` headers
- NIN value is never logged (PII constraint per CLAUDE.md / T-05-04)
- On error: throws `BadRequestException('NIN verification failed')`

### PaystackService.resolveBvn (`backend/src/common/services/paystack.service.ts`)

BVN resolution via Paystack bank API.

- Stub log: `[PAYSTACK STUB] BVN verification stub mode (no PAYSTACK_SECRET_KEY) — returning verified:true`
- Stub return: `{ verified: true, firstName: 'Stub', lastName: 'User' }`
- Live path: `GET https://api.paystack.co/bank/resolve_bvn/{bvn}` with Bearer auth
- BVN value is never logged (PII constraint per CLAUDE.md / T-05-04)
- On error: throws `BadRequestException('BVN verification failed')`

### KycService (`backend/src/modules/users/kyc.service.ts`)

Skeleton only — three method stubs for Wave 3 implementation.

- `verifyBvn(userId, bvn)` — throws `NotImplementedException('Phase 5 plan 03 implements this')`
- `verifyNin(userId, nin)` — throws `NotImplementedException('Phase 5 plan 03 implements this')`
- `completeLiveness(userId)` — throws `NotImplementedException('Phase 5 plan 03 implements this')`
- Constructor injects PrismaService, EncryptionService, PaystackService, DojahService, ConfigService

## Module Wiring

### CommonModule diff (`backend/src/common/common.module.ts`)

Three new providers + exports added (alphabetical):

```
providers: [DojahService, EncryptionService, ImageService, PaystackService, QrService, S3Service, SendgridService, VectorService]
exports:   [DojahService, EncryptionService, ImageService, PaystackService, QrService, S3Service, SendgridService, VectorService]
```

### UsersModule diff (`backend/src/modules/users/users.module.ts`)

```
providers: [UsersService, KycService]
exports:   [UsersService, KycService]
```

## TDD Gate Compliance

- RED commit `d7d3a86`: `test(05-02): add failing tests for EncryptionService (AES-256-GCM)` — 10 tests, all failing
- GREEN commit `3bddb4e`: `feat(05-02): implement EncryptionService (AES-256-GCM)` — all 10 pass

## Test Results

```
Test Suites: 20 passed, 20 total
Tests:       236 passed, 236 total
```

Baseline was 226. 10 new encryption tests added, all pass. No regressions.

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

The following intentional stubs exist and are tracked for 05-03 implementation:

| Stub | File | Reason |
|------|------|--------|
| `KycService.verifyBvn` throws NotImplementedException | kyc.service.ts:28 | Full impl in 05-03 |
| `KycService.verifyNin` throws NotImplementedException | kyc.service.ts:32 | Full impl in 05-03 |
| `KycService.completeLiveness` throws NotImplementedException | kyc.service.ts:36 | Full impl in 05-03 |

These stubs are intentional design points (clear seams for 05-03), not missing functionality — the plan's goal (globally available services + KycService skeleton) is fully achieved.

## Threat Surface Scan

No new network endpoints or auth paths introduced. Services added make outbound HTTP calls only (Dojah, Paystack) — these are within the existing trust boundary documented in the plan's `<threat_model>`. All threat mitigations from the plan are implemented:

| Threat ID | Status |
|-----------|--------|
| T-05-04 (BVN/NIN in logs) | Mitigated — no PII logged in any service method |
| T-05-05 (GCM auth-tag tamper) | Mitigated — `decrypt()` throws on tamper; verified by test |
| T-05-06 (filter injection via userId) | Mitigated — comment added in VectorService above filter line |
| T-05-07 (ENCRYPTION_KEY in git) | Pre-existing mitigation — .env.example placeholder; .env gitignored |
| T-05-08 (Upstash downtime) | Mitigated — upsertInteraction is fire-and-forget; getPersonalisedContext returns '' on error |

## Self-Check: PASSED

- [x] backend/src/common/services/encryption.service.ts — created
- [x] backend/src/common/services/vector.service.ts — created
- [x] backend/src/common/services/dojah.service.ts — created
- [x] backend/src/common/services/paystack.service.ts — extended with resolveBvn
- [x] backend/src/common/common.module.ts — exports DojahService, EncryptionService, VectorService
- [x] backend/src/modules/users/kyc.service.ts — created
- [x] backend/src/modules/users/users.module.ts — exports KycService
- [x] backend/src/common/services/__tests__/encryption.service.spec.ts — 10 tests, all pass
- [x] Commit d7d3a86 (RED), 3bddb4e (GREEN), 59c17af (Task 2) all in git log
- [x] 236 backend tests pass (226 baseline + 10 new)
