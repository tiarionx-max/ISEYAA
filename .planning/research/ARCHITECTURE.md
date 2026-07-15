# Architecture Research: v2.0 Microservices, Multi-Channel Auth & Government Partnership

**Domain:** NestJS modular monolith → real gRPC extraction, channel-choice OTP, Ministry dashboard, generalized settlement splits
**Researched:** 2026-07-15
**Confidence:** HIGH (all findings verified against actual source files and a real `nest build` attempt, not assumptions)

## Critical Correction to Milestone Framing

`.planning/PROJECT.md` states: *"a code audit confirmed zero `@GrpcMethod`/`ClientGrpc` usage anywhere and a single `NestFactory.create()` in `main.ts`."* This is **half true** and the roadmap needs a second correction, not just the first one.

**What's actually there** (verified 2026-07-15):

`backend/apps/` contains **8 fully-scaffolded gRPC microservice entry points** — `auth-service`, `wallet-service`, `events-service`, `stays-service`, `marketplace-service`, `admin-service`, `ai-service`, `notifications-service`. Each has:
- A real `@GrpcMethod`-decorated controller (e.g. `backend/apps/wallet-service/src/wallet-grpc.controller.ts` implements `Credit`/`Debit`/`GetBalance`/`GetTransactions` against the *same* `WalletService`/`PrismaService` the monolith uses)
- A `main.ts` calling `NestFactory.createMicroservice(AppModule, { transport: Transport.GRPC, options: { package, protoPath, url: '0.0.0.0:500X' } })`
- Its own `Dockerfile` and `railway.toml`
- A registered project entry in `backend/nest-cli.json` (`projects.wallet-service`, etc.) so `nest build wallet-service` is a real, intended command

So `@GrpcMethod` usage is **not zero** — it exists for 8 services. The "single `NestFactory.create()`" claim is only true of `backend/src/main.ts` (the monolith entry point); it is not true of the repo as a whole.

**What's actually broken (this is the real finding, and it's worse than "unwired"):**

1. **The build is broken.** Running `npx nest build wallet-service` from `backend/` fails with `TS6059: File '...apps/wallet-service/src/main.ts' is not under 'rootDir' 'backend/src'`. Root cause: `backend/apps/wallet-service/tsconfig.app.json` extends `backend/tsconfig.json`, which hardcodes `"rootDir": "./src"` and is never overridden per-app. All 8 services share this same tsconfig inheritance and will all fail identically — verified for `wallet-service`, structurally identical for the other 7.
2. **The failure is deliberately masked.** `backend/apps/wallet-service/Dockerfile` line 18: `RUN cd backend && npx nest build wallet-service 2>/dev/null || true` — swallows the error and continues. The `CMD` then runs `node ./backend/apps/wallet-service/dist/main.js`, which will not exist (or will be stale from a previous successful local build accidentally committed/cached). Any attempt to actually deploy one of these `backend/apps/*/Dockerfile`s today will crash-loop on container start.
3. **Zero client-side wiring.** `Grep` for `ClientGrpc|ClientProxyFactory|@Client(` across `backend/src` returns nothing. No REST controller anywhere calls these gRPC servers. They are unconsumed islands even where they'd build.
4. **Not deployed.** Root `railway.toml` and `backend/railway.toml` both point only at `backend/Dockerfile` (the monolith). The 8 `backend/apps/*/railway.toml` files exist but nothing provisions or points a Railway service at them — matches PROJECT.md's confirmation that Railway currently runs a single monolith service.
5. **No local dev wiring either.** `backend/package.json` has no `start:wallet-service`-style scripts, and `docker-compose.yml` only builds `backend/Dockerfile.dev` (the monolith) — the 8 services can't be run locally today without hand-written tooling.
6. **Coverage gap confirmed correct.** Proto contracts exist for exactly these 8 modules; `transport`, `delivery`, `tour-packages`, `tour-guides`, `news`, `waitlist`, `reviews` have zero `.proto` files under `packages/proto/` — this part of the roadmap claim is accurate.

**Implication for the roadmap:** this is not "wire up 8 dead contract files from scratch." It's "fix a broken build (rootDir), then build the actually-missing half: gRPC clients + hybrid-app bootstrap + real Railway service provisioning + local dev orchestration," while also doing greenfield proto+wiring for the 7 never-stubbed modules. Both halves are real work, but the *scaffolding pattern to copy* already exists and is proven correct in shape (controller reuses the existing service class, doesn't reimplement logic) — only the tsconfig/build/deploy/client layers are missing or broken.

## Standard Architecture (Target State)

### System Overview — End State After Full gRPC Extraction

```
┌─────────────────────────────────────────────────────────────────────┐
│  CLIENTS (Web / Mobile)  →  REST  →  api-gateway (was: monolith)    │
└───────────────────────────────────┬───────────────────────────────────┘
                                     │ HTTP /api/v1/*
                                     ▼
┌─────────────────────────────────────────────────────────────────────┐
│         backend/src (REST edge — "api-gateway" role)                 │
│  Controllers stay REST. For EXTRACTED modules, the module's          │
│  service is replaced by a gRPC-client proxy implementing the same    │
│  method signatures (see Pattern 1). For NOT-YET-extracted modules,   │
│  controller → service → Prisma stays exactly as today (in-process).  │
└───┬─────────────────────────────────────────────────────┬───────────┘
    │ gRPC (extracted)                                     │ in-process
    ▼                                                       ▼
┌───────────────────┐  ┌───────────────────┐   ┌─────────────────────┐
│ wallet-service     │  │ auth-service       │   │ transport, delivery, │
│ backend/apps/      │  │ backend/apps/      │   │ tour-*, marketplace,  │
│ wallet-service/     │  │ auth-service/       │   │ stays, events, admin  │
│ own PrismaClient    │  │ own PrismaClient    │   │ (still in monolith)   │
│ own Railway service │  │ own Railway service  │   │                       │
└─────────┬──────────┘  └─────────┬──────────┘   └───────────┬───────────┘
          │                       │                            │
          └───────────┬───────────┴────────────────────────────┘
                       ▼
              ┌─────────────────┐
              │ Neon PostgreSQL  │  ← ALL services (extracted + monolith)
              │ ONE DATABASE_URL │    share the same DB, different pools
              └─────────────────┘
```

**Answer to "does @Global() PrismaModule/CommonModule still work post-extraction":** No, not across process boundaries — `@Global()` only broadcasts within a single Nest DI container. Each `backend/apps/*/app.module.ts` re-imports `PrismaModule`, `CommonModule`, `RedisModule` itself (already correctly done in `wallet-service`'s `app.module.ts`) and gets its **own** `PrismaClient` instance = its own connection pool, against the **same** `DATABASE_URL`. This is correct and matches how the scaffolding was already built. The consequence to flag: monolith + 8 extracted services = 9 separate Postgres connection pools all hitting the same Neon instance. Neon's free/hobby tier has a hard concurrent-connection ceiling; this needs either Neon's pooled connection string (`-pooler` suffix, PgBouncer) on every service's `DATABASE_URL`, or a shared PgBouncer sidecar. This was not previously a concern with 1 process; it's the first real capacity risk introduced by extraction and belongs in Phase planning, not left implicit.

### Component Responsibilities (New/Modified for v2.0)

| Component | Responsibility | New or Modified | File |
|-----------|----------------|------------------|------|
| `backend/apps/<name>-service/` (×8) | Standalone gRPC server per extracted module | Modified — fix build, wire deploy | `backend/apps/*/` |
| gRPC client proxies | REST controllers' new dependency when their module is extracted; implements same method surface as the in-process service so controllers don't change | New | `backend/src/modules/<name>/<name>.grpc-client.ts` (proposed) |
| `OtpChannelService` | Dispatch OTP via SMS (Termii)/WhatsApp/Email based on user selection; replaces inline `sendTermii`/`sendTwilio` in `auth.service.ts` | New (extracted from existing private methods) | `backend/src/common/services/otp-channel.service.ts` (proposed) |
| `MinistryModule` (`MinistryController` + `MinistryService`) | Read-only KPI/visitor-entry dashboard + CSV/PDF export for `MINISTRY_VIEWER` role | New | `backend/src/modules/ministry/` (proposed) |
| `VisitorLog` (Prisma model) | Visitor-entry + purpose-of-visit tracking, LGA-scoped | New schema | `backend/prisma/schema.prisma` |
| `SettlementService` | Generic N-way atomic wallet fan-out (vendor/rider, Ministry, platform), generalized from `TourSettlementService` | New, in `CommonModule` | `backend/src/common/services/settlement.service.ts` (proposed) |
| `UserRole.MINISTRY_VIEWER` | New enum member, read-only role | New | `backend/src/common/enums/user-role.enum.ts` |

## Integration Point 1: Real gRPC Extraction

### What already exists and is reusable as-is
- `packages/proto/*.proto` for auth, wallet, events, marketplace, notifications, stays, admin, ai — message/service shapes are already reasonable (verified `wallet.proto`: `Credit`/`Debit`/`GetBalance`/`GetTransactions`).
- `backend/apps/*/[-name]-grpc.controller.ts` — correct pattern: thin `@GrpcMethod` controller that calls into the existing feature service, doesn't duplicate business logic. This is the pattern to replicate for the 7 unstubbed modules (transport, delivery, tour-packages, tour-guides, news, waitlist, reviews).
- `@grpc/grpc-js`, `@grpc/proto-loader`, `@nestjs/microservices`, `ts-proto` already in `backend/package.json` dependencies — no new package installs needed.
- `KafkaModule`/`KafkaService` (`backend/src/kafka/`) is a working, `@Global()`, optional (no-ops when `KAFKA_BROKER_URL` unset) async event bus already used as a **secondary, cross-pod-durable** channel alongside `EventEmitter2` in `TourSettlementService`. This is directly relevant: it's a second, already-proven mechanism for cross-service communication that doesn't require gRPC request/response — worth considering for event-style integrations (e.g., "wallet credited" notifications) instead of always reaching for synchronous gRPC calls.

### What must be fixed before ANY service can be extracted
1. **tsconfig `rootDir` fix** — every `backend/apps/*/tsconfig.app.json` needs its own `rootDir` (typically `"rootDir": "../.."` relative to the app folder, or restructure to compile with `backend/` as the TS project root) so `nest build <service>` actually succeeds. This blocks all 8 services identically; fix once, verify against `wallet-service`, apply to the rest.
2. **Remove the `2>/dev/null || true` build-failure mask** in every `backend/apps/*/Dockerfile` — replace with a real build step that fails the Docker build on error (standard `RUN npx nest build <service>` with no suppression).
3. **Add `ClientGrpc` proxies on the REST side.** For each extracted module, the existing REST controller needs its injected `<Name>Service` swapped for a thin gRPC client wrapper implementing the same method signatures — this is the piece with literally zero prior art in this repo; it must be built from scratch per module. Standard NestJS pattern: `ClientsModule.register([{ name: 'WALLET_PACKAGE', transport: Transport.GRPC, options: { package: 'wallet', protoPath, url } }])` in the consuming module, then `@Inject('WALLET_PACKAGE') private client: ClientGrpc` → `client.getService<WalletServiceClient>('WalletService')` in `onModuleInit`.
4. **Deploy wiring** — each extracted service needs its own provisioned Railway service pointed at its `backend/apps/<name>-service/railway.toml` (the file exists; the Railway-side service does not, per PROJECT.md's confirmation of single-service deploy). `docker-compose.yml` needs a new service block per extracted module for local dev (mirroring the `backend`/`web` block pattern already there), each exposing its gRPC port (`5001`, `5002`, ... — `wallet-service` already claims `5002`).
5. **Connection pool ceiling** — see System Overview note above. Must be resolved (pooled connection string) before more than 1-2 services run concurrently against Neon, or connections will exhaust under load testing.

### Migration path: which module first, and why
**Recommend `notifications-service` as the proof-of-pattern extraction, not `wallet-service`.**

Rationale:
- `notifications-service`'s gRPC surface (`SendPush`, `RegisterToken`) is the **lowest blast-radius** of the 8 — it's fire-and-forget FCM push, not in the payment-critical path. A bug in the client-proxy wiring here degrades push notifications, not money movement.
- It has no `SELECT FOR UPDATE` / transactional wallet semantics to get subtly wrong across a network boundary — `wallet-service`'s `Debit` RPC (verified in `wallet-grpc.controller.ts`) does its own `$transaction` with balance check-then-update, but this duplicates (and could drift from) `WalletService`'s own `debitWallet` idempotency-key logic (`backend/src/modules/wallet/wallet.service.ts:272`) — extracting wallet first means immediately confronting distributed-transaction/idempotency questions that are better solved once the extraction *mechanics* (build, deploy, client wiring, pooling) are proven on a safe module.
- `notifications.service.ts` has almost no cross-module Prisma reads (`user.findUnique` for the FCM token) — minimal blast radius if the extracted service's Prisma pool misbehaves.

**Do NOT extract `wallet-service` until after the settlement generalization (Integration Point 4) is designed**, because `TourSettlementService`'s multi-wallet `$transaction` pattern (5+ `SELECT FOR UPDATE` locks across vendor + system wallets in ONE transaction) is fundamentally incompatible with wallet operations living in a separate process — you cannot hold a Postgres row lock across a gRPC call boundary inside another service's transaction. If `SettlementService` is generalized to live in `CommonModule` and called synchronously in-process by Transport/Delivery/Events/Stays/Marketplace (as recommended in Integration Point 4), then `WalletModule` **must stay in-process** for the foreseeable future — extracting it would force settlement to become a distributed transaction (2-phase commit or saga), which is a much larger undertaking than this milestone scopes. Flag `wallet-service` extraction as a **future milestone**, not part of v2.0, and correct the roadmap accordingly if it currently implies wallet gets extracted too.

**Suggested order:** `notifications-service` (prove the pattern) → `ai-service` (stateless, streaming, no wallet coupling, isolates the Anthropic API blast radius which was the original stated goal — "resilience... around every external vendor call") → `admin-service` (read-mostly, only mutation is `setConfig`/status patches, low risk) → stop there for v2.0. Leave `auth-service`, `events-service`, `stays-service`, `marketplace-service`, `wallet-service` in-process pending the settlement/wallet redesign; extracting them now would be premature given the transactional coupling found in Integration Point 4.

## Integration Point 2: WhatsApp Business API OTP Channel

### What already exists (more than the milestone brief implies)
`AuthService.sendOtp()` → private `sendTermii()` (`backend/src/modules/auth/auth.service.ts:288-333`) **already has WhatsApp-adjacent logic**: when `TERMII_WHATSAPP_SENDER_ID` is configured, it sets `channel: 'whatsapp'` in the Termii API call, which routes the OTP through Termii's own WhatsApp Business API pass-through rather than SMS. There is a Twilio SMS fallback below that, and a final console-log stub if nothing is configured.

**This is not the same thing as user-selectable multi-channel OTP.** Today: (a) channel selection is automatic/config-driven, not user-chosen; (b) there is no `channel` field anywhere in `OtpSendDto` (verified — it has only `phone: string`) or `RegisterDto`; (c) email is never used as an OTP channel — `SendgridService` (already `@Global()` via `CommonModule`) is only ever used for ticket QR delivery emails, never OTP.

### Where it plugs in
**Recommendation: extract a new `OtpChannelService` into `CommonModule`, keep the OTP state machine (Redis TTL/lockout) in `AuthService`.**

Do not extract OTP dispatch into the existing `notifications` module/service, and do not route it through `notifications-service` gRPC once that's extracted. Reasoning:
- `NotificationsModule` is scoped to FCM push (`sendPush`, `registerToken`) — semantically a different concern (push vs. verification-critical delivery) and it's explicitly `@Global()`-excluded, requiring per-module `imports: [NotificationsModule]` (seen in `TourBookingsModule`). Auth doesn't currently import it and shouldn't need to for something this core.
- OTP dispatch is on the critical path of registration/login. If `notifications-service` is gRPC-extracted (per Integration Point 1's suggested order, it's extracted early), routing OTP through it adds a network hop and a new failure mode to the single most latency- and reliability-sensitive flow in the app. Keep OTP dispatch in-process, co-located with the Redis TTL/lockout logic it's tightly coupled to.
- `CommonModule` is `@Global()` and already hosts exactly this shape of external-vendor-wrapper service (`PaystackService`, `SendgridService`, `S3Service`) — `OtpChannelService` fits the existing idiom precisely: inject `SendgridService` for email, add a new `WhatsAppService` (or extend the existing Termii call) for WhatsApp, keep the Termii/Twilio SMS logic, and unify behind one `send(phone, otp, channel)` method that `AuthService` calls instead of its current private `sendTermii`.

### Data flow change
1. Add `channel: OtpChannel` (`enum { SMS, WHATSAPP, EMAIL }`, default `SMS`) to `OtpSendDto` and thread it through `verifyOtp`'s Redis key metadata if channel-specific retry logic is needed (likely not — Redis state stays channel-agnostic).
2. `RegisterDto` gains an optional `preferredChannel` for a persisted preference (new `User.preferredOtpChannel` column) if the product wants "remember my choice" — confirm with stakeholder before adding schema; not implied as required by the milestone brief, just a natural extension.
3. `EMAIL` channel requires an actual OTP email template via `SendgridService` — doesn't exist today (SendGrid is only wired for ticket delivery). New template + new `SendgridService.sendOtpEmail()` method.
4. `WHATSAPP` channel: decide between (a) keep using Termii's WhatsApp pass-through (already partially wired, fastest path, but adds a dependency on Termii's WhatsApp product tier) or (b) integrate Meta's WhatsApp Cloud API directly (matches "WhatsApp Business API (net new)" language in the milestone brief more literally, but is a new vendor integration with its own webhook verification, template-approval process via Meta Business Manager, and rate limits). **Given PROJECT.md explicitly calls this "net new," treat it as (b)** — a genuinely new `WhatsAppService` in `CommonModule` calling Meta's Cloud API (`graph.facebook.com/v.../messages`), not a relabeling of the existing Termii pass-through. Flag this as a phase needing focused research (Meta Business verification requirements, template message approval lead time — this is often a multi-day approval process with Meta, a real scheduling risk for the milestone timeline).

## Integration Point 3: Ministry Dashboard + MINISTRY_VIEWER

### Role wiring — trivial, guard needs no changes
`RolesGuard` (`backend/src/common/guards/roles.guard.ts`) is fully generic — `requiredRoles.includes(user?.role)` — adding `UserRole.MINISTRY_VIEWER` to the enum (`backend/src/common/enums/user-role.enum.ts`) and decorating new endpoints with `@Roles(UserRole.MINISTRY_VIEWER, UserRole.SUPER_ADMIN)` is the entire guard-layer change. **Do not add `MINISTRY_VIEWER` to `REGISTERABLE_ROLES`** — it must be a role assignable only by an admin (matches how `LGA_ADMIN`/`SUPER_ADMIN`/`STATE_ADMIN`/`DRIVER`/`TOUR_GUIDE`/`CREATIVE` are already excluded from self-registration).

### New controller, not an extension of AdminController — this is a real safety finding, not a style preference
`AdminController` (`backend/src/modules/admin/admin.controller.ts`) sets `@Roles(UserRole.SUPER_ADMIN, UserRole.LGA_ADMIN)` at the **class level**, then only 2 of 9 routes narrow it further with a method-level `@Roles(UserRole.SUPER_ADMIN)` override (`getRevenue`, and implicitly none else). NestJS's `reflector.getAllAndOverride` means **method-level always wins, but where no method-level decorator exists, the class-level default applies**. Concretely: `updateUserStatus`, `updateVendorStatus`, `updateStudioSlot`, `setConfig` — all mutation endpoints — have no method-level override and would inherit whatever role set is added at the class level. If `MINISTRY_VIEWER` were added to the class-level `@Roles(...)` to get dashboard access, it would silently also grant Ministry viewers the ability to suspend users, approve/suspend vendors, and rewrite `platformConfig` values (including fee percentages). That is a straightforward compliance violation for a role explicitly named "read-only" in the milestone brief.

**Build a new `MinistryModule`** (`ministry.controller.ts` + `ministry.service.ts` + own DTOs) with `@Roles(UserRole.MINISTRY_VIEWER, UserRole.SUPER_ADMIN)` applied **per-route**, all `@Get`, none writable. This matches the existing "self-contained NestJS module" convention (CLAUDE.md: `controller → service → prisma`) and sidesteps the class-level-inheritance trap entirely by never sharing a controller class with mutation endpoints.

### Query pattern reuse
`AdminService.getRevenue()` (`backend/src/modules/admin/admin.service.ts:50-98`) is the direct template: `Promise.all` of an `aggregate` + three `$queryRaw` breakdowns (by LGA, by status, by month). `MinistryService` should reuse this exact shape for visitor-entry KPIs — LGA breakdown, purpose-of-visit breakdown, monthly trend — swapping `orders`/`govtLevy` for the new `VisitorLog` table. Do not import `AdminService` into `MinistryModule` and call its methods directly (would re-couple the two after just separating them for the role-safety reason above); instead have `MinistryService` run its own equivalent Prisma queries against `VisitorLog` and reuse the read-only `platformConfig`/revenue aggregates by querying `PrismaService` directly, same as `AdminService` does — both services independently reading, neither depending on the other.

### Visitor-entry / purpose-of-visit schema — needs a new table, does not piggyback cleanly
Checked whether this can piggyback on existing booking data: `EventsModule` has QR-based ticket check-in (ticketed events only), `StaysModule` has booking + escrow (accommodation only, no "purpose of visit" concept), `TourismModule`/`LgasModule` are **read-only catalog** endpoints with zero visit-tracking or check-in mechanism at all today (verified — `TourismModule` responsibility is "Attractions CRUD; category/LGA filtering," nothing else). There is no unified "someone physically visited an LGA/attraction" signal in the schema today, and "purpose of visit" (tourism / business / relocation / other — whatever taxonomy the Ministry wants) has no home in any existing model.

**New `VisitorLog` model required:**
```prisma
model VisitorLog {
  id          String   @id @default(uuid())
  lgaId       String
  lga         Lga      @relation(fields: [lgaId], references: [id])
  userId      String?  // nullable — anonymous/kiosk entries allowed
  purpose     String   // enum candidate once taxonomy is confirmed with Ministry
  sourceType  String   // 'MANUAL' | 'EVENT_CHECKIN' | 'STAY_BOOKING' | 'KIOSK'
  sourceRefId String?  // ticket/booking id when sourceType correlates to an existing record
  createdAt   DateTime @default(now())
  @@index([lgaId, createdAt])
}
```
Where it **can** correlate: when `sourceType` is `EVENT_CHECKIN` or `STAY_BOOKING`, populate `sourceRefId` from the existing QR check-in / booking flow (an `@OnEvent` or direct call from `EventsService`/`StaysService` on confirmed check-in) so Ministry gets automatic counts for the transactional flows, while still allowing standalone manual/kiosk entries for foot traffic with no purchase attached — this is the realistic MVP shape given tourism attractions have no check-in mechanism to build on top of yet.

### CSV/PDF export
No existing export utility for tabular data — `ItineraryPdfService` (`CommonModule`) exists but is purpose-built for AI itinerary output, not a general reporting PDF generator. `pdfkit` is already a `backend/package.json` dependency (used by `ItineraryPdfService`), reusable for a Ministry report generator; CSV export has no existing helper and is trivial to hand-write (no new dependency needed — plain string-join is sufficient for tabular KPI exports at this data volume).

## Integration Point 4: Generalized Settlement Splits

### The real state is worse than "hardcoded two-way splits" — verified per-module
This is the most consequential finding for sequencing. Checked actual wallet-credit code, not just the PROJECT.md summary:

| Module | What actually happens today (verified in source) | Platform/Ministry cut actually banked? |
|--------|---|---|
| **Transport** (`transport.service.ts:516-577`) | `feePct` read from `PlatformConfig` (NOT hardcoded — contradicts the "hardcoded" framing in PROJECT.md for this module specifically), driver wallet credited with `fare - platformFee` inside one `$transaction` with `SELECT FOR UPDATE` on the driver wallet only | **No.** `platformFee` is stored as a column value on the `Trip` row. No system/platform wallet is ever credited. |
| **Delivery** (`delivery.service.ts:547-568`) | Same shape as Transport — `feePct` from `PlatformConfig`, rider wallet credited, `platformFee` computed | **No.** Same gap — fee is a number, not a wallet transaction. |
| **Stays** (`stays.service.ts:303-362`, `@Cron releaseEscrow`) | Host wallet credited with the **full** `booking.totalPrice`, 24h after checkout | **No — worse than Transport/Delivery.** `Booking.govtLevyPct` column exists in the schema (default 0) but is never read in the escrow-release code path. Zero platform fee capture of any kind for Stays today. |
| **Marketplace/Events/Studio** (`webhooks.service.ts`) | `WebhooksService` emits `payment.order_payment` / `payment.ticket_purchase` / `payment.studio_booking` via both `EventEmitter2` and Kafka | **No consumer exists.** Grepped `@OnEvent(` across all of `backend/src` — the only handler is `TourSettlementService`'s `@OnEvent('payment.tour_booking')`. The other three payment events are emitted into the void; nothing listens. (Not necessarily a live bug if these modules settle via a different, synchronous path at booking time the way Stays does — but it means the webhook-driven settlement path for these three is currently dead code, and any future real card-payment flow for them has no consumer to receive it.) |
| **Tour Bookings** (`tour-settlement.service.ts`) | The only real N-way pattern: one `$transaction`, `SELECT FOR UPDATE` per vendor wallet + system wallet, platform commission genuinely credited to a real `SYSTEM_USER_ID` wallet, idempotency via `<ref>-V-<idx>` / `<ref>-PLAT` transaction rows, drift-assertion, refund-on-failure | **Yes** — this is the only module where the platform's cut is an actual bankable wallet balance. |

**Conclusion:** "Generalize the settlement engine to a three-way vendor/Ministry/platform split, replacing today's hardcoded two-way splits" understates the work. Transport/Delivery need a **third leg added to a currently-real-but-incomplete two-way credit** (their percentage math is legitimately config-driven, just single-recipient). Stays needs the **fee capture built from scratch** — today it's zero-way (100% to host, 0% retained anywhere). Marketplace/Events/Studio's webhook-driven path needs a consumer built essentially from nothing (or confirmation that a different synchronous path is the real one, mirroring what Stays does, in which case that synchronous path — not yet located per-module in this research pass — is where `SettlementService` needs to plug in instead).

### Recommendation: `SettlementService` in `CommonModule`, generalized from `TourSettlementService`'s pattern
Build a shared `SettlementService.settle(params)` in `CommonModule` (parallel to `RefundService`, which already lives there) that accepts:
```typescript
interface SettlementParams {
  chargeAmountNgn: number;
  reference: string;              // e.g. Paystack ref or internal booking ref
  splits: Array<{ walletId: string; percentage: number; label: string }>;
  ministryWalletId?: string;      // resolved from PlatformConfig, e.g. '<module>.ministry_wallet_user_id'
  module: string;                 // 'transport' | 'delivery' | 'stays' | 'events' | 'marketplace'
}
```
Internally, this is `TourSettlementService`'s steps 4-6 (percentage resolution → drift-safe platform-commission calculation → one `$transaction` with `SELECT FOR UPDATE` per wallet, including a new Ministry wallet leg) lifted out of tour-booking-specific vendor-type resolution. Vendor-type-specific wallet resolution (GUIDE→TourGuide.userId, HOST→Property.hostId, etc.) stays in each calling module — `SettlementService` should accept already-resolved `walletId`s, not know about Transport's `Driver` model or Stays' `Property` model. This keeps `SettlementService` domain-agnostic and reusable, matching how `RefundService` is domain-agnostic today.

`TourSettlementService` itself should be refactored to call the new shared `SettlementService` rather than duplicating the logic — do this refactor as part of generalizing, not left as a second parallel implementation (two implementations of the same critical financial logic is its own pitfall).

### Sequencing: settlement generalization must land before further gRPC extraction touches these modules
Given `SettlementService`'s `$transaction` needs `SELECT FOR UPDATE` locks across **multiple** wallets in one atomic unit, it must run **in-process** relative to `WalletModule`. This reinforces the Integration Point 1 recommendation: do not extract `wallet-service` (or `transport`, `delivery`, `stays`, `events`, `marketplace` once they gain real settlement) until/unless a distributed-transaction pattern is separately designed. **Land settlement generalization before or alongside the gRPC proof-of-pattern work (notifications/ai/admin), not after** — it doesn't block those low-risk extractions, but it does constrain which modules are safe to extract later, so getting the constraint identified early avoids the roadmap accidentally scheduling `wallet-service`/`transport-service` extraction before this is understood.

## Suggested Build Order (Cross-Cutting)

1. **Fix the gRPC build (`rootDir`) + remove Dockerfile build-failure masking** — near-zero risk, unblocks everything else in Integration Point 1, and is a pure bug fix with no design decisions pending.
2. **Ministry dashboard (`MinistryModule` + `MINISTRY_VIEWER` role + `VisitorLog` schema)** — fully independent of the other three; no shared code paths, no sequencing risk. Safe to parallelize with anything else.
3. **Settlement generalization (`SettlementService`)** — before extracting any payment-touching module to gRPC, because it determines which modules *can't* be extracted soon. Also unblocks real revenue capture for Stays (currently zero) and Transport/Delivery (currently fee-tracked-but-unbanked), which is likely higher business value than the gRPC work itself.
4. **WhatsApp OTP channel** — independent of gRPC/settlement; can run in parallel. Sequence it slightly behind an early gRPC decision only if `notifications-service` extraction timing matters to it (it doesn't, per the recommendation to keep OTP dispatch in-process regardless).
5. **gRPC proof-of-pattern extraction: `notifications-service` → `ai-service` → `admin-service`** — only after (1) is fixed and (3) has clarified that `wallet-service`/payment-path modules are out of scope for this milestone's extraction work.

## Anti-Patterns to Avoid

### Anti-Pattern 1: Adding `MINISTRY_VIEWER` to `AdminController`'s class-level `@Roles(...)`
**What people do:** Extend the existing dashboard controller's role list since it "already has KPIs."
**Why it's wrong:** Class-level `@Roles` is the fallback for any method without its own override — 4 of `AdminController`'s 9 routes are unguarded mutation endpoints today. This grants write access to a role explicitly specified as read-only.
**Do this instead:** New `MinistryModule`/`MinistryController`, every route individually decorated `@Get` + `@Roles(UserRole.MINISTRY_VIEWER, UserRole.SUPER_ADMIN)`.

### Anti-Pattern 2: Extracting `wallet-service` (or any payment-path module) to gRPC before settlement generalization is designed
**What people do:** Follow the roadmap's literal service list and extract `wallet-service` early since its scaffold already exists and looks "furthest along."
**Why it's wrong:** `SettlementService`'s multi-wallet `SELECT FOR UPDATE` transaction cannot span a gRPC call boundary without becoming a distributed transaction — a much larger, unscoped problem.
**Do this instead:** Extract read-mostly / non-transactional modules first (`notifications-service`, `ai-service`, `admin-service`); leave `wallet-service` and any module `SettlementService` will call in-process for a future milestone.

### Anti-Pattern 3: Trusting `backend/apps/*/Dockerfile`'s green build as proof the service works
**What people do:** See `RUN ... || true` "succeed" in CI/build logs and assume the service compiled.
**Why it's wrong:** The `|| true` masks a real `TS6059` failure; the container will crash-loop on `CMD` because `dist/main.js` doesn't exist.
**Do this instead:** Fix `rootDir` in each `tsconfig.app.json` first, then remove the `|| true` so genuine build failures fail the pipeline loudly.

## Sources

- Direct source inspection: `backend/src/main.ts`, `backend/src/app.module.ts`, `backend/apps/wallet-service/**`, `backend/apps/notifications-service/**`, `backend/nest-cli.json`, `backend/tsconfig.json`, `packages/proto/wallet.proto`, `backend/src/modules/auth/auth.service.ts`, `backend/src/modules/auth/dto/otp-send.dto.ts`, `backend/src/modules/auth/dto/register.dto.ts`, `backend/src/common/common.module.ts`, `backend/src/common/guards/roles.guard.ts`, `backend/src/common/enums/user-role.enum.ts`, `backend/src/modules/admin/admin.controller.ts`, `backend/src/modules/admin/admin.service.ts`, `backend/src/modules/tour-bookings/tour-settlement.service.ts`, `backend/src/modules/tour-bookings/tour-bookings.module.ts`, `backend/src/modules/transport/transport.service.ts`, `backend/src/modules/delivery/delivery.service.ts`, `backend/src/modules/stays/stays.service.ts`, `backend/src/modules/webhooks/webhooks.service.ts`, `backend/src/kafka/kafka.service.ts`, `backend/prisma/schema.prisma`, `docker-compose.yml`, `railway.toml`, `backend/railway.toml`, `backend/apps/wallet-service/Dockerfile`, `backend/apps/wallet-service/railway.toml`.
- Verification action: actually ran `npx nest build wallet-service` from `backend/` (not assumed) — confirmed `TS6059` rootDir compile failure, cross-checked against the Dockerfile's error-suppression, confirming the scaffold is currently non-functional end-to-end.
- Verification action: `Grep` for `@OnEvent(` across `backend/src` confirmed only 3 handlers exist codebase-wide (`reviews.service.ts`, `tour-settlement.service.ts`, `tour-notifications.service.ts`), proving `payment.stay_booking`/`payment.ticket_purchase`/`payment.order_payment`/`payment.studio_booking` events have no consumer.
- Verification action: `Grep` for `ClientGrpc|ClientProxyFactory|@Client(` across `backend/src` returned zero matches, confirming no gRPC client usage exists anywhere in the REST layer.

---
*Architecture research for: ISEYAA v2.0 milestone (gRPC extraction, WhatsApp OTP, Ministry dashboard, settlement generalization)*
*Researched: 2026-07-15*
