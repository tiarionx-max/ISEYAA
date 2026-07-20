---
status: partial
phase: 19-settlement-dispute-adjustment-workflow
source: [19-VERIFICATION.md]
started: 2026-07-20T16:45:00Z
updated: 2026-07-20T16:45:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Confirm CR-02 DB migration deployment
expected: `npx prisma migrate deploy` run against every real target database (staging/production); `npx prisma migrate status` reports no pending migrations; attempting to INSERT two active SettlementDispute rows for the same settlementReference raises a unique-constraint violation at the DB layer. Migration: `20260720040000_settlement_dispute_partial_unique_active`.
result: [pending]

### 2. Risk-acceptance sign-off on residual platform-row (-PLAT) money-conservation gap
expected: A human with authority over this financial code either (a) explicitly accepts the verifier's risk assessment (currently unreachable via any code path today; recommend adding a defensive runtime assertion as a low-cost follow-up, not a blocker) by adding a formal `overrides:` entry to 19-VERIFICATION.md, or (b) directs a 19-07 gap-closure plan to add the runtime invariant check (`sum(lines) === 0` assertion in `computeAdjustmentLines()`) before the phase is considered fully closed.
result: [pending]

## Summary

total: 2
passed: 0
issues: 0
pending: 2
skipped: 0
blocked: 0

## Gaps
