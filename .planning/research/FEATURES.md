# Feature Research

**Domain:** Government logistics/commerce super-app — v2.1 milestone (live gRPC extraction rollout, blue-green/canary deploys, scheduled Ministry exports, LGA/seasonal heatmap, settlement disputes, configurable split tiers)
**Researched:** 2026-07-19
**Confidence:** MEDIUM-HIGH (verified against existing ISEYAA code where it exists — `SettlementService`, `MinistryService`, `PlatformConfig`, `AuditLog`, `notifications-service` extraction — plus current ecosystem search for Railway deploy patterns, NestJS scheduling, dispute/ledger patterns, and dashboard visualization libraries)

> Supersedes the previous `FEATURES.md` written 2026-07-15 for the v2.0 milestone (gRPC proof-of-pattern, multi-channel OTP, Ministry dashboard v1, settlement engine foundation). That milestone shipped (see PROJECT.md). This file covers the v2.1 backlog-clearance milestone only: GRPC-06/07/08, MIN-08/09, SETTLE-10/11.

## Feature Landscape

### Table Stakes (Users/Operators Expect These)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Zero-REST-behavior-change extraction for each newly-gRPC'd module | Proven pattern from `notifications-service` (Phase 17); breaking client contracts on internal refactor is unacceptable on a live government app | MEDIUM | Author missing `.proto` contracts first — PROJECT.md confirms transport/delivery/tour-packages/tour-guides/news/waitlist/reviews have **no** proto stubs yet (only auth/wallet/events/marketplace/notifications/stays/admin/ai exist as scaffolds under `backend/apps/*-service`, and were unwired until Phase 10/17). GRPC-07/08 must do proto-authoring + wiring, not just wiring. |
| Single-owner-of-the-transaction rule for wallet-adjacent extractions | Delivery's `completeDelivery()` settlement must keep the existing invariant: one process runs `prisma.$transaction` with `SELECT FOR UPDATE` on every wallet row (locked architectural commitment in `settlement.service.ts`) | HIGH | If Delivery-service is extracted, it must call `SettlementService.settle()` via a **synchronous gRPC round-trip** to whichever process still owns `SettlementService`/Prisma — it must NOT get its own direct Prisma write path to `Wallet`/`Transaction` tables. This preserves atomicity without needing saga/outbox (explicitly out-of-scope per the GRPC-05 decision log in PROJECT.md). |
| Real-time GPS/tracking gateway stays reachable at <1s latency through extraction | Constraint in CLAUDE.md: "WebSocket GPS < 1s latency" — this cannot regress during GRPC-07 | HIGH | Recommended minimal pattern: keep the public-facing WebSocket gateway where it is today (monolith or a thin edge process), have it call the extracted Delivery-service for business logic (matching, status transitions) via gRPC, and continue broadcasting location pushes through the existing Upstash Redis pub/sub. Standard industry pattern for extracting a WS-backed service is sticky-session routing at the edge + Redis pub/sub for cross-process fan-out — do not attempt to serve raw WebSocket traffic from a gRPC-only backend. |
| Health-check-gated rollout for each deploy | Table stakes for any production service, gov or not | LOW | Railway's default rolling deploy already does health-check gating — reuse it; don't build custom infra. |
| Reuse the shadow-verify / dual-run comparison pattern for cutover safety | Already proven exactly once in this codebase (Phase 13 SETTLE-09, `ShadowSettlementComparison` model) for the settlement engine cutover | MEDIUM | Apply the same pattern to gRPC extraction and to blue-green cutovers: run old and new code paths side-by-side, log discrepancies, only flip the `*_enabled` config flag after a bake period with zero mismatches. This is cheaper than adopting a canary mesh and matches the team's already-proven playbook. |
| Manual/scripted traffic cutover (not weighted canary) for GRPC-06 | Railway has no native percentage-based canary; only rolling deploys with health-check gating (confirmed current as of 2026) | LOW-MEDIUM | Minimal viable pattern for a small fleet: deploy the new revision as a parallel Railway service/environment, smoke-test its gRPC port internally, flip an internal DNS/private-networking pointer or env var from old→new, keep the old instance running for a fixed bake window as instant rollback, then decommission. This is "blue-green via two services + a pointer flip," not a service mesh. |
| Scheduled email digest with CSV/PDF attachment to Ministry stakeholders | Standard non-technical-stakeholder reporting pattern (weekly/monthly digest) — matches the existing on-demand CSV/PDF export already shipped in Phase 14 | LOW | `@nestjs/schedule` (already a dependency) + existing `SendgridService` + existing export generation code. Wrap the send in the existing `cockatiel` resilience layer (Phase 11, RESIL-01) so a transient SendGrid outage doesn't silently drop a report. |
| Configurable schedule + recipient list, no redeploy to change cadence | Government ops staff will want to change "who gets the monthly report" without filing a dev ticket | LOW | Store as rows in a small new table (or a `PlatformConfig` JSON entry) — same DB-driven-config precedent as platform fees (CLAUDE.md: "Platform fee source: Always from DB, never hardcoded"). |
| LGA x Month/Season visitor grid (heatmap) on Ministry dashboard | Government tourism dashboards (Hawaii DBEDT, UN Tourism) consistently visualize seasonality and regional distribution as a grid/time-series, alongside or instead of full GIS maps | LOW | `MinistryService` already returns `ModuleLgaRevenueRow` and `VisitorEntryRow` grouped by `lgaId`/`lgaName` + `month` (confirmed by direct code read) — **zero new backend aggregation needed**, this is a new frontend chart component over existing query shapes. |
| Reuse `recharts` (already a dependency) for the heatmap, don't add a new charting library | `recharts` is already in `web/` deps per CLAUDE.md stack; adding Nivo (~500kB) or ECharts for one chart is disproportionate | LOW | A matrix/grid heatmap (colored cells, LGA rows x month columns) is achievable with `recharts` primitives (custom cell rendering) or a small purpose-built grid component — avoid a second charting dependency for one screen. |
| Admin-initiated settlement dispute/adjustment with append-only correction entries | Standard fintech pattern: never mutate historical ledger rows; disputes resolve into new offsetting `Transaction` rows | MEDIUM | Reuses `SettlementService`'s existing idempotency-key + `SELECT FOR UPDATE` primitives for the reversal/adjustment leg — do not build a parallel wallet-mutation path. |
| Full audit trail on every dispute action (who/when/why/amount) | NDPA + government-contract accountability expectations; `AuditLog` model already exists in schema (confirmed: `backend/prisma/schema.prisma`) | LOW | Extend the existing `AuditLog` usage pattern (already used elsewhere in admin flows) rather than inventing a new audit mechanism. |
| Per-module default split percentage editable via admin UI, no redeploy | Direct extension of the existing "platform fee always from DB" principle; `PlatformConfig` is already a generic key→JSON store and `resolveMinistryWallet()` already reads it fresh on every `settle()` call (confirmed by direct code read of `settlement.service.ts`) | LOW-MEDIUM | The primitive already exists; SETTLE-11's real work is making splits *structured and validatable* (percentages sum ≤100%, no overlapping effective-date ranges) rather than opaque JSON blobs, and building the admin UI to edit them. |
| Effective-dated split changes (never retroactive) | Settlement percentages are captured at `settle()`-time into an append-only ledger; changing a rule must not alter already-settled transactions | MEDIUM | Resolve "percentage in effect at settlement time" and record it on the settlement's `Transaction.metadata` (the model already supports rich per-leg metadata) — this is a correctness requirement, not optional. |

### Differentiators (Competitive Advantage / Stakeholder Delight)

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| True LGA choropleth map (GeoJSON polygon boundaries, not a grid) | More visually compelling for a government stakeholder demo than a grid heatmap | MEDIUM-HIGH | Ogun State's 20 LGA boundary polygons are **not currently in the app** (only lat/lng centroids for attractions exist, per PROJECT.md's "20 Ogun State LGAs + 61 attractions seeded"). Would require sourcing free Nigeria admin-boundary GeoJSON (e.g., HDX/OCHA Nigeria admin2 data) and a mapping library (`react-simple-maps` or similar) — new data dependency + new frontend library. Treat as a stretch goal, not MVP, given the grid heatmap already satisfies the same information need from existing data. |
| Seasonal derived grouping (dry/rainy season or quarter) on top of monthly data | Ogun tourism has real dry-season (Nov–Mar) vs rainy-season (Apr–Oct) visitor patterns worth surfacing explicitly | LOW | Pure derived aggregation from the existing `month` dimension already returned by `MinistryService` — no new raw data collection needed. |
| Drill-down from LGA/month cell to attraction/event-level detail | Lets a Ministry analyst go from "why is Abeokuta North's June low" to specific causes | MEDIUM | New query surface (attraction/event breakdown filtered by LGA+month) — valuable but adds scope; sequence after the base grid ships. |
| Portal (in-dashboard) notification banner in addition to email digest | Belt-and-suspenders delivery ensures the Ministry viewer sees the report even if email is filtered/ignored | LOW | Cheap to add once the scheduled generation job exists — reuse the existing notification infra rather than build new. |
| Self-service dispute filing by vendors/riders (not just admin-initiated) | Reduces support-ticket load on LJ Entertainment ops for high-volume disputes | MEDIUM-HIGH | Adds a citizen/vendor-facing UI, a new role-permission surface, and abuse/spam controls (rate limiting, evidence requirements) — meaningfully bigger than the admin-only MVP. Defer to a later milestone once dispute *volume* justifies it. |
| Tiered splits within a module (by transaction-amount bracket, vendor category, or promo date-window) | Lets Ogun State run, e.g., a lower Ministry cut during a tourism-promotion month, or a different Marketplace split for food vs. electronics vendors | MEDIUM | Requires a rule-precedence engine (most-specific-rule-wins, fallback to module default) rather than a flat per-module percentage — real added complexity beyond table-stakes per-module config. |
| Weighted/percentage canary traffic shifting for gRPC services | Textbook canary release, gradual blast-radius control | HIGH | Not natively supported by Railway; would require a feature-flag layer or a heavier platform (Istio/Flagger-class tooling) — disproportionate for "a small number of backend microservices," per the milestone's own framing. Recommend explicitly deferring in favor of the shadow-verify + pointer-flip pattern above. |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|------------------|-------------|
| Full outbox/saga rewrite to enable "true" independent deployability of every wallet-touching service | Seems like the "correct" microservices answer for Delivery's wallet-adjacent payouts | Explicitly called out-of-scope by the team's own decision log (GRPC-05, PROJECT.md); huge scope for a small government-contracted team, and the synchronous-single-transaction-owner pattern already satisfies the atomicity requirement without it | Keep one process (wherever `SettlementService` lives) as the sole owner of wallet `$transaction`s; extracted services call it synchronously via gRPC. Revisit saga/outbox only if scale later demands async multi-writer settlement. |
| Direct Prisma access to `Wallet`/`Transaction` tables from a newly-extracted service | Feels faster than an extra gRPC hop | Creates two independent writers to the same rows without a shared lock scope — reintroduces the double-spend/race-condition risk `SELECT FOR UPDATE` was built to prevent | Route all wallet mutations through the single `SettlementService` owner, regardless of which process initiates the request |
| Weighted/percentage canary deploys via a service mesh (Istio/Linkerd/Flagger) | "Canary deploys" often gets read as "need a mesh" | Massive operational overhead for "a small number of backend microservices," not the free-first/$11-mo-infra philosophy this project is built on | Shadow-verify dual-run + manual pointer-flip blue-green (already proven in this codebase for the settlement cutover, SETTLE-09) |
| Real geographic choropleth map as the MVP heatmap | Looks more "GIS-dashboard" impressive | No LGA polygon boundary data exists in the app today; adds a new external data dependency and mapping library for a chart type that a grid heatmap already covers from existing data | Ship the LGA x month/season grid heatmap first using `recharts` and existing `MinistryService` data; treat the true choropleth as an optional stretch/differentiator |
| Mutating historical `Transaction` rows to "fix" a dispute | Feels like the simplest fix ("just correct the number") | Breaks the append-only ledger invariant, destroys audit trail, and makes reconciliation/compliance reporting unreliable | Always create a new offsetting adjustment transaction via `SettlementService`, referencing the original via metadata |
| Full formal case-management dispute system (SLA timers, multi-level escalation, external arbitration integration) | Looks like "enterprise-grade" dispute handling | Wildly disproportionate for a small government wallet operator; nobody on this team needs SLA-clock automation yet | Simple state machine (OPEN → UNDER_REVIEW → RESOLVED/REJECTED) + admin form + audit log; escalate later only if volume demands it |
| Per-individual-vendor negotiated split percentages | "Vendor X wants a better rate" requests will happen | Turns a small config table into a contract-management system with hundreds/thousands of one-off rows to maintain | Keep splits scoped to module (and optionally category/tier), matching the government's need for a standardized, publicly-defensible public fee schedule — not individual deals |
| Push/SMS notification for every scheduled Ministry report | "More channels = more visibility" | Ministry stakeholders are non-technical, low-volume, low-urgency recipients; SMS/push adds cost (Termii/FCM calls) and noise for a report that isn't time-critical | Email digest (primary) + optional in-dashboard portal banner (secondary); no SMS/push for scheduled reports |

## Feature Dependencies

```
GRPC-07 (Delivery + remaining core modules → gRPC)
    └──requires──> proto contracts authored for transport/delivery/tour-* (do not exist yet)
    └──requires──> "single transaction owner" rule for wallet-adjacent settlement calls
    └──requires──> WebSocket gateway stays addressable at <1s latency (kept in place or fronted)

GRPC-08 (news/waitlist/reviews → gRPC)
    └──requires──> proto contracts authored for news/waitlist/reviews (do not exist yet)
    └──lower risk than GRPC-07──> no wallet-adjacency, no WebSocket — good candidate to extract FIRST

GRPC-06 (blue-green/canary deploys)
    └──requires──> at least one more extracted gRPC service beyond notifications-service to be meaningful
    └──reuses──> shadow-verify dual-run pattern proven in SETTLE-09 (Phase 13)

MIN-08 (scheduled Ministry export)
    └──requires──> existing Phase 14 Ministry dashboard + CSV/PDF export code (already shipped)
    └──requires──> existing SendgridService + cockatiel resilience wrapper (already shipped, Phase 11)

MIN-09 (LGA/seasonal heatmap)
    └──requires──> existing MinistryService LGA+month grouped queries (already shipped, Phase 14)
    └──enhances──> MIN-08 (a scheduled report can embed the same heatmap as a static image)

SETTLE-10 (dispute/adjustment workflow)
    └──requires──> SettlementService (Phase 12) for the offsetting-adjustment leg
    └──requires──> AuditLog model (already in schema) for the audit trail
    └──benefits-from──> SETTLE-11 (knowing which split rule applied helps compute a correct partial reversal, but is not a hard blocker — original Transaction rows already record settled amounts)

SETTLE-11 (configurable per-module split tiers)
    └──requires──> PlatformConfig (already exists) and SettlementService's dynamic-config-read pattern (already exists, `resolveMinistryWallet()`)
    └──must-precede-in-spirit──> tiered/promo-window splits (differentiator) — ship flat per-module config first

[GRPC-07 Delivery extraction] ──conflicts-if-done-naively-with──> [Wallet atomicity guarantee]
```

### Dependency Notes

- **GRPC-07/08 require proto authoring, not just wiring:** PROJECT.md's architecture note is explicit — transport/delivery/tour-packages/tour-guides/news/waitlist/reviews have **no** `.proto` stubs at all (unlike the 8 modules Phase 10 already authored contracts for: auth, wallet, events, marketplace, notifications, stays, admin, ai — confirmed present as scaffolds under `backend/apps/*-service`). Budget for contract design + `generate.sh` codegen before any `@GrpcMethod`/`ClientGrpc` wiring.
- **GRPC-08 (news/waitlist/reviews) is the lower-risk extraction and should sequence before or alongside GRPC-07 (Delivery):** none of the three touch the wallet or a live WebSocket gateway, making them a closer analogue to the already-proven `notifications-service` extraction than Delivery is.
- **GRPC-06 needs a second real extracted service to matter:** blue-green/canary tooling built against only `notifications-service` (fire-and-forget, no client-visible latency SLA) won't validate the pattern for something with a real cutover risk like Delivery. Sequence GRPC-06's *pattern-proving* work after at least one of GRPC-07/08 lands.
- **SETTLE-11 should ship before or alongside SETTLE-10's more advanced cases:** a dispute resolver needs to reconstruct "what split applied at settlement time" to compute a correct reversal; since `Transaction` rows already capture settled amounts per recipient, this is a nice-to-have not a hard blocker, but sequencing SETTLE-11 first reduces ambiguity in SETTLE-10's design.
- **MIN-09 conflicts-in-priority, not technically, with a true choropleth:** the grid heatmap and the choropleth map answer the same question with different visual fidelity; don't build both in one milestone — pick the grid (data already shaped for it) and treat the map as future work.

## MVP Definition

### Launch With (v1 of this milestone)

- [ ] GRPC-08: news/waitlist/reviews extracted to real gRPC services — lowest-risk proof that the pattern generalizes beyond notifications
- [ ] GRPC-07 (scoped): Delivery's non-wallet-touching logic (matching, status/tracking ingestion) extracted; settlement/payout calls remain synchronous gRPC calls into the single process that owns `SettlementService`'s `$transaction` — WebSocket gateway stays reachable at <1s latency via existing Redis pub/sub bridging
- [ ] GRPC-06 (scoped): shadow-verify dual-run + manual pointer-flip blue-green for the newly extracted services — no weighted canary
- [ ] MIN-08: weekly/monthly email digest (CSV/PDF attachment) to a configurable Ministry recipient list, wrapped in existing resilience layer
- [ ] MIN-09: LGA x month/season grid heatmap using `recharts` over existing `MinistryService` query shapes — no new GeoJSON/mapping dependency
- [ ] SETTLE-10 (scoped): admin/SUPER_ADMIN-initiated dispute → review → resolve/reject workflow producing append-only offsetting adjustment transactions via `SettlementService`, with full `AuditLog` trail
- [ ] SETTLE-11 (scoped): structured, validated, effective-dated per-module split configuration in the admin UI (flat percentage per module, not yet tiered by category/amount/date-window)

### Add After Validation (v1.x)

- [ ] SETTLE-11 tiers: category/vendor-tier/promo-window split rules with precedence resolution — once the flat per-module config is proven stable
- [ ] SETTLE-10 drill-down: itemized "which recipients were affected by this dispute" report — once basic dispute volume shows this is needed
- [ ] MIN-09 drill-down: LGA/month cell → attraction/event-level breakdown
- [ ] MIN-08 in-dashboard portal notification banner alongside the email digest
- [ ] GRPC-06 pattern applied to the remaining "core modules" extraction batch (Transport, Wallet, Auth, etc.), once proven on Delivery/news/waitlist/reviews

### Future Consideration (v2+)

- [ ] Self-service dispute filing by vendors/riders — defer until dispute volume justifies the added UI/abuse-control surface
- [ ] True LGA choropleth map with GeoJSON boundaries — defer until/unless a stakeholder explicitly asks for map-based visualization over the grid heatmap
- [ ] Weighted/percentage canary traffic shifting via feature-flag layer or mesh tooling — defer until the fleet is large enough that manual pointer-flip blue-green becomes a bottleneck
- [ ] Outbox/saga-based async settlement for fully-independent wallet-adjacent service deployability — defer until scale requires multiple independent writers to wallet state (explicitly out of scope per GRPC-05)

## Feature Prioritization Matrix

| Feature | User/Operator Value | Implementation Cost | Priority |
|---------|----------------------|----------------------|----------|
| GRPC-08 news/waitlist/reviews extraction | MEDIUM | LOW-MEDIUM | P1 |
| GRPC-07 Delivery extraction (scoped, non-wallet logic only) | HIGH | HIGH | P1 |
| GRPC-06 shadow-verify + pointer-flip blue-green | HIGH (risk mitigation) | MEDIUM | P1 |
| MIN-08 scheduled email digest | HIGH (stakeholder-facing) | LOW | P1 |
| MIN-09 LGA/month grid heatmap | MEDIUM-HIGH | LOW | P1 |
| SETTLE-10 admin dispute/adjustment workflow (scoped) | HIGH (compliance/trust) | MEDIUM | P1 |
| SETTLE-11 flat per-module configurable splits | HIGH (ops flexibility) | LOW-MEDIUM | P1 |
| SETTLE-11 tiered splits (category/amount/promo) | MEDIUM | MEDIUM | P2 |
| SETTLE-10 self-service filing | MEDIUM | HIGH | P3 |
| MIN-09 true choropleth map | LOW-MEDIUM | MEDIUM-HIGH | P3 |
| GRPC-06 weighted canary via mesh/feature-flag | LOW (for this fleet size) | HIGH | P3 |

**Priority key:**
- P1: Must have for this milestone
- P2: Should have, add when possible within or just after this milestone
- P3: Nice to have, explicitly deferred to a future milestone

## Reference Pattern Analysis

| Feature | Reference Pattern A | Reference Pattern B | Our Approach |
|---------|---------------------|----------------------|--------------|
| Blue-green/canary on a small fleet, no service mesh | Weighted-canary via a service mesh (Istio/Flagger) | Railway's native rolling deploy with health-check gating only (no percentage canary as of 2026) | Parallel-service deploy + internal pointer flip + bake window, reusing our own shadow-verify pattern from SETTLE-09 instead of adopting mesh tooling |
| Wallet-adjacent service extraction | Saga/outbox pattern for cross-service financial consistency (classic microservices literature) | Single synchronous transaction owner, extracted services call it over gRPC | Deliberately choose the synchronous single-owner pattern (per GRPC-05 decision) — cheaper and already proven safe at this scale; saga/outbox deferred |
| Scheduled stakeholder reporting | jsreport/Nodemailer-style "cron + templated PDF + email" pattern (dominant approach for periodic business reports) | Push/SMS notification per report | `@nestjs/schedule` + existing SendGrid + existing PDF export, wrapped in existing cockatiel resilience — no new infra, no SMS/push |
| Government tourism seasonality dashboards | Full GIS choropleth map (large public-sector/national tourism boards) | Monthly grid/time-series visualization (Hawaii DBEDT, UN Tourism dashboards) | LGA x month grid heatmap with `recharts`, deferring true GeoJSON choropleth as a stretch goal |
| Multi-vendor commission configuration | Per-individual-vendor negotiated rates (large e-commerce platforms) | Rule-based commission engine keyed by category/vendor-tier with precedence ordering (WooCommerce MarketKing, Webkul) | Start with flat per-module `PlatformConfig`-driven percentage (already the shape of the existing primitive); add category/tier precedence rules only as a v1.x follow-up |
| Payment dispute lifecycle | Full case-management system with SLA timers and external arbitration | Standard fintech pattern: raise → review/evidence → resolve (adjustment or reject) → audit trail, ledger always append-only | Admin-initiated OPEN → UNDER_REVIEW → RESOLVED/REJECTED state machine, resolution = new offsetting `SettlementService` transaction, full `AuditLog` entry |

## Sources

- [Railway Deployments docs](https://docs.railway.com/deployments) — MEDIUM confidence (official docs, confirms rolling deploy + health checks, no native weighted canary)
- [Railway Help Station: How to blue/green deploy?](https://station.railway.com/questions/how-to-blue-green-deploy-d83c8864) — LOW-MEDIUM confidence (community discussion, corroborated by official docs' rolling-deploy framing)
- [Best Continuous Deployment Tools in 2026 — Railway Blog](https://blog.railway.com/p/best-continuous-deployment-tools-2026) — MEDIUM confidence
- [Blue/Green vs Canary vs Rolling — TechTarget](https://www.techtarget.com/searchitoperations/answer/When-to-use-canary-vs-blue-green-vs-rolling-deployment) — general industry pattern reference, MEDIUM confidence
- [Saga pattern with NestJS — Java Stack Flow](https://www.javastackflow.com/2026/05/practical-usage-of-saga-with-nestjs.html) — MEDIUM confidence
- [Microservices Data Patterns: Saga, Outbox, CQRS — abstractalgorithms.dev](https://www.abstractalgorithms.dev/microservices-data-patterns-saga-outbox-cqrs-and-event-sourcing) — MEDIUM confidence
- [WebSockets in Microservices Architecture — GeeksforGeeks](https://www.geeksforgeeks.org/system-design/websockets-in-microservices-architecture/) — MEDIUM confidence, corroborates sticky-session/Redis-pub-sub as the standard cross-process WS pattern
- [How to Scale WebSocket Connections — OneUptime](https://oneuptime.com/blog/post/2026-01-26-websocket-scaling/view) — MEDIUM confidence
- Wallet ledger / dispute / audit trail patterns: [Bamboodt](https://www.bamboodt.com/designing-a-scalable-wallet-ledger-system-for-secure-fintech/), [Formance Programmable Wallets](https://www.formance.com/blog/product/programmable-wallets-architecture-holds-and-the-ledger-layer), [Rexi Payment Reconciliation Audit Trail Guide](https://rexi.finance/blog/payment-reconciliation-software/payment-reconciliation-audit-trails.html) — MEDIUM confidence, consistent append-only-ledger + case-workflow pattern across sources
- [Hawaii Tourism Dashboard](https://dbedt.hawaii.gov/visitor/tourism-dashboard/), [UN Tourism Data Dashboard](https://www.untourism.int/tourism-data/un-tourism-tourism-dashboard) — MEDIUM confidence, examples of government seasonality/region visualization
- [Recharts v3 vs Tremor vs Nivo 2026 — PkgPulse](https://www.pkgpulse.com/guides/recharts-v3-vs-tremor-vs-nivo-react-charting-2026), [Nivo vs Recharts — Speakeasy](https://www.speakeasy.com/blog/nivo-vs-recharts/) — MEDIUM confidence, bundle-size and small-dataset guidance
- [MarketKing commission rules (WooCommerce)](https://woocommerce-multivendor.com/docs/admin-and-vendor-commissions-multivendor-marketplace-commissions/), [Webkul multi-vendor commission](https://store.webkul.com/woocommerce-multi-vendor-commission.html) — MEDIUM confidence, rule-based per-category/vendor commission engine pattern
- [NestJS scheduled email pattern — wanago.io](https://wanago.io/2021/01/18/api-nestjs-cron-nodemailer/) — MEDIUM confidence (older post but pattern unchanged; `@nestjs/schedule` API stable)
- Internal codebase verification (HIGH confidence, direct read): `backend/src/common/services/settlement.service.ts`, `backend/src/modules/ministry/ministry.service.ts`, `backend/prisma/schema.prisma` (`PlatformConfig`, `AuditLog`, `ShadowSettlementComparison` models), `backend/apps/*-service` (confirms 8 existing gRPC scaffolds: admin, ai, auth, events, marketplace, notifications, stays, wallet — none for delivery/transport/tour-*/news/waitlist/reviews), `.planning/PROJECT.md`

---
*Feature research for: ISEYAA v2.1 milestone — GRPC-06/07/08, MIN-08/09, SETTLE-10/11*
*Researched: 2026-07-19*
