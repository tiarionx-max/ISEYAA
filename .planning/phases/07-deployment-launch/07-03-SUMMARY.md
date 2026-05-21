---
phase: 07-deployment-launch
plan: "03"
subsystem: monitoring
tags: [grafana, sentry, monitoring, rollback, observability]
dependency_graph:
  requires: ["07-02"]
  provides: ["grafana-dashboard", "sentry-runbook", "rollback-procedure"]
  affects: ["MANUAL-ACTIONS.md"]
tech_stack:
  added: []
  patterns: ["importable-grafana-json", "sentry-alert-rules", "railway-rollback"]
key_files:
  created:
    - monitoring/grafana-dashboard.json
    - monitoring/sentry-alerts.md
  modified:
    - MANUAL-ACTIONS.md
decisions:
  - "Grafana dashboard uses template variable for datasource UID to work across any Grafana Cloud org"
  - "Sentry alert for wallet failures uses stack trace filter rather than custom metric — no backend instrumentation changes needed"
  - "LAUNCH-07 rollback includes database caveat (Neon branch snapshot) to prevent partial-migration rollback issues"
  - "Appended both LAUNCH-07 and LAUNCH-06 sections to MANUAL-ACTIONS.md so all deployment actions are in one file"
metrics:
  duration: "74 minutes"
  completed: "2026-05-21"
  tasks_completed: 3
  files_created: 2
  files_modified: 1
---

# Phase 7 Plan 03: Grafana Dashboard, Sentry Alerts, Rollback Procedure Summary

Importable Grafana Cloud dashboard JSON (5 KPI panels), Sentry alert configuration runbook, and Railway 5-minute rollback procedure documented in MANUAL-ACTIONS.md.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create monitoring/grafana-dashboard.json | 78d1510 | monitoring/grafana-dashboard.json |
| 2 | Create monitoring/sentry-alerts.md | 78d1510 | monitoring/sentry-alerts.md |
| 3 | Append rollback procedure to MANUAL-ACTIONS.md | 78d1510 | MANUAL-ACTIONS.md |

## Files Created

### monitoring/grafana-dashboard.json

Valid Grafana 10.x importable dashboard JSON (`schemaVersion: 38`) with:

- **uid:** `iseyaa-production`
- **title:** ISEYAA Production KPIs
- **timezone:** Africa/Lagos
- **refresh:** 30s
- **time range:** now-1h to now
- **Template variable:** `${datasource}` — Prometheus datasource selector, works across any Grafana Cloud org

5 panels:

| Panel | PromQL | Type | Thresholds |
|-------|--------|------|-----------|
| Requests Per Second | `sum(rate(http_requests_total[1m]))` | timeseries | none |
| P95 Response Latency | `histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket[5m])) by (le)) * 1000` | stat | green < 300ms, yellow < 500ms, red >= 500ms |
| Error Rate % | `sum(rate(http_requests_total{status=~"5.."}[1m])) / sum(rate(http_requests_total[1m])) * 100` | stat | green < 0.1%, yellow < 0.5%, red >= 0.5% |
| Active WebSocket Connections | `websocket_active_connections` | stat | green < 400, yellow < 490, red >= 490 |
| Wallet Transactions (last hour) | `increase(wallet_transactions_total[1h])` | stat | green always |

**Import instructions:** Grafana Cloud → Dashboards → New → Import → Upload JSON file → select `monitoring/grafana-dashboard.json` → choose Prometheus datasource

### monitoring/sentry-alerts.md

Step-by-step Sentry configuration runbook covering:

**Backend (iseyaa-backend):**
- New Project creation and DSN setup in Railway
- `@sentry/nestjs` installation and `Sentry.init()` call in `main.ts`
- 4 alert rules with exact Sentry UI creation steps: high error rate, P95 latency spike, wallet failures, auth failures

**Mobile (iseyaa-mobile):**
- Already configured in Phase 6; DSN setup reminder
- 2 alert rules: crash-free session drop, new crash group
- Release tracking (source maps) via `eas.json` SENTRY_AUTH_TOKEN

Summary table of all 5 required alert rules for LAUNCH-06 compliance.

### MANUAL-ACTIONS.md (appended)

Added two new sections at the end of the Phase 7 block:

**LAUNCH-07: 5-Minute Rollback Procedure** — exact Railway UI steps (Deployments tab → Redeploy), test procedure (intentional break, time the cycle), database caveat (Neon branch snapshot + `prisma migrate resolve --rolled-back`).

**LAUNCH-06: Grafana + Sentry Monitoring Setup** — quick reference linking to the monitoring/ files, Grafana import steps, verification steps for both Grafana and Sentry.

## Deviations from Plan

None — plan executed exactly as written.

## Threat Mitigations Applied

| Threat ID | Mitigation |
|-----------|-----------|
| T-07-06 | sentry-alerts.md notes to keep Grafana dashboards private (requires login); noted Grafana Cloud's "Public dashboards" feature should remain disabled |
| T-07-07 | LAUNCH-07 rollback procedure includes explicit "create Neon branch snapshot before every deployment with a migration" instruction |

## Known Stubs

None — all three files are complete operational documents with no placeholder content.

## Self-Check: PASSED

- `monitoring/grafana-dashboard.json` exists, is valid JSON, contains `iseyaa-production` uid and all 5 PromQL queries including `http_request_duration_seconds_bucket`
- `monitoring/sentry-alerts.md` exists, contains `iseyaa-backend` section and 5-rule alert table
- `MANUAL-ACTIONS.md` contains `5-Minute Rollback` section with `LAUNCH-07` and `LAUNCH-06` markers
- Commit `78d1510` verified in git log
