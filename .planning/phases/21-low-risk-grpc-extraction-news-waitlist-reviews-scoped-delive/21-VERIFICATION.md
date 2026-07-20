---
phase: 21-low-risk-grpc-extraction-news-waitlist-reviews-scoped-delive
verified: 2026-07-20T19:15:00Z
status: gaps_found
score: 8/10 must-haves verified
overrides_applied: 0
gaps:
  - truth: "Reviews extraction has zero client-visible behavior change — business-rule rejections (booking not found, not-your-booking, tour-not-ended, duplicate review) surface with their correct HTTP status/message"
    status: failed
    reason: "reviews-grpc.controller.ts's CreateReview handler calls ReviewsService.createReview() with no try/catch, so NotFoundException/ForbiddenException/BadRequestException/ConflictException thrown by the domain service are never wrapped in RpcException. NestJS's default BaseRpcExceptionFilter replaces any non-RpcException with a generic 'Internal server error' response. reviews-client.service.ts's catch block never inspects err.code — every failure (business or transport) becomes ServiceUnavailableException(503). Confirmed by independent source read: backend/apps/reviews-service/src/reviews-grpc.controller.ts:22-34 has no try/catch; backend/src/modules/reviews-client/reviews-client.service.ts:99-103 catches unconditionally into a 503. Confirmed by the test gap: reviews-client.service.spec.ts's only failure-path test uses a plain Error('UNAVAILABLE') with no .code — no test exercises a business-exception-shaped gRPC error, unlike delivery-otp-client.service.spec.ts which explicitly asserts INVALID_ARGUMENT/NOT_FOUND mapping. This matches CR-01 in 21-REVIEW.md, independently reproduced."
    artifacts:
      - path: backend/apps/reviews-service/src/reviews-grpc.controller.ts
        issue: "createReview() has no try/catch around this.reviewsService.createReview(...) — business exceptions (400/403/404/409) fall through to the default gRPC exception filter and become a generic error, unlike delivery-otp-grpc.controller.ts's explicit RpcException mapping"
      - path: backend/src/modules/reviews-client/reviews-client.service.ts
        issue: "catch block (lines 99-103) throws ServiceUnavailableException unconditionally, never inspecting err.code — a citizen reviewing a tour they don't own gets HTTP 503 instead of 403; a duplicate review gets 503 instead of 409; an early review gets 503 instead of 400 with the real reason"
    missing:
      - "Wrap NotFoundException/ForbiddenException/BadRequestException/ConflictException in RpcException with the appropriate GrpcStatus code inside reviews-grpc.controller.ts's createReview handler, mirroring delivery-otp-grpc.controller.ts's pattern"
      - "Add err?.code inspection in reviews-client.service.ts's createReview catch block, mapping INVALID_ARGUMENT/NOT_FOUND/PERMISSION_DENIED/ALREADY_EXISTS back to BadRequestException/NotFoundException/ForbiddenException/ConflictException before falling back to ServiceUnavailableException"
      - "A test asserting a business-exception-shaped gRPC error (err.code set) round-trips to the correct HTTP exception, not a 503"
  - truth: "Waitlist extraction has zero client-visible behavior change — a join request missing both email and phone still surfaces its correct HTTP 400 with the original validation message"
    status: failed
    reason: "waitlist-grpc.controller.ts's JoinWaitlist handler calls WaitlistService.join() with no try/catch, so the BadRequestException('Provide an email or phone number') thrown when both email and phone are absent is never wrapped in RpcException and is replaced by NestJS's default gRPC exception filter with a generic error. waitlist-client.service.ts's catch block never inspects err.code — every failure becomes ServiceUnavailableException(503). Confirmed by independent source read: backend/apps/waitlist-service/src/waitlist-grpc.controller.ts:11-24 has no try/catch; backend/src/modules/waitlist-client/waitlist-client.service.ts:75-80 catches unconditionally into a 503. This matches CR-02 in 21-REVIEW.md, independently reproduced."
    artifacts:
      - path: backend/apps/waitlist-service/src/waitlist-grpc.controller.ts
        issue: "joinWaitlist() has no try/catch around this.waitlistService.join(...) — the BadRequestException thrown for missing email/phone is never wrapped in RpcException"
      - path: backend/src/modules/waitlist-client/waitlist-client.service.ts
        issue: "catch block (lines 75-80) throws ServiceUnavailableException unconditionally — a caller submitting POST /waitlist with neither email nor phone gets HTTP 503 instead of the correct HTTP 400 with the actionable message"
    missing:
      - "Wrap BadRequestException in RpcException({code: GrpcStatus.INVALID_ARGUMENT, message}) inside waitlist-grpc.controller.ts's joinWaitlist handler"
      - "Add err?.code === GrpcStatus.INVALID_ARGUMENT inspection in waitlist-client.service.ts's join() catch block, mapping back to BadRequestException with the original message before falling back to ServiceUnavailableException"
      - "A test asserting a business-exception-shaped gRPC error round-trips to BadRequestException with the original message, not a 503"
human_verification:
  - test: "D-08 sizing gate verdicts (21-03 Task 3, 21-05 Task 4) — confirm real production/staging WaitlistEntry-per-source and Review-per-target row counts were actually queried and pose no P95/truncation risk before flipping grpc.waitlist_service.canary_enabled / grpc.reviews_service.canary_enabled"
    expected: "SUMMARY.md files record a narrative 'PASS' verdict but include no actual query output (row counts, source breakdown) — only a claim that 'the human operator reviewed real staging/production row counts.' A human with real DB access should independently re-run the specified SQL queries and confirm the recorded PASS verdicts are accurate before any canary flag is flipped in production."
    why_human: "Requires live production/staging database access this verifier does not have; the checkpoint's own design (checkpoint:human-verify, gate=blocking) requires human judgment against real data volumes, not something inferable from source code"
  - test: "Manually exercise POST /api/v1/reviews with a booking a user doesn't own (or a duplicate review) and POST /api/v1/waitlist with neither email nor phone, against a running instance with the reviews/waitlist canary flags enabled, and confirm the actual HTTP status returned"
    expected: "Per CR-01/CR-02 and this verifier's independent code review, both currently return HTTP 503 instead of the correct 403/409 (reviews) or 400 (waitlist) — human confirmation against a live server would remove any residual doubt about NestJS's default gRPC exception filter behavior in this exact deployed configuration"
    why_human: "Requires a running server with the canary flags enabled and gRPC services live; this verifier confirmed the code path via static analysis only (matching source-level evidence explicitly cited in 21-REVIEW.md's own confirmation that BaseRpcExceptionFilter's behavior was verified by direct read of node_modules source)"
---

# Phase 21: Low-Risk gRPC Extraction — News/Waitlist/Reviews + Scoped Delivery OTP Verification Report

**Phase Goal:** Extract News, Waitlist, Reviews, and Delivery-OTP into independently-deployable gRPC microservices, following the risk-ascending order (News -> Waitlist -> Reviews -> Delivery OTP), each with a canary kill-switch and zero client-visible behavior change, mirroring the hybrid HTTP+gRPC pattern already proven by notifications-service.
**Verified:** 2026-07-20T19:15:00Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | News runs as its own Railway process, called exclusively via `ClientGrpc`, zero REST response-shape change (Roadmap SC #1, News slice) | ✓ VERIFIED | `backend/apps/news-service/` scaffolded (main.ts on `:5009`, news-grpc.controller.ts, health.controller.ts); `NewsClientService` canary+resilience-wrapped facade; `app.module.ts` imports `NewsClientModule` not `NewsModule`; `NewsService.findLatest` has zero business exceptions (pure Prisma read) so there is no exception-mapping gap to worry about here; `npx tsc --noEmit` and `npx jest apps/news-service src/modules/news-client` both pass |
| 2 | Waitlist runs as its own Railway process, called exclusively via `ClientGrpc`, zero REST response-shape change (Roadmap SC #1, Waitlist slice) | ✗ FAILED | Response *shape* is preserved (`{message, position, id}` reconstructed via Prisma count; stats fan-out reassembles the grouped array — verified in source and by 10 passing unit tests), BUT business-rule error *behavior* regresses: a join request with no email/phone gets HTTP 503 instead of 400. See gap CR-02 below. |
| 3 | Reviews runs as its own Railway process, called exclusively via `ClientGrpc`, zero REST response-shape change (Roadmap SC #1, Reviews slice) | ✗ FAILED | Response *shape* is preserved (photos write-back, user-embed enrichment, in-memory pagination all verified correct in source and by 23 passing unit tests), BUT business-rule error *behavior* regresses: ownership/duplicate/timing rejections get HTTP 503 instead of 403/409/400. See gap CR-01 below. |
| 4 | Delivery's `VerifyDeliveryOtp` RPC is served by a live, independently-deployed gRPC service; `RequestDelivery`/`AcceptDelivery`/`CompleteDelivery`/`DeliveryGateway` remain in-process; OTP verification behavior unchanged end-to-end (Roadmap SC #2) | ✓ VERIFIED | `delivery-otp-grpc.controller.ts` implements ONLY `VerifyDeliveryOtp` with explicit `RpcException` wrapping of `BadRequestException`→`INVALID_ARGUMENT` and `NotFoundException`→`NOT_FOUND`; `delivery-otp-client.service.ts`'s catch block inspects `err?.code` and re-throws the matching `BadRequestException`/`NotFoundException` with the original message, falling back to `ServiceUnavailableException` only for genuine transport failures. `app.module.ts` confirmed to NOT import `DeliveryModule`/`WalletModule`/`CommonModule`/`AuthModule`; `DeliveryGateway` is stubbed via provider-token override, never constructed as a real `@WebSocketGateway()`. `DeliveryController`'s other 7 handlers are textually unchanged. Tests pass (7+ cases including a non-business-rule numeric code test). This is the correct pattern the other two extractions should have mirrored but didn't. |
| 5 | Every service extracted in this phase passes Phase 20's health-check-gated rollout (real `/healthz`, real Railway `healthcheckPath`) (Roadmap SC #3) | ✓ VERIFIED | All 4 `apps/*-service/src/health.controller.ts` are verbatim Terminus copies; all 4 `railway.toml`s set `healthcheckPath = "/healthz"`; all 4 `grpc-health.spec.ts`/`health.controller.spec.ts` pairs pass (8 suites green) |
| 6 | Each of the 4 new services has its own independent `grpc.<service>_canary_enabled` PlatformConfig kill-switch (opt-out semantics) that short-circuits to 503 without any gRPC call when disabled | ✓ VERIFIED | All 4 `*-client.service.ts` files implement `isCanaryEnabled()` reading a distinct `CANARY_FLAG_KEY` (`grpc.news_service.canary_enabled`, `grpc.waitlist_service.canary_enabled`, `grpc.reviews_service.canary_enabled`, `grpc.delivery_otp_service.canary_enabled`) and every method checks it before calling `resilience.execute`/the gRPC client; canary-off unit tests pass for all 4 facades with explicit assertions that zero gRPC/Prisma calls occur |
| 7 | Shared scaffolding (resilience vendors, nest-cli.json, build:services, .env.example, docker-compose.yml, blue-green runbook) covers all 4 new services consistently, with zero regression to the 8 pre-existing services | ✓ VERIFIED | `resilience.types.ts` has all 4 new Vendor keys with matching tuning; `nest-cli.json` has 4 new project entries; `.env.example`/`docker-compose.yml` have all 4 `*_SERVICE_URL` placeholders/service blocks; `docs/blue-green-cutover-runbook.md` has a new `## Phase 21 Extractions` section |
| 8 | `ReviewsAdminController`'s 3 endpoints (`GET /admin/reviews/queue`, `GET /admin/reviews/flags/:id`, `POST /admin/reviews/flags/:id/resolve`) continue to work unchanged, isolated from the extracted `reviews-service` process (D-07) | ✓ VERIFIED | `reviews-admin.module.ts` created, imports `ReviewsModule` for DI, registers only `ReviewsAdminController`; `reviews-grpc.controller.ts` implements only `CreateReview`/`ListReviews`, no `ResolveReviewFlag`; `ReviewsClientService` has no `resolveFlag`/`getFlagQueue`/`getFlagById` methods (asserted by test 9 in reviews-client.service.spec.ts) |
| 9 | `DeliveryController`'s other 7 handlers (`requestDelivery`, `acceptOrder`, `declineOrder`, `collectParcel`, `completeDelivery`, `rateDelivery`, `cancelOrder`) are untouched — only `verifyOtp`'s body changed | ✓ VERIFIED | Source read of `delivery.controller.ts` confirms only `verifyOtp` was rewired to `deliveryOtpClient.verifyOtp(id, dto.otp)`; all other handlers still call `this.deliveryService.*`; `delivery.service.spec.ts`/`delivery.gateway.spec.ts` pass with no regressions |
| 10 | Full backend workspace still compiles and the phase's own test suites pass with zero regressions | ✓ VERIFIED | `cd backend && npx tsc --noEmit -p tsconfig.json` exits 0; `npx jest apps/news-service apps/waitlist-service apps/reviews-service apps/delivery-otp-service src/modules/news-client src/modules/waitlist-client src/modules/reviews-client src/modules/delivery-otp-client src/modules/reviews src/modules/delivery --silent` — 16 suites / 76 tests, all passing (independently re-run by this verifier, not taken from SUMMARY claims) |

**Score:** 8/10 truths verified (2 FAILED — both concern the same class of regression: business-rule exceptions downgraded to a generic 503 across the Reviews and Waitlist gRPC boundaries)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `backend/apps/news-service/` | Independent hybrid HTTP+gRPC app | ✓ VERIFIED | Builds, tests pass, wired into monolith via `NewsClientModule` |
| `backend/apps/waitlist-service/` | Independent hybrid HTTP+gRPC app, 2-method controller | ✓ VERIFIED (shape) / ✗ (exception mapping) | Scaffolding correct; `waitlist-grpc.controller.ts` missing `RpcException` wrapping (CR-02) |
| `backend/apps/reviews-service/` | Independent hybrid HTTP+gRPC app, CreateReview+ListReviews only | ✓ VERIFIED (shape) / ✗ (exception mapping) | Scaffolding correct, `EventEmitterModule.forRoot()` present, `ListReviews` correctly bypasses the 50-row cap; `reviews-grpc.controller.ts` missing `RpcException` wrapping (CR-01) |
| `backend/apps/delivery-otp-service/` | Independent hybrid HTTP+gRPC app, VerifyDeliveryOtp only, DeliveryGateway stubbed | ✓ VERIFIED | Correctly excludes DeliveryModule/WalletModule/CommonModule/AuthModule; DeliveryGateway stubbed; RpcException mapping present and tested |
| `backend/src/modules/news-client/news-client.service.ts` | Canary+resilience-wrapped facade | ✓ VERIFIED | Correct, no business exceptions to map (pure read) |
| `backend/src/modules/waitlist-client/waitlist-client.service.ts` | join shape reconstruction + stats fan-out | ⚠️ PARTIAL | Shape reconstruction correct; error-mapping catch block always throws generic 503 (CR-02) |
| `backend/src/modules/reviews-client/reviews-client.service.ts` | photos write-back + user-embed enrichment + in-memory pagination | ⚠️ PARTIAL | Shape reconciliation correct (photos, user embed, pagination all verified); error-mapping catch block always throws generic 503 (CR-01) |
| `backend/src/modules/delivery-otp-client/delivery-otp-client.service.ts` | canary+resilience+business/transport exception mapping | ✓ VERIFIED | Correctly maps INVALID_ARGUMENT/NOT_FOUND back to BadRequestException/NotFoundException with original message |
| `backend/src/modules/reviews/reviews-admin.module.ts` | Isolated admin module | ✓ VERIFIED | Present, correctly wired |
| `docs/blue-green-cutover-runbook.md` | 4 new per-service sections | ✓ VERIFIED | Present, existing notifications-service section unchanged |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `news.controller.ts` | `NewsClientService` | constructor injection | ✓ WIRED | Confirmed by source read |
| `waitlist.controller.ts` | `WaitlistClientService` | constructor injection | ✓ WIRED | Confirmed by source read; `RolesGuard(SUPER_ADMIN, STATE_ADMIN)` on `/waitlist/stats` unchanged |
| `reviews.controller.ts` | `ReviewsClientService` | constructor injection | ✓ WIRED | Confirmed by source read |
| `delivery.controller.ts` | `DeliveryOtpClientService` | second constructor param, only `verifyOtp` body changed | ✓ WIRED | Confirmed by source read |
| `app.module.ts` | `{News,Waitlist,Reviews}ClientModule`, `ReviewsAdminModule` | imports array | ✓ WIRED | Confirmed; no bare `NewsModule`/`WaitlistModule`/`ReviewsModule` import remains |
| `delivery.module.ts` | `DeliveryOtpClientModule` | imports array | ✓ WIRED | Confirmed; `DeliveryController` stays registered where it was |
| `reviews-grpc.controller.ts` business exceptions | `RpcException` | try/catch wrap | ✗ NOT_WIRED | No try/catch present — CR-01 |
| `waitlist-grpc.controller.ts` business exceptions | `RpcException` | try/catch wrap | ✗ NOT_WIRED | No try/catch present — CR-02 |
| `delivery-otp-grpc.controller.ts` business exceptions | `RpcException` | try/catch wrap | ✓ WIRED | Correctly implemented, contrast case proving the pattern is known and achievable |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Backend type-checks cleanly | `cd backend && npx tsc --noEmit -p tsconfig.json` | exit 0 | ✓ PASS |
| Phase 21 test suites pass | `cd backend && npx jest apps/{news,waitlist,reviews,delivery-otp}-service src/modules/{news,waitlist,reviews,delivery-otp}-client src/modules/reviews src/modules/delivery --silent` | 16 suites / 76 tests passed | ✓ PASS |
| `docker compose config` validates modified YAML | not run this session (no live Docker daemon in this environment) | — | ? SKIP |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|--------------|--------|----------|
| GRPC-07 | 21-06, 21-07 | Delivery's `VerifyDeliveryOtp` RPC extracted, zero REST behavior change; other Delivery RPCs + DeliveryGateway stay in-process | ✓ SATISFIED | Full RpcException business/transport exception mapping verified end-to-end (server + client), DeliveryGateway confirmed stubbed, other 7 DeliveryController handlers confirmed unchanged |
| GRPC-08 | 21-01 through 21-05 | News/Waitlist/Reviews extracted, own proto contracts, own Railway process, `ClientGrpc`, zero REST behavior change | ✗ BLOCKED (partial) | News fully satisfies this (no business exceptions to map). Waitlist and Reviews satisfy the process/proto/ClientGrpc/shape-preservation parts but FAIL "zero REST behavior change" on their error paths — business-rule rejections downgrade from correct 400/403/404/409 to generic 503 (CR-01, CR-02) |

Both requirement IDs from the 7 plans' frontmatter (`requirements: [GRPC-07]` in 21-01/06/07, `requirements: [GRPC-08]` in 21-01/02/03/04/05) are accounted for against REQUIREMENTS.md — no orphaned requirement IDs found for this phase.

### Anti-Patterns Found

No `TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER` markers found in any file created or modified by this phase (`backend/apps/{news,waitlist,reviews,delivery-otp}-service`, `backend/src/modules/{news,waitlist,reviews,delivery-otp}-client`, `backend/src/modules/{news,waitlist,reviews,delivery}`). The 2 CRITICAL findings (CR-01, CR-02) are not marker-based debt — they are a missing code path (absent try/catch + absent err.code inspection), confirmed by direct source reading and cross-referenced against the phase's own passing test suites, which do not exercise the missing path.

### Human Verification Required

1. **D-08 sizing gate verdicts (21-03 Task 3, 21-05 Task 4)**
   **Test:** Independently re-run the SQL queries specified in each plan's checkpoint task against real production/staging data and confirm the recorded "PASS" verdicts.
   **Expected:** Both SUMMARY.md files narrate a PASS verdict but include no actual query output — only a claim that a human operator reviewed real data. A human with DB access should confirm this before the canary flags are ever flipped.
   **Why human:** Requires live database access this verifier does not have.

2. **Live confirmation of the CR-01/CR-02 regression against a running deployment**
   **Test:** With the reviews/waitlist canary flags enabled and the gRPC services live, submit a review for a booking the user doesn't own, and a waitlist join with neither email nor phone; observe the actual HTTP status returned.
   **Expected:** Per this verifier's static analysis, both currently return 503 instead of 403/409 (reviews) or 400 (waitlist).
   **Why human:** Requires a running server; this verifier's finding is based on source-level tracing, matching the same methodology 21-REVIEW.md itself used (confirmed via direct read of the exception-handling code paths, not dynamic execution).

### Gaps Summary

The phase successfully lands the mechanical/structural side of all 4 extractions: independent Railway-deployable processes, correct proto wiring, canary kill-switches, health checks, and — critically — full response-*shape* preservation (including two genuinely hard shape gaps: Reviews' photos write-back and Waitlist's join-shape reconstruction). The backend compiles cleanly and all 16 phase-relevant test suites (76 tests) pass.

However, two of the four extractions — Reviews and Waitlist — have a real, independently-confirmed functional regression against the phase goal's explicit "zero client-visible behavior change" bar and against GRPC-08's "zero REST behavior change" requirement text: their gRPC controllers never wrap business exceptions (`NotFoundException`/`ForbiddenException`/`BadRequestException`/`ConflictException`) in `RpcException`, so NestJS's default exception filter silently downgrades every legitimate 4xx rejection to a generic 503 once the canary flag is enabled. The fourth extraction (Delivery OTP) demonstrates the correct pattern exists and was known to the phase's own authors — it just wasn't carried over to the other two. This is the same finding as 21-REVIEW.md's CR-01 and CR-02, independently reproduced here via direct source reading, exception-throw-site tracing in the underlying domain services, and confirmation that the phase's own test suites do not exercise the missing path (only generic transport errors are tested, never a business-exception-shaped gRPC error).

Both gaps are narrowly scoped (one method's catch-handling on each side of two facades) and have a proven fix pattern already in the same codebase (`delivery-otp-grpc.controller.ts` / `delivery-otp-client.service.ts`). This does not require new architecture — it requires applying the pattern that's already been built and tested once in this same phase.

---

_Verified: 2026-07-20T19:15:00Z_
_Verifier: Claude (gsd-verifier)_
