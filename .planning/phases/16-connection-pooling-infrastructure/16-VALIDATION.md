---
phase: 16
slug: connection-pooling-infrastructure
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-18
---

# Phase 16 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 29.7.x (backend, existing) |
| **Config file** | `backend/jest` config in `package.json` (unit); `backend/test/jest-e2e.json` (e2e) |
| **Quick run command** | `cd backend && npx jest prisma-config.spec.ts` |
| **Full suite command** | `cd backend && npm test` |
| **Estimated runtime** | ~30 seconds (quick) / ~4 minutes (full suite) |

---

## Sampling Rate

- **After every task commit:** Run `cd backend && npx jest prisma-config.spec.ts`
- **After every plan wave:** Run `cd backend && npm test` + a k6 smoke run (`--vus 50 --duration 60s`) against locally-running monolith + notifications-service
- **Before `/gsd-verify-work`:** Full k6 combined-topology run (`--vus 500` ramping) + a live Grafana dashboard check confirming the gauge metric is visible and the alert rule is saved
- **Max feedback latency:** 30 seconds (quick run)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 16-01-01 | TBD | 0 | POOL-01 | V7 | `DATABASE_URL` never logged raw; connection COUNTS logged, not connection string | unit (config-presence) | `cd backend && npx jest prisma-config.spec.ts -x` | ❌ W0 | ⬜ pending |
| 16-01-02 | TBD | TBD | POOL-01 | — | `notifications-service` boots cleanly with `ResilienceModule` imported (no DI resolution error) | integration (manual boot check) | `cd backend && npx nest build notifications-service && node dist/apps/notifications-service/src/main.js` (expect clean listen log, Ctrl+C to stop) | manual-only | ⬜ pending |
| 16-02-01 | TBD | TBD | POOL-02 | V14 | Combined-topology load test confirms total open connections stay under the researched ceiling | load test (k6) | `k6 run --vus 50 --duration 60s load-tests/k6/main.js` (smoke) → `k6 run --env BASE_URL=... --env NOTIFICATIONS_GRPC_URL=... load-tests/k6/main.js` (full combined run) | ❌ W0 | ⬜ pending |
| 16-02-02 | TBD | TBD | POOL-02 | — | Grafana shows the open-connections metric with an alert rule configured | manual (Grafana UI + human confirmation) | N/A — Grafana alert rules are not code in this repo (same pattern as RESIL-02) | manual-only | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `backend/src/prisma/__tests__/prisma-config.spec.ts` — new config-presence test asserting `DATABASE_URL` contains `-pooler` + `connection_limit` (covers POOL-01)
- [ ] `load-tests/k6/scenarios/notifications-grpc-flow.js` — new gRPC scenario covering POOL-02, wired into `load-tests/k6/main.js`'s default export
- [ ] `packages/proto/tsconfig.json` — needed for the INT-02 build script; does not currently exist

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `notifications-service` boots without a `ResilienceService` DI resolution error | POOL-01 | No automated boot-smoke test exists for any of the 8 gRPC scaffolds today | `cd backend && npx nest build notifications-service && node dist/apps/notifications-service/src/main.js` — expect clean listen log, no `Nest can't resolve dependencies` error, Ctrl+C to stop |
| Grafana dashboard shows the `postgres_open_connections` gauge and an alert rule fires at 80% of the researched ceiling | POOL-02 | Grafana alert rules are not code in this repo — same pattern as Phase 11's RESIL-02 | Log into Grafana Cloud, confirm the gauge metric is visible on the dashboard, confirm the alert rule is saved with the correct threshold |
| Actual Neon plan/compute-size (CU range) confirmed against the live Neon Console before `connection_limit`/alert-threshold numbers are treated as final | POOL-01, POOL-02 | Cannot be read from the repo or any automated tool — requires human login to Neon's web console | Log into Neon Console → Project → Settings → Compute (or Billing page), record the actual plan/CU autoscale range, compare against the conservative 0.25 CU floor (104 `max_connections`) used as the planning baseline |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
