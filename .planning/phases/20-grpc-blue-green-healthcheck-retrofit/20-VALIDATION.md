---
phase: 20
slug: grpc-blue-green-healthcheck-retrofit
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-20
---

# Phase 20 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 29.7.x (unit) + `ts-jest`; separate `jest --config test/jest-e2e.json` profile for e2e (`.e2e-spec.ts$` files) |
| **Config file** | `backend/test/jest-e2e.json` (e2e), default Jest config in `backend/package.json` (unit) |
| **Quick run command** | `npm test -- --forceExit --passWithNoTests` |
| **Full suite command** | `npm run test:e2e:tours -- --forceExit --passWithNoTests` (once D-09's fix lands and it's wired into CI) |
| **Estimated runtime** | ~60s (unit), ~180s (e2e:tours) |

---

## Sampling Rate

- **After every task commit:** Run `npm test -- --forceExit --passWithNoTests`
- **After every plan wave:** Run `npm run test:e2e:tours -- --forceExit --passWithNoTests` (once green) + `npm run test:e2e:settlement-splits` (existing, must stay green)
- **Before `/gsd-verify-work`:** Both e2e suites green, plus the manual/operator-executed dual-liveness check documented in the runbook (no automated equivalent exists — see Manual-Only Verifications)
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 20-01-XX | 01 | 0/1 | GRPC-06a | — | `grpc.health.v1.Health` responds `SERVING` on the gRPC port | unit/integration | New spec — raw `@grpc/grpc-js` client call against test server's health port | ❌ W0 |
| 20-01-XX | 01 | 1 | GRPC-06a | — | HTTP `/healthz` returns 200 on hybrid app's HTTP listener | unit | New spec mirroring monolith's `health.controller.ts` test pattern (confirm none exists first) | ❌ W0 |
| 20-02-XX | 02 | 1 | GRPC-06b | — | Two concurrent `setNx()` calls for same cron key → only one acquires | unit | New spec per guarded cron (or shared spec on the `setNx()` guard helper) | ❌ W0 |
| 20-02-XX | 02 | 1 | GRPC-06b | — | Redis unreachable → cron still executes (fail-open, D-08) | unit | Extend `redis.service.spec.ts` pattern per guarded cron call-site | ✅ primitive tested; call-site test needed |
| 20-03-XX | 03 | 1 | GRPC-06c | — | Canary flag `false` → `NotificationsClientService` throws `ServiceUnavailableException` without a gRPC call attempt | unit | Extend `backend/src/modules/notifications-client/__tests__/notifications-client.service.spec.ts` | ✅ file exists, new cases needed |
| 20-03-XX | 03 | 1 | GRPC-06c | — | Canary flag `true`/absent → existing gRPC call behavior unchanged (regression) | unit | Same file | ✅ |
| 20-04-XX | 04 | 0/1 | D-09 (folded) | — | `test:e2e:tours` passes locally against real Postgres | e2e | `npm run test:e2e:tours -- --forceExit --passWithNoTests` | ✅ test files exist; currently failing (the fix target) |

*Task IDs are placeholders (`XX`) — the planner assigns final task numbers; this map should be cross-checked against the final PLAN.md files during execution.*

---

## Wave 0 Requirements

- [ ] Minimal gRPC health-check test harness — a raw `@grpc/grpc-js` client dialing the test server's health port, since `grpc-health-check`'s `HealthImplementation` wiring has no existing test precedent in this codebase.
- [ ] Confirm whether `backend/src/health/health.controller.ts` already has a spec file — no existing spec was found during research; if genuinely absent, Wave 0 must add a minimal HTTP health-check test pattern before the new `notifications-service` health controller can reuse it.
- [ ] Scale-friendly Docker Compose override (or explicit runbook-documented manual test) for validating cron double-fire prevention — `docker-compose.yml`'s `notifications-service` block uses a fixed `container_name` and fixed host port mapping (`5008:5008`), which blocks `docker compose up --scale notifications-service=2` without first removing both. Decide in Wave 0: build the override, or document this specific check as manual-only in the runbook (see Manual-Only Verifications below).

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Full shadow-verify + manual pointer-flip blue-green cutover end-to-end on a real `notifications-service` deploy | GRPC-06c | Requires a real Railway deploy, real dual-liveness window, and operator judgment against live Grafana/circuit-breaker signals — not reproducible in CI | Follow `docs/blue-green-cutover-runbook.md` step-by-step against a real Railway environment; confirm synthetic RPCs succeed against the new instance before flipping the canary flag, watch the 15-minute bake window, confirm rollback path works by flipping back |
| Two replicas of the same cron actually coexist and only one fires (if Wave 0 doesn't build the scale-friendly compose override) | GRPC-06b | Requires literal concurrent replica execution against shared Redis, not a mocked/unit-testable interaction | `docker compose up --scale notifications-service=2` (or equivalent for the monolith's cron-hosting process) and observe logs/DB state to confirm only one instance executes each guarded cron tick |
| Railway `healthcheckPath` actually gates rollout on a failing health check (blocks promotion) | GRPC-06a | Requires an actual Railway deploy with a deliberately-failing health response — not reproducible locally | Deploy a build with the health endpoint forced to return `NOT_SERVING`, confirm Railway blocks promotion and keeps serving the previous instance |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
