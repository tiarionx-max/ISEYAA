# Requirements: ISEYAA Super Platform

**Defined:** 2026-07-19
**Core Value:** A tourist in Abeokuta can discover an attraction, book a guesthouse, buy an event ticket, and request a ride — all paid through one wallet — and the government analyst sees the revenue in real time.

## v1 Requirements

Requirements for milestone v2.1 (Extraction Backlog Clearance & Settlement Flexibility). Each maps to roadmap phases.

### gRPC Extraction

- [x] **GRPC-06a**: Every newly-extracted gRPC service exposes a `grpc.health.v1.Health` endpoint wired to Railway's `healthcheckPath`, enabling health-check-gated rollout
- [x] **GRPC-06b**: Every existing `@Cron` job (escrow release, heartbeat cleanup, tour reminders, and any new jobs added this milestone) is guarded by a `RedisService.setNx()` distributed lock so it cannot double-fire during a dual-liveness deploy window
- [x] **GRPC-06c**: A shadow-verify dual-run + manual pointer-flip blue-green cutover is proven end-to-end on a real extracted service, with a documented bake-window rollback path
- [x] **GRPC-07**: Delivery's `VerifyDeliveryOtp` RPC is extracted to a live, independently-deployed gRPC service (own Railway process, `ClientGrpc`, zero REST behavior change); `RequestDelivery`, `AcceptDelivery`, `CompleteDelivery`, and `DeliveryGateway` remain in-process this milestone (wallet-adjacent and Socket.IO-coupled)
- [x] **GRPC-08**: The news, waitlist, and reviews modules are each extracted to live, independently-deployed gRPC services (own `.proto` contracts authored, own Railway process, `ClientGrpc`, zero REST behavior change) following the `notifications-service` pattern

### Settlement Flexibility

- [x] **SETTLE-11a**: Per-module settlement split percentages are stored as structured, validated, effective-dated configuration via a new `SettlementSplitTier` model, replacing the 6 duplicated inline `PlatformConfig` reads (Transport, Delivery, Marketplace, Events, Stays, Studio)
- [x] **SETTLE-11b**: `SettlementService.resolveSplit()` is the single resolver used by every settlement call site — no module computes its split percentage inline
- [x] **SETTLE-11c**: Split percentage changes are effective-dated; already-settled transactions retain the percentage that was in effect at settlement time
- [x] **SETTLE-11d**: Runtime shape validation and a `Number.isFinite()` guard are added directly to `SettlementService.settle()` to reject NaN-corrupted config before it reaches a wallet mutation
- [x] **SETTLE-10a**: An admin or `SUPER_ADMIN` can raise a dispute against a completed settlement transaction, capturing reason and disputed amount
- [x] **SETTLE-10b**: Disputes move through a state machine (`OPEN` → `IN_REVIEW` → `RESOLVED`/`DISMISSED`) with a reviewer assigned at review time
- [x] **SETTLE-10c**: Resolving a dispute produces a new append-only adjustment transaction via a new `SettlementService.adjust()` primitive (own idempotency namespace, own `SELECT FOR UPDATE` lock order) — historical `Transaction` rows are never mutated
- [x] **SETTLE-10d**: An adjustment that would take a recipient's wallet balance negative is blocked (not applied) and flagged for manual ops resolution rather than allowed to post
- [x] **SETTLE-10e**: Every dispute action (raise, review, resolve, dismiss) is captured in `AuditLog` with who/when/why/amount

### Ministry Reporting

- [ ] **MIN-08a**: A scheduled (`@Cron`-driven) Ministry export digest — CSV + branded PDF attachment — is generated and delivered by email on a configurable cadence, reusing the existing Phase 14 export code
- [ ] **MIN-08b**: The Ministry export recipient list and delivery cadence are configurable via the database, requiring no redeploy to change
- [ ] **MIN-08c**: Every scheduled delivery attempt (success or failure) is logged; the send is wrapped in the existing `cockatiel` resilience layer so a transient SendGrid outage doesn't silently drop a report
- [ ] **MIN-09**: The Ministry dashboard shows an LGA × month/season point-density visitor heatmap built with the existing `recharts` dependency over existing `MinistryService` query shapes — no new GeoJSON or mapping dependency this milestone

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### gRPC Extraction

- **GRPC-07x**: Full Delivery extraction (`RequestDelivery`/`AcceptDelivery`/`CompleteDelivery` + `DeliveryGateway`) — blocked on a transactional outbox/durable match-timeout redesign, explicitly deferred per the GRPC-05 decision
- **GRPC-06x**: Weighted/percentage canary traffic shifting via a feature-flag layer or service mesh — deferred until fleet size makes manual pointer-flip a bottleneck
- **GRPC-09**: Live extraction of remaining wallet-adjacent modules (Events, Stays, Marketplace, Studio, Transport, Wallet, Auth, Tour*) — needs its own outbox/saga architecture decision first

### Settlement Flexibility

- **SETTLE-11e**: Tiered splits by transaction-amount bracket, vendor category, or promo date-window — needs a rule-precedence engine beyond flat per-module config
- **SETTLE-10f**: Self-service dispute filing by vendors/riders (not just admin-initiated) — needs a new role-permission surface and abuse controls

### Ministry Reporting

- **MIN-09x**: True LGA choropleth map with sourced GeoJSON boundaries — no boundary data exists in the schema today; defer until a stakeholder explicitly asks for map-based visualization over the grid heatmap
- **MIN-10**: In-dashboard portal notification banner alongside the email digest
- **MIN-11**: Drill-down from LGA/month cell to attraction/event-level detail

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Full outbox/saga rewrite for wallet-touching service independence | Explicitly deferred per the GRPC-05 decision log; disproportionate scope for a small government-contracted team at current volume |
| Direct Prisma access to Wallet/Transaction from any newly-extracted service | Reintroduces the double-spend race `SELECT FOR UPDATE` was built to prevent — extracted services call `SettlementService` synchronously instead |
| Service mesh (Istio/Linkerd/Flagger) for canary routing | Massive operational overhead against the project's free-first/$11-mo-infra philosophy; Railway has no native support anyway |
| Mutating historical Transaction rows to "fix" a dispute | Breaks the append-only ledger invariant and destroys the audit trail |
| Full case-management dispute system (SLA timers, multi-level escalation, external arbitration) | Wildly disproportionate for current dispute volume |
| Per-individual-vendor negotiated split percentages | Turns a small config table into a contract-management system |
| SMS/push notification for scheduled Ministry reports | Ministry stakeholders are non-technical, low-urgency recipients; email digest is sufficient |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| GRPC-06a | Phase 20 | Complete |
| GRPC-06b | Phase 20 | Complete |
| GRPC-06c | Phase 20 | Complete |
| GRPC-07 | Phase 21 | Complete |
| GRPC-08 | Phase 21 | Complete |
| SETTLE-11a | Phase 18 | Complete |
| SETTLE-11b | Phase 18 | Complete |
| SETTLE-11c | Phase 18 | Complete |
| SETTLE-11d | Phase 18 | Complete |
| SETTLE-10a | Phase 19 | Complete |
| SETTLE-10b | Phase 19 | Complete |
| SETTLE-10c | Phase 19 | Complete |
| SETTLE-10d | Phase 19 | Complete |
| SETTLE-10e | Phase 19 | Complete |
| MIN-08a | Phase 22 | Pending |
| MIN-08b | Phase 22 | Pending |
| MIN-08c | Phase 22 | Pending |
| MIN-09 | Phase 22 | Pending |

**Coverage:**
- v1 requirements: 18 total
- Mapped to phases: 18
- Unmapped: 0 ✓

---
*Requirements defined: 2026-07-19*
*Last updated: 2026-07-19 after v2.1 ROADMAP.md creation (Phases 18-22)*
