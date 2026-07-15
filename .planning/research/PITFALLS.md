# Pitfalls Research

**Domain:** Adding real gRPC microservice extraction, multi-channel OTP (WhatsApp Business API), government export dashboard, and generalized N-way settlement splits to an already-live, money-handling government platform (ISEYAA v2.0)
**Researched:** 2026-07-15
**Confidence:** MEDIUM-HIGH (gRPC/distributed-transaction and connection-pool findings verified against Prisma docs and established patterns; WhatsApp Business API findings verified against multiple current vendor sources; settlement-split and export pitfalls are HIGH confidence because they are derived directly from this codebase's existing, verified behavior in `stays.service.ts`, `webhooks.service.ts`, and Phase 9's migration incident)

## Critical Pitfalls

### Pitfall 1: gRPC Extraction Splits the Wallet's `SELECT FOR UPDATE` Guarantee Across a Network Boundary

**What goes wrong:**
Today, `WalletService.debit()`/`credit()` and every settlement path (Transport 85/15, Delivery 80/20, Stays escrow, Tour Packages multi-vendor) run inside a single Postgres transaction with `SELECT ... FOR UPDATE` locking the wallet row. Once Transport, Delivery, or Tour Packages is extracted into its own gRPC service, that service can no longer share a Postgres transaction with `WalletService` (which stays in — or is extracted to — a different process). The natural-looking fix — "call the Wallet gRPC method from inside the Transport service, synchronously, after the ride completes" — silently reintroduces the classic distributed-transaction bug: the caller's local write (e.g., marking a ride `COMPLETED`) can succeed while the network call to Wallet's `Debit`/`Credit` RPC times out, crashes, or succeeds-but-the-response-is-lost. The system now has a ride marked complete with no corresponding wallet movement, or a wallet movement with no ride record — and there's no single `FOR UPDATE` lock spanning both anymore, so two concurrent gRPC calls against the same wallet ID can race in ways the old in-process code never could.

**Why it happens:**
Developers translate synchronous in-process function calls 1:1 into synchronous gRPC calls without changing the consistency model. gRPC "feels" like a local function call (that's the whole selling point of RPC), which hides that a network hop with partial-failure modes has been introduced. This is worse here than in a generic app because ISEYAA already depends on `SELECT FOR UPDATE` as its *only* concurrency-safety mechanism (per `CLAUDE.md` constraints) — there is no existing idempotent-retry or saga infrastructure to fall back on.

**How to avoid:**
- Never call Wallet synchronously-and-blocking from an extracted service for money-moving operations. Use the transactional outbox pattern: the extracted service (e.g., Transport) writes its own state change AND an outbox event row in the *same local transaction*, then a separate relay process delivers that event to Wallet (via gRPC or a queue) with at-least-once semantics and retries until Wallet acknowledges.
- Wallet-side operations must be idempotent per `(sourceType, sourceId)` — not just per generic idempotency key — so a redelivered outbox event after a crash doesn't double-credit. This extends the existing "idempotency key required on all wallet mutations" constraint rather than replacing it.
- Keep Wallet itself as the LAST service extracted, or never extract it at all — treat it as the one module that stays in the monolith (or becomes a "core" service everything else calls via well-tested async event delivery, never as a leaf dependency of a leaf service).
- Prefer extracting read-heavy, low-money-velocity modules first (news, waitlist, reviews, tour-guides discovery) to prove the gRPC pattern before touching Transport/Delivery/Tour Packages settlement paths.

**Warning signs:**
- Any new code that does `await walletGrpcClient.debit(...)` directly inside a request handler of another extracted service, with no outbox/event table backing it.
- Load tests that pass at low concurrency but show wallet balance drift (sum of ledger entries != wallet.balance) at 50+ concurrent requests once Transport is extracted.
- Any settlement path where the "did it work" check is "no error was thrown" rather than a reconciliation query.

**Phase to address:**
The phase that extracts Transport, Delivery, or Tour Packages (whichever touches wallet/settlement) — NOT the phase that extracts read-only/discovery modules. Explicitly sequence: extract non-money modules first to validate the gRPC pattern and tooling; build the outbox/idempotent-event pattern as its own phase before extracting any money-touching module; only then extract Transport/Delivery/Tour Packages settlement logic.

---

### Pitfall 2: Extraction Order Breaks In-Process Callers That Haven't Migrated Yet

**What goes wrong:**
`ROADMAP.md` currently (incorrectly) marks 8 services as gRPC-extracted while the runtime is a single `NestFactory.create()` monolith — meaning every "extracted" module today is still called via plain in-process NestJS DI (`this.walletService.debit(...)`). When v2.0 does the real extraction, if Service A is pulled out into its own process before every in-process caller of Service A is updated to call it over gRPC, those remaining callers break at runtime (the injected provider no longer exists, or exists as a stub) — often not caught until a specific code path fires in production (e.g., `AiModule`'s itinerary generator calling `WalletModule` for balance checks, or `WebhooksModule`'s known explicit cross-module dependency on `WalletModule`).

**Why it happens:**
NestJS's DI container doesn't distinguish "this is a real in-process class" from "this should now be a network client" until you change the provider registration everywhere it's injected. A partial extraction (module code physically moved to a new process, but not every consumer updated) compiles fine and passes unit tests (which mock the dependency) but fails integration/production because some caller still expects local method call semantics (synchronous return value, thrown exceptions, no network error handling).

**How to avoid:**
- Before extracting any module, grep for every direct injection of that module's service across the whole monolith (`grep -r "WalletService" backend/src/modules/`) and build the full caller graph. `WebhooksModule → WalletModule` is the one documented explicit cross-module dependency — but Tour Packages, Transport, Delivery, Marketplace, Stays, and Events likely also call `WalletService` directly for debit/credit; confirm each one before cutting the module out.
- Extract in dependency order: leaf modules with no other in-process callers first (news, waitlist, reviews), then modules with few, well-understood callers, and only last the modules everything else depends on (Wallet, Users/Auth).
- Use a facade/adapter pattern during migration: keep an interface-compatible wrapper in the monolith that internally either calls the local service OR the gRPC client based on a feature flag, so extraction can be toggled per-module and rolled back instantly if a caller breaks.
- Never flip a module's "extracted" status to done until every caller has been updated AND a production smoke test confirms the specific code path (not just the happy path) works end-to-end.

**Warning signs:**
- Any grep for a service class name that turns up call sites in modules other than the one being extracted, discovered AFTER extraction has started.
- `ROADMAP.md` marking a phase `[x]` complete based on "proto contract exists" rather than "zero remaining in-process callers confirmed by grep + integration test."
- Production errors of the shape `Nest can't resolve dependencies of the X (?)` after a deploy — the classic partial-DI-migration failure.

**Phase to address:**
The gRPC extraction planning phase, before any code is cut. Build the full dependency graph as a concrete pre-extraction artifact (not just narrative) and use it to fix extraction order. Re-verify with grep before marking each service's extraction checkpoint complete — this is exactly the kind of claim that was wrong last time (Phase 2's "8 services extracted" turned out to mean ".proto file exists," not "wired and callers migrated").

---

### Pitfall 3: Each Extracted gRPC Service Getting Its Own Prisma Client Exhausts the Neon Connection Pool

**What goes wrong:**
Neon's default Prisma connection pool is 10 connections (already noted as unconfigured/default in `CONCERNS.md`). If each extracted gRPC service (Transport, Delivery, Tour Packages, Wallet, Events, etc. — potentially 8+ services) instantiates its own `PrismaClient` against the same `DATABASE_URL`, each with its own default pool, total connections against Neon can hit 80-100+ under even modest concurrent load — not because traffic increased, but purely because the same database now has 8x as many independent connection pools competing for Postgres's actual `max_connections` limit. Neon's serverless/free-tier Postgres has a hard connection ceiling well below what 8 independently-pooled Node services will request under load; the failure mode is connection refusals/timeouts that show up as random 500s across unrelated features, which is very hard to diagnose because no single service looks unhealthy in isolation.

**Why it happens:**
Prisma's default pool sizing formula (`num_physical_cpus * 2 + 1`) is designed for "one service, one database" — it has no awareness that seven other processes are about to independently apply the same formula against the same Postgres instance. Extraction naturally multiplies the number of independent Prisma clients without anyone explicitly deciding "let's use N times the connections."

**How to avoid:**
- Before extracting the first money-touching or high-traffic service, put PgBouncer (or Neon's built-in pooler endpoint, which Neon offers natively — use the pooled connection string, not the direct one) in front of Postgres, and route every extracted service through it.
- Explicitly set `connection_limit` on each service's `DATABASE_URL` (e.g., `?connection_limit=3&pool_timeout=10`) so the sum across all extracted services stays comfortably under Neon's ceiling, rather than relying on Prisma's per-service default.
- Load-test the FULL extracted topology (all services running simultaneously under realistic concurrent load), not each service in isolation — pool exhaustion is an emergent, cross-service problem that per-service testing won't catch.
- Track total open connections as a monitored metric (Grafana, since it's already in the stack) with an alert threshold well below Neon's actual limit.

**Warning signs:**
- Intermittent `P1017`/`Can't reach database server` or `timed out fetching a new connection from the pool` errors that correlate with overall platform traffic, not with any single service's load.
- Local dev / staging never reproduces the issue (because staging runs fewer concurrent extracted services or lower traffic) — it only appears in production once most services are extracted.

**Phase to address:**
Set up connection pooling infrastructure (PgBouncer or Neon pooled connection string + explicit `connection_limit` per service) as its OWN phase, BEFORE extracting more than 1-2 services — not retrofitted after all 8 are live. This is cheap to do early and expensive to diagnose later.

---

### Pitfall 4: WhatsApp Channel Becomes a Rate-Limit Bypass for OTP Brute-Force / Abuse

**What goes wrong:**
The existing OTP system rate-limits and locks by phone number in Redis (3 attempts → 15-minute lock, per `CLAUDE.md`). If WhatsApp is added as a new delivery channel with its own send/verify code path, and the rate-limit key is scoped per-channel (`otp:whatsapp:{phone}`) rather than per-identity (`otp:{phone}` regardless of channel), an attacker can exhaust the SMS channel's lock, then immediately request an OTP via WhatsApp for the same phone number and get 3 fresh attempts — tripling the effective brute-force budget once Email is added too. This is a materially worse problem here than in a generic app because it directly gates access to a wallet holding real money and NIN/BVN-linked KYC data.

**Why it happens:**
The natural implementation path is "copy the SMS OTP module's send/verify logic, swap the Termii call for a WhatsApp Business API call" — which also copies the Redis key naming without noticing the key should be shared across channels, not per-channel. Since `AuthController` currently has no `ThrottlerGuard` applied at all (per `CONCERNS.md` — the global throttler is configured but never wired to auth endpoints), there is also no HTTP-level backstop that would catch channel-hopping abuse even if the Redis-level lock is bypassed.

**How to avoid:**
- Design the rate-limit/lockout key as `otp_lock:{phone}` (identity-scoped, channel-agnostic) from the start of the multi-channel work, not `otp_lock:{channel}:{phone}`. A user selecting a different channel must still draw against the same attempt budget.
- Fix the pre-existing `ThrottlerGuard` gap (noted in `CONCERNS.md`) as part of this work, since multi-channel OTP increases the attack surface the missing guard was supposed to cover — apply `@Throttle()` explicitly to all OTP send/verify endpoints regardless of channel.
- Also rate-limit "channel switch requests" themselves (e.g., max channel switches per phone per hour) to prevent an attacker from cycling through all three channels rapidly.
- Log and alert on cross-channel OTP request patterns for the same phone number within a short window — this is a detectable abuse signature.

**Warning signs:**
- Redis keys with channel embedded in the OTP lock namespace during code review.
- Load/security testing that only exercises one channel at a time never catches this — the test plan must explicitly attempt channel-hopping.

**Phase to address:**
The OTP channel-selection design phase, before WhatsApp integration code is written — the shared-lock-key decision is an architecture choice that's cheap now and a painful migration later if attempt data is already split across channel-scoped keys. Fixing the missing `ThrottlerGuard` should be sequenced into the same phase (or immediately before it), not deferred, since it's the HTTP-level backstop this new attack surface needs.

---

### Pitfall 5: WhatsApp Business API Template Approval Delay Blocks Launch (Meta Review, Not a Dev Task)

**What goes wrong:**
Teams plan WhatsApp OTP as "just another provider integration" on the same timeline as the SMS/Email work, then discover that sending an OTP via WhatsApp Business API requires a pre-approved message template, and template approval is a Meta review process outside engineering's control — typically minutes to hours for a clean authentication-category template, but 24-48+ hours (and sometimes multiple rejection/resubmit cycles) if the template includes anything Meta's automated or manual reviewers flag: promotional-sounding language, PII placeholders, malformed variable sequences (`{{1}} {{2}}` consecutive placeholders, or a skipped variable number), or a placeholder at the start/end of the message. A rejected template mid-sprint silently blocks the whole WhatsApp channel from shipping, and the team discovers this days before the planned ship date rather than weeks before.

**Why it happens:**
Engineers treat "integrate WhatsApp Business API" as symmetrical with "integrate Termii/SendGrid" (both of which are pure API-key-and-go integrations with no external review gate). WhatsApp's Business Platform additionally requires Business Verification (Meta Business Manager) and phone number registration/quality-rating ramp-up, which are also non-engineering, non-instant processes.

**How to avoid:**
- Start Meta Business verification, WhatsApp Business Platform onboarding (via the actual BSP being used, e.g., Twilio/Infobip/360dialog/direct Cloud API), and the authentication-category template submission in week 1 of the phase — in parallel with, not after, backend code — since these are on Meta's timeline, not the team's.
- Use WhatsApp's dedicated "Authentication" template category (not a generic utility/marketing template) for OTP — per current guidance this has the fastest, most predictable approval path and a fixed, restricted format specifically because it's OTP-only.
- Keep the template minimal and compliant from the first submission: no consecutive placeholders, no placeholder at message start/end, no promotional language, no PII collection prompts — resubmission cycles cost days, not minutes.
- Build the WhatsApp send path with SMS as the always-available fallback from day one, so a delayed/rejected template doesn't block the whole OTP feature — WhatsApp becomes additive, not a hard dependency for launch.
- Do not set an external ship date for "channel-choice OTP" that assumes same-day template approval; build in a buffer for at least one resubmit cycle.

**Warning signs:**
- Template submitted for the first time in the same week as planned production rollout.
- Template drafted without checking it against Meta's authentication-category format restrictions in advance.
- No SMS/Email fallback path if WhatsApp send fails or the number's quality rating drops (WhatsApp Business numbers get throttled/restricted on poor engagement metrics, which is a live-operations risk, not just a launch risk).

**Phase to address:**
Kick off Meta/BSP account verification and template submission as the FIRST action of the OTP phase (parallel-tracked with backend dev), not a step within backend implementation. Roadmap should show this as a distinct, front-loaded workstream with its own timeline separate from code completion.

---

### Pitfall 6: Cost-Per-Message Assumptions Blow the Budget (WhatsApp Conversation-Based Pricing vs. Per-SMS)

**What goes wrong:**
Termii SMS is typically billed per-message-sent. WhatsApp Business API billing is conversation-based (a "conversation" is a 24-hour window, and authentication-category conversations are billed per-conversation, with per-country rates that can be higher or structured differently than the equivalent SMS cost in Nigeria) and is billed through the BSP/Meta regardless of whether the user ever opens the message. Teams that budget "WhatsApp OTP" at the same or lower per-unit cost as SMS (reasoning "it's just messaging, should be cheaper") get an unpleasant surprise once real registration volume flows through the new channel, especially if retry/resend logic (a second OTP send because the first "timed out" from the user's perspective) multiplies conversation counts.

**Why it happens:**
SMS and WhatsApp pricing models are structurally different (per-message vs. per-conversation-window), and Nigeria-specific WhatsApp Business rates through a BSP are not always transparently documented up front — the team estimates cost using generic/US pricing examples found in vendor marketing pages rather than confirming Nigeria authentication-category rates with the actual BSP contract.
Note: exact current Nigeria WhatsApp Business authentication-conversation pricing was not verified in this research pass (BSP-dependent, changes over time) — flag as a concrete pre-launch action, not a fact stated here.

**How to avoid:**
- Get exact per-conversation authentication pricing for Nigeria from the specific BSP being used (not generic Meta marketing pages) before committing to a launch date, and model it against expected OTP volume including resend rate.
- Track cost-per-successful-verification (not just cost-per-message-sent) per channel from day one in the analytics/admin dashboard, so a channel that becomes disproportionately expensive is visible immediately, not discovered at month-end billing.
- Consider defaulting new users to the cheapest reliable channel (likely SMS in Nigeria) and presenting WhatsApp as an opt-in alternative rather than a co-equal default, to control cost exposure during rollout.
- Cap OTP resend attempts per channel per session server-side (not just client-side) to prevent retry storms from multiplying conversation-window costs.

**Warning signs:**
- No per-channel cost tracking in the admin/Ministry dashboard.
- Budget line item for WhatsApp OTP based on a generic web search figure rather than the signed BSP rate card.

**Phase to address:**
Cost modeling and BSP rate confirmation belong in the same front-loaded workstream as Pitfall 5 (Meta/BSP onboarding), before committing engineering time to the integration — and per-channel cost visibility should ship as part of the OTP phase itself, not deferred to the Ministry dashboard phase.

---

### Pitfall 7: Ministry Export Leaks BVN/NIN/Phone PII to a Non-Technical Government Stakeholder

**What goes wrong:**
The `MINISTRY_VIEWER` role is explicitly read-only and scoped to visitor entry counts and purpose-of-visit — aggregate/analytical data, not individual PII. The most common mistake building government export features is reusing an existing admin query or Prisma `select` that was written for `SUPER_ADMIN`/internal use (which legitimately needs user-level detail including `nin`, `bvn`, phone) and merely gating it behind the new role check, without re-scoping the underlying query to aggregate-only fields. Given `CONCERNS.md` already documents NIN/BVN stored in PLAINTEXT with no exclusion from `SELECT *` queries, any export code path that touches the `User` model without an explicit narrow `select` will pull plaintext national ID numbers directly into a CSV/PDF handed to a government stakeholder — which is both an NDPA violation and, for a government contract specifically, a severe trust/compliance incident (the Ministry receiving citizens' BVN/NIN in a spreadsheet is arguably worse than a technical data breach, since it's "working as designed" from the exporter's perspective).

**Why it happens:**
Export features are frequently built by extending an existing internal admin report ("just add a CSV button to the existing revenue/analytics query") rather than being designed as a new, deliberately narrow-scoped read path. The plaintext NIN/BVN storage (already a known issue) makes this worse than it would be in a system with field-level encryption, because there's no natural friction (like a decrypt step) that would force a developer to consciously decide to include PII in an export.

**How to avoid:**
- Design the Ministry export query as an explicit allowlist of fields from day one — never `select: { user: true }` or any spread that could include `nin`/`bvn`/raw `phone`. Build a dedicated `MinistryExportView`-style Prisma query or materialized aggregate table that physically cannot return PII columns because they were never selected.
- Do NOT reuse `AdminService` queries for the Ministry dashboard even where they look similar — `AdminModule` is designed for `SUPER_ADMIN`/`LGA_ADMIN` internal use and its existing queries (per `CONCERNS.md`, several already broken/untested — e.g., `getRevenue()`'s broken `vendors.category` raw SQL, `listUsers`'s unbounded `limit`) are not a safe starting template to copy from for a new, more restrictive audience.
- Aggregate at the query level (COUNT, GROUP BY LGA/date/purpose) rather than exporting row-level visitor records with identifying fields, wherever the Ministry's actual need (visitor entry counts, purpose-of-visit tracking) can be satisfied by aggregates — this is both more private and matches what was actually requested.
- Add an automated test asserting the Ministry export response/CSV schema contains ONLY the allowlisted fields — a schema-shape test that fails loudly if a future refactor accidentally widens the `select`.
- Independently of this feature, fix the underlying plaintext NIN/BVN storage (already flagged in `CONCERNS.md`) — at minimum ensure it's excluded from all `SELECT *` and Swagger responses — since it's the root condition that makes every future export/reporting feature a PII-leak risk by default.

**Warning signs:**
- Any Ministry export code path that imports or extends `AdminService` methods rather than being built as its own narrowly-scoped service.
- A Prisma query for the export that includes `include: { user: true }` or omits an explicit `select`.
- No automated test on the export response shape.
- Swagger docs (currently exposed unauthenticated in production per `CONCERNS.md`) showing the Ministry export endpoint's full response schema including PII fields — a second, independent leak vector for the same root cause.

**Phase to address:**
The Ministry dashboard phase must include, as an explicit sub-task, "PII-safe export query design + schema test" before the export endpoint ships — not as a post-launch hardening pass. Given the existing plaintext-PII tech debt, this phase should also either (a) fix the NIN/BVN exclusion-from-SELECT* issue as a prerequisite, or (b) explicitly document why the export is safe despite it (allowlist-select approach) and prove it with a test.

---

### Pitfall 8: Ministry Export Runs Against Unbounded/Unpaginated Queries, Causing Production Load Spikes

**What goes wrong:**
`CONCERNS.md` already documents that `Admin.listUsers` has no upper bound on `limit` and that the escrow-release cron processes records in a sequential, unbatched loop — both signs that this codebase has a recurring pattern of building internal tooling without pagination/streaming discipline. A CSV/PDF export feature is exactly the kind of endpoint most likely to repeat this mistake: "export everything for the date range" naturally wants to return all matching rows in one response, and for a government dashboard with growing visitor-entry data (7M addressable citizens), an unbounded query can scan and materialize a very large result set synchronously inside an HTTP request, on a database already running with an unconfigured 10-connection default pool (per `CONCERNS.md`) shared with every other live payment/booking workload. A large Ministry export run during business hours can starve wallet/payment queries of connections or cause P95 latency spikes across the whole platform — directly violating the stated P95 < 500ms constraint.

**Why it happens:**
Export features are usually built and tested against small dev/staging datasets, where an unpaginated query returns instantly and the problem is invisible until production data volume and Ministry usage patterns (e.g., someone requesting "full year to date" on a live dashboard) expose it.

**How to avoid:**
- Cap the export's date range and/or row count server-side (e.g., require a bounded date range, hard-cap total rows, or require background-job generation for large ranges rather than synchronous request/response).
- For genuinely large exports, generate the CSV/PDF asynchronously (queued job, notify when ready / poll for status) rather than blocking an HTTP request — this also sidesteps request-timeout failures on slow exports.
- Use a read-replica or off-peak scheduling for large aggregate exports if Neon/infra supports it, to isolate export load from the live transactional path — at minimum, ensure the export query is well-indexed and aggregated in SQL (not pulled row-by-row into Node and aggregated in memory, repeating the tourism module's existing Haversine-in-memory anti-pattern noted in `CONCERNS.md`).
- Load-test the export endpoint specifically against production-scale data volume before shipping, not just functional-correctness testing against seed data.

**Warning signs:**
- Export endpoint with no `limit`/date-range validation in its DTO.
- Export query implemented as `findMany()` with no `take`, followed by in-memory aggregation.
- No load test covering the export path in the phase's test plan.

**Phase to address:**
Ministry dashboard phase — pagination/bounding and async-generation-for-large-ranges should be part of the initial export design, not a follow-up fix after a production incident. Directly informed by the pre-existing `listUsers` unbounded-limit bug already in `CONCERNS.md` — same class of mistake, same phase should fix both if `listUsers` is touched.

---

### Pitfall 9: Ministry Export Reports on Data From a Table That Isn't Actually Populated in Production Yet

**What goes wrong:**
The Phase 9 migration incident (a subquery-in-CHECK-constraint bug that silently rolled back the migration in every environment for weeks, fixed 2026-07-13) is direct, recent proof that this codebase can have a schema/migration state where a table or column exists in the Prisma schema and in code, but the actual production database never received the corresponding structure or data. "Purpose-of-visit tracking" is explicitly called out as net-new in the v2.0 milestone — if this data model ships with any migration complexity (new enum, new FK constraint, new required field defaulting logic) and the same class of silent-rollback bug recurs, the Ministry export would report confidently on a table with zero or corrupted rows, and — critically — nothing in the export path itself would surface this as an error; it would just show as "0 visitors" or empty aggregates, which a non-technical government stakeholder has no way to distinguish from "genuinely zero visitors" (a highly plausible-looking but false number is far worse than a visible error).

**Why it happens:**
Migration failures that don't throw a loud error (like the subquery-in-CHECK-constraint case, which silently rolled back rather than failing the deploy) are invisible unless someone explicitly checks `prisma migrate status` against production or notices a discrepancy between expected and actual data. There is currently no CI gate for this (also flagged in `CONCERNS.md`: "Add a CI gate that runs `prisma migrate status` and fails if the schema is ahead of the migration history" — recommended but not yet implemented).
- Failure mode: the visitor-tracking table exists in the schema and code deploys successfully, but the actual production migration silently failed/rolled back, so the table is empty or missing entirely — and the export endpoint returns valid-looking empty/zero aggregates instead of an error.

**How to avoid:**
- Before the Ministry dashboard export ships, explicitly verify — via `prisma migrate status` run against the actual production database, not staging — that every table/column the export queries actually exists and is being written to by the (also new) visitor-entry-tracking code path. Do not trust that "the migration file exists in the repo" means "the migration applied in production," given the exact precedent from Phase 9.
- Implement the CI gate already recommended in `CONCERNS.md` (fail the pipeline if `prisma migrate status` shows drift) as a prerequisite for this milestone, given that v2.0 introduces new schema for purpose-of-visit tracking and the settlement-split generalization — both add migration risk in exactly the failure mode that already bit this project once.
- Add a basic sanity/row-count check to the export or an accompanying health check ("visitor_entries table has > 0 rows and was written to within the last 24h") that fails loudly rather than silently rendering an empty but plausible-looking export.
- Manually confirm in production (not just staging) that new visitor-entry writes are actually landing in the database before demoing or handing off the export feature to the Ministry stakeholder.

**Warning signs:**
- No verification step in the phase plan that checks `prisma migrate status` against production specifically (staging-only verification would have missed the exact Phase 9 bug, since it manifested "in every environment where it ran" — meaning staging alone wasn't sufficient signal that production was fine).
- Export dashboard showing all-zero or suspiciously round numbers with no alerting/sanity check.

**Phase to address:**
Ministry dashboard phase, as a go-live checkpoint gate — "confirm production data is actually populated" should be an explicit item in the phase's human-verification checklist, given the direct recent precedent. The CI migration-drift gate itself is infrastructure work that ideally lands even earlier (its own small phase or folded into the gRPC extraction phase's DB-safety work, since that phase will also be touching schema/deploy processes).

---

### Pitfall 10: Generalizing 2-Way Splits to N-Way Introduces Rounding/Remainder Errors That Silently Leak or Lose Money

**What goes wrong:**
Today's settlement math is simple: Transport is 85/15, Delivery is 80/20 — two-way splits where any rounding remainder has at most one place to go (typically the platform absorbs the fractional kobo). Generalizing to a three-way split (vendor/rider wallet, standing Ministry wallet, platform cut) driven by `PlatformConfig` percentages means three independent percentage calculations against the same base amount, and naive implementation (`vendorAmount = Math.floor(total * vendorPct)`, `ministryAmount = Math.floor(total * ministryPct)`, `platformAmount = Math.floor(total * platformPct)`) will frequently NOT sum back to `total` — the sum can be short by 1-3 kobo per transaction depending on rounding direction, and at scale (thousands of transactions/day across Transport, Delivery, Stays, Marketplace once all are migrated to the shared engine) this compounds into a real, auditable discrepancy between "total collected" and "total distributed," which is exactly the kind of number a government financial audit will catch and flag, especially since ISEYAA is a government-operated payments platform.

**Why it happens:**
Two-way splits are forgiving because there's an obvious "remainder goes here" answer (usually the platform, since it's collecting a fee anyway). Three-plus-way splits lose that obvious answer, and developers generalizing existing code often preserve the same "just floor each piece" logic without adding an explicit remainder-assignment step, because it worked fine (accidentally) in the two-way case.

**How to avoid:**
- Explicitly compute N-1 of the split amounts by percentage/floor, then compute the LAST amount as `total - sum(all_other_amounts)` rather than by its own independent percentage calculation — this guarantees the split always sums to exactly `total`, with any rounding remainder deterministically assigned to one designated recipient (convention: platform absorbs the remainder, consistent with how two-way splits already implicitly behave).
- Reuse Phase 9's Tour Packages multi-vendor settlement engine as the actual implementation base (per the `PROJECT.md` decision to do so) rather than re-deriving split math from scratch for each module — but explicitly verify Phase 9's engine already handles the remainder-assignment correctly (audit it, don't assume) before trusting it as the pattern for Transport/Delivery migration, especially given Phase 9's own migration had an unrelated but recent correctness bug (the CHECK-constraint incident) that suggests this module's rollout wasn't fully validated in production yet.
- Add an automated test that asserts, for every settlement call and a wide range of input amounts (including amounts that don't divide evenly, e.g., ₦1, ₦3, ₦100.01-equivalent kobo amounts), `sum(all recipient amounts) === total` exactly — not approximately.
- Add a periodic reconciliation job (or extend an existing one) that sums all settlement-split outputs against total collected revenue and alerts on any drift, as an ongoing safety net beyond the unit test.

**Warning signs:**
- Settlement code where each recipient's amount is computed independently via its own `Math.floor(total * pct)` with no final "does this sum to total" check.
- No test case using odd/non-round total amounts (real transactions are rarely round numbers).
- Admin revenue dashboard total not matching the sum of vendor + Ministry + platform wallet credits over the same period (this is the audit-catching symptom, and the existing `getRevenue()` endpoint is already known-broken per `CONCERNS.md`, so this drift may currently be invisible).

**Phase to address:**
The settlement-generalization phase, before migrating any existing two-way module (Transport, Delivery) onto the shared N-way engine — remainder-correctness must be proven with tests against the shared engine BEFORE it becomes the source of truth for real money in modules that are already live and trusted.

---

### Pitfall 11: Migrating Transport (85/15) and Delivery (80/20) to the Shared N-Way Engine Silently Changes Live Payout Amounts

**What goes wrong:**
"Generalizing" the settlement engine implies the existing two-way splits become a special case of the new N-way logic (e.g., Transport's 85/15 becomes vendor=85%, ministry=0%, platform=15% in the new schema). If the migration touches the `PlatformConfig` rows or code path that currently drives live driver/rider payouts, any off-by-one in percentage encoding (e.g., storing 15 instead of 0.15, or a default Ministry percentage silently applying to Transport when it shouldn't), any change in rounding behavior (see Pitfall 10), or any gap in the cutover (old code path partially deployed alongside new code path, both trying to settle the same booking) can change what a real driver or delivery rider is actually paid — for a government platform, incorrectly under-paying gig workers (drivers/riders) is a reputational and potentially legal problem, not just a bug.

**Why it happens:**
"Generalize the pattern" reads as a refactor, but for live financial code it's actually a live-money migration with all the same risks as a database migration — and this project has direct, recent precedent for exactly this failure mode (Phase 9's migration silently rolling back for weeks). The temptation is to do a "big bang" cutover (flip Transport/Delivery to the new engine in one deploy) rather than a gradual, verified migration, because the codebase already has the pattern proven in Tour Packages and it "should just work."

**How to avoid:**
- Do NOT touch Transport's or Delivery's live settlement code path in the same phase/deploy that builds the new generalized N-way engine. Build and prove the N-way engine first (new modules or a parallel/shadow-mode path), THEN migrate Transport/Delivery in a separate, later phase with explicit before/after payout verification.
- When migrating, run the new engine in "shadow mode" first: compute what the new engine WOULD pay out for real live bookings, log it alongside what the old hardcoded 85/15 or 80/20 logic actually pays, and diff them for a period before cutting over — this catches encoding/rounding mismatches without risking real driver/rider payouts.
- Explicitly test the migrated `PlatformConfig` values for Transport/Delivery against the exact existing 85/15 and 80/20 outcomes (regression test: "for these fee configs, the new engine must produce byte-identical payout amounts to the old hardcoded logic for every historical booking amount in the test fixture set").
- Communicate/coordinate the cutover timing with whatever operational process notifies drivers/riders of payouts, so a discrepancy (if one slips through) is caught quickly by a human who knows what a driver was expecting, not discovered weeks later in an audit.

**Warning signs:**
- A single PR/deploy that both builds the generalized engine AND rewires Transport/Delivery to use it, with no shadow-mode or parallel-run period.
- No regression test comparing old-path vs. new-path payout amounts for the same historical bookings.
- `PlatformConfig` migration script that transforms existing Transport/Delivery fee rows without an explicit reviewer sign-off on the exact before/after percentage values.

**Phase to address:**
Sequence as two distinct phases: (1) build + prove the generalized N-way settlement engine against new use cases only (or Tour Packages, which already uses a multi-vendor pattern), (2) migrate Transport and Delivery onto it in a later, separate phase with shadow-mode verification — never combine engine-generalization and live-module-cutover in one phase.

---

### Pitfall 12: A Shared Settlement Service Reuses Idempotency Keys Across Booking Types, Causing Silent Skip or Cross-Booking Collision

**What goes wrong:**
`CLAUDE.md` mandates an idempotency key on every wallet mutation — today this is naturally scoped per-module (e.g., a stay booking's settlement key derives from the booking ID in the `Booking` table, a ticket purchase's from the `Ticket`/reference). When settlement logic is generalized into ONE shared service used by Transport, Delivery, Stays, Marketplace, and Tour Packages, if the idempotency key generation logic is naively simplified to something like `settlement:{id}` without also including the source type (`settlement:{bookingType}:{id}`), two different domains that happen to generate overlapping numeric/UUID IDs (unlikely with UUIDs, but very possible if any module uses sequential or short reference IDs) could collide — one module's settlement would be silently treated as an idempotent no-op retry of a completely unrelated transaction from another module, meaning a real payout never happens (silently dropped, mistaken for a duplicate).

**Why it happens:**
When four or five previously-separate settlement code paths get consolidated into one shared service, the most natural refactor keeps the "id" concept but loses the module-scoping context that was implicit before (each module had its own settlement method, so there was never a chance of ID collision across domains). This is an easy thing to miss because it will pass all per-module tests (which only exercise one domain at a time) and only manifests when the shared service is actually handling concurrent cross-domain traffic in production.

**How to avoid:**
- Design the shared settlement service's idempotency key as a composite that always includes the booking/order/settlement TYPE, not just an ID: e.g., `settlement:{sourceType}:{sourceId}:{attemptContext}` — this is a small design decision that must be made explicit and reviewed, not left to whatever falls out of the refactor.
- Add a uniqueness constraint at the database level (not just application-level key construction) on the settlement/transaction ledger table for `(sourceType, sourceId)`, so even a code bug that generates a colliding key is caught by a DB constraint violation (loud failure) rather than silently treated as a legitimate duplicate.
- Write an explicit cross-domain collision test: simulate two different booking types producing the same raw numeric ID and confirm the shared settlement service treats them as distinct.

**Warning signs:**
- Idempotency key construction in the shared settlement service that only interpolates an ID, with no type/domain prefix.
- No composite database uniqueness constraint on the settlement ledger beyond a single ID column.
- A settlement call returning "already processed, skipping" for what should be a first-time settlement — the specific symptom of this exact bug, easy to miss because it looks like the idempotency system working correctly.

**Phase to address:**
The settlement-generalization phase, as part of the shared service's core design (same phase as Pitfall 10/11, but a distinct design decision within it) — get the key schema right before any module migrates onto the shared service, since changing key format later requires a data migration of historical idempotency records.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|-----------------|------------------|
| Calling extracted gRPC service synchronously for wallet debit/credit instead of building outbox pattern | Faster to ship first extracted service | Distributed-transaction bugs (wallet debited, downstream event lost) surface under production concurrency, hard to reproduce/debug | Never for wallet/settlement paths; acceptable only for pure read-only gRPC calls (e.g., fetching a user profile) |
| Copying `AdminService` query patterns for the Ministry export instead of building a narrow allowlist query | Faster to ship the export | PII leak (BVN/NIN/phone) to a government stakeholder; NDPA violation | Never — Ministry export must always be purpose-built with an explicit field allowlist |
| Big-bang cutover of Transport/Delivery to the new N-way settlement engine in the same phase it's built | Fewer total phases, feels more "complete" | Live driver/rider payout errors, no shadow-mode safety net, hard to roll back once real bookings have settled through the new path | Never — always shadow-mode verify before cutover for live money paths |
| Per-channel OTP rate-limit keys (`otp:whatsapp:{phone}`) instead of shared identity-scoped keys | Simpler to implement per-channel, less refactor of existing SMS lock logic | Channel-hopping brute-force bypass on a wallet/KYC-gated auth system | Never for auth/OTP; acceptable only for non-security-critical per-channel delivery-status tracking (distinct from the lock/attempt-count key) |
| Deferring the `prisma migrate status` CI gate (already recommended in `CONCERNS.md`) past v2.0 | Less CI setup work now | Repeat of the Phase 9 silent-rollback incident, this time possibly affecting settlement-split schema or visitor-tracking data that a Ministry export reports on | Acceptable only if manual production migration verification is done as a rigid go-live checklist item for every schema change in v2.0 — better to just build the gate |
| Skipping load testing of the full extracted-service topology (testing each gRPC service individually instead) | Faster per-service sign-off | Connection-pool exhaustion across services only shows up under combined production load, invisible in per-service testing | Never once more than 2-3 services are extracted and sharing the Neon database |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|-----------------|--------------------|
| gRPC between extracted services (wallet/settlement) | Treating the RPC call as a synchronous, always-succeeds local function call | Outbox pattern + idempotent event delivery + retry with backoff; treat every cross-service money call as a distributed transaction |
| Neon Postgres + multiple Prisma clients | Each extracted service gets a default-configured `PrismaClient` (10-connection pool each) | Route through PgBouncer/Neon pooled endpoint; explicitly set `connection_limit` per service so the sum stays under Neon's ceiling |
| WhatsApp Business API (Meta/BSP) | Assuming integration timeline equals engineering timeline; submitting template late; using a non-Authentication category template | Start Meta Business verification + BSP onboarding + Authentication-category template submission in week 1, parallel to backend code; keep template minimal/compliant on first submission |
| WhatsApp Business API billing | Budgeting WhatsApp OTP at SMS-equivalent per-message cost | Confirm exact Nigeria authentication-conversation pricing with the actual BSP contract; track cost-per-verification per channel from launch |
| Existing Paystack webhook trust-only flow + new settlement generalization | Building the new N-way settlement engine on top of the existing "trust the webhook, no server-side verify" flow, compounding financial risk | Add Paystack server-side `GET /transaction/verify/:reference` BEFORE generalizing settlement splits — verifying the amount server-side is a prerequisite for trusting any split logic (2-way or N-way) applied to it |
| Ministry dashboard reading from `AdminModule`/existing analytics queries | Reusing broken/unbounded existing admin queries (`getRevenue()`'s broken raw SQL, `listUsers`'s unbounded limit) as a template | Build the Ministry export as an independently-scoped, tested, bounded query set — do not inherit `AdminModule`'s known bugs by copy-paste |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|-----------------|
| Independent Prisma connection pools per extracted gRPC service | Intermittent DB connection timeout errors correlated with overall platform traffic, not any one service | PgBouncer/pooled connection string + explicit `connection_limit` per service, load-tested as a full topology | Once 3+ services are extracted and live simultaneously under production traffic |
| Unbounded/unpaginated Ministry export query | Slow admin dashboard, P95 latency spike platform-wide during export runs, potential DB connection starvation for payment paths | Bounded date range, hard row cap, async job generation for large exports | Once visitor-entry data volume grows past a few thousand rows, or a Ministry user requests a wide date range |
| Sequential settlement processing in the shared N-way engine (repeating the existing `releaseEscrow` unbatched-loop pattern noted in `CONCERNS.md`) | Settlement cron/job runtime grows linearly with booking volume, cron ticks start overlapping | Concurrency-limited batch processing (`p-limit`) or a proper job queue (BullMQ) from the start of the generalized engine, not inherited from the old per-module crons | Once combined Transport+Delivery+Stays+Marketplace+Tour Packages settlement volume exceeds what a single sequential cron tick can process in its interval |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Ministry export query without explicit field allowlist | BVN/NIN/phone PII leaked to a non-technical government stakeholder — NDPA violation, severe trust incident for a government contract | Purpose-built, allowlisted export query; automated schema-shape test; fix underlying plaintext NIN/BVN storage as a prerequisite or explicitly prove the allowlist prevents leakage |
| Per-channel OTP rate-limit scoping | Channel-hopping brute-force bypass against wallet/KYC-gated accounts | Identity-scoped (not channel-scoped) lock keys; fix pre-existing missing `ThrottlerGuard` on auth endpoints in the same phase |
| Synchronous cross-service wallet calls without idempotent event delivery | Distributed double-debit or lost-credit under concurrent load once wallet logic crosses a network boundary | Outbox pattern, idempotency keyed by `(sourceType, sourceId)`, DB-level uniqueness constraint as a backstop |
| Generalizing settlement splits on top of unverified Paystack webhooks | Any forged/replayed webhook now propagates through a MORE complex N-way payout logic instead of a simple 2-way one — larger blast radius for the same pre-existing vulnerability | Implement Paystack server-side transaction verification (`GET /transaction/verify/:reference`) BEFORE or in the same phase as settlement generalization — do not build more payout logic on an unverified trust boundary |
| Swagger exposed unauthenticated in production (pre-existing) + new Ministry export endpoint | New export endpoint's full request/response schema (potentially revealing what fields exist, including any PII columns not yet removed) publicly visible via `/api/docs` | Gate Swagger behind non-production check or Basic Auth as part of this milestone, given the new sensitive-data endpoints being added |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-------------------|
| Channel-choice OTP presented with no indication of reliability/speed differences | User picks WhatsApp, template not yet approved or number rate-limited, verification silently fails or times out with no clear fallback guidance | Default to the most reliable channel (SMS, proven in production); clearly indicate if a channel is degraded/unavailable; auto-fallback to SMS if WhatsApp send fails, with user notification |
| Ministry dashboard showing empty/zero data with no distinction between "genuinely zero" and "data pipeline not populated yet" | Non-technical stakeholder makes decisions based on a false "zero visitors" reading caused by a silent migration failure (see Pitfall 9) | Add explicit data-freshness/last-updated indicators and a sanity-check banner if underlying tables show suspiciously low/zero row counts |
| Settlement split changes (Transport/Delivery migrating to N-way engine) with no visibility to drivers/riders on why a payout amount changed | Driver/rider trust erosion if a payout looks different from what they expected, even if mathematically correct | Communicate settlement engine changes through whatever existing driver/rider notification channel exists before cutover; keep payout amounts byte-identical during migration (Pitfall 11) so there's nothing to notice |

## "Looks Done But Isn't" Checklist

- [ ] **gRPC extraction "complete" for a service:** Often means only the `.proto` file exists (exactly the Phase 2 mistake already made once) — verify with `grep` for zero remaining in-process `@Injectable()` direct calls to that service AND a production integration test exercising the real gRPC call path, not just a compiled proto contract.
- [ ] **Wallet/settlement gRPC call "working":** Often only tested on the happy path (network call succeeds) — verify idempotent retry behavior explicitly by simulating a network timeout/crash after the caller's local write but before the downstream ack, and confirm no double-credit/lost-credit results.
- [ ] **WhatsApp OTP "integrated":** Often means the API call code is written and tested against Meta's sandbox/test numbers — verify the production Authentication-category template is actually APPROVED (not just submitted) and the WhatsApp Business number's quality rating is healthy before considering this shippable.
- [ ] **Ministry export "built":** Often means the query returns correct-looking data against seed/dev data — verify (a) the export field list was explicitly reviewed against a PII allowlist, (b) the query is bounded/paginated, and (c) the underlying source table is confirmed populated in PRODUCTION (not just staging), given the Phase 9 precedent.
- [ ] **N-way settlement split "generalized":** Often means the new engine works for new bookings — verify a regression test proves byte-identical output to the OLD 85/15 and 80/20 hardcoded logic for the exact same historical booking amounts, and that Transport/Delivery haven't actually been cut over yet without a shadow-mode verification period.
- [ ] **Connection pooling "configured" for extracted services:** Often means one service has an explicit `connection_limit` set — verify the SUM across ALL extracted services plus the remaining monolith stays comfortably under Neon's actual connection ceiling, tested under combined (not per-service) load.
- [ ] **Paystack verification "not blocking this milestone":** Explicitly confirm this decision was made deliberately, not by omission — given the settlement generalization increases the payout complexity riding on top of the unverified webhook trust boundary, this is the highest-leverage moment to close that gap, not defer it further.

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|----------------|------------------|
| Distributed wallet debit/credit inconsistency after partial gRPC extraction | HIGH | Build a reconciliation job comparing wallet ledger sums against source-of-truth booking/order records per domain; manually correct drifted balances with an audited adjustment transaction; retrofit the outbox pattern before continuing extraction of any further money-touching modules |
| Connection pool exhaustion discovered in production after multiple services extracted | MEDIUM | Immediately deploy PgBouncer/Neon pooled connection string in front of all services (can often be done without code changes, just connection string swap); set explicit `connection_limit` per service; this is a config-level fix once diagnosed correctly |
| PII leaked in a Ministry export already delivered | HIGH | Legal/NDPA incident response required (this is a government contract — treat as a compliance incident, not just a bug); revoke/rotate any exposed identifiers where feasible; audit every prior export for the same exposure; fix the query and add the regression test before any further exports are generated |
| N-way settlement rounding drift discovered after Transport/Delivery migration | MEDIUM-HIGH | Run the reconciliation job to quantify total drift; issue manual correcting wallet adjustments to affected drivers/riders; fix the remainder-assignment logic; add the sum-equals-total regression test retroactively before re-enabling the migrated path |
| WhatsApp template rejected close to planned launch | LOW-MEDIUM | Ship with SMS/Email only for the affected timeline; resubmit a corrected, minimal Authentication-category template; do not delay the rest of the OTP feature for WhatsApp specifically since it should have been built as additive from the start (Pitfall 5) |
| Ministry export found reporting on an unpopulated/silently-failed-migration table (Pitfall 9 realized) | MEDIUM | Run `prisma migrate status` against production immediately to confirm/deny drift; if confirmed, treat as a repeat of the Phase 9 incident — apply the missing migration properly, backfill/reconcile data where possible, and retroactively flag any Ministry-facing numbers already reported as unreliable for that period |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|--------------------|----------------|
| Wallet `SELECT FOR UPDATE` guarantee lost across gRPC boundary (P1) | Dedicated "distributed settlement pattern" phase, built BEFORE extracting Transport/Delivery/Tour Packages settlement logic | Chaos/failure-injection test: kill the network mid-call and confirm no double-credit/lost-credit via reconciliation query |
| Partial extraction breaks unmigrated in-process callers (P2) | gRPC extraction planning phase, per-service, before cutting any module | Full caller-graph grep + integration test per extracted service before marking its checkpoint complete |
| Prisma connection pool exhaustion across extracted services (P3) | Connection-pooling infrastructure phase, before extracting more than 1-2 services | Combined-topology load test showing total connections stay under Neon's ceiling |
| WhatsApp channel-hopping OTP bypass (P4) | OTP channel-selection design phase, before WhatsApp code is written | Security test explicitly attempting cross-channel attempt exhaustion; confirm shared `otp_lock:{phone}` key; confirm `ThrottlerGuard` applied to all OTP endpoints |
| WhatsApp template approval delay blocks launch (P5) | Front-loaded, parallel-tracked Meta/BSP onboarding workstream starting week 1 of the OTP phase | Template shows APPROVED status with buffer time before planned ship date |
| WhatsApp cost-per-message budget surprise (P6) | Same front-loaded BSP onboarding workstream as P5 | Confirmed Nigeria authentication-conversation rate from signed BSP contract; per-channel cost tracking live in dashboard |
| Ministry export leaks PII (P7) | Ministry dashboard phase, PII-safe query design as an explicit sub-task | Automated schema-shape test asserting export response contains only allowlisted fields |
| Ministry export unbounded query load spike (P8) | Ministry dashboard phase, bounding/pagination as part of initial design | Load test against production-scale data volume before ship |
| Ministry export reports on unpopulated table (P9) | Ministry dashboard phase, go-live checklist item; CI migration-drift gate as prerequisite infra work | `prisma migrate status` verified clean against PRODUCTION; sanity row-count check on the source table |
| N-way rounding/remainder errors (P10) | Settlement-generalization phase, before migrating any live 2-way module | Automated test: sum of all recipient amounts equals total for a wide range of non-round input amounts |
| Transport/Delivery payout amounts change during migration (P11) | Two separate phases: build engine, then migrate live modules with shadow-mode verification | Regression test proving byte-identical payouts vs. old hardcoded 85/15 and 80/20 logic across historical booking amounts |
| Shared settlement idempotency key collision across booking types (P12) | Settlement-generalization phase, key-schema design decision | Cross-domain collision test; DB-level composite uniqueness constraint on `(sourceType, sourceId)` |
| Missing Paystack server-side verification (pre-existing, `CONCERNS.md`) | Should be sequenced BEFORE or WITHIN the settlement-generalization phase, not deferred further | `GET /transaction/verify/:reference` call confirmed present in the webhook-to-settlement path before N-way splits go live |

## Sources

- `.planning/codebase/CONCERNS.md` — existing verified tech debt (JWT blacklist gap, unverified Paystack webhooks, `prisma db push --accept-data-loss` usage, unconfigured connection pool, ticket oversell race condition, missing ThrottlerGuard on auth, unbounded `listUsers`, plaintext NIN/BVN) — HIGH confidence, direct codebase audit
- `.planning/PROJECT.md` — v2.0 milestone scope, Phase 9 migration incident (subquery-in-CHECK-constraint silent rollback), current settlement percentages (Transport 85/15, Delivery 80/20), gRPC extraction reality-check (proto-only, zero `@GrpcMethod` usage) — HIGH confidence, direct project record
- [Prisma: Database connections](https://www.prisma.io/docs/orm/prisma-client/setup-and-configuration/databases-connections) — connection pool default sizing formula — HIGH confidence, official docs
- [Prisma Connection Pooling Explained (Medium, Safi Ullah)](https://medium.com/@safifma/prisma-connection-pooling-explained-how-multiple-prisma-clients-can-crash-your-postgresql-database-400b0efc86ef) — multi-instance pool exhaustion mechanics — MEDIUM confidence, community source, consistent with official docs
- [GitHub: prisma/prisma#20272 Connection Limit Exceeded and CPU Burnout Issues](https://github.com/prisma/prisma/issues/20272) — real-world pool exhaustion reports — MEDIUM confidence
- [Microservices.io: Strangler Application pattern](https://microservices.io/patterns/refactoring/strangler-application.html) and [AWS Prescriptive Guidance: Strangler fig pattern](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/strangler-fig.html) — extraction ordering and transactional-boundary risk — MEDIUM confidence, established architecture pattern references
- [WUSeller: WhatsApp Template Approval Checklist](https://www.wuseller.com/blog/whatsapp-template-approval-checklist-27-reasons-meta-rejects-messages/), [YCloud: Common WhatsApp API Template Rejection Reasons](https://www.ycloud.com/blog/common-whatsapp-api-template-message-rejection-reasons-with-fixes), [AiSensy: WhatsApp Template Approval Process](https://m.aisensy.com/blog/whatsapp-template-approval-process/) — template approval timing and rejection causes — MEDIUM confidence, cross-referenced across multiple independent vendor sources, consistent findings on Authentication-category format restrictions and approval-time ranges
- WhatsApp Business API conversation-based/authentication-category pricing for Nigeria — NOT independently verified in this research pass (BSP- and time-dependent); flagged explicitly as LOW confidence / an open item requiring direct BSP contract confirmation before launch, per Pitfall 6

---
*Pitfalls research for: ISEYAA v2.0 — gRPC extraction, multi-channel OTP, Ministry export, N-way settlement splits on a live payments platform*
*Researched: 2026-07-15*
