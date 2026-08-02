---
phase: quick-260802-eix
plan: 01
subsystem: web-admin
tags: [responsive, tailwind, mobile, admin-dashboard]
requires: []
provides:
  - Mobile-first single-column stacking for the two dense admin card grids
  - Aligned horizontal-scroll wrappers for the four fixed-template admin tables
affects:
  - web/src/app/admin/page.tsx
  - web/src/app/admin/tours/utilization/page.tsx
  - web/src/app/admin/guides/queue/page.tsx
  - web/src/app/admin/reviews/queue/page.tsx
  - web/src/app/admin/tours/queue/page.tsx
  - web/src/app/admin/tours/revenue/page.tsx
tech-stack:
  added: []
  patterns:
    - "overflow-x-auto > min-w-[Npx] shared wrapper keeps table header + rows column-aligned while scrolling"
    - "mobile-first grid base (grid-cols-1) with sm: breakpoint restoring desktop columns"
key-files:
  created:
    - .planning/quick/260802-eix-make-web-admin-dashboards-responsive-on-/260802-eix-SUMMARY.md
  modified:
    - web/src/app/admin/page.tsx
    - web/src/app/admin/tours/utilization/page.tsx
    - web/src/app/admin/guides/queue/page.tsx
    - web/src/app/admin/reviews/queue/page.tsx
    - web/src/app/admin/tours/queue/page.tsx
    - web/src/app/admin/tours/revenue/page.tsx
decisions:
  - "Used sm: (640px) breakpoint for card grids so md/lg desktop layout is pixel-identical; only sub-640px base changes"
  - "Single shared min-w wrapper around header + rows (not per-region) so columns stay aligned during horizontal scroll"
metrics:
  duration: ~10m
  completed: 2026-08-02
---

# Phase quick-260802-eix Plan 01: Make Web Admin Dashboards Responsive Summary

className-only Tailwind + wrapper-`<div>` changes making all six web admin dashboards usable at 375px phone width while leaving md/lg desktop rendering pixel-identical.

## What Was Done

### Task 1 — Category A: dense card grids stack single-column on mobile
- `web/src/app/admin/page.tsx` (L253, "Supporting row"): `grid grid-cols-3 gap-3` → `grid grid-cols-1 sm:grid-cols-3 gap-3`.
- `web/src/app/admin/tours/utilization/page.tsx` (L120, "Summary"): `grid grid-cols-2 gap-4 mb-6` → `grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6`.
- No other grids touched — already-responsive grids (page.tsx:228/:283/:358, utilization:93) left untouched per plan scope.
- Commit: `6556c11`

### Task 2 — Category B: fixed-template tables scroll horizontally as one aligned unit
For each of the four table pages, the header grid + rows `.map(...)` were wrapped inside a single `<div className="overflow-x-auto"><div className="min-w-[Npx]">…</div></div>` so header and rows share one min-width and stay column-aligned while scrolling. `grid-cols-[...]` templates, gaps, and cell content were left unchanged.
- `guides/queue/page.tsx` — `min-w-[760px]`
- `reviews/queue/page.tsx` — `min-w-[680px]`
- `tours/queue/page.tsx` — `min-w-[900px]`
- `tours/revenue/page.tsx` — `min-w-[620px]`; the "Vendor Summary" title block was kept OUTSIDE the scroll wrapper (stays full-width), wrapper surrounds header + rows only.
- Commit: `0a7f940`

## Verification

- `cd web && npx tsc --noEmit -p tsconfig.json` → **0 errors** (run after each task; both green).
  - Note: the worktree had no `node_modules`. Temporary directory junctions were created to `<main-checkout>/node_modules` and `<main-checkout>/web/node_modules` so tsc could resolve deps, then removed via .NET `Directory.Delete` (junction reparse point only — target `node_modules` verified intact). Junctions are gitignored and were never staged.
- Class review (git grep) confirmed: both Category-A grids now start `grid-cols-1 sm:...`; all four tables contain `overflow-x-auto` + the correct `min-w-[Npx]`; original `grid-cols-[...]` templates intact.
- Scope: only `web/src/app/admin/**` files touched. No backend/mobile/shared/non-admin-web changes.

## Deviations from Plan

None — plan executed exactly as written.

## Note on Base Commit

At startup the worktree merge-base did not match the expected base `5b77d284`; per the worktree-branch-check instructions the worktree was `git reset --hard` to `5b77d284` (the pre-dispatch plan commit) before any edits.

## Self-Check: PASSED

- All 6 modified files present on disk.
- Both task commits present in `git log`: `6556c11` (Task 1), `0a7f940` (Task 2).
- Category-A classes and Category-B min-widths verified via git grep.
- web typecheck: 0 errors.
