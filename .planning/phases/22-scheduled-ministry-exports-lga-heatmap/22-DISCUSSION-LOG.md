# Phase 22: Scheduled Ministry Exports & LGA Heatmap - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-21
**Phase:** 22-scheduled-ministry-exports-lga-heatmap
**Areas discussed:** Digest scope & config, Heatmap grouping & rendering, Recipient management UI, Failure visibility & retry policy

---

## Digest scope & config

| Option | Description | Selected |
|--------|-------------|----------|
| All three (recommended) | Visitor entries + purpose breakdown + revenue-to-government — mirrors MinistryPdfService's existing multi-section renderer | ✓ |
| Visitor entries + revenue only | Drops purpose breakdown — smaller digest | |
| Let Claude decide | Planner picks based on PDF layout fit | |

**User's choice:** All three

| Option | Description | Selected |
|--------|-------------|----------|
| New dedicated model (recommended) | e.g. MinistryExportSubscription — mirrors Phase 18's SettlementSplitTier pattern | ✓ |
| Simple PlatformConfig JSON value | One key with a JSON blob, reuses existing config table | |
| Let Claude decide | Planner picks based on delivery-history tracking needs | |

**User's choice:** New dedicated model

| Option | Description | Selected |
|--------|-------------|----------|
| Fixed enum (recommended) | WEEKLY / MONTHLY (maybe QUARTERLY) | ✓ |
| Free-form cron expression | Raw cron string per subscription, more flexible | |
| Let Claude decide | Planner picks simplest correct implementation | |

**User's choice:** Fixed enum

| Option | Description | Selected |
|--------|-------------|----------|
| Rolling window since last send (recommended) | Self-correcting, no gaps/overlaps | ✓ |
| Calendar period (prior full week/month) | More predictable but can gap/double-count | |
| Let Claude decide | Planner picks simplest correct approach | |

**User's choice:** Rolling window since last send
**Notes:** All 4 questions in this area resolved to the recommended option.

---

## Heatmap grouping & rendering

| Option | Description | Selected |
|--------|-------------|----------|
| Month only (recommended) | Reuses getVisitorEntriesByLgaAndMonth() as-is, zero new query work | ✓ |
| Season bucket (derived from month) | Requires defining season-boundary mapping, no precedent exists | |
| Both, with a toggle | More UI work, no extra backend query | |

**User's choice:** Month only

| Option | Description | Selected |
|--------|-------------|----------|
| Custom color-intensity grid (recommended) | Grid component, LGA rows x month columns, FOREST/GOLD palette | ✓ |
| recharts ScatterChart with sized/colored dots | Stays within recharts dependency, less heatmap-like | |
| Let Claude decide | Planner/UI researcher picks based on existing chart visual style | |

**User's choice:** Custom color-intensity grid

| Option | Description | Selected |
|--------|-------------|----------|
| All 20 LGAs, reuse existing from/to filter (recommended) | Mirrors existing MinistryQueryDto filter, no new filter component | ✓ |
| Top N LGAs by volume + other bucket | Less scrolling, but a new UI pattern not used elsewhere | |
| Let Claude decide | Planner defers density decision to implementation | |

**User's choice:** All 20 LGAs, reuse existing filter

| Option | Description | Selected |
|--------|-------------|----------|
| Dashboard-only, no export (recommended) | MIN-09 only requires dashboard display; data already exportable elsewhere | ✓ |
| Add a 7th export route matching the existing pattern | Consistent with dashboard's export-everything pattern, adds scope | |

**User's choice:** Dashboard-only, no export
**Notes:** All 4 questions in this area resolved to the recommended option.

---

## Recipient management UI

| Option | Description | Selected |
|--------|-------------|----------|
| DB-only, no UI this phase (recommended) | Matches literal ROADMAP/MIN-08b phrasing, keeps phase backend-focused | ✓ |
| Add a settings panel to the Ministry admin page | More complete UX for a non-technical operator, expands UI scope | |
| Let Claude decide | Planner picks based on incremental effort | |

**User's choice:** DB-only, no UI this phase

| Option | Description | Selected |
|--------|-------------|----------|
| Backend-only SUPER_ADMIN-gated CRUD routes (recommended) | Mirrors Phase 18's SettlementSplitTier pattern exactly, visible in Swagger | ✓ |
| Raw DB access only (seed script / Prisma Studio) | Fastest to build, no audit trail, violates codebase's audit-trail precedent | |

**User's choice:** Backend-only SUPER_ADMIN-gated CRUD routes

| Option | Description | Selected |
|--------|-------------|----------|
| Free-text email array, unlimited (recommended) | Simplest, doesn't require Ministry contacts to have platform accounts | ✓ |
| Tied to existing MINISTRY_VIEWER user accounts only | Enforces vetted accounts only, blocks non-onboarded contacts | |

**User's choice:** Free-text email array, unlimited
**Notes:** All 3 questions in this area resolved to the recommended option.

---

## Failure visibility & retry policy

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — lastSentAt + lastStatus + lastError fields (recommended) | Queryable audit trail directly on the subscription model | ✓ |
| Logger only, no DB fields | Satisfies the letter of "every attempt is logged" with less schema work | |

**User's choice:** Yes — add lastSentAt/lastStatus/lastError fields

| Option | Description | Selected |
|--------|-------------|----------|
| Log + mark lastStatus=FAILED, retry on next scheduled tick (recommended) | No new alerting infra, matches Phase 20's fail-open precedent | ✓ |
| Also send a failure alert to a platform admin/ops channel | New alerting surface, more moving parts | |
| Let Claude decide | Planner picks based on cockatiel's existing exhaustion handling | |

**User's choice:** Log + mark lastStatus=FAILED, retry on next tick

| Option | Description | Selected |
|--------|-------------|----------|
| New dedicated method, e.g. sendMinistryDigest() (recommended) | Mirrors existing dedicated-method pattern, scoped attachment risk | ✓ |
| Generalize sendEmail() to accept an optional attachments param | More reusable, touches existing OTP/ticket/booking send paths | |
| Let Claude decide | Planner picks based on @sendgrid/mail API fit | |

**User's choice:** New dedicated method (sendMinistryDigest())

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — log + skip attachment if oversized (recommended) | Defensive guard against SendGrid's ~30MB cap, cheap to add | ✓ |
| No guard — trust current data volumes | Matches milestone's general accept-current-volume-risk pattern | |

**User's choice:** Yes — log + skip attachment if oversized
**Notes:** All 4 questions in this area resolved to the recommended option.

---

## Claude's Discretion

- Exact enum values beyond WEEKLY/MONTHLY (whether QUARTERLY is included)
- Exact attachment-size threshold for the oversized-attachment guard
- Exact subscription model field names/shape beyond the required fields
- Which @Cron schedule expression drives the "check subscriptions due" tick, and whether it needs Phase 20's setNx() distributed lock (planner should confirm and apply, not silently skip)
- Exact color-intensity scale/legend design for the heatmap grid

## Deferred Ideas

None raised beyond what REQUIREMENTS.md already tracks as out-of-scope (MIN-09x true choropleth, MIN-10 notification banner, MIN-11 drill-down).

### Reviewed Todos (not folded)
- "Add compile step to packages/proto (INT-02)" — matched this phase during cross-referencing (score 0.6) but already resolved by Phase 16/17 per STATE.md's Deferred Items table
- "Wire ResilienceModule into gRPC service scaffolds (INT-01)" — matched this phase during cross-referencing (score 0.6) but already resolved by Phase 16/17 per STATE.md's Deferred Items table
