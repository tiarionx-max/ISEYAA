---
phase: 21-low-risk-grpc-extraction-news-waitlist-reviews-scoped-delive
verified: 2026-07-21T01:02:34Z
status: human_needed
score: 10/10 must-haves verified
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 8/10
  gaps_closed:
    - "Reviews extraction has zero client-visible behavior change — business-rule rejections (booking not found, not-your-booking, tour-not-ended, duplicate review) surface with their correct HTTP status/message"
    - "Waitlist extraction has zero client-visible behavior change — a join request missing both email and phone still surfaces its correct HTTP 400 with the original validation message"
  gaps_remaining: []
  regressions: []
human_verification:
  - test: "D-08 sizing gate verdicts (21-03 Task 3, 21-05 Task 4) — confirm real production/staging WaitlistEntry-per-source and Review-per-target row counts were actually queried and pose no P95/truncation risk before flipping grpc.waitlist_service.canary_enabled / grpc.reviews_service.canary_enabled"
    expected: "SUMMARY.md files record a narrative 'PASS' verdict but include no actual query output (row counts, source breakdown) — only a claim that 'the human operator reviewed real staging/production row counts.' A human with real DB access should independently re-run the specified SQL queries and confirm the recorded PASS verdicts are accurate before any canary flag is flipped in production."
    why_human: "Requires live production/staging database access this verifier does not have; the checkpoint's own design (checkpoint:human-verify, gate=blocking) requires human judgment against real data volumes, not something inferable from source code"
  - test: "Manually exercise POST /api/v1/reviews with a booking a user doesn't own (or a duplicate review) and POST /api/v1/waitlist with neither email nor phone, against a running instance with the reviews/waitlist canary flags enabled, and confirm the actual HTTP status returned is now 403/409/400 (not 503)"
    expected: "Per 21-08's code fix and this verifier's independent unit-level round-trip tests, both should now return the correct business-rule HTTP status with the original message preserved. A live end-to-end run against a deployed instance would remove any residual doubt about NestJS's runtime `@GrpcMethod`/`RpcException` behavior in the exact deployed configuration, since this verifier's confirmation is via source review + unit tests (mocked gRPC boundary), not a live gRPC round-trip."
    why_human: "Requires a running server with the canary flags enabled and gRPC services live; this verifier's evidence is source-level (code fix confirmed present and correct) plus unit tests that mock the gRPC transport layer — not an actual network round-trip through a real gRPC server"
---

# Phase 21: Low-Risk gRPC Extraction — News/Waitlist/Reviews + Scoped Delivery OTP Verification Report

**Phase Goal:** News, waitlist, reviews, and Delivery's OTP verification run as independently-deployed gRPC services with zero client-visible behavior change
**Verified:** 2026-07-21T01:02:34Z
**Status:** human_needed
**Re-verification:** Yes — after gap closure (21-08 plan)

## Goal Achievement

### Re-Verification Summary

The prior verification (2026-07-20T19:15:00Z) found 8/10 truths verified, with 2 FAILED truths sharing one root cause: `reviews-grpc.controller.ts`'s `createReview` and `waitlist-grpc.controller.ts`'s `joinWaitlist` never wrapped domain-service business exceptions in `RpcException`, so NestJS's default `BaseRpcExceptionFilter` downgraded every legitimate 4xx rejection to a generic 503 once the canary flag was enabled (CR-01, CR-02 in 21-REVIEW.md). Plan 21-08 was created and executed specifically to close these two gaps by mirroring the already-verified `delivery-otp-grpc.controller.ts` / `delivery-otp-client.service.ts` pattern.

This re-verification independently re-read all four affected source files (not the SUMMARY's claims) and confirms both fixes are present, correct, and covered by new business-exception-shaped tests — not just generic transport-error tests.

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | News runs as its own Railway process, called exclusively via `ClientGrpc`, zero REST response-shape change | ✓ VERIFIED | Regression check: `apps/news-service` + `news-client.service.spec.ts` still pass (independently re-run); no files in this area touched by 21-08 |
| 2 | Waitlist runs as its own Railway process, called exclusively via `ClientGrpc`, zero REST response-shape change | ✓ VERIFIED | **Gap closed.** `waitlist-grpc.controller.ts:20-40` now wraps `this.waitlistService.join(...)` in try/catch; `instanceof BadRequestException` → `RpcException({code: GrpcStatus.INVALID_ARGUMENT, message: err.message})`, any other error rethrown unwrapped. `waitlist-client.service.ts:83-94` catch block checks `err?.code === GrpcStatus.INVALID_ARGUMENT` → `BadRequestException(err.message)` before falling back to `ServiceUnavailableException`. Confirmed by direct source read (not SUMMARY claim). |
| 3 | Reviews runs as its own Railway process, called exclusively via `ClientGrpc`, zero REST response-shape change | ✓ VERIFIED | **Gap closed.** `reviews-grpc.controller.ts:38-66` now wraps `this.reviewsService.createReview(...)` in try/catch; `instanceof` checks for `NotFoundException`→`NOT_FOUND`, `ForbiddenException`→`PERMISSION_DENIED`, `ConflictException`→`ALREADY_EXISTS`, `BadRequestException`→`INVALID_ARGUMENT`, all wrapped in `RpcException`; any other error rethrown unwrapped. `reviews-client.service.ts:110-129` catch block checks all 4 `err?.code` values before falling back to `ServiceUnavailableException`. Confirmed by direct source read. |
| 4 | Delivery's `VerifyDeliveryOtp` RPC is served by a live, independently-deployed gRPC service; other Delivery RPCs + `DeliveryGateway` remain in-process; OTP verification behavior unchanged | ✓ VERIFIED | Regression check: `delivery-otp-grpc.controller.ts` / `delivery-otp-client.service.ts` untouched by 21-08 (confirmed via `git log`); tests still pass |
| 5 | Every service extracted in this phase passes Phase 20's health-check-gated rollout (real `/healthz`, real Railway `healthcheckPath`) | ✓ VERIFIED | Regression check: all 4 `health.controller.spec.ts` / `grpc-health.spec.ts` pairs still pass (8 suites green) |
| 6 | Each of the 4 new services has its own independent `grpc.<service>_canary_enabled` PlatformConfig kill-switch that short-circuits to 503 without any gRPC call when disabled | ✓ VERIFIED | Regression check: `isCanaryEnabled()` unchanged in both `reviews-client.service.ts` and `waitlist-client.service.ts`; canary-off tests (test 3/4 and test 4/3 respectively) still pass, asserting zero gRPC/Prisma calls |
| 7 | Shared scaffolding (resilience vendors, nest-cli.json, build:services, .env.example, docker-compose.yml, blue-green runbook) covers all 4 new services consistently | ✓ VERIFIED | Regression check: not touched by 21-08; no reason to re-verify beyond prior pass, no build/config files in the 8-file diff (`git show --stat 3754039 29eb414`) |
| 8 | `ReviewsAdminController`'s 3 endpoints continue to work unchanged, isolated from the extracted `reviews-service` process (D-07) | ✓ VERIFIED | Regression check: `git log` on `reviews-admin.module.ts` shows last commit is `09148a6` (21-04), untouched by 21-08; `reviews-client.service.spec.ts` test 9 (no `resolveFlag`/`getFlagQueue`/`getFlagById`) still passes |
| 9 | `DeliveryController`'s other 7 handlers are untouched — only `verifyOtp`'s body changed | ✓ VERIFIED | Regression check: `git log` on `delivery.controller.ts` shows last commit is `f30c369` (21-07), untouched by 21-08 |
| 10 | Full backend workspace still compiles and the phase's own test suites pass with zero regressions | ✓ VERIFIED | Independently re-run by this verifier: `cd backend && npx tsc --noEmit -p tsconfig.json` exits 0. `npx jest apps/{news,waitlist,reviews,delivery-otp}-service src/modules/{news,waitlist,reviews,delivery-otp}-client src/modules/reviews src/modules/delivery --silent` — **18 suites / 92 tests, all passing** (up from 16 suites/76 tests pre-fix; +2 new spec files, +9 new test cases across client specs) |

**Score:** 10/10 truths verified — both previously-FAILED truths (Waitlist, Reviews) closed by plan 21-08; no regressions detected in the other 8.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `backend/apps/reviews-service/src/reviews-grpc.controller.ts` | `createReview()` wraps 4 business exception types in `RpcException` with correct `GrpcStatus` codes | ✓ VERIFIED | Confirmed by direct read: imports `RpcException` from `@nestjs/microservices`, `status as GrpcStatus` from `@grpc/grpc-js`; try/catch present with `instanceof NotFoundException/ForbiddenException/ConflictException/BadRequestException` checks in that exact order, `throw err` fallthrough |
| `backend/src/modules/reviews-client/reviews-client.service.ts` | `createReview()` catch block maps `err.code` back to matching Nest HTTP exception | ✓ VERIFIED | Confirmed by direct read: 4 strict `===` checks (`NOT_FOUND`, `PERMISSION_DENIED`, `ALREADY_EXISTS`, `INVALID_ARGUMENT`) before `logger.error` + `ServiceUnavailableException` fallback |
| `backend/apps/waitlist-service/src/waitlist-grpc.controller.ts` | `joinWaitlist()` wraps `BadRequestException` in `RpcException({code: INVALID_ARGUMENT})` | ✓ VERIFIED | Confirmed by direct read: try/catch present, `instanceof BadRequestException` check, `throw err` fallthrough; `getWaitlistStats()` correctly left untouched (no try/catch, matches plan's explicit scope) |
| `backend/src/modules/waitlist-client/waitlist-client.service.ts` | `join()` catch block maps `err.code === INVALID_ARGUMENT` back to `BadRequestException` | ✓ VERIFIED | Confirmed by direct read: single strict `===` check before fallback; `stats()` correctly left untouched |
| `backend/apps/reviews-service/src/__tests__/reviews-grpc.controller.spec.ts` | New spec, business-exception-shaped tests | ✓ VERIFIED | New file exists, 6 tests: success passthrough + 4 mapped-exception round-trips (asserting `getError()` equals exact `{code, message}`) + 1 unwrapped-rethrow test. All 6 pass. |
| `backend/src/modules/reviews-client/__tests__/reviews-client.service.spec.ts` | Extended with business-exception-shaped gRPC error tests | ✓ VERIFIED | Contains tests 5-8, each using `throwError(() => ({code: GrpcStatus.X, message}))` (an object with `.code` set — not a generic `Error`), asserting the correct HTTP exception + message + that Prisma steps are skipped. Test 9 is the regression guard for codeless errors. All pass. |
| `backend/apps/waitlist-service/src/__tests__/waitlist-grpc.controller.spec.ts` | New spec, business-exception-shaped tests | ✓ VERIFIED | New file exists, 3 tests: success + mapped `BadRequestException`→`INVALID_ARGUMENT` round-trip (asserting exact `getError()`) + unwrapped-rethrow. All pass. |
| `backend/src/modules/waitlist-client/__tests__/waitlist-client.service.spec.ts` | Extended with business-exception-shaped gRPC error test | ✓ VERIFIED | Test 9 uses `throwError(() => ({code: GrpcStatus.INVALID_ARGUMENT, message}))`, asserting `BadRequestException` with preserved message and that `prisma.waitlistEntry.count` is skipped. Test 10 is the regression guard. Both pass. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `reviews-grpc.controller.ts` business exceptions | `RpcException` | try/catch wrap in `createReview()` | ✓ WIRED | Confirmed present, all 4 exception types mapped, correct `GrpcStatus` codes |
| `waitlist-grpc.controller.ts` business exceptions | `RpcException` | try/catch wrap in `joinWaitlist()` | ✓ WIRED | Confirmed present, `BadRequestException` mapped to `INVALID_ARGUMENT` |
| `reviews-client.service.ts` `err?.code` | Nest HTTP exceptions | strict `===` checks in `createReview()` catch | ✓ WIRED | All 4 codes checked before `ServiceUnavailableException` fallback |
| `waitlist-client.service.ts` `err?.code` | `BadRequestException` | strict `===` check in `join()` catch | ✓ WIRED | `INVALID_ARGUMENT` checked before `ServiceUnavailableException` fallback |
| `delivery-otp-grpc.controller.ts` business exceptions (reference pattern) | `RpcException` | try/catch wrap | ✓ WIRED | Unaffected by 21-08, still correct (regression check) |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Backend type-checks cleanly | `cd backend && npx tsc --noEmit -p tsconfig.json` | exit 0 | ✓ PASS |
| Phase 21 test suites pass (incl. delivery-otp, news for regression) | `cd backend && npx jest apps/{news,waitlist,reviews,delivery-otp}-service src/modules/{news,waitlist,reviews,delivery-otp}-client src/modules/reviews src/modules/delivery --silent` | 18 suites / 92 tests passed | ✓ PASS |
| Only the 8 declared files were touched by 21-08 (no collateral edits to admin/delivery-controller code) | `git show --stat 3754039 29eb414` | 4 files per commit, 8 total, matching plan's `files_modified` exactly | ✓ PASS |
| Both task commits present in git history | `git log --oneline` | `3754039` (Task 1, CR-01), `29eb414` (Task 2, CR-02) both present | ✓ PASS |
| `docker compose config` validates modified YAML | not run this session (no live Docker daemon in this environment; no YAML touched by 21-08 anyway) | — | ? SKIP |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|--------------|--------|----------|
| GRPC-07 | 21-06, 21-07 | Delivery's `VerifyDeliveryOtp` RPC extracted, zero REST behavior change; other Delivery RPCs + DeliveryGateway stay in-process | ✓ SATISFIED | Unchanged from prior verification — full RpcException business/transport exception mapping verified end-to-end, DeliveryGateway stubbed, other 7 handlers unchanged. Not affected by 21-08. |
| GRPC-08 | 21-01 through 21-05, 21-08 | News/Waitlist/Reviews extracted, own proto contracts, own Railway process, `ClientGrpc`, zero REST behavior change | ✓ SATISFIED | **Upgraded from BLOCKED (partial) to SATISFIED.** News was already fully satisfied. Waitlist and Reviews now also satisfy "zero REST behavior change" on their error paths — business-rule rejections correctly map to their original HTTP status/message via the newly-verified `RpcException`/`err.code` round-trip, closing CR-01 and CR-02. |

Both requirement IDs (`GRPC-07` in 21-01/06/07 frontmatter, `GRPC-08` in 21-01/02/03/04/05/08 frontmatter) are accounted for against REQUIREMENTS.md (lines 15-16, 81-82). No orphaned requirement IDs found for this phase. Note: `.planning/REQUIREMENTS.md`'s checkbox markers for GRPC-07/GRPC-08 still show `[ ]` (unchecked) and the status table (lines 81-82) shows "Pending" — this is a tracking-doc bookkeeping item, not a code gap; it should be updated to reflect phase closure but does not block the phase goal, which is a codebase-behavior claim, not a tracking-doc claim.

### Anti-Patterns Found

No `TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER` markers found in any of the 8 files modified by plan 21-08 (`reviews-grpc.controller.ts`, `reviews-grpc.controller.spec.ts`, `reviews-client.service.ts`, `reviews-client.service.spec.ts`, `waitlist-grpc.controller.ts`, `waitlist-grpc.controller.spec.ts`, `waitlist-client.service.ts`, `waitlist-client.service.spec.ts`). No empty-implementation or hardcoded-empty-data patterns found in the new exception-mapping code paths — each mapped branch constructs a real `RpcException`/Nest HTTP exception carrying the original message, and the "any other error rethrown unwrapped" branches are the deliberate, documented carve-out for genuine defects (matching the already-verified `delivery-otp-grpc.controller.ts` precedent).

### Human Verification Required

1. **D-08 sizing gate verdicts (21-03 Task 3, 21-05 Task 4)** — carried forward unchanged from the prior verification; unrelated to CR-01/CR-02 and not addressed by plan 21-08.
   **Test:** Independently re-run the SQL queries specified in each plan's checkpoint task against real production/staging data and confirm the recorded "PASS" verdicts.
   **Expected:** Both SUMMARY.md files narrate a PASS verdict but include no actual query output — only a claim that a human operator reviewed real data. A human with DB access should confirm this before the canary flags are ever flipped.
   **Why human:** Requires live database access this verifier does not have.

2. **Live end-to-end confirmation of the CR-01/CR-02 fix against a running deployment**
   **Test:** With the reviews/waitlist canary flags enabled and the gRPC services live, submit a review for a booking the user doesn't own, and a waitlist join with neither email nor phone; observe the actual HTTP status returned.
   **Expected:** Per plan 21-08's code fix and this verifier's independent source read plus unit tests, both should now return the correct business-rule HTTP status (403/409/400) with the original message, not 503.
   **Why human:** This verifier's confirmation is via direct source reading (the fix code is present and structurally correct) and unit tests that mock the gRPC transport boundary (`throwError(() => ({code, message}))` simulating what a real gRPC error looks like client-side). It has not observed an actual network round-trip through a live `@GrpcMethod` handler and `BaseRpcExceptionFilter`. A live smoke test would remove the last residual doubt about runtime behavior in the exact deployed configuration.

### Gaps Summary

No gaps remain. Both previously-FAILED truths (CR-01: Reviews business-exception mapping; CR-02: Waitlist business-exception mapping) are closed by plan 21-08, independently re-verified against the current codebase — not the SUMMARY's claims. Server-side `RpcException` wrapping and client-side `err.code` inspection are both present and structurally correct in `reviews-grpc.controller.ts`/`reviews-client.service.ts` and `waitlist-grpc.controller.ts`/`waitlist-client.service.ts`, mirroring the already-verified `delivery-otp-grpc.controller.ts`/`delivery-otp-client.service.ts` pattern exactly. New tests exercise business-exception-shaped gRPC errors (objects with `.code` set, e.g. `{code: GrpcStatus.NOT_FOUND, message: 'Booking not found'}`) — not just generic transport-error tests — closing the exact test gap the prior verification identified. All 18 phase-relevant test suites (92 tests) pass; `tsc --noEmit` is clean; `git log`/`git show --stat` confirm only the 8 files declared in the plan's frontmatter were touched, with zero collateral changes to the other 8 already-passing truths' supporting files.

Status is `human_needed` rather than `passed` solely because of the 2 pre-existing human-verification items (D-08 sizing gate, live end-to-end smoke test) — both are process/environment checks that this verifier cannot perform from source code alone, not code-level gaps.

---

_Verified: 2026-07-21T01:02:34Z_
_Verifier: Claude (gsd-verifier)_
