# Phase 14: Ministry Dashboard - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-18
**Phase:** 14-ministry-dashboard
**Areas discussed:** Visitor entry capture, Purpose-of-visit taxonomy, Revenue-to-government-share breakdown, Export scope & report structure

---

## Visitor entry capture

| Option | Description | Selected |
|--------|-------------|----------|
| Events + Stays only | The two existing booking/check-in flows — matches roadmap wording most directly | |
| Events + Stays + Tour Packages | Adds Tour Packages as a third source | ✓ (via "You decide") |
| You decide | Claude picks based on defensibility + cheapest to build | (chosen) |

**User's choice:** You decide → Events + Stays + Tour Packages.

| Option | Description | Selected |
|--------|-------------|----------|
| Booking's scheduled date | Count as soon as date reached, regardless of later cancellation | |
| Confirmed-active status only | Excludes no-shows/cancellations, needs status-transition check | |
| You decide | Claude picks simplest correct option | ✓ |

**User's choice:** You decide → exclude cancelled/refunded, count by scheduled date reached (status != CANCELLED AND date <= now).

| Option | Description | Selected |
|--------|-------------|----------|
| Monthly buckets, fixed | Matches AdminService.getRevenue()'s existing pattern | |
| Selectable day/week/month | More flexible, more work | |
| You decide | Claude picks proportionate option | ✓ |

**User's choice:** You decide → monthly buckets + optional from/to date-range filter.

| Option | Description | Selected |
|--------|-------------|----------|
| LGA + time only | Matches MIN-02's exact wording | |
| Add visitor-type split | User.role split, zero new capture point | |
| You decide | Claude picks natural zero-cost addition | ✓ |

**User's choice:** You decide → add visitor-type split by User.role.

---

## Purpose-of-visit taxonomy

| Option | Description | Selected |
|--------|-------------|----------|
| Tourism/Leisure, Business, Religious/Pilgrimage, Family/Personal, Event Attendance, Education, Other | General-purpose government taxonomy | |
| Derive automatically from booking type | No citizen-facing question, coarser | |
| You decide | Claude picks a reasonable default | ✓ |

**User's choice:** You decide → explicit taxonomy (first option), since roadmap calls for a real new capture point, not pure inference.

| Option | Description | Selected |
|--------|-------------|----------|
| Optional field, pre-filled with a sensible default per booking type | Zero checkout friction | |
| Required field, no default | Cleaner data, more friction | |
| You decide | Claude picks to minimize friction | ✓ |

**User's choice:** You decide → optional, pre-filled with per-booking-type default.

| Option | Description | Selected |
|--------|-------------|----------|
| New VisitorLog table | Clean single source, no PII columns | |
| Add purpose field to each of the 3 existing tables | Fewer new tables, messier queries | |
| You decide | Claude picks cleanest for MIN-02/03/07 | ✓ |

**User's choice:** You decide → new VisitorLog table.

| Option | Description | Selected |
|--------|-------------|----------|
| Inline in existing handlers | Simplest, no new event plumbing | |
| New @OnEvent('visitor.entry_logged') pattern | Matches settlement's EventEmitter2 precedent | |
| You decide | Claude picks least new surface area | ✓ |

**User's choice:** You decide → inline direct calls to new global VisitorLogService.

---

## Revenue-to-government-share breakdown

| Option | Description | Selected |
|--------|-------------|----------|
| By module + by time (monthly) | Directly queryable, no new joins | |
| By module + by LGA + by time | Richer, needs per-module joins | |
| You decide | Claude picks queryable-without-new-joins option | ✓ |

**User's choice:** You decide → by module + time guaranteed; LGA added only where source naturally has one.

| Option | Description | Selected |
|--------|-------------|----------|
| All historical Ministry wallet transactions | Complete picture immediately | |
| Only from Phase 14's ship date forward | Simpler mental model, confusing gap | |
| You decide | Claude picks most useful for first-time viewer | ✓ |

**User's choice:** You decide → all historical transactions since Phase 12/13 settlement wiring went live.

| Option | Description | Selected |
|--------|-------------|----------|
| Separate independent panels | Simplest, avoids misleading ratio | |
| Add a derived revenue-per-visitor metric | Useful KPI but imprecise ratio | |
| You decide | Claude picks to avoid misleading metric | ✓ |

**User's choice:** You decide → separate independent panels, no derived ratio.

---

## Export scope & report structure

| Option | Description | Selected |
|--------|-------------|----------|
| All three (visitor entries, purpose-of-visit, revenue) | Matches MIN-05/06's literal wording | |
| One combined report | Fewer exports, less literal match | |
| You decide | Claude picks the literal reading | ✓ |

**User's choice:** You decide → all three reports independently exportable.

| Option | Description | Selected |
|--------|-------------|----------|
| Reuse itinerary-pdf.service.ts's existing pattern | Proven branded shell | |
| New report-specific PDF template | More control, more new code | |
| You decide | Claude picks maximum reuse | ✓ |

**User's choice:** You decide → reuse itinerary-pdf.service.ts's branded shell; new table-rendering logic for report bodies.

| Option | Description | Selected |
|--------|-------------|----------|
| Export respects active filters | "What you see is what you export" | |
| Always export full dataset | Simpler, but surprising | |
| You decide | Claude picks standard dashboard-export UX | ✓ |

**User's choice:** You decide → export respects active LGA/date-range filters.

---

## Claude's Discretion

Every question in every area was answered "You decide" — the user reviewed the concrete options presented for each and deferred the specific choice to Claude's judgment in all cases:
- Visitor entry sources, timestamp rule, granularity, and secondary dimension (Visitor entry capture)
- Taxonomy category list, capture mandatoriness/defaulting, data model, and write path (Purpose-of-visit taxonomy)
- Breakdown dimensions, historical inclusion, and correlation with visitor counts (Revenue-to-government-share breakdown)
- Export scope, PDF layout reuse, and filter-respecting behavior (Export scope & report structure)

All resulting decisions are recorded as D-01 through D-14 in `14-CONTEXT.md`.

## Deferred Ideas

None — discussion stayed within phase scope. MIN-08 (scheduled export delivery) and MIN-09 (heatmap visualization) were already deferred to v2 in REQUIREMENTS.md prior to this discussion and were not re-litigated.
