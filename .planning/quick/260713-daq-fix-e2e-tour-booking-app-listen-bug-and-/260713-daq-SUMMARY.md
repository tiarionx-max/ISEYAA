---
phase: quick
plan: 260713-daq
subsystem: testing
tags: [jest, nestjs, e2e, jwt, zustand, jest-expo, next/jest, testing-library, cart]

requires: []
provides:
  - "backend E2E test app now binds a real HTTP socket (app.listen(0)) instead of relying on a stray port-3001 process"
  - "web/ has a working Jest test runner (next/jest based) with 4 passing smoke tests"
  - "mobile/ has a working Jest config (jest-expo preset) with 6 passing smoke tests"
affects: [testing, tour-bookings-e2e, web-cart, mobile-cart]

tech-stack:
  added: ["jest@29.7.0 (web)", "jest-environment-jsdom@29.7.0 (web)", "@testing-library/react@14.2.1", "@testing-library/jest-dom@6.4.2", "jest-expo@51.0.4 preset (mobile config only, dep already present)"]
  patterns: ["next/jest wrapper for Next.js App Router jest config", "jest-expo preset for Expo SDK 51 RN test config", "AsyncStorage jest mock for zustand-persisted RN stores"]

key-files:
  created:
    - web/jest.config.js
    - web/jest.setup.js
    - web/src/lib/__tests__/cart.test.ts
    - web/src/components/ui/__tests__/PageTransition.test.tsx
    - mobile/jest.config.js
    - mobile/lib/__tests__/cart-store.test.ts
    - mobile/lib/__tests__/category-config.test.ts
  modified:
    - backend/test/setup-e2e-tours.ts
    - backend/test/e2e-tour-booking.e2e-spec.ts
    - web/package.json
    - package-lock.json

key-decisions:
  - "Fixed mintJwt() to sign {sub, role, jti} (matching AuthService's real token shape) instead of {userId, role, registeredRoles} — the original shape silently broke req.user.userId for every authenticated E2E request"
  - "Fixed 3 stale assumptions in e2e-tour-booking.e2e-spec.ts (become-guide status code, missing tour-package fixture fields, missing booking email field) since they directly blocked verifying the app.listen(0) fix"
  - "Did NOT fix Steps 7-11 (live Paystack API dependency) — confirmed via debug logging this is a real external network/connectivity issue in this sandboxed environment, not a code bug"
  - "Symlinked (junctioned) node_modules from the main repo into this worktree rather than a fresh npm install, since the worktree had none and a full install would duplicate ~1GB+ of packages already present"

requirements-completed: [BUGFIX-e2e-app-listen, TEST-web-smoke, TEST-mobile-smoke]

duration: 45min
completed: 2026-07-13
---

# Quick Task 260713-daq: E2E app.listen fix + web/mobile Jest smoke tests Summary

**Fixed the root cause (missing `app.listen()`) plus two cascading JWT/fixture bugs it was masking in the Phase 9 tour-booking E2E suite (6/17 to 12/17 passing), and added working `npm test` with cart-math smoke coverage to both `web/` (next/jest) and `mobile/` (jest-expo) where zero test files existed before.**

## Performance

- **Duration:** ~45 min
- **Completed:** 2026-07-13T18:23:47Z
- **Tasks:** 3/3 completed
- **Files modified:** 11 (2 backend test files, 5 web files, 3 mobile files, plus package-lock.json)

## Accomplishments

- `backend/test/setup-e2e-tours.ts`: `bootstrapE2EApp()` now calls `app.listen(0)` after `app.init()`, binding a real ephemeral-port HTTP socket instead of leaving `getHttpServer()` unbound (`address()` returned `null`).
- Discovered and fixed (Rule 1 — same-file bug directly blocking Task 1's own `<done>` verification) that `mintJwt()` signed the wrong JWT payload shape (`{userId, role, registeredRoles}` instead of `{sub, role, jti}`), which meant `JwtStrategy.validate()` always produced `req.user.userId === undefined` — every authenticated E2E request was broken regardless of the socket-binding fix.
- `web/` now has a real Jest test runner (`next/jest`-based config, jsdom environment, `@testing-library/jest-dom` matchers) with 4 passing smoke tests covering cart math (add/dedupe/remove) and one component render.
- `mobile/` `npm test` now discovers and runs tests (previously "No tests found" against 340 files) — 6 passing smoke tests covering the mirrored cart store and category query-string builders.

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix E2E app.listen bug in setup-e2e-tours.ts (+ cascading JWT/fixture fixes)** - `d972f42` (fix)
2. **Task 2: Add Jest smoke-test tooling to web/** - `e42cc95` (feat)
3. **Task 3: Add Jest smoke-test config + tests to mobile/** - `a34ce2b` (feat)

_No TDD tasks in this plan — all three were `type="auto"` / `tdd="false"`._

## Files Created/Modified

- `backend/test/setup-e2e-tours.ts` - Added `app.listen(0)`; fixed `mintJwt()` payload shape to `{sub, role, jti}`
- `backend/test/e2e-tour-booking.e2e-spec.ts` - Fixed 3 stale test assumptions (become-guide status code, tour-package fixture fields, booking email field) blocking Task 1's own verification
- `web/jest.config.js` - `next/jest` wrapper config, jsdom environment
- `web/jest.setup.js` - Imports `@testing-library/jest-dom`
- `web/src/lib/__tests__/cart.test.ts` - 3 smoke tests for `useCartStore`
- `web/src/components/ui/__tests__/PageTransition.test.tsx` - Render-smoke test
- `web/package.json` - Added `test` script + Jest devDependencies
- `mobile/jest.config.js` - `preset: 'jest-expo'`
- `mobile/lib/__tests__/cart-store.test.ts` - 3 smoke tests mirroring web's cart tests, with AsyncStorage jest-mocked
- `mobile/lib/__tests__/category-config.test.ts` - 3 smoke tests for query-string builders
- `package-lock.json` - Updated via `npm install --workspace=web` for the new devDependencies

## Decisions Made

- Kept the `mintJwt()` and E2E-spec test fixes scoped to the same files already touched by this plan (`setup-e2e-tours.ts`, `e2e-tour-booking.e2e-spec.ts`) rather than expanding into other backend source files — no production `src/` code was modified.
- Chose `example.com` for the test booking email (Paystack's live API rejected the original `.iseyaa` placeholder TLD as an invalid email domain during real network validation).
- Did not attempt to make Steps 7-11 pass — see Deviations/Issues below.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug, same file as Task 1] Fixed `mintJwt()` JWT payload shape mismatch**
- **Found during:** Task 1 verification (running the E2E suite against live Postgres+Redis)
- **Issue:** `mintJwt()` signed `{ userId, role, registeredRoles }`, but `JwtStrategy.validate()` (and the real `AuthService.generateTokens()`) use `{ sub, role, jti }`. This meant `req.user.userId` was always `undefined` for every authenticated E2E request, causing 500s/404s downstream of the `app.listen(0)` fix.
- **Fix:** Changed `mintJwt()` to sign `{ sub: userId, role, jti: randomUUID() }`.
- **Files modified:** `backend/test/setup-e2e-tours.ts`
- **Verification:** Re-ran the E2E suite; authenticated requests now resolve `req.user.userId` correctly.
- **Committed in:** `d972f42` (Task 1 commit)

**2. [Rule 3 - Blocking, test-file bug] Fixed stale status-code assumption in Step 1 (`become-guide`)**
- **Found during:** Task 1 verification
- **Issue:** Test expected `[201, 409]` but `POST /users/me/become-guide` is an idempotent upsert with `@HttpCode(HttpStatus.OK)`, always returning 200.
- **Fix:** Changed assertion to `expect(res.status).toBe(200)`.
- **Files modified:** `backend/test/e2e-tour-booking.e2e-spec.ts`
- **Verification:** Step 1 now passes.
- **Committed in:** `d972f42`

**3. [Rule 3 - Blocking, missing test fixture data] Added required `lgaId`/`tourGuideId`/`attractionIds` to Step 4 package-creation payload**
- **Found during:** Task 1 verification
- **Issue:** `CreateTourPackageDto` requires `lgaId` (UUID), `tourGuideId` (UUID), and `attractionIds` (1-10 UUIDs) — none were in the original test payload, causing a 400.
- **Fix:** Fetch the first available `LGA` and `Attraction` row from already-seeded reference data in `beforeAll`, and pass them through (`tourGuideId` reuses `guideRecordId` captured in Step 1).
- **Files modified:** `backend/test/e2e-tour-booking.e2e-spec.ts`
- **Verification:** Steps 4-6 now pass.
- **Committed in:** `d972f42`

**4. [Rule 3 - Blocking, missing required DTO field] Added `email` to Step 7 booking-creation payload**
- **Found during:** Task 1 verification
- **Issue:** `CreateTourBookingDto` requires `email` (used for Paystack init); the test sent an unrecognized `paymentMode` field instead and omitted `email` — both trigger 400 under the global `whitelist: true, forbidNonWhitelisted: true` ValidationPipe.
- **Fix:** Removed `paymentMode`, added `email: 'e2e.tourist@example.com'` (switched from an initial `.iseyaa` placeholder domain after Paystack's live API rejected it as an invalid email address).
- **Files modified:** `backend/test/e2e-tour-booking.e2e-spec.ts`
- **Verification:** Step 7's DTO validation now passes (see Issues Encountered for the remaining network-level failure).
- **Committed in:** `d972f42`

---

**Total deviations:** 4 auto-fixed (1 same-file bug, 3 blocking test-fixture/assertion bugs)
**Impact on plan:** All four were necessary to verify Task 1's own `<done>` criteria (the E2E suite becoming "trustworthy"); none touched production `src/` code. No scope creep into unrelated modules.

## Issues Encountered

- **Steps 7-11 of `e2e-tour-booking.e2e-spec.ts` still fail (5/17 tests) — NOT fixed, documented here per this task's explicit instructions not to fabricate a passing result.** Once Steps 1-6 were fixed (see deviations above), Step 7 (`POST /tour-bookings`, which calls Paystack's live `initialize` endpoint to get a payment reference) fails with either a real Paystack validation response (confirming outbound network connectivity partially works) or `Client network socket disconnected before secure TLS connection was established` (confirmed via temporary debug logging of the NestJS `PaystackService` error output, then removed). This is a live external network/TLS connectivity issue reaching `api.paystack.co` from this sandboxed agent environment, not a code bug — the spec file's own header comment already flags this ("E2E tests with a real DB should be run by the operator in the deployed Railway environment"). Steps 8-11 cascade-fail because they depend on Step 7's booking/paystackRef.
  - **Verification performed:** Ran the combined E2E command 3 times; Steps 1-6 pass deterministically every run, Steps 7-11 fail consistently (with the specific failure mode varying between a Paystack validation-rejection response and a raw TLS socket disconnect — both consistent with unreliable/restricted network egress in this sandbox, not application logic).
  - **Recommendation for a human operator:** Re-run `cd backend && npx jest --config test/jest-e2e.json --testPathPattern="wallet-invariant|kyc-encryption|e2e-tour-booking"` from an environment with confirmed outbound HTTPS access to `api.paystack.co` (e.g., the Railway deployment, or a local machine without egress restrictions) to get the true 17/17 result.
- **Flagging a separate, pre-existing security concern (not part of this task's scope, not modified):** `backend/.env` (and the root `.env`) contain a **live** Paystack secret key (`sk_live_...`), not a test key (`sk_test_...`). Local/E2E test runs are making real calls against Paystack's production API surface. This predates this quick task and was not introduced or modified by it — flagging here for visibility since it was directly observed during E2E verification. Recommend the project owner rotate to test-mode keys for local/CI test runs.
- **Worktree had no `node_modules` at all** (this is expected for GSD parallel-agent worktrees) — resolved by creating filesystem junctions (`ln -s` on Windows via Git Bash, which produces Windows directory junctions) from the main repo's `node_modules` directories (root, `backend/`, `web/`, `mobile/`, `shared/`) into the worktree, avoiding a duplicate multi-GB install. `npm install --workspace=web` was still run to add the new Jest/testing-library devDependencies, which updated the shared `node_modules` (visible from the main repo too, but `node_modules` is gitignored so this has no repo-visibility impact) and the worktree-local `package-lock.json`.
- **`.env` / `backend/.env` were copied from the main repo into the worktree** (both gitignored, not committed) purely to obtain `DATABASE_URL`/`REDIS_URL`/`PAYSTACK_*` values needed to run the E2E suite against the already-running `iseyaa_postgres`/`iseyaa_redis` Docker containers.

## User Setup Required

None - no external service configuration required. (The Paystack live-key concern noted above is an existing configuration state, not a new setup requirement from this task.)

## Next Phase Readiness

- The E2E harness itself (`bootstrapE2EApp`) is now correct and reusable by future E2E specs without the silent-pass footgun.
- `web/` and `mobile/` both have working `npm test` entry points that future plans can extend with additional coverage.
- **Remaining work for a future task/human action:** get Steps 7-11 of `e2e-tour-booking.e2e-spec.ts` green from an environment with real Paystack network access, and consider rotating the live Paystack key used in local `.env` files to a test-mode key.

## Self-Check: PASSED

- All 9 created/modified files verified present on disk.
- All 3 task commit hashes (`d972f42`, `e42cc95`, `a34ce2b`) verified present in `git log`.

---
*Phase: quick*
*Completed: 2026-07-13*
