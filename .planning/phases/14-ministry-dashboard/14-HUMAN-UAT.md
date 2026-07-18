---
status: partial
phase: 14-ministry-dashboard
source: [14-VERIFICATION.md]
started: 2026-07-18T08:20:00Z
updated: 2026-07-18T08:20:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Visitor Entries PDF visual polish check
expected: Generate a Visitor Entries PDF export against real (non-fixture) production-shaped data (real LGA UUIDs if legacy rows exist, dozens of rows spanning at least one page break) and open it in a PDF viewer. Every row renders as a clean, non-overlapping table row; the header repeats identically on page 2+; no cell text is clipped.
result: [pending]

### 2. Revenue PDF branding + multi-section layout check
expected: Open a Revenue export PDF (3 sections: By Module / By Month / By LGA) in a PDF viewer, ideally once `byMonth` has accumulated enough rows to approach a page boundary, and visually confirm no header/content overlap at section boundaries (exercises the WR-02 edge case directly). Forest Green (#1A6B3C) headings, Gold (#C8962A) divider, and section headers all render cleanly with no overlap, even at a section boundary.
result: [pending]

## Summary

total: 2
passed: 0
issues: 0
pending: 2
skipped: 0
blocked: 0

## Gaps
