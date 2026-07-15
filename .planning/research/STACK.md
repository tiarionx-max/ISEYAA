# Stack Research

**Domain:** Real gRPC microservice extraction + WhatsApp OTP channel + government dashboard export + generalized multi-recipient settlement (v2.0 milestone additions to an existing NestJS 10/11 modular monolith)
**Researched:** 2026-07-15
**Confidence:** HIGH (gRPC, resilience, export — verified against installed `backend/package.json`, npm registry, and official docs) / MEDIUM (WhatsApp cost comparison — Termii's exact per-message NGN rate not published, only USD list price found)

## Important correction before recommendations

`backend/package.json` (read directly, not assumed) shows the backend is **already on NestJS 11.1.20**, not "NestJS 10.3.x" as `CLAUDE.md`/`PROJECT.md` state — that documentation is stale (repo is on branch `microservices-redesign`, mid-upgrade). More importantly for this milestone: **`@grpc/grpc-js` (^1.14.3), `@grpc/proto-loader` (^0.8.1), `@nestjs/microservices` (^11.1.19), and `ts-proto` (^2.11.8) are already installed dependencies**, and `packages/proto/generate.sh` already runs `ts-proto` with `nestJs=true, outputServices=grpc-js` to produce `packages/proto/generated/*.ts`. A grep of `backend/src` for `GrpcMethod|ClientGrpc|connectMicroservice|Transport.GRPC` returns zero matches — confirming PROJECT.md's claim: the gRPC toolchain is fully installed and codegen'd but **never wired into a running handler**. This changes the scope of "stack additions" for gRPC from *"add a library"* to *"wire up what's already installed, add proto stubs for 7 un-stubbed modules, and decide the mTLS/auth story."*

Also already installed and reusable (do not re-add): `kafkajs` ^2.2.4 (`backend/src/kafka/kafka.service.ts` — optional async event bus, no-ops when `KAFKA_BROKER_URL` unset, already consumed by `TourSettlementService` for cross-pod durability), `@nestjs/terminus` ^11.1.1 (health checks — reuse for gRPC service readiness probes on Railway), `@sentry/nestjs` + `@opentelemetry/*` (already wired — reuse for circuit-breaker state-change telemetry, no new observability library needed), `pdfkit` ^0.19.1 (`backend/src/common/services/itinerary-pdf.service.ts` — reuse pattern for Ministry export, do not add a second PDF library).

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| `@nestjs/microservices` | `^11.1.20` (bump from installed `^11.1.19` to exactly match `@nestjs/core`) | gRPC transporter for NestJS hybrid app | Already installed; NestJS convention is to pin every `@nestjs/*` package to the identical version as `@nestjs/core` to avoid DI/decorator metadata drift between packages. |
| `@grpc/grpc-js` | `^1.14.4` (bump from installed `^1.14.3`) | Pure-JS gRPC implementation (client + server) | Official Node gRPC library recommended by both NestJS docs and the gRPC project itself over the legacy native-binding `grpc` package (deprecated since 2021). Already the transporter `ts-proto`'s codegen targets (`outputServices=grpc-js`). |
| `@grpc/proto-loader` | `^0.8.1` (already latest, no change) | Loads `.proto` files at runtime for the `ReflectionService`/dynamic paths | Required peer of `@grpc/grpc-js`; already installed and pinned to current. |
| `ts-proto` | `^2.12.0` (bump from installed `^2.11.8`) | Generates NestJS-shaped TS interfaces + gRPC-js service stubs from `.proto` | Already the codegen tool in `packages/proto/generate.sh`. Do not introduce `grpc-tools`/`protoc` native codegen or `@nestjs/proto` alternatives — `ts-proto`'s `nestJs=true` flag produces exactly the `@GrpcMethod`-decoratable interfaces NestJS controllers expect. |
| `cockatiel` | `^4.0.0` | Composable resilience policies (retry, circuit breaker, timeout, bulkhead, fallback) around Paystack/Termii/Anthropic/R2/FCM calls | See dedicated comparison below. Net-new dependency — no existing retry/circuit-breaker logic found anywhere in `backend/src` (`paystack.service.ts` has a bare 10s axios timeout and nothing else). |
| `@json2csv/node` | `^7.0.6` | Streaming JSON→CSV transform for Ministry dashboard export | Net-new. Streams directly to the NestJS `@Res()` response or an S3 upload without buffering the full result set in memory — important since Ministry exports are open-ended date-range aggregate queries that could return large row counts. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `pdfkit` | `^0.19.1` (already installed — **do not add a second PDF library**) | Ministry dashboard PDF export | Reuse `backend/src/common/services/itinerary-pdf.service.ts` as the template: build a sibling `MinistryDashboardPdfService` following the same stream-to-Buffer→S3-or-response pattern. `puppeteer`/`pdf-lib` are explicitly forbidden by the same rationale already documented in `itinerary-pdf.service.ts` (puppeteer bundles ~150MB headless Chrome, blows the free-tier container budget; pdf-lib is a heavier API for list-style documents). |
| `p-timeout` | not needed | — | Cockatiel's own `timeout()` policy covers this — do not add a separate timeout library. |
| Axios (`axios` ^1.6.7, already installed) | — | HTTP client for Termii WhatsApp Token API | No new HTTP client needed — extend the existing Termii integration (same base URL, same `api_key` auth) with a `channel: "whatsapp_otp"` request variant. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| `packages/proto/generate.sh` (existing) | Regenerate `.ts` stubs from `.proto` | Extend with 7 new `.proto` files for transport, delivery, tour-packages, tour-guides, news, waitlist, reviews — no script changes needed, `ts-proto`'s glob (`./packages/proto/*.proto`) already picks up new files automatically. |
| `grpcurl` (CLI, not npm) | Manual gRPC smoke-testing against a running `connectMicroservice()` port | Install via `choco install grpcurl` (Windows) or download binary; not a project dependency — dev-machine tool only, for verifying `@GrpcMethod` handlers respond correctly before wiring a `ClientGrpc` consumer. |

## Installation

```bash
# gRPC — bump existing installs to align exactly with @nestjs/core 11.1.20
npm install @nestjs/microservices@^11.1.20 @grpc/grpc-js@^1.14.4 --workspace backend

# Resilience
npm install cockatiel@^4.0.0 --workspace backend

# Ministry export
npm install @json2csv/node@^7.0.6 --workspace backend

# Dev dependency bump for proto codegen
npm install -D ts-proto@^2.12.0 --workspace backend
```

WhatsApp OTP requires **no new npm package** — it is an additional request shape (`channel: "whatsapp_otp"`) on the already-integrated Termii REST API, called via the already-installed `axios`. Settlement generalization requires **no new npm package** — it is a service-layer refactor of `TourSettlementService`'s existing Prisma `$transaction` + `SELECT FOR UPDATE` pattern.

## Gap: real gRPC microservice extraction

### What "already exists but unwired" means concretely
`packages/proto/*.proto` (8 files: auth, wallet, events, marketplace, notifications, stays, admin, ai) and their `generated/*.ts` counterparts define the *contract*. Nothing in `backend/src` implements a `@GrpcMethod()` handler against them, and `backend/src/main.ts` calls only `NestFactory.create()` — a single HTTP app. Zero `ClientGrpc`/`ClientGrpcProxy` consumers exist either.

### Recommended wiring pattern (hybrid app, in-process first)
NestJS's documented pattern for this exact situation — REST stays the external surface, gRPC becomes internal transport — is `app.connectMicroservice()` with `inheritAppConfig: true` so the gRPC microservice picks up the same global pipes/interceptors/filters as the HTTP app:

```typescript
// main.ts
const app = await NestFactory.create(AppModule, { rawBody: true });
app.connectMicroservice<MicroserviceOptions>(
  {
    transport: Transport.GRPC,
    options: {
      package: 'wallet',
      protoPath: join(__dirname, '../../packages/proto/wallet.proto'),
      url: '0.0.0.0:50051',
    },
  },
  { inheritAppConfig: true },
);
await app.startAllMicroservices();
await app.listen(process.env.PORT ?? 3001);
```

This lets each module add a `@GrpcMethod('WalletService', 'DebitWallet')` handler beside its existing REST controller **inside the same process** first — cheap way to validate the 8 existing proto contracts (and stub the 7 missing ones for transport/delivery/tour-packages/tour-guides/news/waitlist/reviews) without a deploy topology change. Physical extraction to separate Railway services is the second step, per-module, once each contract is proven in-process.

### Railway topology change
Today: one Railway service (`backend`), one Docker container, one `NestFactory.create()`. For real extraction: multiple Railway services *within the same Railway project*, one per extracted module, each with its own root directory/watch path (Railway's monorepo support builds only the service whose watch path changed). Services communicate over Railway's private network — every service gets a `<service>.railway.internal` DNS name, and Railway confirms **all private-network traffic is already encrypted via WireGuard** at the platform level. This is a load-bearing fact for the mTLS decision below.

### Inter-service auth: skip mTLS certs, use a shared-secret gRPC interceptor
Because Railway's private network is already WireGuard-encrypted end-to-end, per-call mTLS certificate rotation is redundant transport-layer work for v2.0 — it adds cert-issuance/rotation operational burden (a CA, cert renewal, no existing secrets-rotation tooling in this stack) without a corresponding threat this milestone needs to close (traffic isn't traversing the public internet). Recommend instead: a NestJS gRPC `CanActivate` guard (pattern: [`nestjs-guard-grpc`](https://github.com/mabuonomo/nestjs-guard-grpc), or a ~20-line custom guard) that validates a shared-secret bearer token in gRPC `Metadata` on every internal call, sourced from a `GRPC_INTERNAL_SECRET` env var (same pattern as existing `PAYSTACK_WEBHOOK_SECRET` HMAC verification). Document real mTLS as a backlog item **only if** a future requirement needs gRPC calls to cross Railway project/environment boundaries where the private network doesn't reach.

### What NOT to do here
Do not add a service mesh (Istio/Linkerd), API gateway product (Kong/Ambassador), or service-discovery library (Consul/etcd) — Railway's private network + internal DNS already provides service discovery, and a single `backend` service can keep acting as the public REST-to-gRPC gateway (BFF pattern) for the foreseeable future given the platform's scale (7M addressable, not 7M concurrent).

## Resilience: Cockatiel vs Opossum

| Criterion | Cockatiel 4.0.0 | Opossum 10.0.0 |
|---|---|---|
| Scope | Retry + circuit breaker + timeout + bulkhead + fallback, all composable via `wrap()` | Circuit breaker only |
| To cover this milestone's need (retry + breaker + timeout across 5 vendors) | One dependency, one policy pipeline per vendor | Would need `opossum` + a separate retry lib (`p-retry` or `async-retry`) + a separate timeout wrapper — 3 dependencies, manual composition |
| TypeScript | TypeScript-first, zero runtime dependencies | JS-native with `@types/opossum`, functional but retrofitted types |
| Maintenance | Actively maintained | Maintained by the Node.js Foundation's nodeshift team, v9+ requires Node ≥20 (compatible) |
| Fit with NestJS interceptor pattern | Policies are plain functions — trivially wrapped in a NestJS provider factory (`createPaystackPolicy()`, `createTermiiPolicy()`, etc.) registered in the existing `CommonModule` | Same, but requires assembling breaker + retry + timeout as three separate wired objects per vendor |

**Recommendation: Cockatiel.** Given the requirement is explicitly "circuit breaker / retry / timeout / fallback" across five distinct vendor integrations (Paystack, Termii, Anthropic, R2/S3, FCM), Cockatiel's single composable policy (`wrap(retry(...), circuitBreaker(...), timeout(...))`) per vendor is materially less glue code than assembling Opossum plus two more single-purpose libraries. Emit Cockatiel's `onFailure`/`onBreak`/`onReset` events into the existing `Logger` + OpenTelemetry span attributes (both already wired) — no new observability library needed.

Implementation location: new `backend/src/common/resilience/` with one policy-factory function per vendor, injected into the existing `PaystackService`, `TermiiService` (or its WhatsApp variant), `AiService` (Anthropic), `S3Service`, and the FCM push service — this fits the existing `@Global() CommonModule` pattern (`backend/src/common/common.module.ts`) without restructuring module boundaries.

## WhatsApp OTP: Termii vs Meta direct — explicit call

**Recommendation: Termii's `Send WhatsApp Token` API (`channel: "whatsapp_otp"` on the existing `POST /api/sms/send` endpoint). Do not integrate Meta's WhatsApp Business Cloud API directly for v2.0.**

| Factor | Termii WhatsApp Token API | Meta WhatsApp Business Cloud API (direct) |
|---|---|---|
| New vendor relationship | None — reuses the already-integrated `TERMII_API_KEY`, same base URL family as the existing SMS OTP integration | New: requires a Meta Business Account, WhatsApp Business Account (WABA) setup, phone number registration, and business verification — a multi-week approval process, non-trivial for a government-affiliated entity |
| Template approval | Handled by Termii as the Business Solution Provider; endpoint documented as "not enabled by default — contact support to activate" (a support ticket, not a compliance review) | Every OTP message must go through Meta's template pre-approval queue (24–48h+ review cycle per template, per language) before it can be sent |
| New SDK/dependency | None — extends existing axios-based Termii integration | Official `WhatsApp/WhatsApp-Nodejs-SDK` (Meta-hosted on GitHub) — a new dependency, new client wiring, new webhook endpoint for delivery-status callbacks |
| Cost | Termii WhatsApp OTP list price ≈ $0.0566/message (USD reference rate found; exact NGN billing not published — verify directly with Termii before scoping budget) | Since July 2025, Meta bills per delivered authentication template message by destination country; Nigeria falls under Meta's "Authentication-international" tier for WABAs not registered in-market, which carries a materially higher per-message rate than domestic authentication pricing (observed ~20x+ multiplier in other markets, e.g. India domestic $0.0014 vs international $0.0304) — likely more expensive than Termii's flat rate once the international surcharge applies |
| Operational fit | OTP channel selection (SMS/Email/WhatsApp) becomes a `channel` parameter on one existing service, matching the existing `TermiiService` shape | Requires a parallel `WhatsAppService`, a parallel webhook ingestion path for delivery receipts, and ongoing template-content compliance ownership |
| Risk | Single point of failure if Termii's own Meta BSP relationship has an outage — mitigated because WhatsApp is one of three user-selectable channels (SMS/Email remain available) | More control over branding/template content, but that control isn't a stated requirement for this milestone |

Verify before implementation: confirm Termii's WhatsApp Token endpoint is activated for the ISEYAA account (support ticket, per their docs) and pull exact NGN pricing from Termii's account dashboard — the public pricing page did not surface Nigeria-specific WhatsApp OTP rates during this research pass (flagged MEDIUM confidence on cost only, not on the architectural recommendation).

## Government dashboard export

**Recommendation: CSV via `@json2csv/node`, PDF via the existing `pdfkit` pattern. Do not add a spreadsheet library (ExcelJS/xlsx) or scope an OData/Power BI feed for v2.0.**

- CSV covers the "spreadsheet-consumable feed" requirement without a new dependency category: CSV opens natively in Excel and is importable directly into Power BI via "Get Data → Text/CSV" — no XLSX-specific formatting (merged cells, formulas, multi-sheet workbooks) was named as a requirement, so `exceljs`/`xlsx` would be scope creep. If a future milestone needs multi-sheet workbooks or cell formatting, revisit with `exceljs` (`^4.4.0`) then — not now.
- Avoid the legacy `json2csv` package (still published, latest is `6.0.0-alpha.2`, effectively unmaintained under that name) — the project was split into scoped packages (`@json2csv/node`, `@json2csv/plainjs`, etc.), current stable `7.0.6`. `@json2csv/node` specifically provides a Node `Transform`/async-iterable interface, which matters for streaming a large Ministry export directly to the HTTP response instead of materializing the whole CSV string in memory.
- PDF: reuse `pdfkit` and mirror `ItineraryPdfService`'s existing structure (render to Buffer, no headless browser, upload via `S3Service` or stream directly to `@Res()`) for a `MinistryDashboardPdfService`. Do not introduce `puppeteer` or `pdf-lib` — the same container-size and complexity rationale already documented in that file applies unchanged.
- A true OData feed or scheduled Power BI connector is out of scope for v2.0: it implies an additional auth surface (service-principal or API-key-scoped read endpoint with its own rate limiting) and an ongoing schema-stability contract with an external BI tool — bigger commitment than "read-only dashboard with CSV/PDF export" calls for. Flag as a backlog candidate only if the Ministry explicitly requests live BI connectivity beyond periodic export.

## Generalized multi-recipient settlement split

**No new library.** `backend/src/modules/tour-bookings/tour-settlement.service.ts` (`TourSettlementService`) is the pattern to generalize, not reinvent:

- One Prisma `$transaction` per payment event, `SELECT FOR UPDATE` (via `tx.$executeRaw`) on every wallet row touched, in vendor-then-platform order.
- Split entries resolved from a stored `settlementSplit: {vendorType, vendorId, percentage}[]` array (currently on `TourBooking.snapshot`), each type resolved to a `userId` → `walletId` via a `switch` (`GUIDE`→`TourGuide.userId`, `HOST`→`Property.hostId`, `ORGANISER`→`Event.organizerId`, `ATTRACTION`→a `PlatformConfig`-driven standing wallet with a `logger.warn` fallback-to-platform-commission if unset).
- Platform/commission share is computed as the *remainder* (`chargeAmount - sum(resolved vendor shares)`), which absorbs rounding drift — with a defensive `> ₦0.02` drift assertion that throws rather than silently misallocating funds.
- Idempotency via `<reference>-V-<idx>` / `<reference>-PLAT` transaction rows checked before the transaction runs (replay-safe).
- Failure path calls the existing `RefundService.refund()` and flips status to `REFUNDED` outside the failed transaction.

**Generalization for the three-way vendor/Ministry/platform split**: add a `MINISTRY` (or reuse the existing `ATTRACTION`-style `PlatformConfig`-driven standing wallet) `vendorType` case, resolved the same way `ATTRACTION` already resolves — via a well-known `PlatformConfig` key (e.g. `settlement.ministry_wallet_user_id`), analogous to `tour.government_wallet_user_id`. Extract the `SplitEntry`/`ResolvedSplit` resolution logic and the `$transaction` fan-out loop out of `TourSettlementService` into a shared `backend/src/common/services/settlement-engine.service.ts` that any module's `@OnEvent('payment.*')` handler can call with its own split config, replacing the hardcoded two-way percentages currently in Transport (85/15) and Delivery (80/20). Each module keeps its own `@OnEvent()` listener (per the existing `WebhooksService` → feature-service dispatch pattern in `CLAUDE.md`); only the fan-out/locking/idempotency core moves to the shared engine.

**What NOT to do**: do not build a new payment-splitting library or adopt a third-party "marketplace payments" SDK (e.g., Stripe Connect-style patterns) — Paystack/Flutterwave have no native split-payment primitive that fits the wallet-ledger model this project already uses, and the in-house engine is already proven correct under concurrent load (wallet invariant tests exist: `tour-bookings/__tests__/wallet-invariant.e2e-spec.ts`).

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|--------------------------|
| Cockatiel | Opossum + p-retry + a timeout wrapper | If the team specifically wants Node.js Foundation governance on the circuit-breaker piece and is fine assembling retry/timeout separately — more moving parts for the same outcome here. |
| Termii WhatsApp Token API | Meta WhatsApp Business Cloud API direct | If the Ministry later requires WhatsApp-specific rich templates (buttons, carousels, media-heavy notifications) beyond simple OTP codes — that's beyond what Termii's token endpoint offers and would justify the Meta Business verification effort. |
| `@json2csv/node` | `fast-csv` (`^5.0.7`) | If the export needs full control over row-by-row streaming transforms (e.g., joining multiple async data sources per row) rather than field-mapped JSON objects — `fast-csv`'s lower-level stream API is more flexible but requires more boilerplate for the straightforward "map Prisma aggregate rows to named columns" case here. |
| Hybrid in-process `connectMicroservice()` first, physical split second | Extract straight to separate Railway services per module immediately | If the team is confident in the 8 existing (and 7 new) proto contracts and wants to skip the in-process validation step — riskier given zero `@GrpcMethod` handlers exist today to validate against. |
| Shared-secret gRPC metadata guard | Full mTLS with a private CA | If gRPC traffic will ever cross Railway project/environment boundaries (multi-region, multi-tenant deploys) where the WireGuard-encrypted private network doesn't reach — not a stated requirement for v2.0. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|--------------|
| Legacy `json2csv` (unscoped package, stuck at `6.0.0-alpha.2`) | Effectively superseded/unmaintained under that name; the maintainers moved to scoped `@json2csv/*` packages years ago | `@json2csv/node` |
| `exceljs`/`xlsx` for v2.0 export | Not a stated requirement (no multi-sheet/formula/formatting need mentioned); adds a second export-format dependency for a "nice to have" | CSV via `@json2csv/node` (opens fine in Excel/Power BI) |
| `puppeteer` for Ministry PDF export | ~150MB headless Chrome bundle — already explicitly forbidden for the itinerary PDF service for container-size reasons; same constraint applies here | Existing `pdfkit` |
| Meta WhatsApp Business Cloud API (direct) for v2.0 | Multi-week Business verification + WABA setup + per-template Meta review cycle; likely more expensive on Nigeria's "authentication-international" pricing tier; duplicates the vendor-integration effort already done for Termii | Termii's `Send WhatsApp Token` API (`channel: "whatsapp_otp"`) |
| Full mTLS/private-CA rollout for internal gRPC in v2.0 | Railway's private network is already WireGuard-encrypted; a CA + cert rotation pipeline is operational overhead this milestone doesn't need to justify | Shared-secret gRPC `Metadata` guard, same pattern as existing `PAYSTACK_WEBHOOK_SECRET` HMAC verification |
| Opossum alone (without a companion retry/timeout lib) | Circuit-breaker-only scope doesn't cover the stated "retry / timeout / fallback" requirement without bolting on 2 more dependencies | Cockatiel (single composable dependency) |
| Native `grpc` package (deprecated) or `grpc-tools`/raw `protoc` codegen | `grpc` package has been deprecated since 2021 in favor of `@grpc/grpc-js`; raw `protoc` codegen doesn't produce NestJS-shaped interfaces | `@grpc/grpc-js` + existing `ts-proto` (`nestJs=true`) toolchain |
| Service mesh (Istio/Linkerd) or API gateway product (Kong) | Massive operational overweight for the current scale and Railway's managed-platform model | Railway private networking + internal DNS + one `backend` service as REST-to-gRPC gateway (BFF) |

## Stack Patterns by Variant

**If a vendor call needs a graceful degraded response (not just fail-fast):**
- Use Cockatiel's `fallback()` policy composed with `circuitBreaker()`
- Because a bare circuit breaker only fails fast — it doesn't define *what* the caller gets back. E.g., FCM push failures should fall back to "notification recorded, push skipped" rather than surfacing a 500 to the booking flow.

**If extracting a module that already has heavy vendor-call surface (Transport, Delivery — live GPS + matching):**
- Extract these first once the hybrid in-process pattern is validated
- Because they're explicitly the modules named in the milestone as needing "one vendor outage degrades a feature instead of crashing dependent modules" — they're both the highest-value and highest-risk targets for the resilience work, so validating gRPC extraction on them first surfaces integration issues before touching lower-traffic modules (news, waitlist, reviews).

**If the Ministry later asks for scheduled/recurring exports (not just on-demand):**
- Add `@nestjs/schedule` `@Cron()` jobs (already installed, used elsewhere for escrow release) that generate and email/S3-upload the CSV/PDF on a schedule
- Because no new dependency is needed — `@nestjs/schedule` ^6.1.3 is already in `backend/package.json` and already used for cron-driven business logic (stays escrow `@Cron`).

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|------------------|-------|
| `@nestjs/microservices@11.1.20` | `@nestjs/core@11.1.20`, `@nestjs/common@11.1.20` | NestJS convention: keep every `@nestjs/*` package on the identical version number as `@nestjs/core` to avoid decorator-metadata mismatches between packages. |
| `@grpc/grpc-js@1.14.4` | `@grpc/proto-loader@0.8.1`, `ts-proto@2.12.0` (`outputServices=grpc-js`) | Already the pairing used by `packages/proto/generate.sh` — no changes to codegen flags needed. |
| `cockatiel@4.0.0` | Node.js ≥16 (project is on Node 20 LTS) | Zero runtime dependencies — no transitive version conflicts to track. |
| `@json2csv/node@7.0.6` | Node.js ≥14 (project is on Node 20 LTS) | Streaming API works with both plain arrays and async iterables — compatible with Prisma's `findMany` result arrays or a cursor-based paginated fetch for very large exports. |
| `pdfkit@0.19.1` | Already installed, no version change | Confirmed working pattern in `itinerary-pdf.service.ts` — reuse as-is. |

## Sources

- `backend/package.json` (read directly) — ground truth for installed versions; contradicts stale `CLAUDE.md`/`PROJECT.md` claim of "NestJS 10.3.x" (actual: 11.1.20)
- `packages/proto/generate.sh`, `packages/proto/*.proto`, `packages/proto/generated/*.ts` (read directly) — confirms ts-proto codegen toolchain already in place, unwired
- Grep of `backend/src` for `GrpcMethod|ClientGrpc|connectMicroservice|Transport.GRPC` (zero matches) — confirms zero gRPC runtime wiring exists, corroborating PROJECT.md's audit finding
- `backend/src/modules/tour-bookings/tour-settlement.service.ts` (read directly) — the settlement pattern to generalize
- `backend/src/common/services/itinerary-pdf.service.ts` (read directly) — the PDF pattern to reuse; documents its own puppeteer/pdf-lib rejection rationale
- `backend/src/common/services/paystack.service.ts` (grepped) — confirms no existing retry/circuit-breaker logic (bare 10s axios timeout only), validating this is genuinely net-new work
- `backend/src/kafka/kafka.service.ts` (grepped) — confirms Kafka already present as optional async event bus, not to be duplicated
- npm registry (`npm view`, live queries 2026-07-15) — current versions for `@nestjs/microservices`, `@grpc/grpc-js`, `@grpc/proto-loader`, `cockatiel`, `opossum`, `ts-proto`, `json2csv`, `@json2csv/node`, `@json2csv/plainjs`, `fast-csv`, `exceljs` — HIGH confidence, primary source
- [NestJS gRPC microservices docs](https://docs.nestjs.com/microservices/grpc) — hybrid app / `connectMicroservice` / `inheritAppConfig` pattern — HIGH confidence, official docs
- [Railway — How Private Networking Works](https://docs.railway.com/networking/private-networking/how-it-works) — WireGuard encryption + internal DNS confirmation — HIGH confidence, official docs
- [Railway — Deploying a Monorepo](https://docs.railway.com/guides/monorepo) — per-service watch paths, multi-service-per-project pattern — HIGH confidence, official docs
- [cockatiel GitHub](https://github.com/connor4312/cockatiel) / [opossum GitHub](https://github.com/nodeshift/opossum) — feature scope comparison — HIGH confidence, official repos
- [nestjs-guard-grpc](https://github.com/mabuonomo/nestjs-guard-grpc) — example gRPC metadata auth guard pattern for NestJS — MEDIUM confidence, community project not official NestJS
- [Termii Developers — Send WhatsApp Token](https://developer.termii.com/send-whatsapp-token) — endpoint shape, activation-on-request caveat — MEDIUM confidence, official docs but thin on pricing detail
- [Termii Developers — WhatsApp Template API](https://developers.termii.com/templates) — confirms Termii operates as a WhatsApp BSP with its own template channel — MEDIUM confidence
- [WhatsApp/WhatsApp-Nodejs-SDK GitHub](https://github.com/WhatsApp/WhatsApp-Nodejs-SDK) — official Meta Cloud API Node SDK, evaluated and not recommended for v2.0 — HIGH confidence on capability, decision is a project-fit call
- WebSearch: Meta WhatsApp Business Platform pricing 2026 (Chatarmin, Blueticks, Authgear blog posts) — authentication-international pricing tier confirmation — MEDIUM confidence (multiple secondary sources agree, no single official Meta pricing page fetched directly)
- WebSearch: Termii WhatsApp OTP pricing — MEDIUM/LOW confidence, only a third-party aggregator (VerifyWay) surfaced a $0.0566/msg figure; **flagged for direct verification with Termii before budgeting**

---
*Stack research for: gRPC extraction, WhatsApp OTP, government dashboard export, multi-recipient settlement — ISEYAA v2.0*
*Researched: 2026-07-15*
