# Phase 21: Low-Risk gRPC Extraction — News/Waitlist/Reviews + Scoped Delivery OTP - Context

**Gathered:** 2026-07-20
**Status:** Ready for planning

<domain>
## Phase Boundary

News, Waitlist, and Reviews each become their own independently-deployed gRPC service (own Railway process, own `ClientGrpc` facade in the monolith, zero REST response-shape change). Delivery's `VerifyDeliveryOtp` RPC is extracted the same way while `RequestDelivery`, `AcceptDelivery`, `CompleteDelivery`, and `DeliveryGateway` stay in-process. All four extractions follow the exact pattern already proven live by `notifications-service` (Phases 17/20): thin gRPC controller wrapping the existing domain module, canary kill-switch flag, health-check-gated rollout per Phase 20.

Full Delivery extraction (the other 3 RPCs + Gateway) is explicitly out of scope — deferred as GRPC-07x pending an outbox/saga redesign.

</domain>

<decisions>
## Implementation Decisions

### Delivery OTP service scope
- **D-01:** The new `delivery-otp-service` reuses the full `DeliveryModule` as-is (import it wholesale into the new app, matching exactly how `notifications-service` imports the full `NotificationsModule`), rather than extracting `verifyOtp`'s Redis+Prisma logic into a new lean OTP-only module. Accepted tradeoff: `WalletModule`/`AuthModule` (pulled in for the Socket.IO gateway) ship into the new process even though `VerifyDeliveryOtp` itself never touches them. Chosen for speed and precedent-fidelity over minimal blast radius — matches the low-risk/low-effort framing of this phase.
- **D-02:** `DeliveryService.verifyOtp()` (backend/src/modules/delivery/delivery.service.ts:489-521) is not stateless — it reads/writes Redis keys `delivery:otp:{orderId}` and `delivery:otp:attempts:{orderId}`, and writes `prisma.deliveryOrder.otpVerifiedAt`. The extracted service needs both Redis and Prisma access via the shared `RedisModule`/`PrismaModule`, same as every other extracted service — no new architecture needed, this is the established pattern from Phase 17/20, not a new decision point.

### Service naming
- **D-03:** The new Delivery service is named `delivery-otp-service`, not `delivery-service` — the name deliberately signals narrow, permanent-until-GRPC-07x-unblocks scope, matching how REQUIREMENTS.md already separates GRPC-07 (this phase) from GRPC-07x (deferred full extraction). If/when full Delivery extraction happens later, that is expected to be a new or renamed service, not an in-place growth of this one.

### Rollout sequencing
- **D-04:** All four services ship staggered, one at a time, each with its own canary flag flip and a bake period before the next starts — matching Phase 20's blue-green bake-period gate pattern. Rejected: shipping all four in one wave (faster but harder to isolate a regression to one service).
- **D-05:** Rollout order is risk-ascending: **News → Waitlist → Reviews → Delivery OTP**. Rationale: News and Waitlist are pure read/write CRUD with no cross-domain writes or shared mutable state (lowest risk, good pattern-proving warm-up). Reviews has a cross-domain rating recompute (writes into `TourGuide`/`TourPackage`/`Property`, other domains' tables) — see Established Patterns below for the debounce caveat. Delivery OTP touches Redis+Postgres state shared live with the still-in-process `DeliveryService` — highest risk, ships last.
- **D-06:** Per-service canary flags follow the existing `grpc.<service>_canary_enabled`-style key precedent (opt-out kill switch: absence or any value other than `false` means enabled) — one independent flag per service, not one combined phase-wide flag. This is precedent-following, not a new decision the user needed to make.

### Claude's Discretion
None — all three discussed areas (delivery-OTP module scope, service naming, rollout order) resolved to explicit user decisions above. The researcher/planner should still use judgment on: exact gRPC port assignments for the four new services (5001-5008 already taken by existing apps/services), and the mechanics of the bake-period length/gate criteria between each staggered rollout step (Phase 20's `20-CONTEXT.md`/`20-PATTERNS.md` should be the reference for what "bake period" concretely means operationally).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Proven gRPC extraction pattern (Phase 17/20)
- `backend/apps/notifications-service/` — the only service actually live as a separate deployed Railway process today; the template for all four new services (Dockerfile, railway.toml, `src/app.module.ts`, `src/main.ts`, `src/health.controller.ts`, `src/<domain>-grpc.controller.ts`)
- `backend/src/modules/notifications-client/notifications-client.service.ts` — the `ClientGrpc` facade + canary-flag + `resilience.execute()` wrapper pattern to replicate for news/waitlist/reviews/delivery-otp client facades
- `.planning/phases/20-grpc-blue-green-healthcheck-retrofit/20-CONTEXT.md` — canary flag semantics (D-01/D-10 addendum: opt-out kill switch, single-hostname Railway has no second instance to route to), rollback runbook approach (markdown only, D-04), health-check-gated rollout requirement
- `.planning/phases/20-grpc-blue-green-healthcheck-retrofit/20-PATTERNS.md` — bake-period gate mechanics referenced for D-04 above
- `.planning/phases/20-grpc-blue-green-healthcheck-retrofit/20-RESEARCH.md` — blue-green/health-check research this phase's rollout must satisfy (Success Criteria #3: "passes Phase 20's health-check-gated rollout ... before being considered live")

### Proto contracts (already authored, Phase 10-03)
- `packages/proto/news.proto` — `NewsService.ListNews`
- `packages/proto/waitlist.proto` — `WaitlistService.JoinWaitlist`, `GetWaitlistStats`
- `packages/proto/reviews.proto` — `ReviewsService.CreateReview`, `ListReviews`, `ResolveReviewFlag`
- `packages/proto/delivery.proto` — `DeliveryService.VerifyDeliveryOtp` is the only RPC this phase implements server-side; `RequestDelivery`/`AcceptDelivery`/`CompleteDelivery` are defined in the same proto (authored ahead for GRPC-07x) but stay unimplemented/unused by this phase

### Requirements & roadmap
- `.planning/REQUIREMENTS.md` lines 15-16, 43, 81-82 — GRPC-07 (Delivery OTP scope + explicit GRPC-07x deferral), GRPC-08 (News/Waitlist/Reviews)
- `.planning/ROADMAP.md` lines 487-495 — Phase 21 success criteria (this is the fixed scope anchor)
- `.planning/STATE.md` line 80, 92 — GRPC-05 decision reaffirmed (no wallet-touching service extraction this milestone) and confirms Events/Stays/Marketplace/Studio are NOT candidates for this phase (out of scope, different requirement)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `backend/src/modules/news/` (news.service.ts, news.controller.ts, news.module.ts) — pure read-only `prisma.newsItem` query, no cron/cache/external fetch, single caller (`NewsController`). Trivial extraction — wrap as-is.
- `backend/src/modules/waitlist/` (waitlist.service.ts, waitlist.controller.ts, waitlist.module.ts, dto/) — pure CRUD (`join()` upserts `waitlistEntry`, `stats()` does a `groupBy`), no external calls (no SendGrid despite the domain), no other module depends on it. Trivial extraction — wrap as-is.
- `backend/src/modules/reviews/` (reviews.service.ts [434 lines], reviews.controller.ts [ReviewsController + ReviewsAdminController], reviews.module.ts, dto/) — NOT pure CRUD. `createReview` runs 7 eligibility guards then an atomic `$transaction` (Review + conditional AdminReviewFlag on rating ≤2), emits `review.created` via EventEmitter2, consumed by an in-process `@OnEvent` handler that debounces (5s, in-memory `Map`, already-documented not-cluster-safe caveat) a rating recompute writing back into `TourGuide`/`TourPackage`/`Property`. `ReviewsAdminController` already lives inside `ReviewsModule` — no separate `AdminModule` coupling to worry about.
- `backend/src/modules/delivery/` (delivery.controller.ts, delivery.service.ts [858 lines], delivery.gateway.ts, delivery.module.ts) — `verifyOtp()` at lines 489-521 is the only piece extracted this phase; it is stateful (Redis OTP+attempts keys, Postgres `otpVerifiedAt` write) but has no side effects beyond that (no Gateway emit, no wallet call inside `verifyOtp` itself — `completeDelivery`, staying in-process, is the only other reader of `otpVerifiedAt`).

### Established Patterns
- Every extracted service reuses the monolith's `PrismaModule`/`RedisModule`/`ResilienceModule` directly (same Postgres/Redis instance, separate process) — no data-ownership boundary is enforced between services. This is precedent from `notifications-service`, confirmed applicable to all four new services including cross-domain writes (Reviews → TourGuide/TourPackage/Property) and shared state (Delivery OTP → Redis+Postgres also touched by in-process code).
- Canary flag: `PlatformConfig` key per service, opt-out semantics (`value !== false` → enabled), checked before every gRPC call in the client facade; on canary-disabled or gRPC failure, facade throws `ServiceUnavailableException` with a Paystack-style user-facing message (see `UNAVAILABLE_MESSAGE` in notifications-client.service.ts).
- gRPC bootstrap: `app.connectMicroservice` with `Transport.GRPC`, dual `package: [<domain>, 'grpc.health.v1']`, `grpc-health-check` npm package wired via `HealthImplementation`, plus a separate HTTP `/healthz` on `PORT` for Railway's `healthcheckPath` (this is the Phase 20 blue-green retrofit pattern — new services should be built with both from day one, not retrofitted later).
- Existing gRPC ports in use: 5001 (auth-service, scaffold-only/not live), 5002 (wallet-service, scaffold-only), 5003 (events-service, scaffold-only), 5004 (stays-service, scaffold-only), 5005 (marketplace-service, scaffold-only), 5006 (admin-service, scaffold-only), 5007 (ai-service, scaffold-only), 5008 (notifications-service, the only one actually live). New services need 5009+.

### Integration Points
- `backend/src/app.module.ts` — where `NewsModule`, `WaitlistModule`, `ReviewsModule`, `DeliveryModule` are currently registered flat (no cross-imports among these four); new `*-client` modules (matching `notifications-client`) replace direct in-process calls at whatever controllers/services currently import these four modules' services directly.
- `backend/apps/*/railway.toml` `watchPaths` — each new service's `railway.toml` should watch its own app dir + the corresponding `backend/src/modules/<domain>/**` + `packages/proto/**`, matching `notifications-service`'s `railway.toml`.

</code_context>

<specifics>
## Specific Ideas

No specific UI/behavior requirements beyond "zero client-visible behavior change" (already stated in ROADMAP.md success criteria). No UI hint on this phase — pure backend infrastructure work.

</specifics>

<deferred>
## Deferred Ideas

None raised — discussion stayed within phase scope. (Full Delivery extraction — RequestDelivery/AcceptDelivery/CompleteDelivery/Gateway — is already tracked as GRPC-07x in REQUIREMENTS.md, not a new deferred idea from this discussion.)

</deferred>

---

*Phase: 21-Low-Risk gRPC Extraction — News/Waitlist/Reviews + Scoped Delivery OTP*
*Context gathered: 2026-07-20*
