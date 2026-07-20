---
phase: 21
slug: low-risk-grpc-extraction-news-waitlist-reviews-scoped-delive
status: draft
nyquist_compliant: true
wave_0_complete: true
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
- **Before `/gsd-verify-work`:** Full unit suite green + each of the 4 new services' Docker build succeeds locally + Railway health-check-gated deploy succeeds (manual, per `docs/blue-green-cutover-runbook.md`) + both D-08 sizing-gate checkpoints (21-03 Task 3, 21-05 Task 4) recorded PASS
- **Max feedback latency:** ~90 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 21-01 Task 1 | 21-01 | 1 | GRPC-07, GRPC-08 | — | resilience.types.ts/nest-cli.json/package.json register the 4 new gRPC vendors and service projects | unit | `npx tsc --noEmit -p tsconfig.json` | ✅ | ⬜ pending |
| 21-01 Task 2 | 21-01 | 1 | GRPC-07, GRPC-08 | T-21-01-01, T-21-01-02 | .env.example/docker-compose.yml/runbook wire all 4 new services consistently | unit | `docker compose -f docker-compose.yml config` | ✅ | ⬜ pending |
| 21-02 Task 1 | 21-02 | 2 | GRPC-08 (News) | T-21-02-01 | `news-service`'s `@GrpcMethod` handler delegates unmodified to `NewsService.findLatest`; health endpoints respond | unit | `npx nest build news-service && npx jest apps/news-service --silent` | ✅ | ⬜ pending |
| 21-02 Task 2 | 21-02 | 2 | GRPC-08 (News) | T-21-02-01, T-21-02-02 | `NewsClientService.findLatest` returns identical shape to current `NewsService.findLatest`, canary-gated, resilience-wrapped | unit | `npx jest src/modules/news-client --silent` | ✅ | ⬜ pending |
| 21-03 Task 1 | 21-03 | 3 | GRPC-08 (Waitlist) | T-21-03-01 | `waitlist-service`'s `@GrpcMethod` handlers (`JoinWaitlist`, `GetWaitlistStats`) delegate unmodified to `WaitlistService`; health endpoints respond | unit | `npx nest build waitlist-service && npx jest apps/waitlist-service --silent` | ✅ | ⬜ pending |
| 21-03 Task 2 | 21-03 | 3 | GRPC-08 (Waitlist) | T-21-03-02, T-21-03-03 | `WaitlistClientService.join`/`stats` preserve REST shape (stats fan-out per D-08) | unit | `npx jest src/modules/waitlist-client --silent` | ✅ | ⬜ pending |
| 21-03 Task 3 | 21-03 | 3 | GRPC-08 (Waitlist), D-08 | T-21-03-04 | D-08 sizing gate: waitlistEntry-per-source volumes confirmed safe against P95 < 500ms before canary flip | manual (checkpoint:human-verify, blocking) | Operator runs the `SELECT source, COUNT(*) FROM "WaitlistEntry" GROUP BY source` query per Task 3's `<how-to-verify>` and records PASS/FAIL | N/A (gate, not a file) | ⬜ pending |
| 21-04 Task 1 | 21-04 | 4 | GRPC-08 (Reviews) | T-21-04-01, T-21-04-03 | `reviews-service`'s `@GrpcMethod` handlers (`CreateReview`, `ListReviews`) delegate unmodified to `ReviewsService`/direct Prisma; `ResolveReviewFlag` correctly absent per D-07; health endpoints respond | unit | `npx nest build reviews-service && npx jest apps/reviews-service --silent` | ✅ | ⬜ pending |
| 21-04 Task 2 | 21-04 | 4 | GRPC-08 (Reviews) | T-21-04-02 | `ReviewsAdminController` isolated into `reviews-admin.module.ts`, never wholesale-imported into `reviews-service` | unit | `npx tsc --noEmit -p tsconfig.json && npx jest src/modules/reviews --silent` | ✅ | ⬜ pending |
| 21-05 Task 1 | 21-05 | 5 | GRPC-08 (Reviews) | T-21-05-01, T-21-05-02, T-21-05-03 | `ReviewsClientService.createReview`/`findByTarget` preserve REST shape (photos write-back, user embed, in-memory pagination per D-08); admin queue + resolveFlag confirmed absent (D-07) | unit | `npx jest src/modules/reviews-client --silent` | ✅ | ⬜ pending |
| 21-05 Task 2 | 21-05 | 5 | GRPC-08 (Reviews) | — | `ReviewsController` swapped to `ReviewsClientService`; monolith compiles with `ReviewsClientModule` + `ReviewsAdminModule`, no bare `ReviewsModule` import | unit | `npx tsc --noEmit -p tsconfig.json && npx jest src/modules/reviews src/modules/reviews-client --silent` | ✅ | ⬜ pending |
| 21-05 Task 3 | 21-05 | 5 | GRPC-08 (Reviews) | — | Full behavioral test coverage matching Task 1's `<behavior>` contract | unit | `npx jest src/modules/reviews-client --silent` | ✅ | ⬜ pending |
| 21-05 Task 4 | 21-05 | 5 | GRPC-08 (Reviews), D-08 | T-21-05-04 | D-08 sizing gate: review-count-per-target volumes confirmed safe against P95 < 500ms / 1000-row truncation before canary flip | manual (checkpoint:human-verify, blocking) | Operator runs the per-target `Review` count query per Task 4's `<how-to-verify>` and records PASS/FAIL | N/A (gate, not a file) | ⬜ pending |
| 21-06 Task 1 | 21-06 | 6 | GRPC-07 (Delivery OTP) | T-21-06-05 | `delivery-otp-service` provides `DeliveryService` directly (not a wholesale `DeliveryModule` import); `DeliveryGateway` is stubbed via provider override, never instantiated as a live Socket.IO server; health endpoints respond | unit | `npx jest apps/delivery-otp-service/src/__tests__/health.controller.spec.ts apps/delivery-otp-service/src/__tests__/grpc-health.spec.ts --silent` | ✅ | ⬜ pending |
| 21-06 Task 2 | 21-06 | 6 | GRPC-07 (Delivery OTP) | T-21-06-03, T-21-06-04 | `delivery-otp-service`'s gRPC controller correctly delegates to `DeliveryService.verifyOtp`, preserving `BadRequestException`/`NotFoundException` messages via explicit `RpcException` mapping | unit | `npx nest build delivery-otp-service && npx jest apps/delivery-otp-service --silent` | ✅ | ⬜ pending |
| 21-07 Task 1 | 21-07 | 7 | GRPC-07 (Delivery OTP) | T-21-07-02, T-21-07-03 | `DeliveryOtpClientService.verifyOtp` preserves current `BadRequestException`/`NotFoundException` messages for wrong/expired/locked OTP and missing order, `ServiceUnavailableException` only on transport failure | unit | `npx jest src/modules/delivery-otp-client --silent` | ✅ | ⬜ pending |
| 21-07 Task 2 | 21-07 | 7 | GRPC-07 (Delivery OTP) | T-21-07-01 | `DeliveryController`'s partial swap — only `verifyOtp` routed through `DeliveryOtpClientService`, every other handler unchanged | unit | `npx tsc --noEmit -p tsconfig.json && npx jest src/modules/delivery src/modules/delivery-otp-client --silent` | ✅ | ⬜ pending |
| 21-07 Task 3 | 21-07 | 7 | GRPC-07 (Delivery OTP) | — | Full round-trip business-vs-transport exception mapping (21-06 server-side RpcException codes -> 21-07 client-side HTTP exceptions) proven by tests | unit | `npx jest src/modules/delivery-otp-client --silent` | ✅ | ⬜ pending |
| — | 21-07 | 7 | Success Criteria #3 (all 4) | — | Each service's `grpc.health.v1.Health` + HTTP `/healthz` respond correctly before go-live | unit + manual | `npx jest apps/<service>` (mirrors `grpc-health.spec.ts`/`health.controller.spec.ts`, covered per-plan above); Railway `healthcheckPath`-blocks-promotion behavior is manual-only per runbook | ✅ (unit half) | ⬜ pending |
| — | 21-01..21-07 | — | All | — | REST-facing controller endpoints (News/Waitlist/Reviews GET/POST, Delivery verify-otp PATCH) still return identical response shapes end-to-end | manual | No existing e2e suite targets these 4 domains — response-shape assertions added to the manual/smoke QA pass accompanying each staggered rollout step (`docs/blue-green-cutover-runbook.md`) | N/A (manual) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

*Task IDs above reflect the finalized 7-plan set (21-01 through 21-07). "File Exists" reflects whether each task's automated verify target exists in the corresponding PLAN.md (all ✅ as of this revision); actual green/red execution status remains ⬜ pending until `/gsd-execute-phase 21` runs.*

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

All Wave 0 test files above are declared as `<files>` outputs of their corresponding Plan Task in the finalized 21-01 through 21-07 PLAN.md set (see Per-Task Verification Map).

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Railway `healthcheckPath`-gated promotion actually blocks traffic cutover until `/healthz` is green | Success Criteria #3 | No automated harness drives Railway's deploy/promotion pipeline (per Phase 20's existing "known manual-only checks" caveat, applies identically here) | Follow `docs/blue-green-cutover-runbook.md` per-service: deploy behind canary flag off, confirm `/healthz` green in Railway dashboard, flip canary flag, bake for the runbook's bake period, confirm no error-rate/latency regression before proceeding to next service |
| REST response shape is byte-for-byte unchanged for News/Waitlist/Reviews/Delivery-OTP endpoints as observed by web/mobile clients | GRPC-07, GRPC-08 (Success Criteria #1, #2) | No e2e suite exists for these 4 domains today (only `test:e2e:tours` and `test:e2e:settlement-splits`) | Manual smoke pass per staggered rollout step: hit each REST endpoint before and after the canary flip, diff response JSON shape (not just status code) |
| Waitlist stats fan-out (D-08) holds up at realistic waitlistEntry-per-source volumes | GRPC-08 | Requires real production-like row counts, not something research/unit tests can size | **Now a gated task, not a passive checklist item:** Plan 21-03 Task 3 (`checkpoint:human-verify`, blocking) — operator runs the sizing query and records PASS/FAIL before `grpc.waitlist_service.canary_enabled` is flipped in any environment |
| Reviews in-memory pagination (D-08) holds up at realistic review-count-per-target volumes | GRPC-08 | Requires real production-like row counts, not something research/unit tests can size | **Now a gated task, not a passive checklist item:** Plan 21-05 Task 4 (`checkpoint:human-verify`, blocking) — operator runs the sizing query and records PASS/FAIL before `grpc.reviews_service.canary_enabled` is flipped in any environment |
| `delivery-otp-service` never binds a live `DeliveryGateway` WebSocket server (Success Criteria #2) | GRPC-07 | Provable by code inspection + unit test of the provider graph, but the absence of a live Socket.IO listener on the deployed Railway process is confirmed operationally during the 21-06/21-07 Railway deploy step | Per `docs/blue-green-cutover-runbook.md`'s delivery-otp-service section: after deploying, confirm no `socket.io` handshake succeeds against delivery-otp-service's public/private endpoint (only `/healthz` and the gRPC port should respond) |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies (the two D-08 sizing-gate tasks are `checkpoint:human-verify` by design — they require real environment data no automated harness can source, consistent with the Manual-Only Verifications precedent already established elsewhere in this table)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify (both checkpoint tasks are immediately preceded and followed by automated-verify tasks within their own plan)
- [x] Wave 0 covers all MISSING references (all Wave 0 files are declared `<files>` outputs of a specific plan task, per the Per-Task Verification Map)
- [x] No watch-mode flags
- [x] Feedback latency < 90s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
