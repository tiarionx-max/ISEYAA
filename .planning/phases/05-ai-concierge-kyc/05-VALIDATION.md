---
phase: 5
slug: ai-concierge-kyc
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-16
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 29.7.x + ts-jest 29.1.x |
| **Config file** | `backend/jest.config.js` |
| **Quick run command** | `cd backend && npm test -- --testPathPattern=ai.service --passWithNoTests` |
| **Full suite command** | `cd backend && npm test` |
| **Estimated runtime** | ~45 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd backend && npm test -- --testPathPattern=ai.service --passWithNoTests`
- **After every plan wave:** Run `cd backend && npm test`
- **Before `/gsd-verify-work`:** Full suite must be green (226+ tests)
- **Max feedback latency:** 45 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 05-01-01 | 01 | 1 | AI-02, AI-03, KYC-01 | T-05-01 | Schema push + seeds — no data loss | integration | `cd backend && npx prisma db push` | ✅ | ⬜ pending |
| 05-02-01 | 02 | 2 | AI-03 | T-05-02 | AES-256-GCM round-trip: encrypt → decrypt returns original | unit | `cd backend && npm test -- --testPathPattern=encryption.service` | ❌ W0 | ⬜ pending |
| 05-02-02 | 02 | 2 | AI-02 | T-05-03 | VectorService.upsertInteraction calls Index.upsert with userId filter | unit | `cd backend && npm test -- --testPathPattern=vector.service` | ❌ W0 | ⬜ pending |
| 05-03-01 | 03 | 3 | AI-03, KYC-01 | T-05-04 | BVN verify: duplicate rejected with ConflictException | unit | `cd backend && npm test -- --testPathPattern=kyc.service` | ❌ W0 | ⬜ pending |
| 05-03-02 | 03 | 3 | AI-03, KYC-02 | T-05-04 | BVN verify: plaintext NOT stored — only encrypted ciphertext + hash | unit | same | ❌ W0 | ⬜ pending |
| 05-03-03 | 03 | 3 | AI-03, KYC-01 | T-05-05 | Wallet tier limit reads from PlatformConfig, not hardcoded | unit | `cd backend && npm test -- --testPathPattern=wallet.service` | ❌ W0 | ⬜ pending |
| 05-04-01 | 04 | 4 | AI-01 | T-05-06 | streamChatWithTools emits text + tool_use SSE chunks | unit | `cd backend && npm test -- --testPathPattern=ai.service` | ✅ (extend) | ⬜ pending |
| 05-04-02 | 04 | 4 | AI-02 | T-05-07 | VectorService.getPersonalisedContext returns recommendations for userId | unit | `cd backend && npm test -- --testPathPattern=vector.service` | ❌ W0 | ⬜ pending |
| 05-04-03 | 04 | 4 | AI-04 | — | Driver status polling in mobile driver.tsx reflects APPROVED in real-time | manual | n/a — manual admin approval flow | manual-only | ⬜ pending |
| 05-05-01 | 05 | 5 | AI-05, AI-01 | — | Mobile ai-chat.tsx renders FlatList, streaming token appends in-place | manual | n/a — React Native UI | manual-only | ⬜ pending |
| 05-06-01 | 06 | 6 | KYC-01, KYC-02, KYC-03 | — | KYC screen 3-tier progression, locked → active → pending → verified | manual | n/a — React Native UI | manual-only | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `backend/src/common/services/__tests__/encryption.service.spec.ts` — AES-256-GCM round-trip tests (AI-03)
- [ ] `backend/src/common/services/__tests__/vector.service.spec.ts` — Upstash Vector stub tests (AI-02)
- [ ] Extend `backend/src/modules/users/__tests__/kyc.service.spec.ts` — BVN/NIN verify + duplicate + encryption (AI-03, KYC-01, KYC-02)
- [ ] Extend `backend/src/modules/wallet/__tests__/wallet.service.spec.ts` — PlatformConfig tier limits (AI-03)
- [ ] `.env.example` additions: `UPSTASH_VECTOR_REST_URL`, `UPSTASH_VECTOR_REST_TOKEN`, `ENCRYPTION_KEY`, `DOJAH_API_KEY`, `SMILE_IDENTITY_PARTNER_ID`
- [ ] Prisma schema: `bvnEncrypted`, `bvnHash`, `ninEncrypted`, `ninHash`, `kycBvnVerifiedAt`, `kycNinVerifiedAt`, `kycLivenessVerifiedAt`, `kycTier` on User model
