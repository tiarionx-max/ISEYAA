---
phase: 21
slug: low-risk-grpc-extraction-news-waitlist-reviews-scoped-delive
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-20
---

# Phase 21 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 29.7.x + ts-jest (backend) |
| **Config file** | `backend/jest.config.js` — `roots: ['<rootDir>', '<rootDir>/../scripts', '<rootDir>/../apps']` already scans `apps/*/src/__tests__` for any new service's specs, no config change needed |
| **Quick run command** | `cd backend && npx jest src/modules/news-client --silent` (adapt path per new client module) |
| **Full suite command** | `cd backend && npm test` |
| **Estimated runtime** | ~60-90 seconds (existing backend suite) |

---

## Sampling Rate

- **After every task commit:** Run `cd backend && npx jest <changed-module-path> --silent`
- **After every plan wave:** Run `cd backend && npm test`
- **Before `/gsd-verify-work`:** Full unit suite green + each of the 4 new services' Docker build succeeds locally + Railway health-check-gated deploy succeeds (manual, per `docs/blue-green-cutover-runbook.md`)
- **Max feedback latency:** ~90 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 21-XX-XX | TBD | 0 | GRPC-08 (News) | — | `NewsClientService.findLatest` returns identical shape to current `NewsService.findLatest`, canary-gated, resilience-wrapped | unit | `npx jest src/modules/news-client/__tests__/news-client.service.spec.ts` | ❌ W0 | ⬜ pending |
| 21-XX-XX | TBD | 0 | GRPC-08 (Waitlist) | — | `WaitlistClientService.join`/`stats` preserve REST shape (stats fan-out per D-08) | unit | `npx jest src/modules/waitlist-client/__tests__/waitlist-client.service.spec.ts` | ❌ W0 | ⬜ pending |
| 21-XX-XX | TBD | 0 | GRPC-08 (Reviews) | — | `ReviewsClientService.createReview`/`findByTarget` preserve REST shape (enrichment + in-memory pagination per D-08; admin queue + resolveFlag stay in-process per D-07) | unit | `npx jest src/modules/reviews-client/__tests__/reviews-client.service.spec.ts` | ❌ W0 | ⬜ pending |
| 21-XX-XX | TBD | 0 | GRPC-07 (Delivery OTP) | — | `DeliveryOtpClientService.verifyOtp` preserves current `BadRequestException` messages for wrong/expired/locked OTP, `ServiceUnavailableException` only on transport failure | unit | `npx jest src/modules/delivery-otp-client/__tests__/delivery-otp-client.service.spec.ts` | ❌ W0 | ⬜ pending |
| 21-XX-XX | TBD | 0 | GRPC-08 (News/Waitlist/Reviews) | — | Each new gRPC controller's `@GrpcMethod` handlers correctly delegate to the unmodified domain service | unit | `npx jest apps/news-service`, `apps/waitlist-service`, `apps/reviews-service` | ❌ W0 | ⬜ pending |
| 21-XX-XX | TBD | 0 | GRPC-07 (Delivery OTP) | — | `delivery-otp-service`'s gRPC controller correctly delegates to `DeliveryService.verifyOtp` | unit | `npx jest apps/delivery-otp-service` | ❌ W0 | ⬜ pending |
| 21-XX-XX | TBD | — | Success Criteria #3 (all 4) | — | Each service's `grpc.health.v1.Health` + HTTP `/healthz` respond correctly before go-live | unit + manual | `npx jest apps/<service>` (mirrors `grpc-health.spec.ts`/`health.controller.spec.ts`); Railway `healthcheckPath`-blocks-promotion behavior is manual-only per runbook | ❌ W0 | ⬜ pending |
| 21-XX-XX | TBD | — | All | — | REST-facing controller endpoints (News/Waitlist/Reviews GET/POST, Delivery verify-otp PATCH) still return identical response shapes end-to-end | manual | No existing e2e suite targets these 4 domains — response-shape assertions added to the manual/smoke QA pass accompanying each staggered rollout step | ❌ W0 gap | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

*Task IDs are TBD pending planner output — this map anchors requirement→test coverage; the planner should populate concrete Task IDs and Plan numbers when it creates PLAN.md files.*

---

## Wave 0 Requirements

- [ ] `backend/src/modules/news-client/__tests__/news-client.service.spec.ts` — mirror `notifications-client.service.spec.ts` structure exactly
- [ ] `backend/src/modules/waitlist-client/__tests__/waitlist-client.service.spec.ts` — plus explicit stats-fan-out assertion (D-08)
- [ ] `backend/src/modules/reviews-client/__tests__/reviews-client.service.spec.ts` — plus enrichment assertions (photos/user embed, in-memory pagination per D-08) and confirmation that admin-queue + resolveFlag routes bypass the gRPC client entirely (D-07)
- [ ] `backend/src/modules/delivery-otp-client/__tests__/delivery-otp-client.service.spec.ts` — plus business-exception-vs-transport-exception mapping assertions (wrong/expired/locked OTP → 400, transport failure → 503)
- [ ] `backend/apps/news-service/src/__tests__/health.controller.spec.ts` + `grpc-health.spec.ts` — copy from `notifications-service` verbatim, adjust service name in test descriptions only
- [ ] `backend/apps/waitlist-service/src/__tests__/health.controller.spec.ts` + `grpc-health.spec.ts` — same
- [ ] `backend/apps/reviews-service/src/__tests__/health.controller.spec.ts` + `grpc-health.spec.ts` — same
- [ ] `backend/apps/delivery-otp-service/src/__tests__/health.controller.spec.ts` + `grpc-health.spec.ts` — same
- [ ] Framework install: none — Jest/ts-jest already configured and already scans `apps/*/src/__tests__` per `backend/jest.config.js`'s `roots` array

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Railway `healthcheckPath`-gated promotion actually blocks traffic cutover until `/healthz` is green | Success Criteria #3 | No automated harness drives Railway's deploy/promotion pipeline (per Phase 20's existing "known manual-only checks" caveat, applies identically here) | Follow `docs/blue-green-cutover-runbook.md` per-service: deploy behind canary flag off, confirm `/healthz` green in Railway dashboard, flip canary flag, bake for the runbook's bake period, confirm no error-rate/latency regression before proceeding to next service |
| REST response shape is byte-for-byte unchanged for News/Waitlist/Reviews/Delivery-OTP endpoints as observed by web/mobile clients | GRPC-07, GRPC-08 (Success Criteria #1, #2) | No e2e suite exists for these 4 domains today (only `test:e2e:tours` and `test:e2e:settlement-splits`) | Manual smoke pass per staggered rollout step: hit each REST endpoint before and after the canary flip, diff response JSON shape (not just status code) |
| Waitlist stats fan-out and Reviews in-memory pagination hold up at realistic data volumes (D-08 sizing check) | GRPC-08 | Requires real production-like row counts, not something research/unit tests can size | Query current `waitlistEntry` count per source and `review` count per target in staging/production before go-live; if either is large enough to risk the P95 < 500ms constraint, flag as a follow-up (e.g., proto amendment request) rather than shipping silently |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 90s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
