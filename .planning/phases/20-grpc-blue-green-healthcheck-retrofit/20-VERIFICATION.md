---
phase: 20-grpc-blue-green-healthcheck-retrofit
verified: 2026-07-20T15:20:00Z
status: human_needed
score: 5/5 must-haves verified (code-level); 3 items require human/operator verification against a live Railway deployment
overrides_applied: 0
human_verification:
  - test: "Deploy notifications-service to Railway with a deliberately-failing /healthz response (e.g. force HealthImplementation.setStatus('', 'NOT_SERVING') or crash the Prisma connection) and confirm Railway's healthcheckPath actually blocks promotion, keeping the previous instance live."
    expected: "Railway refuses to route traffic to the new container and keeps serving the last known-good deployment until /healthz returns 200."
    why_human: "Requires a real Railway deploy and platform-level rollout behavior; not reproducible in CI or locally. Documented as Manual-Only Verification #1 in 20-VALIDATION.md and in docs/blue-green-cutover-runbook.md's 'Known manual-only checks' section."
  - test: "Run two replicas of the monolith (or notifications-service) concurrently against shared Redis (e.g. temporarily remove docker-compose.yml's fixed container_name/port mapping and `docker compose up --scale notifications-service=2`) and confirm only one replica executes each cron-lock:*-guarded tick (releaseEscrow, cleanStaleDriverHeartbeats, cleanStaleRiderHeartbeats, pushTMinus24h, pushTMinus2h, pushPostTourRating)."
    expected: "Exactly one replica's tick wins the lock and runs the guarded body per interval; the other observes setNx() return false and skips (logged via logger.debug)."
    why_human: "Requires literal concurrent-replica execution against shared Redis — not mockable/unit-testable. docker-compose.yml's fixed container_name/port mapping blocks trivial --scale. Documented as Manual-Only Verification #2 in 20-VALIDATION.md and the runbook."
  - test: "Execute the full 6-step blue-green cutover procedure in docs/blue-green-cutover-runbook.md against a real Railway deployment of notifications-service: flip canary flag off, deploy new build, run synthetic verification directly against the new container, flip canary flag back on, actively watch the 15-minute bake window, confirm the rollback path (flag flip back to false) actually restores the pre-cutover behavior."
    expected: "The operator can follow the runbook verbatim and successfully completes a real cutover with the documented rollback available and working if bake-window signals show trouble."
    why_human: "This is GRPC-06c's literal 'proven end-to-end' language — requires a real Railway environment, real dual-liveness window, live Grafana/circuit-breaker signals, and operator judgment. Explicitly scoped as Manual-Only Verification in 20-VALIDATION.md (\"Full shadow-verify + manual pointer-flip blue-green cutover end-to-end on a real notifications-service deploy... not reproducible in CI\"). 20-05-SUMMARY.md itself states this 'remains open until a live Railway cutover is actually run.'"
---

# Phase 20: gRPC Blue-Green Healthcheck Retrofit Verification Report

**Phase Goal:** "Every extracted gRPC service exposes a real health endpoint gating Railway rollout, every `@Cron` job is distributed-lock-guarded, and a real blue-green cutover is proven end-to-end" (ROADMAP.md line 43; Phase 20 section, lines 459-485)
**Verified:** 2026-07-20T15:20:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `notifications-service` exposes a real `grpc.health.v1.Health` RPC on its gRPC port (5008) and a plain HTTP `GET /healthz`, both wired for Railway's health-gated rollout (GRPC-06a) | ✓ VERIFIED (code) | `backend/apps/notifications-service/src/main.ts` rewritten to hybrid `NestFactory.create()` + `connectMicroservice()` bootstrap with `onLoadPackageDefinition` wiring `HealthImplementation`; `health.controller.ts` exposes terminus-backed `GET /healthz`; `railway.toml` has `healthcheckPath = "/healthz"` + `healthcheckTimeout = 60`; `Dockerfile` exposes both 5008/8080. Independently re-ran `npm test -- --testPathPattern="grpc-health|health.controller"` → 2/2 suites pass. |
| 2 | "A failing health check blocks rollout" (Railway's own promotion behavior) | ? NEEDS HUMAN | Config is correctly wired (`healthcheckPath`), but whether Railway's platform actually blocks promotion on a forced `NOT_SERVING`/failing response can only be confirmed against a real Railway deployment — see Human Verification #1. |
| 3 | Every `@Cron` job GRPC-06b names (D-07: `releaseEscrow`, `cleanStaleDriverHeartbeats`, `cleanStaleRiderHeartbeats`, `pushTMinus24h`, `pushTMinus2h`, `pushPostTourRating`) is guarded by `RedisService.setNx()`; `db-metrics.service.ts`'s `pollOpenConnections` intentionally excluded; fail-open (D-08) preserved | ✓ VERIFIED (code) | Grep-confirmed all 6 `cron-lock:*` guards present at the correct lines with correct keys/TTLs (25s heartbeat crons, 3300s `releaseEscrow`/`pushTMinus24h`, 840s `pushTMinus2h`/`pushPostTourRating`); `pollOpenConnections` has no lock (confirmed absent); `setNx()` itself unmodified, still returns `true` on Redis-unavailable (`redis.service.ts:130-137`). Independently re-ran the 5 relevant spec files → 116/116 tests pass. |
| 4 | "Running two replicas simultaneously does not double-fire any job" (real concurrency proof) | ? NEEDS HUMAN | Unit tests prove the skip-and-return logic in isolation (mocked `setNx`), which is the maximum that's testable without a live multi-replica environment. `docker-compose.yml`'s fixed `container_name`/port mapping blocks trivial `--scale`. Explicitly documented as Manual-Only Verification #2 in 20-VALIDATION.md — see Human Verification #2. |
| 5 | `NotificationsClientService` canary kill-switch (`grpc.notifications_service.canary_enabled`) gates `registerToken()`/`sendPush()` with correct opt-out polarity; zero circular dependencies in the module graph (GRPC-06c primitives) | ✓ VERIFIED (code) | `notifications-client.service.ts` implements `isCanaryEnabled()` returning `cfg?.value !== false`, gating both methods before their try/catch. `notifications-client.constants.ts` is a genuine zero-import leaf file breaking the module↔service cycle. Independently re-ran `npx madge --circular --extensions ts --ts-config tsconfig.json src/app.module.ts` → "No circular dependency found!" (196 files). Independently re-ran `notifications-client.service.spec.ts` → passes (11 test cases incl. 3 new canary cases). |
| 6 | `wallet-invariant.e2e-spec.ts` and `e2e-tour-booking.e2e-spec.ts` (`test:e2e:tours`) pass green against a real Postgres+Redis instance, and are wired into CI | ✓ VERIFIED (code) | Grep-confirmed zero remaining references to `wireTransaction`/`txn`/`mockPrisma.$transaction` in `wallet-invariant.e2e-spec.ts`; all 6 INV-* assertions now read `mockSettlementService.settle.mock.calls[N][0]`. `.github/workflows/ci.yml` contains the `E2E tests (tour booking + wallet invariant + KYC encryption)` step running `test:e2e:tours`. Independently re-ran `npm run test:e2e:tours -- --forceExit --passWithNoTests` against the live local Postgres 16/Redis 7 containers → 2 suites, 17/17 tests pass (matches SUMMARY's claimed count exactly). |
| 7 | `docs/blue-green-cutover-runbook.md` documents an operator-executable 6-step shadow-verify + manual pointer-flip cutover, with an explicit rollback path, a fixed 15-minute actively-watched bake window, and Pitfall 2's "signals only meaningful after flag flips back on" warning (GRPC-06c documentation) | ✓ VERIFIED | File exists (159 lines); contains the exact `PATCH /api/v1/admin/config/grpc.notifications_service.canary_enabled` endpoint and body verbatim (Steps 1/4/6); documents all 6 sequencing steps in order; dedicated "Bake window" section defines 15-minute/actively-watched operationally; Pitfall 2 called out explicitly inside Step 5; "Known manual-only checks" section lists all 3 items from 20-VALIDATION.md. |
| 8 | "An operator can execute a shadow-verify dual-run + manual pointer-flip blue-green cutover on a real extracted service end-to-end" (literal GRPC-06c / roadmap Success Criterion 3 wording — actual execution, not just documented capability) | ? NEEDS HUMAN | The runbook and every underlying primitive (health check, canary flag, CI-gated regression suite) are built and code-verified, but no actual live Railway cutover has been executed as part of this phase. 20-05-SUMMARY.md itself states this "remain[s] open until a live Railway cutover is actually run," and 20-VALIDATION.md scopes this explicitly as a Manual-Only Verification, not something this phase's automation can complete. See Human Verification #3. |
| 9 | Full backend regression suite (unit + both e2e suites) is green after Plans 01-04 merge, with zero cross-plan regressions and zero circular dependencies (Plan 05's phase-gate) | ✓ VERIFIED | Independently re-ran the full chain: `npm test` → 57 suites/700 tests passing (exact match to SUMMARY); `npm run test:e2e:tours` → 2 suites/17 tests passing; `npm run test:e2e:settlement-splits` → 1 suite/2 tests skipped (pre-existing DB-state gate, unchanged); `npm run test:e2e:settlement-disputes` → 1 suite/3 tests passing; `npx madge --circular` → zero cycles. All numbers match 20-05-SUMMARY.md's claims exactly. |

**Score:** 5/5 code-level must-haves verified; 3 truths require human/operator verification against a real Railway deployment (all explicitly and deliberately scoped as Manual-Only Verifications during planning — not a hidden gap).

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `backend/apps/notifications-service/src/main.ts` | Hybrid HTTP+gRPC bootstrap | ✓ VERIFIED | `NestFactory.create()` → `connectMicroservice()` (dual package `['notifications','grpc.health.v1']`, `onLoadPackageDefinition` wires `HealthImplementation`) → `startAllMicroservices()` → `listen()` on `PORT ?? 8080` |
| `backend/apps/notifications-service/src/health.controller.ts` | `@nestjs/terminus`-backed `GET /healthz` | ✓ VERIFIED | `@Controller() @Get('healthz') @HealthCheck() check() { return this.health.check([]); }` |
| `backend/apps/notifications-service/railway.toml` | `healthcheckPath` wired | ✓ VERIFIED | `healthcheckPath = "/healthz"`, `healthcheckTimeout = 60` present in `[deploy]` block |
| `backend/apps/notifications-service/Dockerfile` | Both ports exposed | ✓ VERIFIED | `EXPOSE 5008` and `EXPOSE 8080` both present |
| `backend/jest.config.js` | `roots` scans `backend/apps/**` | ✓ VERIFIED | `roots: ['<rootDir>', '<rootDir>/../scripts', '<rootDir>/../apps']` |
| `backend/src/modules/transport/transport.service.ts` | `cleanStaleDriverHeartbeats` guarded | ✓ VERIFIED | `cron-lock:cleanStaleDriverHeartbeats`, TTL 25, guard is first statement in `try` block |
| `backend/src/modules/delivery/delivery.service.ts` | `cleanStaleRiderHeartbeats` guarded | ✓ VERIFIED | `cron-lock:cleanStaleRiderHeartbeats`, TTL 25, same shape |
| `backend/src/modules/stays/stays.service.ts` | `releaseEscrow` guarded | ✓ VERIFIED | `cron-lock:releaseEscrow`, TTL 3300, `RedisService` newly injected |
| `backend/src/modules/tour-bookings/tour-notifications.service.ts` | 3 crons guarded | ✓ VERIFIED | `cron-lock:pushTMinus24h` (3300), `cron-lock:pushTMinus2h` (840), `cron-lock:pushPostTourRating` (840) |
| `backend/src/modules/notifications-client/notifications-client.constants.ts` | Zero-import leaf token file | ✓ VERIFIED | Single export, zero imports, confirmed breaks the cycle (madge clean) |
| `backend/src/modules/notifications-client/notifications-client.service.ts` | Canary kill-switch | ✓ VERIFIED | `isCanaryEnabled()` gates `registerToken()`/`sendPush()`; `listForUser()` correctly left unguarded |
| `backend/src/modules/tour-bookings/__tests__/wallet-invariant.e2e-spec.ts` | Rewritten against `SettlementService` boundary | ✓ VERIFIED | Zero `wireTransaction`/`txn` references remain; all assertions target `mockSettlementService.settle.mock.calls` |
| `.github/workflows/ci.yml` | `test:e2e:tours` step | ✓ VERIFIED | "E2E tests (tour booking + wallet invariant + KYC encryption)" step present, runs `npm run test:e2e:tours` |
| `docs/blue-green-cutover-runbook.md` | Operator-executable runbook | ✓ VERIFIED | 159 lines; all required sections present (see Truth #7) |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `main.ts` | `grpc-health-check`'s `HealthImplementation` | `onLoadPackageDefinition` hook | ✓ WIRED | Confirmed at `main.ts:19-23`; independently confirmed via `grpc-health.spec.ts` (raw client dials the same wiring shape, resolves `SERVING`) |
| `railway.toml` | `health.controller.ts` | Railway polling `GET /healthz` | ✓ WIRED (config-level) | `healthcheckPath = "/healthz"` present; actual Railway-side promotion-blocking behavior is unverifiable locally (see Human Verification #1) |
| Each guarded `@Cron` method | `RedisService.setNx()` | skip-and-return guard, first statement | ✓ WIRED | Confirmed at all 6 call sites; unit tests prove both the lock-acquired pass-through and lock-held skip-and-return paths |
| `notifications-client.service.ts` | `PlatformConfig` table | `prisma.platformConfig.findUnique({ where: { key: 'grpc.notifications_service.canary_enabled' } })` | ✓ WIRED | Confirmed at `notifications-client.service.ts:42`; exercised by 3 new test cases (flag false on both methods, flag absent/true regression) |
| `notifications-client.module.ts` | `notifications-client.constants.ts` | `import { NOTIFICATIONS_PACKAGE }` | ✓ WIRED | Confirmed; madge reports zero cycles |
| `docs/blue-green-cutover-runbook.md` | `PATCH /api/v1/admin/config/grpc.notifications_service.canary_enabled` | Documented curl/PATCH step | ✓ WIRED (documentation-level) | Runbook reproduces the exact endpoint/body verbatim in Steps 1/4/6; endpoint itself (`admin.controller.ts:96-100`) pre-existed and is unmodified by this phase |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| gRPC health RPC + `/healthz` unit specs pass | `npm test -- --testPathPattern="grpc-health\|health.controller"` | 2 suites, 2 tests passing | ✓ PASS |
| Cron-lock guard specs pass (all 4 affected service files) | `npm test -- --testPathPattern="transport.service.spec\|delivery.service.spec\|stays.service.spec\|tour-notifications.service.spec\|notifications-client.service.spec"` | 5 suites, 116 tests passing | ✓ PASS |
| Full unit suite, zero regressions | `npm test -- --forceExit --passWithNoTests` | 57 suites, 700 tests passing (matches SUMMARY exactly) | ✓ PASS |
| `test:e2e:tours` green against real Postgres/Redis | `npm run test:e2e:tours -- --forceExit --passWithNoTests` | 2 suites, 17 tests passing (matches SUMMARY exactly) | ✓ PASS |
| `test:e2e:settlement-splits` unaffected | `npm run test:e2e:settlement-splits -- --forceExit --passWithNoTests` | 1 suite, 2 tests skipped (pre-existing DB-state gate) | ✓ PASS |
| `test:e2e:settlement-disputes` unaffected | `npm run test:e2e:settlement-disputes -- --forceExit --passWithNoTests` | 1 suite, 3 tests passing | ✓ PASS |
| Zero circular dependencies in module graph | `npx madge --circular --extensions ts --ts-config tsconfig.json src/app.module.ts` | "No circular dependency found!" (196 files) | ✓ PASS |

All spot-checks were run independently by the verifier against the live working tree (not copied from SUMMARY.md), against real local Postgres 16 + Redis 7 containers already running.

### Probe Execution

No `scripts/*/tests/probe-*.sh` files exist in this repository and none are declared in any Phase 20 PLAN/SUMMARY. Step 7c: SKIPPED (no probes declared or found).

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| GRPC-06a | 20-01 | `grpc.health.v1.Health` endpoint wired to Railway `healthcheckPath` | ✓ SATISFIED (code) | Truths #1-2 above. **Documentation discrepancy:** `.planning/REQUIREMENTS.md` line 12 still shows `[ ]` unchecked and its Traceability table (line 78) still shows "Pending" for GRPC-06a, despite the implementation being complete and tested. Only GRPC-06c's checkbox was updated (commit `6bf085b`, "mark GRPC-06c requirement complete"). This is a phase-closure documentation gap, not a code gap. |
| GRPC-06b | 20-02 | All named `@Cron` jobs distributed-lock-guarded | ✓ SATISFIED (code) | Truths #3-4 above. **Same documentation discrepancy** as GRPC-06a: `REQUIREMENTS.md` line 13 and Traceability line 79 still show unchecked/"Pending". |
| GRPC-06c | 20-03, 20-04, 20-05 | Shadow-verify dual-run + manual pointer-flip blue-green cutover proven end-to-end, documented rollback | ⚠ PARTIALLY SATISFIED | Code primitives (canary flag, zero circular deps, green CI-gated e2e suite) and documentation (runbook) are complete and verified (Truths #5-7, #9). The literal "proven end-to-end" / "an operator can execute... end-to-end" clause (Truth #8) has NOT been exercised against a real Railway deployment — this is a deliberate, explicitly-documented Manual-Only Verification per 20-VALIDATION.md, not a silent gap. `REQUIREMENTS.md`'s checkbox for GRPC-06c is already marked `[x]` complete, which is arguably premature given the "proven end-to-end" wording, but matches the project's established pattern of treating "all buildable primitives shipped + documented procedure" as the phase-closable definition of this requirement (see 20-CONTEXT.md D-01/D-03/D-04/D-05 decisions, all scoping this phase to NOT include a live Railway execution). |

No orphaned requirements — `REQUIREMENTS.md`'s Traceability table maps exactly GRPC-06a, GRPC-06b, GRPC-06c to Phase 20, and all three appear in this phase's plans' `requirements:` frontmatter (20-01: GRPC-06a; 20-02: GRPC-06b; 20-03/20-04/20-05: GRPC-06c).

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `backend/src/modules/notifications-client/notifications-client.service.ts` | 41-44 | `isCanaryEnabled()`'s `prisma.platformConfig.findUnique()` call is not wrapped in try/catch, unlike every other failure path in this class | ⚠️ Warning | A transient DB error surfaces as a raw, unnormalized exception instead of the class's promised `ServiceUnavailableException`. Already identified and documented as WR-01 in `20-REVIEW.md` (code review, standard depth) — not a new finding, carried forward for visibility. |
| `backend/src/modules/notifications-client/notifications-client.service.ts` | 43 | Canary flag check uses strict `cfg?.value !== false` with no server-side type guard on the admin PATCH endpoint that sets it | ⚠️ Warning | An operator sending `"value": "false"` (string) instead of `false` (boolean) during a live incident would silently fail to disable the kill switch. Already identified and documented as WR-02 in `20-REVIEW.md`. This is the most operationally significant of the three warnings given the runbook depends on this exact flag for its entire rollback mechanism (D-04) — worth prioritizing a fix before this pattern is relied upon in a real incident. |
| `backend/src/modules/tour-bookings/__tests__/wallet-invariant.e2e-spec.ts` | 61-72, 112-127 | `mockPrisma` is missing `tourPackage`/`user.findUnique`, causing `recordVisitorEntry()`'s `Promise.all` to throw (silently swallowed by the method's own try/catch) on every one of the 6 INV-* tests | ⚠️ Warning | `mockVisitorLog.record` is never actually exercised by any test in this file despite being wired into the `TestingModule` — a real regression in `VisitorLogService.record()`'s integration would go undetected here. Already identified and documented as WR-03 in `20-REVIEW.md`. Pre-dates the 20-04 rewrite but the rewrite touched this exact file extensively. |
| `.planning/REQUIREMENTS.md` | 12-13, 78-79 | GRPC-06a/GRPC-06b checkboxes and Traceability status remain unchecked/"Pending" despite complete, tested implementations | ℹ️ Info | Phase-closure documentation hygiene gap — does not affect code correctness but means `REQUIREMENTS.md` currently understates this phase's actual completion state. Recommend updating alongside this verification. |

No debt markers (`TBD`/`FIXME`/`XXX`) found in any file modified by this phase. One pre-existing `// TODO: persistence not yet wired` comment referenced in a code comment in `notifications-client.service.ts:48` documents `listForUser()`'s already-accepted, out-of-scope stub status (D-03) — not new debt introduced by this phase.

### Human Verification Required

See `human_verification` in the frontmatter above for full detail. Summary:

1. **Railway healthcheck-blocks-promotion test** — deploy with a deliberately-failing `/healthz`, confirm Railway blocks rollout.
2. **Concurrent cron-replica dedup test** — run two replicas against shared Redis, confirm only one wins each `cron-lock:*` tick.
3. **Full live blue-green cutover execution** — actually run `docs/blue-green-cutover-runbook.md`'s 6-step procedure against a real Railway deployment of `notifications-service`, including the 15-minute bake window and rollback path.

All three are explicitly pre-identified and documented as Manual-Only Verifications in `20-VALIDATION.md` (created during planning, before execution began) — this is not a gap discovered late by this verifier, it is a deliberate, disclosed scope boundary of the phase.

### Gaps Summary

No code-level gaps found. All artifacts exist, are substantive (not stubs), are correctly wired, and pass their own tests plus a full independent regression re-run (57 unit suites/700 tests, 2 e2e suites/17 tests, 2 more e2e suites unaffected, zero circular dependencies — every number independently reproduced by this verifier, not copied from SUMMARY.md).

The phase's own goal statement uses the word "proven" ("a real blue-green cutover is proven end-to-end"), and GRPC-06c's requirement text says the cutover "is proven end-to-end on a real extracted service." Every underlying primitive this proof depends on (health endpoint, canary flag, cron locks, green CI-gated regression suite, and a runbook precise enough to execute verbatim) is built and verified. What has NOT happened — by the plans' own explicit, pre-declared design (20-CONTEXT.md, 20-VALIDATION.md) — is an actual live execution of that procedure against a real Railway deployment. This was scoped as a Manual-Only Verification from the start, not silently dropped, and 20-05-SUMMARY.md itself says as much ("remain open until a live Railway cutover is actually run"). This verifier surfaces it as `human_needed` rather than `gaps_found` because it reflects a deliberate, disclosed division of labor between automatable engineering work (complete) and operator-executed live verification (not yet performed) — consistent with how the phase was planned and validated from the outset.

Separately, `.planning/REQUIREMENTS.md`'s checkboxes for GRPC-06a and GRPC-06b were never updated to reflect completion (only GRPC-06c's was, via commit `6bf085b`) — a minor phase-closure documentation gap worth fixing, noted above under Anti-Patterns, not blocking.

---

_Verified: 2026-07-20T15:20:00Z_
_Verifier: Claude (gsd-verifier)_
