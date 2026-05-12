---
phase: 2
slug: infrastructure-migration
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-12
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 29 (NestJS default) |
| **Config file** | `backend/package.json` (jest config) |
| **Quick run command** | `cd backend && npm test -- --passWithNoTests` |
| **Full suite command** | `cd backend && npm test` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd backend && npm test -- --passWithNoTests`
- **After every plan wave:** Run `cd backend && npm test` (all 153 tests must still pass)
- **Before `/gsd-verify-work`:** Full suite green + all infrastructure smoke tests passing
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | Status |
|---------|------|------|-------------|-----------|-------------------|--------|
| 02-01-01 | 01 | 1 | INFRA-01 | integration | `cd backend && npx prisma migrate status` exits 0 on Neon | ⬜ pending |
| 02-01-02 | 01 | 1 | INFRA-01 | integration | `cd backend && npx prisma db pull` against Neon returns schema matching local | ⬜ pending |
| 02-02-01 | 02 | 1 | INFRA-02 | integration | Redis PING returns PONG via Upstash TLS connection | ⬜ pending |
| 02-02-02 | 02 | 1 | INFRA-02 | unit | 153 existing tests pass with Upstash env vars | ⬜ pending |
| 02-03-01 | 03 | 1 | INFRA-03 | integration | `PutObjectCommand` to R2 returns 200; presigned URL resolves | ⬜ pending |
| 02-03-02 | 03 | 1 | INFRA-03 | unit | S3Service unit tests pass with R2 credentials | ⬜ pending |
| 02-04-01 | 04 | 2 | INFRA-04 | deployment | Each Railway service health-check endpoint returns 200 | ⬜ pending |
| 02-04-02 | 04 | 2 | INFRA-04 | deployment | `git push` to main triggers auto-deploy in Railway | ⬜ pending |
| 02-05-01 | 05 | 2 | INFRA-05 | manual | No `.env` files in any committed path; secrets injected at runtime | ⬜ pending |
| 02-06-01 | 06 | 2 | INFRA-06 | manual | Grafana Cloud shows traces for POST /auth/register with >3 spans | ⬜ pending |
| 02-06-02 | 06 | 2 | INFRA-06 | manual | Sentry captures test error and shows stack trace in dashboard | ⬜ pending |
| 02-07-01 | 07 | 3 | INFRA-07 | integration | Each microservice starts independently and responds to gRPC health check | ⬜ pending |
| 02-07-02 | 07 | 3 | INFRA-07 | integration | auth-service REST POST /auth/login returns JWT (end-to-end through API gateway) | ⬜ pending |
| 02-08-01 | 08 | 3 | INFRA-08 | unit | gRPC proto compilation succeeds: `npm run proto:gen` exits 0 | ⬜ pending |
| 02-08-02 | 08 | 3 | INFRA-08 | integration | wallet-service gRPC call to auth-service for token validation returns correct userId | ⬜ pending |
| 02-09-01 | 09 | 3 | INFRA-09 | integration | Kafka producer publishes charge.success; consumer receives and processes in <5s | ⬜ pending |
| 02-09-02 | 09 | 3 | INFRA-09 | integration | No EventEmitter2 imports remain in any service after migration | ⬜ pending |
| 02-10-01 | 10 | 1 | INFRA-10, SEARCH-01–03 | integration | Typesense health endpoint returns 200; attraction search returns results in <100ms | ⬜ pending |
| 02-10-02 | 10 | 1 | INFRA-10, SEARCH-01 | integration | Search for "Olum" returns Olumo Rock (typo tolerance active) | ⬜ pending |
| 02-10-03 | 10 | 2 | SEARCH-02 | integration | Geo-ranked search for attractions near lat:7.16 lng:3.35 returns nearest first | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `backend/test/` — 153 existing tests must remain green throughout migration
- [ ] Smoke test scripts for each infrastructure component (Neon ping, Upstash Redis ping, R2 upload)
- [ ] `packages/proto/` directory created with first `.proto` file before Wave 3 begins

*Existing Jest infrastructure covers unit testing. Integration tests must be run manually against live infrastructure.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| No .env files in repo | INFRA-05 | Git inspection required | `git log --all --full-history -- "**/.env"` returns empty |
| Grafana dashboards show live data | INFRA-06 | Requires live traffic | Send 10 requests, verify traces appear in Grafana Cloud within 60s |
| Railway auto-deploy triggers | INFRA-04 | Requires GitHub push | Push a dummy commit to main, verify Railway deployment starts within 2 min |
| Infisical secrets injected correctly | INFRA-05 | Runtime verification | `railway run env | grep DATABASE_URL` shows Neon connection string |
| Typesense geo-ranking accuracy | SEARCH-02 | Requires seeded data | Query attractions near Abeokuta — Olumo Rock (0km) must rank above Agodi Gardens (80km) |

---

## Validation Architecture

Infrastructure validation uses a 3-tier approach:
1. **Unit** — existing Jest tests must remain green throughout (regression guard)
2. **Integration smoke tests** — per-component scripts that ping each new infrastructure piece
3. **Manual deployment verification** — Railway, Grafana, and Infisical verified by human inspection

The monolith (Waves 1-2) is validated before any microservice extraction (Wave 3). This ensures the infrastructure migration itself doesn't break the existing test suite, and that microservice extraction starts from a known-good baseline.
