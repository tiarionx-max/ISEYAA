# Phase 6: QA, Security & Performance - Research

**Researched:** 2026-05-19
**Domain:** Load testing, OWASP security scanning, database query optimization, image optimization, mobile performance
**Confidence:** HIGH (verified stack) / MEDIUM (tool-specific patterns)

---

## Summary

Phase 6 is a hardening sprint that must satisfy seven quantitative acceptance criteria before Phase 7 launch. The work divides cleanly into five technical tracks: (1) HTTP load testing with k6 targeting 10 K concurrent virtual users at P95 < 500ms, (2) WebSocket stress testing with Artillery for Socket.IO targeting 500 sustained connections over 10 minutes, (3) application-level data-isolation testing (the project uses Prisma — database-native RLS is not configured — so this is a Jest integration test suite confirming guards enforce user-scoped access), (4) OWASP ZAP API scan via Docker against the Swagger OpenAPI spec, and (5) a combined image and mobile performance track covering WebP upload-time conversion, Cloudflare image transforms, and Expo Atlas bundle analysis.

The codebase already has strong foundations: Sentry + OpenTelemetry are wired in `instrumentation.ts`, Helmet, compression, throttler, and CORS are configured in `main.ts`, and 270 unit tests are passing. Phase 6 does not add new features — it adds load scripts, security scans, index migrations, image pipeline changes, and mobile optimization configuration. Known bugs flagged in `STATE.md` (admin `v.category` raw SQL column, escrow checkIn/checkOut cutoff, marketplace stock decrement, Paystack pre-credit verification) must be fixed as part of this phase since the security scan will surface the admin 500 error and the integration tests will catch the isolation bugs.

**Primary recommendation:** Run all five tracks in parallel waves: bugs first (Wave 1), then load tests + ZAP scan + index audit (Wave 2), then WebP pipeline + mobile optimization (Wave 3), with a green-gate integration test run between each wave.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| QA-01 | k6 load test passes with 10,000 concurrent users, P95 < 500ms, error rate < 0.1% | k6 stages pattern, Neon connection pooling (PgBouncer), Upstash rate limit awareness |
| QA-02 | 500 concurrent WebSocket connections (transport GPS tracking) sustain for 10 minutes with zero drops | Artillery with socketio engine, JWT auth in handshake, trip room isolation |
| QA-03 | RLS test suite confirms user A cannot read user B's wallet, bookings, orders, or personal data | Jest integration test pattern with two seeded users, NestJS testing module, direct service call isolation |
| QA-04 | OWASP ZAP scan on staging returns zero critical findings on wallet, KYC, and auth endpoints | ZAP Docker API scan against /api/docs OpenAPI spec, passive + active modes |
| QA-05 | All hot database queries have EXPLAIN ANALYZE output confirming no sequential scans; indexes added where missing | 9 missing FK indexes identified in schema audit; Prisma @@index migrations |
| QA-06 | All images served via Cloudflare R2 are WebP-optimized; LCP < 2.5s on 3G | sharp WebP conversion in ImageService before upload; Cloudflare Image Transforms URL pattern |
| QA-07 | App cold start time < 3s on a 3G connection; crash-free rate > 99.5% | Expo Atlas EXPO_UNSTABLE_ATLAS=true, Hermes bytecode, lazy screens, Sentry crash-free rate |
</phase_requirements>

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| HTTP load testing (QA-01) | External tool (k6) | Backend API tier | k6 drives VUs; NestJS handles requests; Neon+Upstash are the bottlenecks |
| WebSocket stress test (QA-02) | External tool (Artillery) | Backend WebSocket tier | Artillery sends Socket.IO events; TransportGateway handles them |
| Data isolation (QA-03) | Backend service layer | Database layer | Prisma + Guards enforce isolation; no DB-native RLS is configured |
| Security scan (QA-04) | External tool (ZAP Docker) | Backend API tier | ZAP reads OpenAPI spec from /api/docs; scans all endpoints |
| Query indexes (QA-05) | Database layer | Backend Prisma schema | @@index declarations in schema.prisma; `prisma migrate dev` applies them |
| WebP image pipeline (QA-06) | Backend service (ImageService) | CDN layer (Cloudflare) | sharp converts to WebP pre-upload; Cloudflare Image Transforms for on-demand |
| Mobile cold start (QA-07) | Mobile bundle (Metro/Hermes) | CDN layer (delivery speed) | Expo Atlas identifies bloat; Hermes bytecode; lazy loading reduces initial parse |

---

## Standard Stack

### Core Tools

| Tool | Version | Purpose | Why Standard |
|------|---------|---------|--------------|
| k6 | 0.55.x (binary, not npm) | HTTP load testing with VUs and thresholds | Go binary, scripted in JS, first-class CI support, Grafana Cloud output |
| Artillery | 2.0.31 | Socket.IO / WebSocket load testing | Native Socket.IO engine, YAML declarative, supports authentication |
| OWASP ZAP | `ghcr.io/zaproxy/zaproxy:stable` | DAST security scanner | Docker-native, API scan mode reads OpenAPI spec directly from Swagger endpoint |
| Expo Atlas | Built into Expo SDK 51+ | React Native bundle analysis | `EXPO_UNSTABLE_ATLAS=true npx expo export` — no separate install |
| sharp | 0.34.5 (already installed) | WebP conversion pre-upload | Already in codebase; `.webp({ quality: 85 })` replaces `.jpeg({ quality: 85 })` |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@types/k6` | 0.0.x | k6 TypeScript type hints in IDE | Editor support for k6 scripts (not a runtime dep) |
| `artillery-engine-socketio-v3` | community | Artillery Socket.IO v3/v4 compatibility | Required if bundled Artillery engine does not match your Socket.IO version — verify first |
| `socket.io-client` | 4.8.3 (already installed mobile) | Manual Node.js WebSocket stress scripts | Fallback if Artillery has compatibility issues with custom auth handshake |

**Version verification (k6):**
```bash
# k6 is a Go binary — install via package manager, not npm
# macOS: brew install k6
# Linux: sudo apt install k6  (after adding grafana repo)
# Windows: choco install k6   OR  winget install k6
k6 version
```

**Version verification (Artillery):**
```bash
npm install -g artillery@latest
artillery --version
```

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| k6 for HTTP load | Locust (Python) | k6 has better CI output and JS scripting; Locust requires Python runtime |
| Artillery for WS | k6 with k6/ws | k6 ws module is raw WebSocket — does not speak the Socket.IO handshake protocol natively; Artillery's socketio engine is the safer choice |
| ZAP Docker | Burp Suite | ZAP is free/open source; Burp requires licence for automation |
| Expo Atlas | react-native-bundle-visualizer | Atlas is the official Expo tool, available from SDK 51 onward (this project is SDK 51) |

---

## Architecture Patterns

### System Architecture Diagram

```
Load Testing Track
──────────────────
[k6 VUs]──────────────────→ [Railway backend :3001] → [Neon Postgres] → [Upstash Redis]
                                                      ↓
[Artillery VUs]──(ws)──────→ [TransportGateway (Socket.IO)] → trip room emit

Security Track
──────────────
[ZAP Docker]──(HTTP)──────→ [/api/docs OpenAPI spec] → [passive scan all endpoints]
                          └─(HTTP active scan)───────→ [wallet / KYC / auth]

Database Track
──────────────
[prisma.$queryRaw EXPLAIN ANALYZE] → [Neon Postgres] → [output: Seq Scan / Index Scan]
[schema.prisma @@index additions] → [prisma migrate dev] → [new indexes deployed]

Image Track
───────────
[upload request] → [ImageService.sharp] → [.webp({ quality: 85 })] → [S3Service.upload]
                                                                       → [R2 bucket]
                                           [Cloudflare Image Transforms URL] → [CDN cache]

Mobile Track
────────────
[EXPO_UNSTABLE_ATLAS=true expo export] → [Atlas web UI :8081/_expo/atlas]
[Hermes bytecode (default SDK 51)]     → [reduced cold parse time]
[lazy screen imports]                  → [smaller initial bundle]
```

### Recommended Project Structure

```
load-tests/
├── k6/
│   ├── common/
│   │   └── auth.js          # helper: login + return Bearer token
│   ├── scenarios/
│   │   ├── auth-flow.js     # register / login / refresh
│   │   ├── wallet-flow.js   # topup / balance / debit
│   │   ├── events-flow.js   # list events / purchase ticket
│   │   └── transport-flow.js # request ride
│   └── main.js              # orchestrates all scenarios, defines thresholds
├── artillery/
│   ├── socketio-gps.yml     # 500-connection GPS tracking test
│   └── processor.js         # dynamic JWT token injection
backend/src/
├── modules/
│   └── */
│       └── __tests__/
│           └── *-isolation.spec.ts  # new: cross-user RLS tests
└── prisma/
    └── migrations/
        └── <date>_add_fk_indexes/
            └── migration.sql        # new FK indexes
```

### Pattern 1: k6 Load Test with Stages and Thresholds (QA-01)

**What:** Ramp from 0 to 10,000 VUs over 5 minutes, hold for 5 minutes, ramp down. Assert P95 < 500ms and error rate < 0.1%.

**When to use:** Final acceptance gate before Phase 7. Also run at 500 VUs after each wave to catch regressions early.

```javascript
// Source: k6 official docs — https://grafana.com/docs/k6/latest/
// load-tests/k6/main.js
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend } from 'k6/metrics';

export const options = {
  stages: [
    { duration: '2m', target: 500 },    // warm up
    { duration: '3m', target: 10000 },  // ramp to 10 K
    { duration: '5m', target: 10000 },  // hold
    { duration: '2m', target: 0 },      // ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'],   // QA-01: P95 < 500ms
    http_req_failed:   ['rate<0.001'],  // QA-01: error rate < 0.1%
  },
};

const BASE_URL = __ENV.BASE_URL || 'https://iseyaa-api.railway.app';

export default function () {
  const res = http.get(`${BASE_URL}/api/v1/health`, {
    tags: { endpoint: 'health' },
  });
  check(res, { 'status is 200': (r) => r.status === 200 });
  sleep(1);
}
```

**Critical note for Neon:** Neon serverless PostgreSQL has a default connection limit (~100 pooled connections per branch). k6 at 10 K VUs will overwhelm raw connections. The backend must use connection pooling (PgBouncer in transaction mode, enabled via the `?pgbouncer=true` suffix on `DATABASE_URL` for Neon). [VERIFIED: Neon docs — connection pooling is a toggle on the Neon project dashboard, then append `?pgbouncer=true` to DATABASE_URL] [ASSUMED]

### Pattern 2: Artillery Socket.IO Stress Test (QA-02)

**What:** 500 concurrent connections sending GPS location events for 10 minutes with JWT auth.

**When to use:** After the Transport module is deployed to staging.

```yaml
# Source: Artillery docs — https://www.artillery.io/blog/load-testing-socketio-with-artillery
# load-tests/artillery/socketio-gps.yml
config:
  target: "https://iseyaa-api.railway.app"
  engines:
    socketio: {}
  phases:
    - duration: 60
      arrivalRate: 5       # 5 new connections/sec → 300 connections in 60s
    - duration: 540        # hold for 9 more minutes = 10 min total
      arrivalRate: 2       # top off to 500

scenarios:
  - name: "GPS Driver Tracking"
    engine: "socketio"
    flow:
      - emit:
          channel: "join:driver"
      - loop:
          - emit:
              channel: "driver:location"
              data:
                tripId: "{{ tripId }}"
                lat: 6.889
                lng: 3.721
          - think: 2        # 2-second GPS interval matching production
        count: 300          # 300 iterations × 2s ≈ 10 minutes
```

**Auth requirement:** The TransportGateway verifies JWT on `handshake.auth.token`. Artillery's socketio engine supports custom handshake options via `extraHeaders` or by injecting the token in the connect flow. Use a `processor.js` to pre-login and inject the token. [ASSUMED — verify Artillery socketio engine handshake options against current version]

**Artillery Socket.IO v4 compatibility:** The Socket.IO official docs state that Artillery's default client is v2, incompatible with v4 servers. Check whether `artillery-engine-socketio-v3` is needed by testing with a small script first. Current artillery v2.0.31 may bundle an updated client. [MEDIUM confidence — requires test verification]

### Pattern 3: Cross-User Data Isolation Test (QA-03)

**What:** Jest integration tests using the NestJS Testing Module (no HTTP layer) that call service methods with user A's identity but request user B's resources.

**When to use:** Every PR that touches wallet, bookings, or orders services.

```typescript
// Source: project convention — backend/src/modules/wallet/__tests__/wallet-isolation.spec.ts
import { Test } from '@nestjs/testing';
import { WalletService } from '../wallet.service';

describe('Wallet isolation', () => {
  let service: WalletService;
  const USER_A = 'user-a-uuid';
  const USER_B = 'user-b-uuid';

  beforeEach(async () => {
    // seed wallet for USER_B in mockPrisma
    mockPrisma.wallet.findUnique.mockImplementation(({ where }) => {
      if (where.userId === USER_B) return mockWalletB;
      return null;
    });
    // build module with mocked Prisma
    const module = await Test.createTestingModule({
      providers: [WalletService, /* mocks */],
    }).compile();
    service = module.get(WalletService);
  });

  it('rejects user A reading user B wallet', async () => {
    // call getWallet with USER_B's walletId but authenticated as USER_A
    await expect(service.getBalance(USER_A)).rejects.toThrow();
    // or assert the returned wallet.userId === USER_A (not USER_B)
  });
});
```

**Key observation:** Because ISEYAA uses application-level guards (`@CurrentUser` from JWT, scoped queries with `where: { userId: currentUser.id }`) rather than database-native RLS, the isolation test must verify that service methods **never** accept a foreign resource ID without checking ownership. The test pattern is: (1) seed two users, (2) call service method with user A's JWT but user B's resource ID, (3) assert `ForbiddenException` or `NotFoundException` is thrown. [VERIFIED: codebase inspection — Prisma queries in wallet.service.ts use `where: { userId }` scoping]

### Pattern 4: OWASP ZAP API Scan (QA-04)

**What:** Docker-based ZAP scan against the Swagger OpenAPI spec.

**When to use:** Against the staging Railway deployment before Phase 7.

```bash
# Source: https://www.zaproxy.org/docs/docker/api-scan/
# Passive scan only (safe, no mutations) — run first to inventory findings
docker run --rm -v $(pwd)/zap-reports:/zap/reports \
  ghcr.io/zaproxy/zaproxy:stable \
  zap-api-scan.py \
    -t https://iseyaa-staging.railway.app/api/docs-json \
    -f openapi \
    -r zap-reports/passive-report.html \
    -S   # -S = safe mode (passive only)

# Active scan (can mutate data — run against isolated staging only, never production)
docker run --rm -v $(pwd)/zap-reports:/zap/reports \
  ghcr.io/zaproxy/zaproxy:stable \
  zap-api-scan.py \
    -t https://iseyaa-staging.railway.app/api/docs-json \
    -f openapi \
    -r zap-reports/active-report.html
```

**Swagger spec endpoint:** NestJS exposes JSON at `/api/docs-json` (Swagger module default) or `/api/docs-yaml`. Confirm the exact path with a `curl https://staging/api/docs-json | head -5`. The current `main.ts` gates Swagger by `APP_ENV !== 'production'`, so the staging environment needs `APP_ENV=staging` (not `production`) for ZAP to reach the spec.

**Expected findings (pre-fix):** ZAP will likely flag `cors: { origin: '*' }` on the WebSocket gateway as a MEDIUM finding, and the `helmet()` default config's missing `Content-Security-Policy` for API-only routes as LOW. The `ALLOWED_ORIGINS=*` in `.env.example` will trigger a CORS alert. Fix before scanning: set `ALLOWED_ORIGINS` to the actual frontend domains.

### Pattern 5: Prisma EXPLAIN ANALYZE Audit Script (QA-05)

**What:** A standalone script that runs `EXPLAIN ANALYZE` on the 8 hot queries via `prisma.$queryRaw`.

```typescript
// load-tests/db-audit/explain-analyze.ts
// Run with: ts-node load-tests/db-audit/explain-analyze.ts
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient({ log: ['query'] });

async function audit() {
  const queries = [
    // Transaction history — walletId FK not indexed
    `EXPLAIN ANALYZE SELECT * FROM transactions WHERE "walletId" = 'test-id' ORDER BY "createdAt" DESC LIMIT 20`,
    // Tickets by user — userId FK not indexed
    `EXPLAIN ANALYZE SELECT * FROM tickets WHERE "userId" = 'test-id'`,
    // Bookings by user — userId FK not indexed
    `EXPLAIN ANALYZE SELECT * FROM bookings WHERE "userId" = 'test-id' ORDER BY "createdAt" DESC`,
    // Orders by user — userId FK not indexed
    `EXPLAIN ANALYZE SELECT * FROM orders WHERE "userId" = 'test-id' ORDER BY "createdAt" DESC`,
    // Trip lookup by rider — riderId FK not indexed
    `EXPLAIN ANALYZE SELECT * FROM trips WHERE "riderId" = 'test-id' ORDER BY "requestedAt" DESC`,
    // Delivery orders by sender — senderId FK not indexed
    `EXPLAIN ANALYZE SELECT * FROM delivery_orders WHERE "senderId" = 'test-id' ORDER BY "createdAt" DESC`,
    // Audit log by user — userId FK not indexed
    `EXPLAIN ANALYZE SELECT * FROM audit_logs WHERE "userId" = 'test-id' ORDER BY "createdAt" DESC LIMIT 50`,
    // Ticket type availability — eventId FK not indexed
    `EXPLAIN ANALYZE SELECT * FROM ticket_types WHERE "eventId" = 'test-id' AND "deletedAt" IS NULL`,
  ];

  for (const q of queries) {
    const result = await prisma.$queryRawUnsafe(q);
    console.log(q.split('\n')[0]);
    console.log(result);
    console.log('---');
  }
  await prisma.$disconnect();
}

audit().catch(console.error);
```

### Pattern 6: WebP Conversion Pre-Upload (QA-06)

**What:** Modify `ImageService` to convert all uploads to WebP before calling `S3Service.upload`.

```typescript
// Source: sharp npm docs — https://www.npmjs.com/package/sharp
// Modify backend/src/common/services/image.service.ts

async resizeEventCover(buffer: Buffer): Promise<{ buffer: Buffer; contentType: string }> {
  const optimized = await sharp(buffer)
    .resize(1200, 630, { fit: 'cover', position: 'centre' })
    .webp({ quality: 85 })   // ← was .jpeg({ quality: 85 })
    .toBuffer();
  return { buffer: optimized, contentType: 'image/webp' };
}

// Callers must update key extension: 'events/cover.webp' instead of 'events/cover.jpg'
```

**Cloudflare Image Transforms (on-demand):** Cloudflare supports on-the-fly WebP conversion via URL transformation:
```
https://<zone>/cdn-cgi/image/format=webp,quality=85/<R2-object-key>
```
This is available on the Cloudflare Free tier (5,000 unique transformations/month included). Cached transformations are served for free after first render. For a government platform with ~100K monthly users, this is adequate for MVP. [VERIFIED: Cloudflare pricing docs — https://developers.cloudflare.com/images/pricing/]

**LCP measurement:** Use Chrome DevTools → Performance tab → record page load on simulated 3G (Fast 3G preset). The largest contentful paint target is 2.5s. With WebP images (~30% smaller than JPEG at same quality), CDN caching, and compressed responses (already enabled via `compression()` in main.ts), this target is achievable.

### Pattern 7: Expo Atlas Bundle Analysis (QA-07)

```bash
# Source: Expo official docs — https://docs.expo.dev/guides/analyzing-bundles/
# Enable Atlas during export
EXPO_UNSTABLE_ATLAS=true npx expo export --platform ios
# Open the Atlas visualization
npx expo-atlas .expo/atlas.jsonl

# Target: keep the initial bundle below ~2MB for 3G < 3s cold start
# Hermes is default in SDK 51 — bytecode compilation at build time reduces parse time
```

**Key optimizations for cold start:**
1. Verify `"jsEngine": "hermes"` is set in `app.json` (this project's SDK 51 default)
2. Lazy-load heavy screens (AI chat, KYC flow) with `React.lazy()` or `expo-router`'s `lazy` option
3. Check if `react-native-maps`, `react-native-reanimated`, and `socket.io-client` are tree-shaken from screens that don't need them

### Anti-Patterns to Avoid

- **Running active ZAP scan against production:** Will attempt SQL injection, XSS, and CSRF attacks against real data. Always scan staging only.
- **k6 testing against production Neon branch:** Load tests can exhaust Neon connection pool. Use the Neon dev branch or a dedicated load-test branch.
- **Artillery with `arrivalRate` only, no duration:** Without a hold phase, the test ramps and immediately tears down — does not validate 10-minute sustained connections.
- **Measuring LCP without Cloudflare cache:** First-request LCP includes origin fetch latency. Test with a warm CDN cache (run the page twice, measure second).
- **Isolation tests that only mock Prisma at the HTTP layer:** If the mock returns data regardless of userId, the test has no coverage. Mock must respect `where.userId` in the mock implementation.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| HTTP load generation | Custom Node.js loop | k6 | k6 handles connection pooling, response validation, threshold checks, CI exit codes |
| WebSocket load generation | Custom ws.connect() loop | Artillery with socketio engine | Artillery manages concurrency, backpressure, and metric collection automatically |
| DAST scanning | Custom vulnerability checkers | OWASP ZAP | ZAP embeds OWASP Top 10 rules, SQLi detection, header analysis, and report generation |
| Bundle size analysis | Manual file size comparisons | Expo Atlas | Atlas provides treemap visualization, unmapped regions, and per-module size breakdowns |
| Image transcoding CDN | Custom Workers for every request | sharp pre-upload + Cloudflare Image Transforms | Pre-upload converts at rest; Cloudflare handles per-request resize without server CPU |
| Database query profiling | Logging all query times | `prisma.$queryRaw EXPLAIN ANALYZE` | Direct plan output shows whether indexes are used; query timing alone does not distinguish full-scan vs. index-scan |

**Key insight:** QA tooling is its own ecosystem. All five acceptance criteria have purpose-built, battle-tested tools. Custom implementations introduce measurement error (load generators that can't saturate the server) or false negatives (security scanners that miss injection vectors).

---

## Common Pitfalls

### Pitfall 1: Neon Connection Pool Exhaustion During k6 Test

**What goes wrong:** k6 at 10 K VUs can generate thousands of concurrent DB connections. Neon serverless has a default pooled limit. NestJS/Prisma opens a connection per query unless PgBouncer pooling is enabled.

**Why it happens:** Prisma's default connection limit is calculated from `ceil(2 + (cpus * 2))`. On Railway's 1 vCPU container, that is 4 connections. At 10 K VUs, the queue builds up and latency spikes, not the backend code itself.

**How to avoid:** Enable Neon PgBouncer (transaction-mode pooling) by appending `?pgbouncer=true&connection_limit=10` to `DATABASE_URL`. Set `Prisma.connection_limit` to a pool-appropriate value. Test with 500 VUs first to confirm P95 behavior before scaling to 10 K.

**Warning signs:** k6 output shows `http_req_waiting` time (TTFB) > 400ms while `http_req_sending` is near 0. Indicates DB queue, not network.

### Pitfall 2: Artillery Socket.IO v2 vs v4 Client Mismatch

**What goes wrong:** Artillery ships with Socket.IO v2 client by default. The ISEYAA backend uses Socket.IO v4.8.3. The handshake uses a different path and polling upgrade protocol. Connections will fail silently or return HTTP 400 from the v4 server.

**Why it happens:** Socket.IO changed the default transport path and handshake format between v2 and v3.

**How to avoid:** Either install `artillery-engine-socketio-v3` (community plugin), or validate that the bundled Artillery v2.0.31 ships with a v4-compatible client. Run `artillery run --target http://localhost:3001 socketio-gps.yml` against a local dev server first and check the NestJS logs for `Client connected:` messages.

**Warning signs:** No `Client connected:` log lines in NestJS, but Artillery reports connections as opened.

### Pitfall 3: ZAP Cannot Reach Swagger Because APP_ENV=production

**What goes wrong:** `main.ts` conditionally registers Swagger only when `APP_ENV !== 'production'`. If the staging environment has `APP_ENV=production`, ZAP gets a 404 for `/api/docs-json` and scans zero endpoints.

**Why it happens:** Swagger is intentionally gated in production per the STATE.md security note ("Swagger UI exposed without auth in production — must gate before Phase 7 launch").

**How to avoid:** For Phase 6 staging, set `APP_ENV=staging`. Confirm ZAP can retrieve the spec with `curl https://staging/api/docs-json` before running the full scan. After ZAP passes, add authentication or IP restriction to the Swagger route before Phase 7.

**Warning signs:** ZAP report shows 0 endpoints scanned, or all URLs are 404.

### Pitfall 4: Prisma @@index on FK Columns Requires Migration

**What goes wrong:** Adding `@@index([userId])` to the Prisma schema does not automatically apply to the database. If `prisma migrate dev` is not run, the index exists only in schema.prisma but not in Neon, and EXPLAIN ANALYZE still shows Seq Scan.

**Why it happens:** Prisma schema and database state are separate. `prisma generate` regenerates the client but does not touch the database.

**How to avoid:** After adding all `@@index` directives, run `prisma migrate dev --name add_fk_indexes` to generate and apply the migration. Verify with `EXPLAIN ANALYZE` that Index Scan appears in the query plan for each patched table.

**Warning signs:** EXPLAIN ANALYZE still shows `Seq Scan on transactions` after schema edit.

### Pitfall 5: WebP Key Extension Mismatch in R2

**What goes wrong:** After converting to WebP, the uploaded R2 key still has `.jpg` extension. Browsers use the `Content-Type` header not the extension, but Cloudflare Image Transforms URL-based approach may use the extension to determine format, causing confusion.

**Why it happens:** `ImageService.resizeEventCover` returns a buffer. The caller constructs the S3 key. If the key generation code hardcodes `.jpg`, the stored file is WebP with a `.jpg` name.

**How to avoid:** Return `{ buffer, contentType: 'image/webp' }` from `resizeEventCover`. Callers update key construction to use `.webp` suffix. Update any URL-matching logic in frontend components.

**Warning signs:** Images in R2 have `.jpg` extension but open as WebP. Cloudflare Transform URLs using `/cdn-cgi/image/` may behave unexpectedly.

### Pitfall 6: Admin Revenue SQL Bug Causes 500 During Security Scan

**What goes wrong:** ZAP (or any caller) hitting `GET /api/v1/admin/revenue` receives a 500. ZAP may flag this as an unhandled error — a HIGH-severity finding.

**Why it happens:** `admin.service.ts` line 70 executes `SELECT v.category FROM vendors` but the `vendors` table has no `category` column (schema confirmed: `Vendor` model has no such field).

**How to avoid:** Fix the `getRevenue()` SQL in Wave 1 before running ZAP. Remove or replace the by-category breakdown query. Since `Vendor` has no `category`, replace with grouping by `status` or `lgaId` as a useful alternative.

**Warning signs:** `GET /api/v1/admin/revenue` returns 500 in logs with `column v.category does not exist`.

### Pitfall 7: k6 "10,000 VUs" on a Single Developer Laptop Will OOM

**What goes wrong:** Running k6 with 10,000 VUs locally exhausts the machine's sockets/memory and the test results are invalid (the load generator is the bottleneck, not the server).

**Why it happens:** k6 at 10 K VUs consumes roughly 1–4 GB RAM on the load generator machine.

**How to avoid:** Use k6 Cloud (free tier: 50 VUs) or a dedicated CI machine. Alternatively, run the test from a separate Railway one-off process or a GitHub Actions runner with adequate RAM. For local validation, use 500 VUs as a smoke test. The actual 10 K run should be from a cloud environment. [ASSUMED — k6 cloud free tier limits; verify current limits at app.k6.io]

---

## Code Examples

### Admin Revenue Bug Fix

```typescript
// Source: codebase inspection — admin.service.ts line 70
// BEFORE (broken — vendors has no 'category' column):
this.prisma.$queryRaw<{ category: string; total: number }[]>`
  SELECT v.category, COALESCE(SUM(o."govtLevy"), 0) AS total
  FROM orders o
  JOIN vendors v ON o."vendorId" = v.id
  WHERE o."deletedAt" IS NULL AND o.status != 'CANCELLED'
  GROUP BY v.category
  ORDER BY total DESC
`

// AFTER (fix — group by lga instead of missing category):
this.prisma.$queryRaw<{ lgaName: string; total: number }[]>`
  SELECT l.name AS "lgaName", COALESCE(SUM(o."govtLevy"), 0) AS total
  FROM orders o
  JOIN vendors v ON o."vendorId" = v.id
  JOIN lgas l ON v."lgaId" = l.id
  WHERE o."deletedAt" IS NULL AND o.status != 'CANCELLED'
  GROUP BY l.name
  ORDER BY total DESC
`
```

### Missing FK Indexes (all 9 identified)

```prisma
// Source: codebase inspection — backend/prisma/schema.prisma
// Add these @@index directives to the corresponding models

model Ticket {
  // ... existing fields ...
  @@index([userId])           // hot: user's ticket history
  @@index([ticketTypeId])     // hot: availability check
}

model Booking {
  // @@index([propertyId, status, escrowReleasedAt]) already exists
  @@index([userId])           // hot: user's booking history — MISSING
}

model Order {
  @@index([userId])           // hot: user's order history — MISSING
  @@index([vendorId])         // hot: vendor's order list — MISSING
}

model OrderItem {
  @@index([orderId])          // hot: order line items — MISSING
  @@index([productId])        // hot: product sales — MISSING
}

model Transaction {
  @@index([walletId])         // CRITICAL: every wallet history query — MISSING
}

model AuditLog {
  @@index([userId])           // hot: user audit trail — MISSING
  @@index([createdAt])        // hot: time-range queries — MISSING
}

model Trip {
  // @@index([status, requestedAt]) and @@index([driverId, status]) already exist
  @@index([riderId])          // hot: rider's trip history — MISSING
}
```

### k6 Threshold Configuration

```javascript
// Source: k6 docs — https://grafana.com/docs/k6/latest/using-k6/thresholds/
export const options = {
  thresholds: {
    // QA-01 acceptance criteria
    'http_req_duration{endpoint:health}':   ['p(95)<100'],  // health is faster
    'http_req_duration{endpoint:wallet}':   ['p(95)<500'],
    'http_req_duration{endpoint:events}':   ['p(95)<500'],
    'http_req_duration{endpoint:auth}':     ['p(95)<500'],
    'http_req_failed':                       ['rate<0.001'],
    // Custom metrics
    'ws_connecting':                         ['p(95)<1000'], // QA-02 connection time
  },
};
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| AWS S3 + CloudFront | Cloudflare R2 + Image Transforms | Phase 2 migration | No egress fees; Image Transforms are free up to 5K/month |
| EventEmitter2 for payment events | Upstash Kafka (dual-write) | Phase 2 (02-11-PLAN) | Cross-service durability; requires Kafka consumer for some test scenarios |
| ZAP 2docker-stable image name | `ghcr.io/zaproxy/zaproxy:stable` | Docker Hub to GHCR migration | Use GHCR URL; old Docker Hub image may be stale |
| k6/ws for WebSocket tests | Artillery with socketio engine | Socket.IO-specific | k6/ws is raw WebSocket; does not speak Socket.IO protocol |

**Deprecated / outdated:**
- `owasp/zap2docker-stable`: Old Docker Hub image. Use `ghcr.io/zaproxy/zaproxy:stable` from GitHub Container Registry. [VERIFIED: zaproxy.org docs reference GHCR]
- `firebase-admin` legacy HTTP FCM API: Flagged in STATE.md as deprecated. Not blocking Phase 6 but should be flagged for Phase 7.

---

## Runtime State Inventory

> This is not a rename/refactor phase. No runtime state migration is required.
> None — verified by phase description review.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | All backend scripts | ✓ | 24.15.0 (LTS) | — |
| Docker | OWASP ZAP scan | ✓ | 29.4.2 | Run ZAP Desktop GUI manually |
| Java | ZAP fallback (desktop) | ✓ | 23.0.1 | Not needed with Docker approach |
| k6 binary | QA-01 load tests | ✗ | — | Install via choco/winget on Windows |
| Artillery | QA-02 WebSocket tests | ✗ | — | `npm install -g artillery@latest` |
| Expo CLI | QA-07 Atlas analysis | ✓ (project dep) | SDK 51 | Built into `npx expo` |

**Missing dependencies with no fallback:**
- k6: Must be installed before Wave 2 begins. Windows: `choco install k6` or `winget install k6 --source winget`. Verify: `k6 version`.

**Missing dependencies with fallback:**
- Artillery: `npm install -g artillery@2.0.31` (use exact version for determinism). Fallback: manual Socket.IO client script using `socket.io-client` (already installed in mobile package.json).

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Jest 29.7.x + ts-jest 29.1.x |
| Config file | `backend/jest.config.js` |
| Quick run command | `cd backend && npx jest --testPathPattern isolation` |
| Full suite command | `cd backend && npx jest --coverage` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| QA-01 | k6 P95 < 500ms at 10K VUs | Performance (k6) | `k6 run load-tests/k6/main.js` | ❌ Wave 0 |
| QA-02 | 500 WS connections sustained 10min | Performance (Artillery) | `artillery run load-tests/artillery/socketio-gps.yml` | ❌ Wave 0 |
| QA-03 | User A cannot access User B data | Integration (Jest) | `cd backend && npx jest --testPathPattern isolation` | ❌ Wave 0 |
| QA-04 | ZAP zero critical findings | DAST (Docker ZAP) | `docker run ... zap-api-scan.py -t .../api/docs-json` | ❌ Wave 0 |
| QA-05 | No sequential scans on hot queries | DB audit script | `ts-node load-tests/db-audit/explain-analyze.ts` | ❌ Wave 0 |
| QA-06 | Images served as WebP; LCP < 2.5s | Manual (DevTools) + unit | `cd backend && npx jest --testPathPattern image` | ❌ Wave 0 |
| QA-07 | Cold start < 3s; crash-free > 99.5% | Manual + Atlas | `EXPO_UNSTABLE_ATLAS=true npx expo export --platform ios` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `cd backend && npx jest --testPathPattern isolation --passWithNoTests`
- **Per wave merge:** `cd backend && npx jest --coverage` (must stay at 270+ tests passing)
- **Phase gate:** All 7 QA criteria confirmed green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `load-tests/k6/main.js` — covers QA-01 (HTTP load)
- [ ] `load-tests/k6/scenarios/wallet-flow.js` — authenticated wallet endpoint scenario
- [ ] `load-tests/artillery/socketio-gps.yml` — covers QA-02 (WebSocket stress)
- [ ] `load-tests/artillery/processor.js` — JWT injection for Artillery
- [ ] `load-tests/db-audit/explain-analyze.ts` — covers QA-05 (query audit)
- [ ] `backend/src/modules/wallet/__tests__/wallet-isolation.spec.ts` — QA-03 wallet isolation
- [ ] `backend/src/modules/stays/__tests__/stays-isolation.spec.ts` — QA-03 booking isolation
- [ ] `backend/src/modules/marketplace/__tests__/marketplace-isolation.spec.ts` — QA-03 order isolation
- [ ] k6 binary install: `choco install k6` (Windows, one-time)
- [ ] Artillery install: `npm install -g artillery@2.0.31` (one-time)

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | JWT (already implemented); verify ZAP finds no `alg:none` bypass |
| V3 Session Management | yes | Redis blacklist + 15min JWT expiry (already implemented) |
| V4 Access Control | yes | RolesGuard + @Roles + userId-scoped queries (Phase 6 isolation tests verify this) |
| V5 Input Validation | yes | NestJS ValidationPipe global with `whitelist: true, forbidNonWhitelisted: true` (already implemented) |
| V6 Cryptography | yes | AES-256-GCM for BVN/NIN (Phase 5); bcrypt 12 rounds for passwords (Phase 1) |
| V7 Error Handling | yes | ZAP will probe for verbose error messages — ensure `APP_ENV=staging` to avoid stack traces in responses |
| V9 Communications | yes | TLS via Railway's reverse proxy; verify ZAP HTTPS scan works |

### Known Threat Patterns for NestJS + Prisma Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| CORS `origin: '*'` on WebSocket gateway | Spoofing | Restrict to `*.iseyaa.ng` before Phase 7 |
| Missing CSP header (helmet default for API) | Tampering | NestJS API-only — CSP less critical; confirm helmet defaults are sufficient |
| Swagger UI accessible without auth | Information Disclosure | Gate with `APP_ENV=staging` for Phase 6; add IP restriction or auth header in Phase 7 |
| Admin revenue SQL 500 error | Information Disclosure | Fix `v.category` column reference (Wave 1) before ZAP scan |
| JWT `sub` not validated against DB on each request | Elevation of Privilege | Current: JwtStrategy validates signature + expiry but does not re-check user status. Suspended users may still hold a valid token for up to 15min. LOW risk for MVP — flag for Phase 7 |
| Paystack webhook credited without signature verification | Tampering | STATE.md flags this as an open issue. Fix in Wave 1: verify `x-paystack-signature` HMAC-SHA512 before crediting wallet |
| Marketplace stock not decremented | Denial of Service (resource) | STATE.md flags this. Fix in Wave 1: add `stock: { decrement: 1 }` in the order completion flow |

---

## Known Bugs to Fix in Phase 6 (from STATE.md)

These bugs were flagged as "address during Phase 6". They must be resolved before the security scan and isolation tests, since two of them create exploitable paths.

| Bug | Location | Fix | Priority |
|-----|----------|-----|----------|
| Escrow release uses `checkIn` not `checkOut` as cutoff | `stays.service.ts` | Change escrow release trigger to fire after `checkOut` date, not `checkIn` | Wave 1 |
| Marketplace stock not decremented on order | `marketplace.service.ts` | Add `product.update({ where: { id }, data: { stock: { decrement: quantity } } })` in order flow | Wave 1 |
| Webhook Paystack payment credited without server-side verification | `webhooks.service.ts` | Verify `x-paystack-signature` header (HMAC-SHA512) before crediting wallet — already in architecture intent but needs implementation audit | Wave 1 |
| Admin `getRevenue()` references non-existent `vendors.category` column | `admin.service.ts` | Remove or replace by-category breakdown (see Code Examples above) | Wave 1 |
| Firebase legacy FCM API deprecated | `notifications` module | Flag for Phase 7; not blocking Phase 6 | Wave 3 |

---

## Open Questions (RESOLVED)

1. **(RESOLVED) Neon PgBouncer availability on the current Neon tier**
   - What we know: Neon supports PgBouncer-mode connection pooling; it is a project-level toggle
   - What's unclear: Whether it's enabled on the current ISEYAA Neon project
   - Decision: Check Railway/Neon dashboard before running Wave 2 load tests; the 06-06 checkpoint plan gates the 10K VU run on PgBouncer being confirmed enabled. If not enabled, enable it in the Neon dashboard and append `?pgbouncer=true` to `DATABASE_URL` before proceeding with the full load test.

2. **(RESOLVED) k6 Cloud vs. self-hosted for the 10 K VU test**
   - What we know: k6 Cloud free tier allows up to 50 VUs; the 10 K requirement exceeds this
   - What's unclear: Whether GitHub Actions runners (16 GB RAM) are sufficient to generate 10 K VUs from a single process
   - Decision: Use GitHub Actions runner with `--vus 10000 --duration 5m`; k6 free binary is sufficient provided the runner has at least 8GB RAM. The 06-06 checkpoint plan documents this as the standard approach. k6 Cloud paid plan is not required.

3. **(RESOLVED) Artillery Socket.IO v4 engine compatibility with `handshake.auth.token`**
   - What we know: Artillery's built-in socketio engine supports custom options; Socket.IO official docs recommend Artillery for load testing
   - What's unclear: Whether Artillery 2.0.31's bundled engine supports the `handshake.auth` object (vs. query params)
   - Decision: Run a 5-connection local smoke test in 06-04 Task 2 verification before the full 500-connection stress test. If `handshake.auth` fails, fall back to `artillery-engine-socketio-v3` or a custom `socket.io-client` script. The smoke test is the gate.

4. **(RESOLVED) Cloudflare Image Transforms availability on current ISEYAA R2 account**
   - What we know: Cloudflare Image Transforms free tier includes 5,000 unique transformations/month; requires the R2 bucket to be connected to a Cloudflare zone
   - What's unclear: Whether the current R2 setup has a custom domain / Cloudflare zone configured (the `.env.example` shows `R2_PUBLIC_URL=` as empty)
   - Decision: Primary path is sharp WebP pre-upload (plan 06-02); Image Transforms are an optional enhancement if a custom Cloudflare zone is confirmed on the account. No blocking dependency on Cloudflare Image Transforms for Phase 6 gate.

5. **(RESOLVED) Sentry crash-free rate measurement for QA-07**
   - What we know: Sentry is integrated via `@sentry/nestjs` in `instrumentation.ts`. Mobile Sentry integration is not confirmed in `mobile/package.json`
   - What's unclear: Whether the mobile app has `@sentry/react-native` initialized to report crashes
   - Decision: Plan 06-05 explicitly adds `@sentry/react-native` to mobile/package.json and initializes it in `mobile/app/_layout.tsx`. This resolves the uncertainty — the SDK is present after 06-05 executes.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | k6 Cloud free tier supports up to 50 VUs | Open Questions #2 | If limit is lower, the 10 K VU test requires a paid plan or self-hosted runner |
| A2 | Neon PgBouncer connection pooling is available on the current ISEYAA project tier | Pitfall 1 | If PgBouncer is not available, 10 K VUs will exhaust connections and load test will produce misleading results |
| A3 | Artillery 2.0.31's bundled Socket.IO engine supports `handshake.auth.token` for JWT | Pattern 2, Pitfall 2 | If it doesn't, a custom Node.js script or `artillery-engine-socketio-v3` is required |
| A4 | The mobile app does not currently have `@sentry/react-native` initialized | Open Questions #5 | If Sentry mobile is already configured, no action needed |
| A5 | Cloudflare Image Transforms require a custom domain zone; `R2_PUBLIC_URL` is likely empty in prod | Open Questions #4 | If a zone is already configured, Image Transforms are immediately available |

---

## Sources

### Primary (HIGH confidence)
- Codebase inspection (`backend/prisma/schema.prisma`, `backend/src/main.ts`, `backend/src/common/services/s3.service.ts`, `backend/src/common/services/image.service.ts`, `backend/src/modules/admin/admin.service.ts`, `backend/src/modules/transport/transport.gateway.ts`) — all index gaps and bugs verified directly
- `C:\Developer\work\ISEYAA\.planning\STATE.md` — known bugs list confirmed
- REQUIREMENTS.md QA-01 through QA-07 — requirement text confirmed
- `backend/package.json` — confirmed socket.io 4.8.3, sharp 0.34.5, @sentry/nestjs, Artillery missing
- Cloudflare Images pricing docs — https://developers.cloudflare.com/images/pricing/ — 5,000 free transforms/month confirmed [CITED]
- OWASP ZAP API scan docs — https://www.zaproxy.org/docs/docker/api-scan/ — Docker command syntax [CITED]
- Socket.IO v4 load testing docs — https://socket.io/docs/v4/load-testing/ — Artillery recommended [CITED]
- Expo Atlas docs — https://docs.expo.dev/guides/analyzing-bundles/ — `EXPO_UNSTABLE_ATLAS=true` pattern [CITED]

### Secondary (MEDIUM confidence)
- k6 WebSocket examples — https://grafana.com/docs/k6/latest/examples/websockets/ — `ws.connect()` pattern, stages configuration [CITED]
- Artillery Socket.IO blog post — https://www.artillery.io/blog/load-testing-socketio-with-artillery — YAML config pattern [CITED]
- Prisma missing index study — https://stackinsight.dev/blog/missing-index-empirical-study — FK index gaps pattern confirmed by independent empirical research [CITED]
- Prisma query optimization docs — https://www.prisma.io/docs/orm/prisma-client/queries/advanced/query-optimization-performance — `$queryRaw EXPLAIN ANALYZE` pattern [CITED]

### Tertiary (LOW confidence — needs validation)
- k6 Cloud free tier 50 VU limit — WebSearch only; verify at https://app.k6.io before planning load test strategy
- Artillery Socket.IO v4 handshake.auth support in v2.0.31 — requires local test to confirm

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — tools verified against npm registry, Docker Hub/GHCR, and official docs
- Architecture: HIGH — based on direct codebase inspection, all module files reviewed
- Pitfalls: HIGH — three pitfalls verified from codebase (admin SQL bug, CORS wildcard, Swagger gate); two are MEDIUM (connection pool, Socket.IO version)
- Load test patterns: MEDIUM — k6 and Artillery patterns cited from official docs but 10K VU Railway-specific behavior is [ASSUMED]
- Image optimization: HIGH — sharp WebP API verified from npm docs; Cloudflare pricing verified from official docs
- Mobile optimization: MEDIUM — Expo Atlas SDK 51 availability verified; cold start measurement is manual

**Research date:** 2026-05-19
**Valid until:** 2026-06-19 (30 days — stable tooling; Cloudflare pricing may change)
