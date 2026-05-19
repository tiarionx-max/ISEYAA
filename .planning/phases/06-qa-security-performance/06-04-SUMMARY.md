---
phase: 06-qa-security-performance
plan: "04"
subsystem: testing
tags: [k6, artillery, load-testing, performance, websocket, socketio, gps]

# Dependency graph
requires:
  - phase: 06-01
    provides: QA-01 performance requirements (P95 < 500ms at 10K concurrent users)
  - phase: 06-02
    provides: QA-02 WebSocket GPS requirements (500 sustained connections, 10 min)
provides:
  - k6 load test suite targeting /api/v1 endpoints at 10K VU scale
  - Artillery Socket.IO GPS stress test with JWT pre-auth injection
  - Acceptance gate scripts ready to run against Railway staging
affects: [06-05, 06-06]

# Tech tracking
tech-stack:
  added:
    - k6 (Go-based load testing binary, ES module syntax)
    - Artillery 2.0.31 (Node.js load testing framework)
    - artillery-engine-socketio (Socket.IO load test engine)
    - axios (used in Artillery processor.js for login pre-step)
  patterns:
    - k6 tag-based threshold isolation (endpoint:wallet, endpoint:events, endpoint:auth)
    - Artillery before.flow JWT pre-login injection pattern for Socket.IO auth
    - ES module syntax in k6 scripts (import/export, __ENV not process.env)

key-files:
  created:
    - load-tests/k6/main.js
    - load-tests/k6/common/auth.js
    - load-tests/k6/scenarios/auth-flow.js
    - load-tests/k6/scenarios/wallet-flow.js
    - load-tests/k6/scenarios/events-flow.js
    - load-tests/k6/scenarios/transport-flow.js
    - load-tests/artillery/socketio-gps.yml
    - load-tests/artillery/processor.js
  modified: []

key-decisions:
  - "k6 uses ES module syntax (import/export) not CommonJS require() — required by Go k6 runtime"
  - "Artillery processor.js uses CommonJS module.exports — required by Node.js Artillery runtime"
  - "GPS loop count: 300 iterations x 2s think = 600s = 10 minutes per connection (matches QA-02)"
  - "k6 stages: ramp 0→500 in 2m, 500→10K in 3m, hold 10K for 5m, ramp down 2m"
  - "Error rate threshold: rate<0.001 (0.1%) — stricter than QA-01's implied error gate"

patterns-established:
  - "k6 auth pattern: getToken() helper in common/auth.js, imported by authenticated scenario scripts"
  - "Artillery JWT pattern: before.flow injectToken sets context.vars.token before scenario starts"

requirements-completed: [QA-01, QA-02]

# Metrics
duration: 2min
completed: 2026-05-19
---

# Phase 6 Plan 04: k6 + Artillery Load Test Scripts Summary

**k6 HTTP load test suite (4 scenarios, 10K VU ramp, P95<500ms thresholds) and Artillery Socket.IO GPS stress test (500 connections, 10-minute sustained, JWT auth injection) ready to run against Railway staging**

## Performance

- **Duration:** 2 min
- **Started:** 2026-05-19T14:55:33Z
- **Completed:** 2026-05-19T14:57:09Z
- **Tasks:** 2
- **Files created:** 8

## Accomplishments

- 6 k6 script files implementing QA-01 acceptance gate: 4 scenario scripts (auth, wallet, events, transport), 1 auth helper, 1 main orchestrator with P95<500ms and error<0.1% thresholds at 10K VUs
- 2 Artillery files implementing QA-02 acceptance gate: YAML with 600-second GPS tracking scenario (300 loop iterations x 2s think), Node.js processor for JWT pre-login injection
- All scripts target `https://iseyaa-api.railway.app` by default with `__ENV.BASE_URL` / `process.env.BASE_URL` override

## Task Commits

Each task was committed atomically:

1. **Task 1: k6 HTTP load test scripts** - `011b14d` (feat)
2. **Task 2: Artillery Socket.IO GPS stress test** - `94bb7c5` (feat)

## Files Created/Modified

- `load-tests/k6/common/auth.js` — getToken() helper; POST /api/v1/auth/login, returns accessToken
- `load-tests/k6/main.js` — Orchestrator; 4-stage ramp to 10K VUs; P95<500ms per-endpoint thresholds
- `load-tests/k6/scenarios/auth-flow.js` — Login endpoint load scenario with endpoint:auth tag
- `load-tests/k6/scenarios/wallet-flow.js` — Wallet balance GET with Bearer auth, endpoint:wallet tag
- `load-tests/k6/scenarios/events-flow.js` — Public events list GET, endpoint:events tag
- `load-tests/k6/scenarios/transport-flow.js` — Fare estimate POST with Bearer auth, endpoint:transport tag
- `load-tests/artillery/processor.js` — Node.js CommonJS JWT token injector using axios
- `load-tests/artillery/socketio-gps.yml` — Artillery GPS stress config: join:driver → 300x driver:location at 2s intervals

## Decisions Made

- k6 uses ES module syntax (`import`/`export`, `__ENV`) not CommonJS `require()` — the k6 binary is Go-based and has its own JS runtime incompatible with Node.js APIs
- Artillery processor.js uses CommonJS `module.exports` — Artillery is a Node.js process that dynamically `require()`s processor files; ES module exports would silently break function lookup
- GPS loop count 300 × 2s think = 600 seconds exactly satisfies QA-02's "10 minutes of sustained connections"
- k6 error rate threshold set at `rate<0.001` (0.1%) — matches QA-01 "< 0.1% error rate" requirement exactly
- Transport scenario checks status 200 OR 201 to accommodate NestJS route returning either status on successful POST

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

Scripts require these env vars at run time (not at creation time):
- `BASE_URL` — staging API URL override (default: https://iseyaa-api.railway.app)
- `TEST_PHONE`, `TEST_PASSWORD` — for k6 authenticated scenarios
- `TEST_DRIVER_PHONE`, `TEST_DRIVER_PASSWORD` — for Artillery GPS test
- `TEST_TRIP_ID` — for Artillery GPS test (default: load-test-trip-001)

## Next Phase Readiness

- Load test scripts ready for execution in Wave 6 human checkpoint plan (06-06)
- Scripts are acceptance gate tools — they must pass against Railway staging to satisfy QA-01 and QA-02 requirements
- No blockers; all 8 files created and verified

---
*Phase: 06-qa-security-performance*
*Completed: 2026-05-19*
