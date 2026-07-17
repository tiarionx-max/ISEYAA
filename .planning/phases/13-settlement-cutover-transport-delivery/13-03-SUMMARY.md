---
phase: 13-settlement-cutover-transport-delivery
plan: 03
subsystem: delivery
tags: [settlement, wallet, delivery, cutover-flag, shadow-mode]

# Dependency graph
requires:
  - phase: 13-01
    provides: "ShadowSettlementComparison table + delivery.govt_levy_pct/delivery.platform_fee_pct/delivery.settlement_engine_enabled PlatformConfig rows"
provides:
  - "completeDelivery() cutover-flag-gated onto SettlementService.settle() for the rider/Ministry/platform 3-way split"
  - "Stage-2 live shadow-comparison persistence for every real delivery completion while the cutover flag is off"
affects: [13-04-shadow-verify-script]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Cutover-flag gate inside completeDelivery(): cutoverEnabled=true delegates the full wallet fan-out to SettlementService.settle() with a deterministic ISY-DLV-${orderId} reference; cutoverEnabled=false runs the legacy inline $transaction byte-for-byte plus a best-effort try/catch shadow write outside the transaction"
    - "Delivery's rider-earnings rounding stays MULTIPLY-FIRST (fee * (1 - pct/100)) in both branches — never normalized to Transport's subtract-first order"

key-files:
  created: []
  modified:
    - backend/src/modules/delivery/delivery.service.ts
    - backend/src/modules/delivery/__tests__/delivery.service.spec.ts

key-decisions:
  - "Installed backend workspace node_modules (isolated, not junctioned with main repo) and ran `npx prisma generate` in this worktree — the worktree had zero dependencies and a Prisma client whose enums lagged schema.prisma, both pre-existing environment gaps unrelated to plan content, needed only to run the plan's own tsc/jest verification commands"
  - "Consolidated the spec file's two legacy blanket-mock completeDelivery data-flow tests into two scenario-specific tests (cutoverEnabled=true / cutoverEnabled=false) per the plan's explicit replace-block instruction, rather than keeping 4 overlapping tests"

requirements-completed: [SETTLE-04, SETTLE-09]

# Metrics
duration: 34min
completed: 2026-07-17
---

# Phase 13 Plan 03: Delivery Settlement Cutover Summary

**`completeDelivery()` now delegates the rider/Ministry/platform 3-way split to `SettlementService.settle()` behind the `delivery.settlement_engine_enabled` flag, preserves the legacy inline wallet-credit path byte-for-byte when the flag is off, and records a non-blocking Stage-2 shadow comparison on every real completion pre-cutover.**

## Performance

- **Duration:** ~34 min
- **Tasks:** 2/2 completed
- **Files modified:** 2 (delivery.service.ts, delivery.service.spec.ts)

## Accomplishments

- `DeliveryService` now injects `SettlementService` (already `@Global()` via `CommonModule`, no module import-list change needed) and imports `SettlementRecipient`.
- `completeDelivery()` reads `delivery.settlement_engine_enabled` before branching:
  - **`true` branch:** builds a 2-entry `SettlementRecipient[]` (RIDER + MINISTRY), calls `settlementService.settle()` with the deterministic `ISY-DLV-${orderId}` reference (idempotency-safe replay detection per `SettlementService`'s own precheck), and mutates the order/event only inside `onSettled`/`onFailure`. No `tx.wallet.update(` call exists on this path — verified via `grep -c "tx.wallet.update"` returning exactly `1` (the sole survivor is the legacy branch's).
  - **`false`/unset branch:** unchanged legacy inline `$transaction` crediting the rider wallet directly, immediately followed by a separate best-effort `try/catch` that recomputes the same multiply-first formula and writes a `shadowSettlementComparison` row (`matched: true` when the two amounts agree) — a shadow-write failure can never roll back or block the real rider credit.
- Preserved Delivery's own multiply-first rounding order (`fee * (1 - pct/100)`) exactly in both branches, per D-01/Pitfall-1 — verified against fixture math: fee=800, govtLevyPct=5, platformFeePct=15 → riderEarnings=640, govtLevyNgn=40, matching today's fee=800/feePct=20 legacy output exactly.
- `delivery.service.spec.ts` rewritten: widened `mockPlatformConfig` to `number | boolean`, added `mockSettlement` (mirroring `studio.service.spec.ts`'s pattern) and `shadowSettlementComparison.create` to `mockPrisma`, and replaced the two legacy blanket-mock completeDelivery data-flow tests with two scenario-specific tests covering both cutover-flag states.

## Task Commits

Each task was committed atomically:

1. **Task 1: Rewire completeDelivery() onto SettlementService with cutover-flag gate + Stage-2 shadow write** — `74e3a94` (feat)
2. **Task 2: Rewrite delivery.service.spec.ts's completeDelivery coverage** — `015a3c8` (test)

_Plan metadata commit (SUMMARY.md) follows this summary._

## Files Created/Modified

- `backend/src/modules/delivery/delivery.service.ts` — `completeDelivery()` rewritten with the cutover-flag gate; `SettlementService`/`SettlementRecipient` imports added; constructor now takes `settlementService: SettlementService`.
- `backend/src/modules/delivery/__tests__/delivery.service.spec.ts` — `mockPlatformConfig` widened; `mockSettlement` + `shadowSettlementComparison` mocks added; `completeDelivery` describe block's two data-flow tests replaced with cutover-flag-state-specific coverage.

## Decisions Made

- Followed the plan's exact target shape from `13-PATTERNS.md` lines 138-212 (Delivery's mirror of Transport's Pattern 1) — no deviation from the specified formula order, reference scheme, or recipient shape.
- Kept the two pre-existing precondition-guard tests (`otpVerifiedAt` null, `proofPhotoBase64` absent) unchanged since they test dual-gate logic that runs identically before the cutover-flag branch in both paths.
- Added explicit negative assertions (`mockPrisma.$transaction` not called on the `true` path; `mockSettlement.settle` not called on the `false` path) beyond the plan's literal text, to make the branch-exclusivity acceptance criterion ("no `tx.wallet.update` outside the legacy branch") test-visible, not just grep-visible.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Worktree had no installed dependencies / stale Prisma client**
- **Found during:** Task 1 verification (`npx tsc --noEmit -p tsconfig.build.json`)
- **Issue:** `backend/node_modules` was empty (this worktree was never `npm install`-ed) and, after installing, the generated Prisma Client's enums (`TripStatus`, `VehicleType`, `TourPackageCategory`, etc.) were stale relative to `schema.prisma`, producing ~110 pre-existing type errors unrelated to `delivery.service.ts`.
- **Fix:** Ran `npm install --workspace=backend` from the worktree root, then `npx prisma generate` to regenerate the Prisma Client against the current schema. Both are environment-setup only — no tracked files changed (node_modules and generated client are gitignored).
- **Verification:** `npx tsc --noEmit -p tsconfig.build.json` returns zero errors; `npx jest delivery.service.spec --silent` passes 11/11.
- **Committed in:** N/A (environment setup only)

---

**Total deviations:** 1 environment-setup auto-fix (Rule 3 - Blocking), 0 code-behavior deviations from the plan's specified implementation.
**Impact on plan:** The auto-fix was required only to run the plan's own verification commands; it did not alter any of the plan's specified deliverables (formula order, reference scheme, recipient shape, shadow-write placement all match spec exactly).

## Issues Encountered

None beyond the environment-setup deviation documented above. Plan 13-02 (Transport cutover) executed concurrently in a sibling worktree against disjoint files (`transport.service.ts`, `transport.service.spec.ts`, `CLAUDE.md`) — no file conflicts observed.

## User Setup Required

None — no external service configuration required. This plan only touched `backend/src/modules/delivery/` service and spec files.

## Next Phase Readiness

- Plan 13-04 (shadow-verify script) can now query `shadow_settlement_comparisons` rows with `module: 'delivery'` written by every real `completeDelivery()` call while `delivery.settlement_engine_enabled` remains `false` in production.
- Flipping `delivery.settlement_engine_enabled` to `true` in `PlatformConfig` is now a safe, additive cutover — the legacy path is fully preserved and only replaced once the flag flips.

---
*Phase: 13-settlement-cutover-transport-delivery*
*Completed: 2026-07-17*

## Self-Check: PASSED

All modified files verified present on disk; both task commits (`74e3a94`, `015a3c8`) verified present in `git log --oneline -5`.
