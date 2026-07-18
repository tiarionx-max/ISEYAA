# Phase 14: Ministry Dashboard - Context

**Gathered:** 2026-07-18
**Status:** Ready for planning

<domain>
## Phase Boundary

A `MINISTRY_VIEWER` read-only role plus a dashboard surfacing aggregate visitor entries, purpose-of-visit breakdown, and revenue-to-government-share, each exportable as CSV/PDF, with zero row-level citizen PII reachable at the query layer.

**In scope:**
- `MINISTRY_VIEWER` role, gated by its own `@Roles()` decorator on every route it touches — never sharing a controller with a mutation endpoint
- A new `VisitorLog` model + `VisitorLogService`, written inline at three existing confirmation points (Event ticket check-in, Stays booking check-in, Tour Package booking) — the only new data-capture work this phase requires
- Purpose-of-visit taxonomy (optional field, defaulted per booking type) feeding into `VisitorLog.purpose`
- Ministry dashboard endpoints: visitor entries (by LGA + month, secondary split by visitor role), purpose-of-visit breakdown, revenue-to-government-share (by settled module + month, reading the existing Ministry wallet `Transaction` ledger from Phase 12/13)
- CSV export and branded PDF export (Forest Green/Gold, reusing `itinerary-pdf.service.ts`'s shell) for all three reports independently, respecting whatever LGA/date-range filter is active
- Automated field-allowlist/schema-shape test proving `MINISTRY_VIEWER` responses never carry BVN/NIN/phone/name

**Out of scope (belongs to other phases or explicitly deferred per REQUIREMENTS.md):**
- Scheduled/recurring export delivery (MIN-08, deferred to v2)
- Seasonal/LGA heatmap visualization (MIN-09, deferred to v2)
- Live BI/Power BI connector — CSV/PDF satisfies the stated need
- Real-time/WebSocket push dashboard — Ministry checks monthly/quarterly, not sub-second
- Any change to how Transport/Delivery's settlement engine cutover flags get flipped live (Phase 13's D-08 bake-period gate is unrelated, manual, and out of this phase's control)
- Building a physical/attraction check-in mechanism — attractions remain browse-only; no new capture point is added there

</domain>

<decisions>
## Implementation Decisions

### Visitor entry capture (MIN-02)
- **D-01:** Three existing booking/check-in flows count as a "visitor entry": Events (QR check-in scan, `Ticket.usedAt`), Stays (booking check-in date), Tour Packages (scheduled tour date). Marketplace, Transport, and Delivery are excluded — they're commercial transactions, not tourism visits.
- **D-02:** For Stays and Tour Packages (no physical scan moment), the entry counts once the booking's scheduled date is reached AND the booking's status is not cancelled/refunded — i.e. `status != CANCELLED AND (checkIn date OR tour date) <= now`. No new status machinery needed; uses existing status fields.
- **D-03:** All time-period breakdowns (visitor entries, revenue) use monthly buckets, matching `AdminService.getRevenue()`'s existing `TO_CHAR(createdAt, 'YYYY-MM')` pattern, with an optional `from`/`to` date-range filter for quarterly-or-wider reporting. No day/week granularity selector.
- **D-04:** Visitor entry counts get a secondary breakdown by `User.role` (TOURIST vs CITIZEN vs other) alongside the required LGA + time dimensions — zero new capture point since `role` already exists on every user.

### Purpose-of-visit taxonomy (MIN-03)
- **D-05:** Explicit taxonomy (not inferred from booking type, per the roadmap's literal "new data-capture point" wording): **Tourism/Leisure, Business, Religious/Pilgrimage, Family/Personal, Event Attendance, Education, Other.** Values are plain strings/enum, not hardcoded into report/query logic, so the Ministry can request renamed categories later without a redeploy.
- **D-06:** The field is optional at checkout on all three booking flows, pre-filled with a sensible per-booking-type default (Event ticket → "Event Attendance", Tour → "Tourism/Leisure", Stays → "Tourism/Leisure" unless overridden) — adds zero friction to revenue-generating checkouts while still yielding a real (if occasionally default) signal.
- **D-07:** Data model is a **new `VisitorLog` table** — one row per counted entry, columns limited to `lgaId`, `purpose`, `sourceType`, `sourceId`, `visitedAt`, `userRole` (no BVN/NIN/phone/name columns at all). This directly satisfies MIN-07's PII-isolation requirement structurally — there is nothing sensitive on the table to leak, rather than relying on query-time filtering across Ticket/Booking/TourBooking (which do carry PII-adjacent fields).
- **D-08:** `VisitorLog` rows are written via **inline direct calls to a new global `VisitorLogService`** (CommonModule-style, directly injected) from the three confirmation points (Events check-in, Stays check-in, Tour booking confirmation) — not a new `@OnEvent` domain event. `EventEmitter2` is reserved for the webhook-decoupling problem it already solves (third-party payment webhooks → feature services); these are first-party in-process confirmations, matching how most `CommonModule` services (`QrService`, `ImageService`) are already called directly.

### Revenue-to-government-share (MIN-04)
- **D-09:** Guaranteed breakdown dimensions are **by settled module + by month** (`Transaction.metadata.sourceType` grouped, read from the Ministry wallet's ledger built in Phase 12/13). An LGA breakdown is added only where the underlying source record naturally carries one already (Stays via `Property.lgaId`, Marketplace via `Vendor.lgaId`, Tour via package LGA) — not forced onto Transport/Delivery, which are point-to-point trips with no stable LGA concept.
- **D-10:** MIN-04 includes **all historical Ministry wallet transactions**, back to whenever each module's settlement wiring first went live in Phase 12/13 — not scoped to only-after-Phase-14-ships. Note: Transport and Delivery will show near-zero revenue-to-government-share until their `*.settlement_engine_enabled` `PlatformConfig` flags flip true after Phase 13's D-08 manual bake-period gate — this is a pre-existing condition of the system, not a defect for this phase to fix.
- **D-11:** Visitor-entry counts (`VisitorLog`) and revenue (`Transaction` ledger) are presented as **separate, independent dashboard panels** — no derived "revenue-per-visitor" metric. `VisitorLog` only covers Events/Stays/Tour while Ministry wallet revenue spans all 7 settled modules (including Marketplace/Transport/Delivery, which have no `VisitorLog` entries), so a ratio between the two would be a misleading, apples-to-oranges number for a government stakeholder.

### Export scope & report structure (MIN-05, MIN-06)
- **D-12:** All three reports (visitor entries, purpose-of-visit, revenue-to-government-share) are independently exportable as both CSV and PDF — matches MIN-05/06's literal "every Ministry dashboard report can be exported" wording, not a single combined document.
- **D-13:** PDF exports reuse `itinerary-pdf.service.ts`'s existing branded shell (pdfkit, Forest Green/Gold header/footer/fonts) for visual consistency with the rest of the platform's PDF output. The report body (tabular data, not narrative itinerary text) needs new rendering logic — the shell is reused, the content layout is not.
- **D-14:** CSV/PDF exports respect whatever LGA/date-range filter is active on the dashboard at export time ("what you see is what you export") — reuses the same `from`/`to`/LGA query params already decided for the on-screen views (D-03), so this adds negligible new surface area.

### Claude's Discretion
Every decision above marked "You decide" in the discussion log was exercised as documented (D-01 through D-14) — the user deferred all four discussed areas to Claude's judgment after the options were laid out. Category names in D-05's taxonomy, the exact default-purpose mapping in D-06, and the precise CSV column ordering are all open to refinement during planning/implementation as long as they stay consistent with these decisions.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & roadmap
- `.planning/REQUIREMENTS.md` §"Ministry Dashboard" — MIN-01 through MIN-07 full requirement text; §"Deferred Ministry Features" — MIN-08, MIN-09 explicitly out of scope this phase.
- `.planning/ROADMAP.md` §"Phase 14: Ministry Dashboard" — goal, 6 success criteria, dependency on Phase 12 (Ministry wallet).
- `.planning/STATE.md` — flagged this exact blocker pre-discussion: "Phase 14 (Ministry Dashboard): `VisitorLog.purpose` taxonomy... is undefined — needs a stakeholder conversation during Phase 14 planning." Resolved by D-05 through D-08 above.

### Settlement engine (revenue data source — Phase 12/13 foundation)
- `.planning/phases/12-settlement-engine-foundation/12-CONTEXT.md` — `SettlementService` architecture, standing Ministry wallet provisioning (`tour.government_wallet_user_id`), `Transaction.metadata` shape (recipientType, recipientId, sourceType, sourceId, percentage) that MIN-04's queries read.
- `.planning/phases/13-settlement-cutover-transport-delivery/13-CONTEXT.md` — Transport/Delivery's three-way split cutover, the `*.settlement_engine_enabled` flags (both still seeded `false`), and why Transport/Delivery revenue will be near-zero until the manual D-08 bake-period gate flips (informs D-10 above).
- `backend/src/common/services/settlement.service.ts` — `resolveMinistryWallet()` (reads `tour.government_wallet_user_id`), the `Transaction` audit-trail shape MIN-04 queries against.
- `backend/prisma/schema.prisma` — `Transaction` model (`walletId`, `type`, `amount`, `metadata: Json`), `PlatformConfig` model (simple KV).

### Existing patterns to reuse
- `backend/src/modules/admin/admin.service.ts` — `getRevenue()`'s monthly-bucket `$queryRaw` pattern (`TO_CHAR(createdAt, 'YYYY-MM')`) and LGA-join pattern to mirror for MIN-02/04's queries; `getDashboard()`'s KPI-aggregation shape.
- `backend/src/common/services/itinerary-pdf.service.ts` — pdfkit-based branded PDF shell (Forest Green/Gold, header/footer) to reuse for MIN-06's exports (D-13).
- `backend/src/common/guards/roles.guard.ts` + `@Roles()` decorator — the existing RBAC pattern `MINISTRY_VIEWER` slots into (MIN-01).
- `backend/prisma/schema.prisma` — `UserRole` enum (currently CITIZEN, TOURIST, VENDOR, ORGANISER, HOST, DRIVER, CREATIVE, LGA_ADMIN, STATE_ADMIN, SUPER_ADMIN, TOUR_GUIDE) — `MINISTRY_VIEWER` is a net-new additive value, same pattern as Phase 9's `TOUR_GUIDE` addition (`ALTER TYPE ADD VALUE`).

### Data-capture touchpoints (VisitorLog write sites)
- `backend/src/modules/events/events.service.ts` — event ticket QR check-in flow (`Ticket.usedAt`) — one of three `VisitorLogService` call sites (D-08).
- `backend/src/modules/stays/stays.service.ts` — booking check-in date, `releaseEscrow()` cron context — second call site.
- `backend/src/modules/tour-bookings/` (Phase 9) — tour booking confirmation — third call site.
- `backend/prisma/schema.prisma` §Ticket, §Property/Booking — existing fields informing what's available at each capture point (no LGA on Ticket directly; via `Event`. `Property.lgaId` direct for Stays).

### Project conventions
- `c:/Developer/work/ISEYAA/CLAUDE.md` — RBAC via `@Roles()`; PII encryption/handling rules (AES-256-GCM for BVN/NIN) that MIN-07's isolation must respect even though `VisitorLog` itself carries none of that data; NDPA compliance context.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `AdminService.getRevenue()`'s `$queryRaw` monthly + LGA-join pattern — direct template for MIN-02's visitor-entry-by-LGA-and-month query and MIN-04's revenue-by-module-and-month query.
- `itinerary-pdf.service.ts` — branded pdfkit shell, reusable for all three PDF exports (D-13).
- `RolesGuard` / `@Roles()` / `@CurrentUser()` — standard RBAC pattern `MINISTRY_VIEWER` slots into with zero new guard infrastructure.
- Ministry wallet + `Transaction` ledger (Phase 12/13) — MIN-04's entire data source already exists; this phase only adds read/aggregation endpoints, no new settlement plumbing.

### Established Patterns
- Per-module `PlatformConfig` KV reads (seen throughout Transport/Delivery/Marketplace fee config) — not directly needed for Ministry Dashboard's read-only queries, but the taxonomy/category values in D-05 should follow the same "configurable, not hardcoded" spirit even if stored as a simple enum/string rather than a `PlatformConfig` row.
- `UserRole` enum additive-value pattern (`ALTER TYPE ADD VALUE`, Phase 9's `TOUR_GUIDE`) — the exact precedent for adding `MINISTRY_VIEWER`.
- CommonModule direct-injection pattern (`PaystackService`, `S3Service`, `QrService`) — the model for the new `VisitorLogService` (D-08), rather than an EventEmitter2 event.

### Integration Points
- Three write sites for `VisitorLogService`: `events.service.ts` (check-in), `stays.service.ts` (booking check-in), tour-bookings module (booking confirmation) — all first-party in-process calls, no webhook involved.
- Ministry Dashboard read endpoints are net-new (likely a new `MinistryModule` or extension of `AdminModule` — planner's call), querying `VisitorLog` (new) and `Transaction` (existing, via Ministry wallet ID) — no writes from the dashboard itself, purely read + export.

</code_context>

<specifics>
## Specific Ideas

- The purpose-of-visit taxonomy (D-05) was chosen as a general-purpose government tourism category set, not invented arbitrarily — worth flagging to the planner that the Ministry may eventually want to rename or extend these categories, which the "not hardcoded into report logic" decision already accommodates.
- The user deferred all four discussed areas to Claude's discretion after seeing the concrete options — no area had a strong pre-existing user preference to preserve verbatim; the decisions above represent the most defensible reading of the roadmap/requirements text plus what's cheapest to build on top of Phase 12/13's existing settlement work.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope. MIN-08 (scheduled/recurring export delivery) and MIN-09 (seasonal/LGA heatmap) were already flagged as deferred-to-v2 in REQUIREMENTS.md before this discussion started and were not re-litigated.

</deferred>

---

*Phase: 14-ministry-dashboard*
*Context gathered: 2026-07-18*
</code_context>
