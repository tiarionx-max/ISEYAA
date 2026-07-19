---
phase: 17
slug: grpc-proof-of-pattern-extraction-notifications-service
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-18
---

# Phase 17 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 29.7.x (existing, `backend/jest.config.js`) |
| **Config file** | `backend/jest.config.js` (`rootDir: 'src'`) |
| **Quick run command** | `cd backend && npx jest notifications-client.service.spec.ts tour-notifications.service.spec.ts resilience.service.spec.ts` |
| **Full suite command** | `cd backend && npm test` |
| **Estimated runtime** | ~35 suites / 412+ tests (per Phase 10 verification run) |

---

## Sampling Rate

- **After every task commit:** Run the quick run command (or whichever spec the task touched)
- **After every plan wave:** Run `cd backend && npm test`
- **Before `/gsd-verify-work`:** Full suite must be green, plus the manual REST-response-shape diff (GRPC-03 criterion 3), the caller-graph audit artifact committed (GRPC-04), and the GRPC-05 grep gate showing zero matches
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 17-01-XX | 01 | 0 | GRPC-03 | — | `isTransientError()` classifies gRPC numeric status codes (UNAVAILABLE=14, DEADLINE_EXCEEDED=4, RESOURCE_EXHAUSTED=8) as transient | unit | `cd backend && npx jest resilience.service.spec.ts` | ⚠️ existing file needs new cases | ⬜ pending |
| 17-01-XX | 01 | 1 | GRPC-03 | — | `NotificationsClientService.sendPush`/`registerToken` convert Observable→Promise, wrap in resilience, throw `ServiceUnavailableException` on failure | unit | `cd backend && npx jest notifications-client.service.spec.ts` | ❌ Wave 0 — new file | ⬜ pending |
| 17-01-XX | 01 | 1 | GRPC-03 | — | `TourNotificationsService`'s 3 crons + 1 event handler work with facade substituted, still don't rethrow | unit | `cd backend && npx jest tour-notifications.service.spec.ts` | ⚠️ existing mock provide-token needs swap | ⬜ pending |
| 17-01-XX | 01 | 1 | GRPC-04 | — | Caller-graph audit accurate and complete | manual (grep-verified, committed markdown) | `grep -rn "NotificationsService" backend/src backend/apps --include="*.ts" \| grep -v ".spec.ts"` | N/A — documentation artifact | ⬜ pending |
| 17-01-XX | 01 | 1 | GRPC-05 | — | Zero `ClientGrpc`/`ClientProxyFactory` usage for Wallet/Transport/Delivery/Events/Stays/Marketplace/Auth/Tour modules | manual (grep gate) | `grep -rln "ClientGrpc\|ClientsModule" backend/src/modules/{wallet,transport,delivery,events,stays,marketplace,auth,tour-bookings,tour-packages,tour-guides}` — expect zero matches | ❌ not run as automated CI gate today (optional polish) | ⬜ pending |
| 17-01-XX | 01 | 1 | GRPC-03 | — | Web/mobile REST response shape for `/notifications/*` unchanged pre/post cutover | manual (before/after diff, local boot check) | manual — no automated e2e harness exists for gRPC-backed REST endpoints today | manual-only | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `backend/src/modules/notifications-client/__tests__/notifications-client.service.spec.ts` — new, covers GRPC-03's facade behavior (success, gRPC failure → 503, `listForUser` stub)
- [ ] `backend/src/resilience/__tests__/resilience.service.spec.ts` — new test cases for the gRPC numeric-status-code branch of `isTransientError()`
- [ ] `backend/src/modules/tour-bookings/__tests__/tour-notifications.service.spec.ts` — swap mock `provide` token from `NotificationsService` to `NotificationsClientService`

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| REST response shape for `/notifications/*` unchanged pre/post cutover | GRPC-03 | No automated e2e harness exists for gRPC-backed REST endpoints today | Boot monolith + notifications-service (docker-compose or bare-metal), hit `GET /notifications`, `POST /notifications/register-token`, `POST /notifications/send` before and after cutover; diff response shapes |
| Railway service for notifications-service exists in dashboard, linked to `backend/apps/notifications-service/railway.toml`, gRPC URL env var set on monolith's Railway service | GRPC-03 (criterion 2) | Genuine human-action prerequisite — no Railway CLI/dashboard access available to agents this session | Human confirms in Railway dashboard: service created, linked to correct `railway.toml`, env var pointing at private network hostname |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
