# Phase 22: Scheduled Ministry Exports & LGA Heatmap - Context

**Gathered:** 2026-07-21
**Status:** Ready for planning

<domain>
## Phase Boundary

The Ministry receives its 3 existing on-demand exports (visitor entries, purpose breakdown, revenue-to-government — all built in Phase 14) as a recurring, automatically-delivered email digest on an operator-configurable cadence, with no redeploy required to change recipients or cadence. The Ministry dashboard also gains a new LGA × month visitor-density heatmap built on the existing `getVisitorEntriesByLgaAndMonth()` query shape and the existing `recharts` dependency — no new mapping/GeoJSON dependency (true LGA-boundary choropleth is explicitly deferred as MIN-09x per REQUIREMENTS.md).

</domain>

<decisions>
## Implementation Decisions

### Digest scope & config
- **D-01:** All 3 existing Phase 14 exports (visitor entries + purpose breakdown + revenue-to-government) are bundled into one digest email, rendered as one multi-section branded PDF (reusing `MinistryPdfService`'s existing multi-section renderer) plus CSV attachment(s).
- **D-02:** Recipient list + cadence are stored in a new dedicated model (not a `PlatformConfig` JSON blob) — mirrors Phase 18's `SettlementSplitTier` precedent: typed columns, not a loose JSON value, so delivery history can be queried directly rather than parsed out of a blob.
- **D-03:** Cadence is a fixed enum (`WEEKLY` / `MONTHLY`, possibly `QUARTERLY`) — not a free-form cron string. No precedent exists in this codebase for user-editable cron expressions, and a government reporting cadence doesn't need finer granularity.
- **D-04:** Each digest covers a rolling window since the subscription's own `lastSentAt` (not a fixed calendar period) — self-correcting against late/retried sends, no gaps or double-counted overlaps.

### Heatmap grouping & rendering
- **D-05:** Heatmap groups by month only (not season, not a toggle) — reuses `getVisitorEntriesByLgaAndMonth()`'s existing `{lgaId, lgaName, month, count}` shape with zero new backend query work. Satisfies MIN-09's "month/season" wording without inventing an undefined season-boundary concept.
- **D-06:** Rendered as a custom color-intensity grid component (LGA rows × month columns, cell background intensity = visitor count), styled with the existing FOREST (`#1A6B3C`)/GOLD (`#C8962A`) palette — not a `recharts` primitive (recharts has no native heatmap chart type), satisfying the "no new mapping dependency" constraint since it's a styled grid, not a charting-library feature.
- **D-07:** Shows all 20 Ogun State LGAs, reusing the existing `MinistryQueryDto` `from`/`to`/`lgaId` filter already used by the other 3 Ministry charts — same date-range picker UX, no new filter component.
- **D-08:** Dashboard-only — no new CSV/PDF export route for the heatmap. MIN-09's requirement text only asks for it to be shown on the dashboard; the underlying LGA×month data is already exportable via the existing visitor-entries export route.

### Recipient management
- **D-09:** No admin UI this phase — `web/src/app/admin/ministry/page.tsx` gets no new settings panel. ROADMAP/MIN-08b's "configurable via the database" is satisfied at the backend layer.
- **D-10:** Backend-only `SUPER_ADMIN`-gated CRUD REST routes for the subscription model (mirrors Phase 18's `SettlementSplitTier` pattern exactly) — real endpoints visible in Swagger (`/api/docs`), callable via Postman/curl, audit-trail-preserving. Explicitly rejected: raw DB/Prisma Studio access with no routes — violates the audit-trail precedent set by `SettlementSplitTier`/`SettlementDispute`.
- **D-11:** Recipients are a free-text email array/JSON field on the subscription row, not tied to existing `MINISTRY_VIEWER` user accounts — a Ministry contact without a platform login can still receive the digest, matching how dashboard access itself isn't 1:1 with a single user account.

### Failure visibility & retry policy
- **D-12:** Beyond `Logger` entries, the subscription model itself gets `lastSentAt` / `lastStatus` / `lastError` fields — an operator can see each subscription's last delivery outcome via the CRUD `GET` route without grepping logs or Grafana.
- **D-13:** The send is wrapped in the existing `cockatiel`/`ResilienceService` pattern (per MIN-08c). After retries are exhausted on a still-failing send: log + mark `lastStatus = FAILED`, and let the next scheduled `@Cron` tick retry naturally (since `lastSentAt` is unchanged, the subscription is still "due"). No new alerting channel/ops notification is added this phase — relies on existing Grafana/Sentry error visibility, matching Phase 20's no-new-alerting-infra precedent.
- **D-14:** `SendgridService` gets a new dedicated method (e.g. `sendMinistryDigest()`) rather than generalizing the shared `sendEmail()` signature — matches the existing per-feature dedicated-method pattern (`sendTicketConfirmation`, `sendBookingConfirmation`, etc.) and keeps the new `attachments` array construction (base64 CSV + PDF buffers) scoped to this one call site, with zero risk to existing OTP/ticket/booking send paths.
- **D-15:** A size guard exists for the combined CSV+PDF attachment: if combined size exceeds a safe threshold (planner's discretion on exact number, well under SendGrid's ~30MB hard cap), log a warning and send the digest email without attachments rather than risk SendGrid silently rejecting the whole send.

### Claude's Discretion
- Exact enum values beyond `WEEKLY`/`MONTHLY` (whether `QUARTERLY` is included)
- Exact attachment-size threshold for D-15's guard
- Exact subscription model field names/shape (beyond the required `recipients`, `cadence`, `lastSentAt`, `lastStatus`, `lastError`)
- Which `@Cron` schedule expression drives the "check subscriptions due" tick, and whether it needs the Phase 20 `setNx()` distributed lock (very likely yes — this is exactly the class of shared-side-effect cron Phase 20's pattern exists for — but the planner should confirm and apply it, not silently skip it)
- Exact color-intensity scale/legend design for the heatmap grid (sequential palette, bucketing vs. continuous gradient)

### Reviewed Todos (not folded)
- "Add compile step to packages/proto (INT-02)" and "Wire ResilienceModule into gRPC service scaffolds (INT-01)" both matched this phase during cross-referencing (score 0.6, keyword overlap on "grpc"/"resilience"/"build"), but per `STATE.md`'s Deferred Items table both are already resolved by Phase 16/17 (the todo files themselves were just never marked complete). Not folded — no action needed here.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & roadmap
- `.planning/REQUIREMENTS.md` lines 32-36 — MIN-08a/MIN-08b/MIN-08c/MIN-09 (this phase's fixed scope anchor)
- `.planning/REQUIREMENTS.md` line 54 — MIN-09x (true LGA choropleth explicitly deferred, not this phase)
- `.planning/REQUIREMENTS.md` lines 92-95 — phase mapping confirmation
- `.planning/ROADMAP.md` Phase 22 section — goal, dependencies (Phase 20 only), success criteria
- `.planning/STATE.md` — Deferred Items table (confirms the 2 reviewed-but-not-folded todos above are already resolved elsewhere)

### Phase 14 (Ministry Dashboard) — existing code this phase builds on
- `backend/src/modules/ministry/ministry.service.ts` — `getVisitorEntriesByLgaAndMonth()` (exact query shape the heatmap consumes), `getPurposeBreakdown()`, `getRevenueToGovernment()` (the 3 exports bundled into the digest)
- `backend/src/modules/ministry/ministry.controller.ts` — existing 6 export routes pattern (CSV via `CsvExportService`, PDF via `MinistryPdfService`), `MinistryQueryDto` filter shape, `@Roles(MINISTRY_VIEWER, STATE_ADMIN, SUPER_ADMIN)` gating precedent
- `backend/src/common/services/ministry-pdf.service.ts` — multi-section branded PDF renderer (already built for exactly this bundling use case per its own doc comment, D-14 in Phase 14)
- `backend/src/common/services/csv-export.service.ts` — `fast-csv`-backed CSV writer
- `web/src/app/admin/ministry/page.tsx` — existing Ministry dashboard page, `ALLOWED_ROLES` gating; where the new heatmap component mounts
- `web/src/components/admin/ministry/{PurposeBreakdownChart,RevenueChart,VisitorEntriesChart}.tsx` — existing `recharts`-based chart components; visual style reference for the new heatmap grid

### Phase 18 (Settlement Split Centralization) — DB-config-with-audit-trail precedent
- `backend/prisma/schema.prisma` `SettlementSplitTier` model (line 696+) — the direct schema-design precedent for the new export-subscription model (typed columns, partial-unique-index pattern, `isActive`/audit fields)
- `.planning/phases/18-settlement-split-centralization/18-CONTEXT.md` — the `SUPER_ADMIN`-gated backend-only CRUD pattern this phase's D-10 reuses

### Phase 20 (gRPC Blue-Green Healthcheck Retrofit) — cron/resilience precedent
- `.planning/phases/20-grpc-blue-green-healthcheck-retrofit/20-CONTEXT.md` — `setNx()` distributed-lock cron pattern (D-07/D-08), applicable to this phase's new "check subscriptions due" cron tick
- `backend/src/redis/redis.service.ts` `setNx()` (~lines 125-138) — the distributed-lock primitive itself

### Attachment support gap (new work, not existing pattern)
- `backend/src/common/services/sendgrid.service.ts` — current `sendEmail()`/dedicated-method pattern; has NO attachment support today — D-14's new method is genuinely new code, not a reuse

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `MinistryService.getVisitorEntriesByLgaAndMonth()`, `getPurposeBreakdown()`, `getRevenueToGovernment()` — all 3 data sources for the digest already exist and are unit-tested (Phase 14)
- `MinistryPdfService` — multi-section tabular PDF renderer, built exactly for bundling multiple report sections into one branded document
- `CsvExportService.toCsv()` — RFC4180-correct CSV writer via `fast-csv`
- `RedisService.setNx()` — fail-open distributed lock, already applied to 6 other crons in Phase 20

### Established Patterns
- DB-config-with-audit-trail: insert-new-row/deactivate-old pattern from `SettlementSplitTier`/`updateSplitTier()`, reusable for subscription CRUD if update semantics are needed (though a subscription's mutable fields like `lastSentAt`/`lastStatus` are expected to update in place, not audit-trail-versioned like split percentages)
- Canary/config-flag precedent: `PlatformConfig` key-value table exists but was explicitly rejected for this phase's recipient/cadence storage (D-02) in favor of a dedicated typed model
- `@Cron` + `setNx()` guard: exact pattern from Phase 20's 6 guarded crons — this phase's new "check subscriptions due, send if due" tick is the same class of shared-side-effect cron

### Integration Points
- `backend/src/modules/ministry/` — new subscription model, service methods, and CRUD controller likely live here or in a new sibling module (planner's discretion)
- `backend/src/common/services/sendgrid.service.ts` — new `sendMinistryDigest()` method added here
- `web/src/components/admin/ministry/` — new heatmap grid component added alongside the 3 existing chart components
- `backend/prisma/schema.prisma` — new model + migration required

</code_context>

<specifics>
## Specific Ideas

No specific visual mockup or exact color-scale reference was given for the heatmap — "styled with the existing FOREST/GOLD palette" is the only stated visual constraint (D-06). Planner/UI researcher has discretion on the exact intensity-scale design.

</specifics>

<deferred>
## Deferred Ideas

None raised beyond what REQUIREMENTS.md already tracks as out-of-scope (MIN-09x true choropleth, MIN-10 in-dashboard notification banner, MIN-11 drill-down) — discussion stayed within phase scope.

### Reviewed Todos (not folded)
- "Add compile step to packages/proto (INT-02)" — matched this phase (score 0.6) but already resolved by Phase 16/17 per STATE.md; todo file itself just never marked complete
- "Wire ResilienceModule into gRPC service scaffolds (INT-01)" — matched this phase (score 0.6) but already resolved by Phase 16/17 per STATE.md; todo file itself just never marked complete

</deferred>

---

*Phase: 22-Scheduled Ministry Exports & LGA Heatmap*
*Context gathered: 2026-07-21*
