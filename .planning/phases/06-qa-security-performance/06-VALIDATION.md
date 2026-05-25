---
phase: "06"
phase_slug: "qa-security-performance"
date: "2026-05-19"
---

# Phase 06 — Validation Strategy

## Validation Dimensions

1. **HTTP Load Performance (QA-01)**
   Tool: k6 binary (Go, not npm). Measures P95 response latency and error rate under 10,000 concurrent virtual users. Gate: P95 < 500ms, error rate < 0.1%. Run first at 500 VUs (smoke), then at 10K VUs (acceptance gate) only after Neon PgBouncer is confirmed enabled.

2. **WebSocket Sustained Connections (QA-02)**
   Tool: Artillery 2.0.31 with socketio engine. Measures whether 500 concurrent Socket.IO connections remain open and active for 10 consecutive minutes sending GPS location events. Gate: 0 dropped connections over the hold window. Verify Socket.IO v4 compatibility with a 5-connection local smoke test before the full run.

3. **Cross-User Data Isolation (QA-03)**
   Tool: Jest 29.7.x + NestJS Testing Module (no HTTP layer). Three spec files cover wallet, stays/bookings, and marketplace/orders. Each test seeds two users, calls a service method with user A's identity requesting user B's resource, and asserts `ForbiddenException` or `NotFoundException`. Gate: 0 failures across all isolation specs.

4. **OWASP Security Scan (QA-04)**
   Tool: OWASP ZAP Docker image (`ghcr.io/zaproxy/zaproxy:stable`) in passive-scan mode (`-S` flag). Reads OpenAPI spec from `/api/docs-json` on staging. Gate: 0 CRITICAL findings. Requires `APP_ENV=staging` on Railway (not `production`) so Swagger is reachable. Pre-flight: `docker --version && curl -sf .../api/v1/health` confirmed in Task 1.

5. **Database Query Plan Audit (QA-05)**
   Tool: `ts-node` script running `prisma.$queryRawUnsafe` with `EXPLAIN ANALYZE` against Neon dev branch. 8 hot queries audited. Gate: every query shows `Index Scan`, not `Seq Scan`. Requires `prisma migrate dev --name add_fk_indexes` to have been applied (9 missing FK indexes added in plan 06-03).

6. **WebP Image Pipeline + LCP (QA-06)**
   Tool: Manual verification via `curl` (check `Content-Type: image/webp` header on uploaded image URL) + Chrome DevTools Performance tab (LCP on simulated Fast 3G). Gate: Content-Type is `image/webp`; LCP < 2.5s with warm CDN cache.

7. **Mobile Cold Start + Crash-Free Rate (QA-07)**
   Tool: Expo Atlas (`EXPO_UNSTABLE_ATLAS=true expo export`) for bundle size, ADB or Chrome DevTools Remote Debugging for cold start timing, Sentry React Native for crash session reporting. Gate (Phase 6): cold start < 3s on 3G; Sentry SDK confirmed initialized with at least 1 session reported in the 1-hour test window. Gate (Phase 7 LAUNCH-05): crash-free rate > 99.5% over 48 hours (formally measured post-launch).

## Requirement-to-Test Map

| Requirement | Test Method | Automated |
|-------------|-------------|-----------|
| QA-01: P95 < 500ms at 10K VUs | k6 `--vus 10000 --duration 5m` with `p(95)<500` threshold | Yes — `k6 run load-tests/k6/main.js` exits non-zero on threshold failure |
| QA-02: 500 WS connections sustained 10min | Artillery `socketio-gps.yml` with 10-min hold phase | Yes — `artillery run` reports connection drop count |
| QA-03: Cross-user data isolation | Jest isolation spec files (wallet, stays, marketplace) | Yes — `npx jest --testPathPattern isolation` |
| QA-04: ZAP 0 critical findings | OWASP ZAP passive scan via Docker | Semi-automated — human opens HTML report and counts CRITICAL entries |
| QA-05: Index Scan on all 8 hot queries | `ts-node load-tests/db-audit/explain-analyze.ts` EXPLAIN ANALYZE output | Semi-automated — human reads plan output for "Index Scan" vs "Seq Scan" |
| QA-06: Images as WebP; LCP < 2.5s | curl Content-Type check + Chrome DevTools LCP | Semi-automated — curl check is scripted; LCP is manual |
| QA-07: Cold start < 3s; crash-free SDK init | Expo Atlas export + ADB timing + Sentry session check | Semi-automated — Atlas is scripted; cold start and Sentry are manual |

## Wave 0 Gaps

The following test artifacts do not exist at phase start and must be created in Wave 1 plans before any Wave 2 verification can run:

- [ ] `load-tests/k6/main.js` — k6 entry point with thresholds (covers QA-01)
- [ ] `load-tests/k6/scenarios/wallet-flow.js` — authenticated wallet endpoint scenario
- [ ] `load-tests/artillery/socketio-gps.yml` — 500-connection GPS test (covers QA-02)
- [ ] `load-tests/artillery/processor.js` — JWT injection for Artillery sessions
- [ ] `load-tests/db-audit/explain-analyze.ts` — EXPLAIN ANALYZE runner (covers QA-05)
- [ ] `load-tests/db-audit/tsconfig.json` — ts-node config for the audit script
- [ ] `backend/src/modules/wallet/__tests__/wallet-isolation.spec.ts` — QA-03 wallet isolation
- [ ] `backend/src/modules/stays/__tests__/stays-isolation.spec.ts` — QA-03 booking isolation
- [ ] `backend/src/modules/marketplace/__tests__/marketplace-isolation.spec.ts` — QA-03 order isolation

All gaps are addressed in plans 06-01 through 06-05. Plan 06-06 is the final human-verified gate that confirms all 7 QA criteria are met.
