---
phase: 20-grpc-blue-green-healthcheck-retrofit
plan: 04
subsystem: api
tags: [nestjs, jest, e2e, tour-bookings, settlement, ci, wallet-invariant, tdd]

# Dependency graph
requires:
  - phase: 20-grpc-blue-green-healthcheck-retrofit
    plan: 03
    provides: Zero-circular-dependency backend/src module graph (unblocks AppModule bootstrap in test:e2e:tours)
provides:
  - "wallet-invariant.e2e-spec.ts rewritten against the current SettlementService-delegation architecture (TOUR-10 regression coverage restored)"
  - "npm run test:e2e:tours permanently wired into CI, adjacent to test:e2e:settlement-splits"
  - "e2e-tour-booking.e2e-spec.ts and setup-e2e-tours.ts fixed — full test:e2e:tours suite green end-to-end"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Mock the shared SettlementService boundary (settle()'s recipients/platformMetadata/onFailure args), not a local $transaction, when testing a caller service that delegates its wallet fan-out"
    - "createNestApplication({ rawBody: true }) is required in e2e test bootstraps whenever the app under test has any Paystack/Flutterwave webhook route — mirrors src/main.ts's NestFactory.create() option"

key-files:
  created: []
  modified:
    - backend/src/modules/tour-bookings/__tests__/wallet-invariant.e2e-spec.ts
    - .github/workflows/ci.yml
    - backend/test/e2e-tour-booking.e2e-spec.ts
    - backend/test/setup-e2e-tours.ts

key-decisions:
  - "Rewrote all 6 INV-* tests to assert against mockSettlementService.settle.mock.calls[N][0] (the SettlementInput argument) instead of the old wireTransaction()/txn capture object, which exercised dead code since Phase 12/18 moved the transactional primitives out of TourSettlementService entirely"
  - "INV-4 reframed from 'idempotency no-op' to 'always delegates to settle() exactly once, even on a REPLAYED result' — idempotency now lives entirely inside SettlementService, not TourSettlementService, so the meaningful assertion is that TourSettlementService never adds a redundant local check"
  - "INV-5's mockRefund.refund assertion removed — that call now happens inside the mocked SettlementService.settle(), already covered by settlement.service.spec.ts, not this file's job to re-verify"
  - "Extended scope (Rule 1) to fix 3 pre-existing, unrelated bugs in e2e-tour-booking.e2e-spec.ts/setup-e2e-tours.ts discovered while confirming Task 2's stated exit gate (full test:e2e:tours green) — these were blocking the plan's explicit must_haves truth, not new work"

requirements-completed: [GRPC-06c]

# Metrics
duration: 70min
completed: 2026-07-20
---

# Phase 20 Plan 04: TOUR-10 Wallet Invariant Rewrite + CI Wiring Summary

**Rewrote `wallet-invariant.e2e-spec.ts`'s 6 INV-* tests to assert against `TourSettlementService`'s actual current boundary (the `SettlementService.settle()` call's `recipients`/`platformMetadata`/`onFailure` arguments) instead of a stale `$transaction` mock that exercised dead code since Phase 12/18, then wired `npm run test:e2e:tours` into CI and fixed 3 pre-existing bugs to get the full suite green end-to-end.**

## Performance

- **Duration:** 70 min
- **Started:** 2026-07-20T14:25:00Z
- **Completed:** 2026-07-20T15:35:00Z
- **Tasks:** 2 completed
- **Files modified:** 4 (0 created, 4 modified)

## Accomplishments

- `wallet-invariant.e2e-spec.ts`'s 6 INV-* tests now assert against the real architecture: `TourSettlementService` resolves the N-way vendor split and hands the result to `SettlementService.settle()`, which the test mocks and inspects via `mockSettlementService.settle.mock.calls[N][0]`
- `npm run test:e2e:tours -- --testPathPattern="wallet-invariant"` passes 6/6
- `.github/workflows/ci.yml` runs `test:e2e:tours` on every PR/push, adjacent to the existing `test:e2e:settlement-splits` step
- Full `npm run test:e2e:tours` (wallet-invariant + e2e-tour-booking, kyc-encryption pattern matched zero files and no-ops via `--passWithNoTests`) passes **17/17** against a real local Postgres + Redis instance
- Full backend unit suite (`npm test`) passes **700/700** across 57 suites — zero regressions
- `npm run test:e2e:settlement-splits` unaffected (its own DB-state gate skips 2 tests, as before this plan)

## Task Commits

Each task was committed atomically:

1. **Task 1: Rewrite wallet-invariant.e2e-spec.ts to mock the centralized SettlementService boundary** - `a0b8d1d` (test)
2. **Task 2: Wire test:e2e:tours into CI + full regression confirmation** - `7969107` (feat)

## Files Created/Modified

- `backend/src/modules/tour-bookings/__tests__/wallet-invariant.e2e-spec.ts` — removed `wireTransaction()`/`TxnCapture`/`txn`; added `mockSettlementService`/`mockVisitorLog` providers (matching `stays.service.spec.ts`'s established convention); rewrote all 6 INV-* test bodies to assert on `mockSettlementService.settle`'s captured call arguments
- `.github/workflows/ci.yml` — added `E2E tests (tour booking + wallet invariant + KYC encryption)` step running `npm run test:e2e:tours -- --forceExit --passWithNoTests`, immediately adjacent to the existing settlement-splits step
- `backend/test/setup-e2e-tours.ts` — `bootstrapE2EApp()` now passes `{ rawBody: true }` to `createNestApplication()`
- `backend/test/e2e-tour-booking.e2e-spec.ts` — Step 7 reference extraction fixed; Step 8 gained a settlement-completion poll; Step 10's expected `metadata.module` literal corrected from `'tour'` to `'tour_booking'`

## Decisions Made

- Reused the exact `mockSettlementService`/`mockVisitorLog` shape already established in `stays.service.spec.ts` for consistency across the codebase's SettlementService-mocking convention.
- INV-4's original "idempotency no-op" framing no longer applies (idempotency moved fully into `SettlementService`); reframed as "TourSettlementService always delegates to `settle()` exactly once regardless of `SETTLED`/`REPLAYED` result," which is the meaningful invariant that remains TourSettlementService's own responsibility.
- Removed INV-5's `mockRefund.refund` assertion since that call is now internal to the mocked `SettlementService.settle()`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `bootstrapE2EApp()` missing `rawBody: true`, causing every Paystack webhook call to 400**
- **Found during:** Task 2's full-suite verification run
- **Issue:** `setup-e2e-tours.ts` built its NestJS test app via `moduleRef.createNestApplication()` without the `{ rawBody: true }` option that `src/main.ts`'s `NestFactory.create()` uses. `req.rawBody` was always `undefined`, so `WebhooksService.handlePaystack()`'s C-11 guard ("Missing raw body — rawBody middleware not configured") threw a 400 before HMAC verification could even run — Step 8 of `e2e-tour-booking.e2e-spec.ts` failed 100% of the time regardless of DB/network state.
- **Fix:** Added `{ rawBody: true }` to `createNestApplication()`, mirroring `main.ts`.
- **Files modified:** `backend/test/setup-e2e-tours.ts`
- **Commit:** `7969107`

**2. [Rule 1 - Bug] `e2e-tour-booking.e2e-spec.ts` Step 7 read the Paystack reference from fields that were never populated**
- **Found during:** Task 2's full-suite verification run
- **Issue:** The test read `res.body.reference` (doesn't exist — the controller returns `{ booking, payment }`, not a top-level `reference`) then fell back to `res.body.booking.paymentReference` — but `paymentReference` is written by a separate `prisma.tourBooking.update()` call issued *after* the `booking` object in the response was already constructed from the initial `create()`, so it always read back `null`/`undefined` on this response regardless of environment.
- **Fix:** Read `res.body.payment?.reference ?? res.body.booking.reference ?? ''` — `payment.reference` (Paystack init result) and `booking.reference` (the minted `ISY-TOUR-` value, set at creation) are the fields actually populated on this response.
- **Files modified:** `backend/test/e2e-tour-booking.e2e-spec.ts`
- **Commit:** `7969107`

**3. [Rule 1 - Bug] `e2e-tour-booking.e2e-spec.ts` assumed synchronous settlement completion after the webhook HTTP response**
- **Found during:** Task 2's full-suite verification run (after fixing #1/#2, Steps 9-11 still failed with `status: 'PENDING'`)
- **Issue:** `WebhooksService.handlePaystack()` calls `this.eventEmitter.emit('payment.tour_booking', ...)` without awaiting it (fire-and-forget by design). `TourSettlementService.handleTourBookingPayment()` then runs several awaited Prisma round-trips before flipping the booking to `CONFIRMED`. The HTTP webhook response can (and, in practice, reliably did) return before that async settlement completes — the test's own comment claiming "EventEmitter2 settlement is synchronous" was incorrect for this event-driven architecture.
- **Fix:** Added a short poll loop (50ms interval, 5s deadline) inside Step 8, waiting for the booking's status to leave `PENDING` before the subsequent steps assert on it.
- **Files modified:** `backend/test/e2e-tour-booking.e2e-spec.ts`
- **Commit:** `7969107`

**4. [Rule 1 - Bug] `e2e-tour-booking.e2e-spec.ts` Step 10 asserted a stale metadata literal**
- **Found during:** Task 2's full-suite verification run (after fixing #1-#3, this was the last failure)
- **Issue:** Step 10 asserted `Transaction.metadata.module` equals `'tour'`. The actual current value — set via `TourSettlementService`'s `SettlementInput.module` field, which `SettlementService.settle()` copies verbatim into every credit row's metadata — is `'tour_booking'`.
- **Fix:** Corrected the expected literal to `'tour_booking'`.
- **Files modified:** `backend/test/e2e-tour-booking.e2e-spec.ts`
- **Commit:** `7969107`

All four fixes were required to satisfy this plan's own stated exit criterion ("`npm run test:e2e:tours` passes green locally against a real Postgres + Redis instance") and Task 2's explicit `<done>` block (both `wallet-invariant.e2e-spec.ts` and `e2e-tour-booking.e2e-spec.ts` green). None touch production runtime code — all four are test-infrastructure-only changes (T-20-11's disposition in the threat model: "test-only changes, zero production surface").

## Issues Encountered

- **Missing `node_modules` in the git worktree:** as in 20-03, the worktree checkout carried no installed dependencies. Resolved with the same approach — Windows junctions (`mklink /J`) pointing `node_modules` and `backend/node_modules` at the main working tree's already-installed packages (read-only reuse, no `package.json`/lockfile changes, gitignored, never entered version control).
- **No `.env` in the worktree:** copied the main working tree's root `.env` into the worktree root (gitignored, never staged) to get a real `DATABASE_URL`/`REDIS_URL`/`PAYSTACK_WEBHOOK_SECRET` for the local Postgres 16 + Redis 7 instances already running and reachable from this environment.
- **`e2e-tour-booking.e2e-spec.ts` genuinely calls the real Paystack API** (`PaystackService.initiatePayment()` hits `https://api.paystack.co` with the live secret key present in `.env` per STATE.md's carried-over blocker). This is pre-existing e2e test design, not something this plan changed or should change — flagging for awareness only, not fixing (out of this plan's scope; the live-key rotation is already tracked as an unresolved blocker in STATE.md).

## User Setup Required

None — no external service configuration required for this plan's own scope. (The pre-existing live Paystack secret key rotation recommendation from STATE.md remains open and unrelated to this plan.)

## Next Phase Readiness

- `test:e2e:tours` is now a permanent, green CI gate — the TOUR-10 wallet invariant regression can no longer silently rot without a visible CI failure (T-20-10 mitigated).
- No blockers for subsequent phase-20 plans or Phase 21.

---
*Phase: 20-grpc-blue-green-healthcheck-retrofit*
*Completed: 2026-07-20*

## Self-Check: PASSED

All modified files confirmed present on disk with expected content; both commits (`a0b8d1d`, `7969107`) confirmed present in `git log --oneline --all`.
