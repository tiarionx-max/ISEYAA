---
phase: 16
slug: connection-pooling-infrastructure
status: draft
nyquist_compliant: true
wave_0_complete: true
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
| 16-01-01 | 16-01 | 1 | POOL-01 | T-16-01 | `DATABASE_URL` never logged raw; connection COUNTS logged, not connection string | unit (config-presence) | `cd backend && npx jest prisma-config.spec.ts -x` | ✅ present | ⬜ pending |
| 16-01-02 | 16-01 | 1 | POOL-01 | T-16-03 | `notifications-service` boots cleanly with `ResilienceModule` imported (no DI resolution error) | integration (manual boot check) | `cd backend && npx nest build notifications-service && node dist/apps/notifications-service/src/main.js` (expect clean listen log, Ctrl+C to stop) | manual-only | ⬜ pending |
| 16-02-01 | 16-02 | 1 | POOL-02 | T-16-04, T-16-05 | `DbMetricsService` polls `pg_stat_activity` every 30s and exports `postgres_open_connections` via OTel | unit (Jest, mocked Prisma) | `cd backend && npx jest db-metrics.service.spec.ts -x` | ✅ present | ⬜ pending |
| 16-03-01 | 16-03 | 2 | POOL-02 | T-16-07 | k6 native gRPC scenario exercises `notifications-service`'s SendPush RPC | load test (k6, single-iteration smoke) | `cd load-tests/k6 && k6 run --vus 1 --iterations 1 --env NOTIFICATIONS_GRPC_URL=localhost:5008 scenarios/notifications-grpc-flow.js` | ✅ present | ⬜ pending |
| 16-03-02 | 16-03 | 2 | POOL-02 | T-16-08 | Combined-topology VU function exercises monolith HTTP + notifications-service gRPC in the same iteration | load test (k6, single-iteration smoke) | `cd load-tests/k6 && k6 run --vus 1 --iterations 1 --env BASE_URL=http://localhost:3001 --env NOTIFICATIONS_GRPC_URL=localhost:5008 main.js` | ✅ present | ⬜ pending |
| 16-04-01 | 16-04 | 3 | POOL-01, POOL-02 | — | Real Neon plan/CU ceiling confirmed and reconciled against the 104-connection planning baseline | manual (Neon Console + human confirmation) | N/A — no Neon API credential provisioned in this project | manual-only | ⬜ pending |
| 16-04-02 | 16-04 | 3 | POOL-02 | T-16-09 | Combined-topology k6 run stays under confirmed ceiling; Grafana shows the live gauge with a saved alert rule | load test (k6, full combined run) + manual (Grafana UI) | `cd load-tests/k6 && k6 run --vus 50 --duration 60s ... main.js` + Grafana Cloud UI confirmation | manual-only | ⬜ pending |
| 16-04-03 | 16-04 | 3 | POOL-01 | T-16-09 | Live production Railway `DATABASE_URL` for the monolith updated to the pooled `-pooler` format with the confirmed `connection_limit`, redeployed, and confirmed via `pg_stat_activity`/Railway logs/Grafana gauge | manual (Railway dashboard + human confirmation) | N/A — Railway env var change is not code in this repo | manual-only | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `backend/src/prisma/__tests__/prisma-config.spec.ts` — new config-presence test asserting `DATABASE_URL` contains `-pooler` + `connection_limit` (covers POOL-01) — created by Plan 16-01 Task 3
- [x] `load-tests/k6/scenarios/notifications-grpc-flow.js` — new gRPC scenario covering POOL-02, wired into `load-tests/k6/main.js`'s default export — created by Plan 16-03 Task 1, wired by Task 2
- [x] `packages/proto/tsconfig.json` — needed for the INT-02 build script — created by Plan 16-01 Task 1

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `notifications-service` boots without a `ResilienceService` DI resolution error | POOL-01 | No automated boot-smoke test exists for any of the 8 gRPC scaffolds today | `cd backend && npx nest build notifications-service && node dist/apps/notifications-service/src/main.js` — expect clean listen log, no `Nest can't resolve dependencies` error, Ctrl+C to stop |
| Grafana dashboard shows the `postgres_open_connections` gauge and an alert rule fires at 80% of the confirmed ceiling | POOL-02 | Grafana alert rules are not code in this repo — same pattern as Phase 11's RESIL-02 | Log into Grafana Cloud, confirm the gauge metric is visible on the dashboard, confirm the alert rule is saved with the correct threshold |
| Actual Neon plan/compute-size (CU range) confirmed against the live Neon Console before `connection_limit`/alert-threshold numbers are treated as final | POOL-01, POOL-02 | Cannot be read from the repo or any automated tool — requires human login to Neon's web console | Log into Neon Console → Project → Settings → Compute (or Billing page), record the actual plan/CU autoscale range, compare against the conservative 0.25 CU floor (104 `max_connections`) used as the planning baseline |
| Live production Railway `DATABASE_URL` for the monolith actually updated to the pooled `-pooler` format with an explicit `connection_limit` and redeployed | POOL-01 | No Railway API credential is provisioned in this project's env vars for automated variable updates/redeploys | Log into the Railway dashboard, monolith service → Variables tab, replace `DATABASE_URL` with the pooled format from `.env.example`, redeploy, confirm via `pg_stat_activity`, Railway logs, or the Grafana gauge |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** confirmed (revision iteration 1)
