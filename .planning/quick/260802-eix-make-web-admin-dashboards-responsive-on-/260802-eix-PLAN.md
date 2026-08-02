---
phase: quick-260802-eix
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - web/src/app/admin/page.tsx
  - web/src/app/admin/tours/utilization/page.tsx
  - web/src/app/admin/guides/queue/page.tsx
  - web/src/app/admin/reviews/queue/page.tsx
  - web/src/app/admin/tours/queue/page.tsx
  - web/src/app/admin/tours/revenue/page.tsx
autonomous: true
requirements: [RESPONSIVE-ADMIN]

must_haves:
  truths:
    - "At 375px width, the two dense card grids stack to a single column instead of cramming 2-3 cards per row"
    - "At 375px width, each admin fixed-template table scrolls horizontally as one aligned unit (header + rows move together)"
    - "At md/lg width, every touched page renders pixel-identically to before (desktop appearance unchanged)"
    - "web/ typecheck passes with 0 errors after all changes"
  artifacts:
    - path: "web/src/app/admin/page.tsx"
      provides: "Supporting-row grid with mobile-first single-column base"
      contains: "grid-cols-1 sm:grid-cols-3 gap-3"
    - path: "web/src/app/admin/tours/utilization/page.tsx"
      provides: "Summary grid with mobile-first single-column base"
      contains: "grid-cols-1 sm:grid-cols-2 gap-4 mb-6"
    - path: "web/src/app/admin/guides/queue/page.tsx"
      provides: "Guide queue table wrapped in overflow-x-auto + min-width"
      contains: "min-w-[760px]"
    - path: "web/src/app/admin/reviews/queue/page.tsx"
      provides: "Review flags table wrapped in overflow-x-auto + min-width"
      contains: "min-w-[680px]"
    - path: "web/src/app/admin/tours/queue/page.tsx"
      provides: "Tour package queue table wrapped in overflow-x-auto + min-width"
      contains: "min-w-[900px]"
    - path: "web/src/app/admin/tours/revenue/page.tsx"
      provides: "Vendor summary table wrapped in overflow-x-auto + min-width"
      contains: "min-w-[620px]"
  key_links:
    - from: "each table header grid"
      to: "its data-row grids"
      via: "shared min-width scroll wrapper"
      pattern: "overflow-x-auto"
---

<objective>
Make every web admin dashboard usable at 375px (phone) width without changing the desktop (md/lg) appearance. Two mechanical fix categories, className-only + wrapper `<div>` insertion. Scope is strictly `web/src/app/admin/**` and `web/src/components/admin/**`.

Purpose: Admins currently cannot read the dashboards on a phone — dense card grids overflow and fixed-template tables crush their `1fr` columns to unreadable widths.
Output: 6 admin files edited (2 grid breakpoints, 4 table scroll wrappers), `web/` typecheck green.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@./CLAUDE.md

<audit_result>
Audited every `grid-cols-{2..6}` in `web/src/app/admin/**` and `web/src/components/admin/**`.
Category A targets (base class is unprefixed `grid-cols-2`+ holding card/stat content) = EXACTLY two:
  - web/src/app/admin/page.tsx:253 — `grid grid-cols-3 gap-3`
  - web/src/app/admin/tours/utilization/page.tsx:120 — `grid grid-cols-2 gap-4 mb-6`
LEAVE AS-IS (already responsive or intentional mobile base — do NOT touch):
  - page.tsx:228 `grid-cols-1 sm:grid-cols-3`, :283 `grid-cols-1 lg:grid-cols-5`, :358 `grid-cols-2 sm:grid-cols-4`
  - ministry/page.tsx:187, tours/revenue/page.tsx:112 & :167 (all `grid-cols-1 sm:grid-cols-3`)
  - tours/utilization/page.tsx:93 `grid-cols-1 sm:grid-cols-2`
  - components/admin/** — no bare `grid-cols-{2..6}` matches at all.
The `grid-cols-[...px...]` fixed templates are Category B (below), not Category A.
</audit_result>

<table_structure>
All four Category B tables share ONE structure: an outer `<div className="glass rounded-2xl border border-white/6 overflow-hidden">` containing a header `<div className="grid grid-cols-[...]">` immediately followed by `{items.map(...)}` (or `{...vendorBreakdown.map(...)}`) rendering row `<div className="grid grid-cols-[...]">` blocks.
Because the header and rows are already siblings inside one common container, the CLEAN approach applies: insert a single `<div className="overflow-x-auto"><div className="min-w-[Npx]">` wrapping BOTH the header grid and the rows map, then close both new divs. Header + rows share the same wrapper → same min-width → columns stay aligned while scrolling together.
Reference pattern to mirror: `overflow-x-auto` wrapper in web/src/components/admin/ministry/LgaMonthHeatmap.tsx:93.
</table_structure>

<interfaces>
Exact current fixed-template class strings + wrapper insertion points (line numbers approximate — executor MUST read each file to confirm before editing):

guides/queue/page.tsx — template `grid-cols-[1fr_80px_1fr_80px_100px_160px]`, wrapper `min-w-[760px]`
  header div ~L146, rows `{items.map(...)}` ~L154-198, all inside `glass...overflow-hidden` ~L145.
reviews/queue/page.tsx — template `grid-cols-[1fr_1fr_80px_1fr_160px]`, wrapper `min-w-[680px]`
  header div ~L153, rows `{items.map(...)}` ~L160-onward, inside `glass...overflow-hidden` ~L152.
tours/queue/page.tsx — template `grid-cols-[1fr_1fr_1fr_1fr_100px_180px]`, wrapper `min-w-[900px]`
  header div ~L147, rows `{items.map(...)}` ~L155-196, inside `glass...overflow-hidden` ~L146.
tours/revenue/page.tsx — template `grid-cols-[1fr_1fr_120px_100px]`, wrapper `min-w-[620px]`
  Outer `glass...overflow-hidden` ~L213 has a "Vendor Summary" TITLE block (`px-5 py-4 border-b`) ~L214-216 BEFORE the header grid ~L217. The scroll wrapper goes AROUND the header grid + rows map ONLY (~L217-235), NOT around the title block — the title stays full-width.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add mobile-first base to the two dense card grids (Category A)</name>
  <files>web/src/app/admin/page.tsx, web/src/app/admin/tours/utilization/page.tsx</files>
  <action>
Two single-token className edits only. Change nothing else in either file.
1. web/src/app/admin/page.tsx (~L253, the "Supporting row" comment block): change `grid grid-cols-3 gap-3` to `grid grid-cols-1 sm:grid-cols-3 gap-3`.
2. web/src/app/admin/tours/utilization/page.tsx (~L120, the "Summary" block): change `grid grid-cols-2 gap-4 mb-6` to `grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6`.
Do NOT touch any other grid in either file — page.tsx:228/:283/:358 and utilization:93 are already responsive and are explicitly out of scope. `sm:` (640px) preserves the desktop layout exactly; only the sub-640px base changes.
  </action>
  <verify>
    <automated>cd web && npx tsc --noEmit -p tsconfig.json</automated>
  </verify>
  <done>page.tsx supporting-row grid reads `grid-cols-1 sm:grid-cols-3`; utilization summary grid reads `grid-cols-1 sm:grid-cols-2`; no other grid changed; web typecheck 0 errors.</done>
</task>

<task type="auto">
  <name>Task 2: Wrap the four fixed-template admin tables in aligned horizontal-scroll containers (Category B)</name>
  <files>web/src/app/admin/guides/queue/page.tsx, web/src/app/admin/reviews/queue/page.tsx, web/src/app/admin/tours/queue/page.tsx, web/src/app/admin/tours/revenue/page.tsx</files>
  <action>
For EACH of the four files, read the actual JSX first, then insert a shared scroll wrapper around the header grid + rows map (see `<table_structure>` and `<interfaces>` in context for exact templates, min-widths, and insertion points).

Per table: immediately inside the existing `glass...overflow-hidden` container (for tours/revenue, immediately AFTER the "Vendor Summary" title block — not before it), open `<div className="overflow-x-auto"><div className="min-w-[Npx]">`, then close `</div></div>` right after the rows `.map(...)` closes. The header `<div className="grid grid-cols-[...]">` and the row grids must BOTH sit inside this single `min-w-[Npx]` wrapper so they share one min-width and stay column-aligned while scrolling together.

Min-widths (do not deviate): guides/queue `min-w-[760px]`, reviews/queue `min-w-[680px]`, tours/queue `min-w-[900px]`, tours/revenue `min-w-[620px]`.

Do NOT change the `grid-cols-[...]` templates, the `gap-*`, or any row/cell content. Do NOT apply min-w to only the header or only the rows — the whole point is one shared wrapper. On desktop (≥ min-width) `overflow-x-auto` shows no scrollbar and adds zero visual change; the outer `overflow-hidden` rounded corners still clip cleanly because the inner `overflow-x-auto` owns its own scroll context. No logic, no new imports, no new deps.
  </action>
  <verify>
    <automated>cd web && npx tsc --noEmit -p tsconfig.json</automated>
  </verify>
  <done>All four tables have their header+rows region wrapped in `overflow-x-auto` > `min-w-[Npx]` (correct px per table); `grid-cols-[...]` templates unchanged; tours/revenue title block remains outside the wrapper; web typecheck 0 errors.</done>
</task>

</tasks>

<verification>
- `cd web && npx tsc --noEmit -p tsconfig.json` → 0 errors.
- Class review: `grep` the six files confirms the two Category-A grids now start `grid-cols-1 sm:...` and each of the four tables contains its `overflow-x-auto` + correct `min-w-[Npx]` pair, with the original `grid-cols-[...]` templates intact.
- No file outside `web/src/app/admin/**` touched; no backend/mobile/shared/non-admin-web changes.
</verification>

<success_criteria>
- 6 admin files edited: 2 grid-breakpoint one-liners + 4 table scroll wrappers.
- Desktop (≥640px / md/lg) rendering unchanged on every touched page.
- At 375px: the two card grids stack single-column; all four tables scroll as one aligned unit.
- `web/` typecheck green; no new dependencies; no logic rewrites.
</success_criteria>

<output>
After completion, create `.planning/quick/260802-eix-make-web-admin-dashboards-responsive-on-/260802-eix-SUMMARY.md`
</output>
