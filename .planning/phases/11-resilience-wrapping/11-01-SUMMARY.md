---
phase: 11-resilience-wrapping
plan: 01
subsystem: infra
tags: [cockatiel, circuit-breaker, retry, timeout, opentelemetry, sentry, resilience, nestjs]

# Dependency graph
requires: []
provides:
  - "@Global() ResilienceModule exporting ResilienceService, injectable from any feature module"
  - "ResilienceService.execute(vendor, fn) facade wrapping any async vendor call in circuit-breaker + retry + timeout"
  - "7 cached per-vendor cockatiel policies (paystack, paystackRefund, termiiAuth, termiiDelivery, anthropic, s3, fcm) built once at process startup"
  - "PlatformConfig-backed per-vendor threshold overrides (resilience.<vendor>.timeout_ms/retry_count/breaker_failure_threshold/half_open_after_ms) with hardcoded RESILIENCE_DEFAULTS fallback"
  - "onBreak/onReset/onHalfOpen wiring to manual OTel spans + Sentry.captureMessage on circuit-open"
affects: [11-02-paystack-s3-wrapping, 11-03-fcm-anthropic-wrapping, 11-04-termii-wrapping, 11-05-verification]

# Tech tracking
tech-stack:
  added: ["cockatiel@^3.2.1", "@opentelemetry/api@^1.9.1"]
  patterns:
    - "OnModuleInit-built, cached, per-vendor stateful policy registry (Map<Vendor, VendorPolicy>) — never rebuild a circuit breaker per-call"
    - "handleWhen(isTransientError) error filter excluding 4xx business-logic errors from retry/breaker accounting"
    - "Manual OTel span creation at call-time (trace.getTracer() invoked inside each onBreak/onReset/onHalfOpen handler, not at module load) — first manual tracer usage in this codebase"
    - "Explicit Sentry.captureMessage at circuit-open transition (no global exception filter exists to catch this automatically)"

key-files:
  created:
    - backend/src/resilience/resilience.types.ts
    - backend/src/resilience/resilience.service.ts
    - backend/src/resilience/resilience.module.ts
    - backend/src/resilience/__tests__/resilience.service.spec.ts
  modified:
    - backend/package.json
    - backend/src/app.module.ts

key-decisions:
  - "paystackRefund is a distinct vendor key from paystack with retryCount: 0 — never auto-retry a refund call, avoiding a double-refund if a lost response actually reached Paystack's server (RESEARCH.md Pitfall 6)"
  - "cockatiel pinned at exactly ^3.2.1, not the Node>=22/ESM-only 4.0.0 latest dist-tag"
  - "Anthropic vendor policy defaults retryCount: 0 since the SDK client will be constructed with its own maxRetries: 0 in Plan 03 — cockatiel owns circuit-breaking/timeout only for that vendor"
  - "Resilience thresholds read from PlatformConfig once at onModuleInit (not per-call) since they configure a stateful policy object, unlike existing stateless per-call PlatformConfig reads (fee percentages)"

patterns-established:
  - "ResilienceService.execute(vendor, fn) is the single choke-point every vendor-call-site plan in this phase wraps its outbound call with"
  - "Circuit breaker composition wrap(breaker, timeout, retry) built once per vendor at startup, cached in a Map, never reconstructed per invocation"

requirements-completed: [RESIL-01, RESIL-02]

# Metrics
duration: 20min
completed: 2026-07-16
---

# Phase 11 Plan 01: Resilience Engine Foundation Summary

**@Global() ResilienceModule exposing ResilienceService.execute(vendor, fn) — 7 cached cockatiel circuit-breaker+retry+timeout policies (including a zero-retry paystackRefund) reading PlatformConfig thresholds with hardcoded defaults, wired to manual OTel spans + Sentry.captureMessage on every breaker state transition**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-07-16T15:16:00Z (approx, from worktree branch-point)
- **Completed:** 2026-07-16T15:27:07Z
- **Tasks:** 3 completed
- **Files modified:** 6 (4 created, 2 modified)

## Accomplishments
- Installed `cockatiel@3.2.1` (pinned, not the incompatible ESM-only `4.0.0`) and `@opentelemetry/api@1.9.1` as direct backend dependencies
- Built `ResilienceService` with a stateful, cached, per-vendor cockatiel policy registry (`onModuleInit`-built, never rebuilt per-call)
- Implemented `isTransientError` filter excluding 4xx business-logic errors from breaker/retry accounting
- Wired every circuit-breaker state transition (open/reset/half-open) to a manual OpenTelemetry span plus a `Sentry.captureMessage` alert on open — the first manual tracer usage anywhere in this codebase
- Registered `ResilienceModule` globally in `AppModule`, positioned between `RedisModule` and `AuthModule` per the existing infra-modules-first convention

## Task Commits

Each task was committed atomically:

1. **Task 1: Install pinned cockatiel + define resilience contract types** - `db83a43` (feat)
2. **Task 2a: Add failing test for ResilienceService** - `2e3a62e` (test — RED)
2. **Task 2b: Implement ResilienceService** - `107ce06` (feat — GREEN)
3. **Task 3: Register ResilienceModule globally in AppModule** - `8b5eed1` (feat)

_TDD task (Task 2) has two commits: test (RED) → feat (GREEN). No refactor commit was needed — implementation was clean on first pass._

## Files Created/Modified
- `backend/package.json` - Added `cockatiel: ^3.2.1` and `@opentelemetry/api: ^1.9.1` as direct dependencies
- `backend/src/resilience/resilience.types.ts` - `Vendor` union (7 keys), `VendorThresholds` interface, `RESILIENCE_DEFAULTS` per-vendor default thresholds
- `backend/src/resilience/resilience.service.ts` - `ResilienceService`: `onModuleInit` builds 7 cached cockatiel policies from PlatformConfig-backed thresholds with hardcoded fallback; `execute(vendor, fn)` facade; `isTransientError` filter; `onBreak`/`onReset`/`onHalfOpen` OTel+Sentry wiring
- `backend/src/resilience/resilience.module.ts` - `@Global()` module exporting `ResilienceService`
- `backend/src/resilience/__tests__/resilience.service.spec.ts` - 7 unit tests covering default-fallback config read, unknown-vendor rejection, breaker-opens-on-transient-failures, breaker-stays-closed-on-4xx, paystackRefund zero-retry vs paystack multi-retry, and onBreak Sentry+span assertions
- `backend/src/app.module.ts` - Imported and registered `ResilienceModule` between `RedisModule` and `AuthModule`

## Decisions Made
- `paystackRefund` split out as its own vendor key (distinct from `paystack`) with `retryCount: 0` per RESEARCH.md Pitfall 6 — prevents cockatiel from ever auto-retrying a refund call, which could otherwise cause a double-refund if a lost response actually reached Paystack's server.
- Resilience thresholds are read from `PlatformConfig` once at `onModuleInit`, not per-call — unlike this codebase's existing stateless PlatformConfig reads (e.g. `PLATFORM_FEE_PCT`), these values configure a stateful policy object that must not be rebuilt per-request (rebuilding would silently make the circuit breaker inert).
- `anthropic`'s default `retryCount: 0` anticipates Plan 03 constructing the Anthropic SDK client with its own `maxRetries: 0`, keeping cockatiel as the single source of retry truth for that vendor rather than compounding two independent retry/backoff layers.

## Deviations from Plan

None - plan executed exactly as written. All acceptance criteria met on first implementation pass; no auto-fixes were required.

## Issues Encountered

None. Pre-existing, unrelated TypeScript compile errors exist elsewhere in the codebase (`tour-packages`, `transport`, `wallet`, `stays`, `studio` modules referencing Prisma client members not present in the currently-generated client) — confirmed these do not touch any file created or modified by this plan (`npx tsc --noEmit` produces zero errors matching `resilience` or `app.module`), and are out of this plan's scope per the deviation rules' scope boundary (not caused by this plan's changes).

## User Setup Required

None - no external service configuration required. `cockatiel` and `@opentelemetry/api` are locally-installed npm packages; Sentry and the OTel trace exporter were already configured in `main.ts`/`instrumentation.ts` prior to this plan.

## Next Phase Readiness

- `ResilienceService` is globally injectable and ready for Plans 02-04 to call `this.resilience.execute(vendor, fn)` at each vendor call site (Paystack/S3, FCM/Anthropic, Termii).
- No blockers. The `paystackRefund` vendor key, `anthropic` zero-retry default, and PlatformConfig key-naming convention (`resilience.<vendor>.timeout_ms` etc.) are all established and ready for downstream plans to reference.

---
*Phase: 11-resilience-wrapping*
*Completed: 2026-07-16*

## Self-Check: PASSED

All created files verified present on disk; all 5 commits (`db83a43`, `2e3a62e`, `107ce06`, `8b5eed1`, `0a93b05`) verified present in git log.
