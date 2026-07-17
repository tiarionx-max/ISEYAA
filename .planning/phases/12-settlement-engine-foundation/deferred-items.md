# Deferred Items — Phase 12 Settlement Engine Foundation

Out-of-scope discoveries logged during plan execution. Not fixed as part of the
originating plan's task scope (see plan file for boundary rationale).

## From Plan 12-03 (Tour settlement delegation to SettlementService)

- **File:** `backend/src/modules/tour-bookings/__tests__/wallet-invariant.e2e-spec.ts`
- **Issue:** Filename ends in `.e2e-spec.ts` (hyphen before `spec`), but
  `backend/jest.config.js` `testRegex` is `'.*\\.spec\\.ts$'` — which requires a
  literal `.` immediately before `spec.ts`. This file is never matched/executed
  by `npx jest` (confirmed: `npx jest src/modules/tour-bookings/__tests__/wallet-invariant.e2e-spec.ts`
  → "No tests found"). It is dead/orphaned test code, pre-existing before this
  plan (not caused by 12-03's changes).
- **Compounding factor:** even if the filename were fixed to match the test
  regex, this file's `makeService()` helper constructs `TourSettlementService`
  via `Test.createTestingModule` without providing `SettlementService`, so it
  would now fail to resolve DI after 12-03's constructor-injection change
  (the same fix applied to `tour-settlement.service.spec.ts` in Task 2 would be
  needed here too).
- **Recommendation:** rename to `wallet-invariant.spec.ts` (or add an `e2e`
  testRegex entry to `jest.config.js`) AND add the `SettlementService` real
  provider, mirroring `tour-settlement.service.spec.ts`'s `makeService()`.
  Out of scope for 12-03 since the file was never part of the executed suite
  and is not in the plan's `files_modified` list.
