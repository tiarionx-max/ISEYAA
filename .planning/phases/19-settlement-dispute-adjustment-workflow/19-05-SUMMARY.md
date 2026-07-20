---
phase: 19-settlement-dispute-adjustment-workflow
plan: 05
subsystem: payments
tags: [prisma, nestjs, jest, settlement, partial-unique-index, money-conservation]

# Dependency graph
requires:
  - phase: 19-settlement-dispute-adjustment-workflow (19-01 through 19-04)
    provides: SettlementDisputesService state machine (raise/moveToReview/resolve/dismiss), SettlementService.adjust() compensating-adjustment primitive, 19-VERIFICATION.md/19-REVIEW.md gap findings (CR-01/CR-02/CR-03)
provides:
  - Money-conserving computeAdjustmentLines() — platform wallet is now always included in the dispute-resolution diff, every non-empty lines array sums to exactly 0
  - Database-enforced "at most one active dispute per settlement" invariant via a partial unique index, closing the raise() TOCTOU race
  - dto.module cross-check in raise() against the settlement's actually-recorded metadata.module, rejecting mismatches before any dispute row is created
affects: [19-VERIFICATION (re-run), REQUIREMENTS.md SETTLE-10a/10c/10e checkbox update]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Self-balancing platform-wallet correction: correctPlatformTotal = chargeAmountNgn - correctEarnerTotal - correctMinistryTotal (mirrors settle()'s own drift-absorption formula), never platformPct directly"
    - "Partial unique index for 'at most one active row' invariants, added via raw-SQL migration (Postgres/Prisma can't express partial unique as @@unique) — now used twice (SettlementSplitTier 19-18, SettlementDispute here)"
    - "P2002-to-domain-exception translation in application code, matching the pre-check's exception type so callers see one consistent error contract regardless of which guard actually caught the race"

key-files:
  created:
    - backend/prisma/migrations/20260720040000_settlement_dispute_partial_unique_active/migration.sql
  modified:
    - backend/src/modules/settlement-disputes/settlement-disputes.service.ts
    - backend/src/modules/settlement-disputes/__tests__/settlement-disputes.service.spec.ts
    - backend/src/modules/settlement-disputes/__tests__/settlement-disputes.e2e-spec.ts
    - backend/prisma/schema.prisma

key-decisions:
  - "Platform-wallet balancing line is pushed as the LAST line in computeAdjustmentLines() (after ministry, after earner block), preserving the existing -ADJ-${n} write-order numbering convention"
  - "The DB-level P2002 catch in raise() does not inspect err.meta?.target (unlike settle()/adjust()) because settlement_disputes has only one unique constraint reachable from create() — the new partial index; the id primary key is a collision-free UUID"
  - "A settlement Transaction row with metadata.module absent/null is NOT rejected by the CR-03 cross-check — only an explicit, present mismatch is a validation failure, preserving backward compatibility with any pre-existing rows"

patterns-established:
  - "Money-conservation as an explicit test assertion: every adjustment-lines test that produces non-empty lines now asserts sum(deltaNgn) === 0, not just individual line values"

requirements-completed: [SETTLE-10a, SETTLE-10c, SETTLE-10e]

# Metrics
duration: 20min
completed: 2026-07-20
---

# Phase 19 Plan 05: Gap Closure — CR-01/CR-02/CR-03 Summary

**Platform-wallet self-balancing in dispute resolution diffs, DB-enforced one-active-dispute-per-settlement partial unique index, and a module cross-check that rejects mismatched disputes before any row is written**

## Performance

- **Duration:** ~20 min (10:20 plan-load to 10:40 final commit)
- **Started:** 2026-07-20T10:20:58-05:00
- **Completed:** 2026-07-20T10:40:39-05:00
- **Tasks:** 3/3 completed
- **Files modified:** 5 (1 created, 4 modified)

## Accomplishments

- Closed CR-01 (BLOCKER): `computeAdjustmentLines()` now derives `correctPlatformTotal` self-balancingly and pushes a platform delta line whenever the correction is >= ₦0.01 — every non-empty `lines` result now sums to exactly 0, proving money is reallocated (never created/destroyed) across earner/ministry/platform on every dispute resolution
- Closed CR-02 (BLOCKER): new partial unique index `settlement_disputes_active_per_reference` makes "at most one active dispute per settlement" a database-enforced invariant; `raise()` catches the resulting P2002 and translates it into the same `ConflictException` the application-level pre-check already throws, so the race and the pre-check are indistinguishable to callers
- Closed CR-03 (BLOCKER): `raise()` now cross-checks `dto.module` against the settlement's actually-recorded `metadata.module` and rejects a mismatch with `BadRequestException` before the active-dispute check or any row creation runs; settlements with no recorded module are unaffected
- All 3 previously-passing truths (state machine transitions, insufficient-balance BLOCKED path, audit logging) remain green — zero regressions across the full 680-test backend suite

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix CR-01 — computeAdjustmentLines() platform-wallet balancing + money-conservation tests** - `c179a89` (feat)
2. **Task 2: Fix CR-02 (DB-enforced one-active-dispute-per-settlement) + CR-03 (module cross-check) in raise()** - `f2dc4e0` (feat)
3. **Task 3: End-to-end regression — update real-service e2e scenarios for the CR-01 platform line, full-suite regression check** - `cf6d095` (test)

**Plan metadata:** committed alongside this SUMMARY (docs, worktree mode — orchestrator merges and updates STATE.md/ROADMAP.md centrally)

## Files Created/Modified

- `backend/src/modules/settlement-disputes/settlement-disputes.service.ts` - `computeAdjustmentLines()` platform-wallet balancing line; `raise()` module cross-check + P2002-to-ConflictException translation
- `backend/src/modules/settlement-disputes/__tests__/settlement-disputes.service.spec.ts` - Money-conservation assertions across `computeAdjustmentLines()`/`resolve()`; 3 new `raise()` tests (P2002 race, module mismatch, legacy no-module row)
- `backend/src/modules/settlement-disputes/__tests__/settlement-disputes.e2e-spec.ts` - Platform-wallet-balance assertions in Scenarios 1 (happy path) and 2 (BLOCKED-retry); Scenario 3 (dismiss) left unmodified
- `backend/prisma/schema.prisma` - Doc comment above `SettlementDispute`'s `@@index([settlementReference])` explaining the partial-unique-index precedent
- `backend/prisma/migrations/20260720040000_settlement_dispute_partial_unique_active/migration.sql` - New partial unique index enforcing at most one active dispute per settlementReference

## Decisions Made

- Platform-wallet line placement: pushed last (after ministry and earner lines) to preserve the existing `-ADJ-${n}` write-order numbering convention that `adjust()` relies on
- P2002 catch in `raise()` skips `err.meta?.target` inspection (unlike `settle()`/`adjust()`) since `settlement_disputes` has exactly one unique constraint reachable from `create()` — the new partial index
- Module-mismatch check is unconditional-on-presence: absent/null `metadata.module` is not rejected, only an explicit mismatch is, preserving backward compatibility with pre-existing rows

## Deviations from Plan

None - plan executed exactly as written across all 3 tasks. All acceptance criteria grep checks matched the plan's exact expected counts (`correctPlatformTotal`, `platformRow?.walletId`, `WAL_PLATFORM` x5+, `BadRequestException` x2, `Prisma.PrismaClientKnownRequestError` x1, `CREATE UNIQUE INDEX` x1, `WHERE "status" IN (...)` x1, `SYSTEM_WALLET_ID` x4, `platformAdj` x8).

## Issues Encountered

- **Worktree had no `node_modules`** (not installed for this parallel worktree). Resolved by symlinking `node_modules` and `backend/node_modules` to the main repo's already-installed copies (`ln -s`) rather than re-running a full `npm install` — faster and avoids duplicate downloads across concurrently-running worktree agents. These symlinks are gitignored and not part of any commit.
- **`npx prisma migrate dev` against the real dev database was blocked by the sandbox's auto-mode classifier** ("Modify Shared Resources" — the action would apply a real migration against the shared, persistent Neon/local Postgres instance from the shared root `.env`, not an isolated test DB). Per the classifier's instructions, I did not attempt a workaround. All migration-file-level acceptance criteria were verified instead: `npx prisma validate` passed (schema.prisma comment-only edit did not break the schema), `npx prisma migrate status` confirmed the new migration `20260720040000_settlement_dispute_partial_unique_active` is the only pending migration (17 already applied, matching file content exactly), and the migration SQL was read back and grep-verified against both required acceptance-criteria patterns. **Applying this migration to the shared dev database is a deferred human/operator action** — flagging this for the orchestrator/user to run `npx prisma migrate deploy` (or `migrate dev`) once this plan's worktree is merged.

## User Setup Required

**Manual migration deploy required.** The new migration `backend/prisma/migrations/20260720040000_settlement_dispute_partial_unique_active/migration.sql` has NOT been applied to the shared dev/production database — it exists only as a file in this commit. Before this fix takes effect at the database level (the CR-02 DB-backstop is otherwise dormant), run:
```bash
cd backend && npx prisma migrate deploy
```
Verification: `npx prisma migrate status` should report no pending migrations, and attempting to `INSERT` two active `SettlementDispute` rows for the same `settlementReference` should raise a unique-constraint violation.

## Next Phase Readiness

- All 3 CRITICAL gaps from `19-VERIFICATION.md` (score 3/5) and `19-REVIEW.md` (CR-01/CR-02/CR-03) are closed at the code+test level; a re-verification pass (`/gsd-verify-phase 19` or equivalent) should re-confirm all 5/5 must-haves once the migration above is applied
- Per the plan's own verification note, `.planning/REQUIREMENTS.md`'s `SETTLE-10a`/`SETTLE-10c`/`SETTLE-10e` checkboxes should be updated to reflect the true post-fix state during that re-verification step — not by this gap-closure plan itself, to avoid pre-emptively marking gaps closed before independent confirmation
- No blockers for merge; the only outstanding action is the deferred migration deploy documented above

---
*Phase: 19-settlement-dispute-adjustment-workflow*
*Completed: 2026-07-20*
