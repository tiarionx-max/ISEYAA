---
phase: 18-settlement-split-centralization
reviewed: 2026-07-19T00:00:00Z
depth: standard
files_reviewed: 22
files_reviewed_list:
  - backend/jest.config.js
  - backend/prisma/migrations/20260719152059_add_settlement_split_tier/migration.sql
  - backend/prisma/schema.prisma
  - backend/scripts/__tests__/migrate-settlement-split-tiers.spec.ts
  - backend/scripts/migrate-settlement-split-tiers.ts
  - backend/src/common/services/__tests__/settlement.service.spec.ts
  - backend/src/common/services/settlement.service.ts
  - backend/src/modules/admin/__tests__/admin.service.spec.ts
  - backend/src/modules/admin/admin.controller.ts
  - backend/src/modules/admin/admin.service.ts
  - backend/src/modules/admin/dto/update-split-tier.dto.ts
  - backend/src/modules/delivery/__tests__/delivery.service.spec.ts
  - backend/src/modules/delivery/delivery.service.ts
  - backend/src/modules/events/__tests__/events.service.spec.ts
  - backend/src/modules/events/events.service.ts
  - backend/src/modules/marketplace/__tests__/marketplace.service.spec.ts
  - backend/src/modules/marketplace/marketplace.service.ts
  - backend/src/modules/stays/__tests__/stays.service.spec.ts
  - backend/src/modules/stays/stays.service.ts
  - backend/src/modules/studio/__tests__/studio.service.spec.ts
  - backend/src/modules/studio/studio.service.ts
  - backend/src/modules/transport/__tests__/transport.service.spec.ts
  - backend/src/modules/transport/transport.service.ts
findings:
  critical: 1
  warning: 4
  info: 3
  total: 8
status: issues_found
---

# Phase 18: Code Review Report

**Reviewed:** 2026-07-19T00:00:00Z
**Depth:** standard
**Files Reviewed:** 22
**Status:** issues_found

## Summary

Phase 18 centralizes settlement split-percentage resolution (`SettlementService.resolveSplit()`) and migrates transport/delivery/events/marketplace/stays/studio off ad-hoc `PlatformConfig` reads. The cutover-flag pattern, drift-tolerance math, and byte-for-byte-preserved legacy formulas are carefully done and heavily unit-tested (all six module specs assert exact pre/post-migration parity).

However, one **BLOCKER** was found: the new `SettlementSplitTier` schema's `@@unique([module, tierName])` constraint is fundamentally incompatible with `AdminService.updateSplitTier()`'s "create new active row, deactivate prior" audit-trail pattern that the controller's own docstring advertises. Every real (non-mocked) call to `PATCH /admin/settlement-splits/:id` will throw a database-level `P2002` unique-constraint violation, because the prior row is only soft-deactivated (`isActive: false`), not deleted, and a new row is created with the identical `(module, tierName)` key. This is invisible in `admin.service.spec.ts` because `$transaction`/`create` are fully mocked and never touch a real unique index. This effectively makes the admin split-tier editing feature (the whole point of D-05) non-functional against a real database.

Additional warnings cover an unused `resolveSplit()` parameter (dead tiering columns), an untyped/unvalidated admin PATCH body (mass-assignment risk), and an inconsistency in float-safety rounding of `amountKobo` between modules.

## Critical Issues

### CR-01: `SettlementSplitTier` unique constraint breaks the admin split-tier audit-trail update path

**File:** `backend/prisma/schema.prisma:710` (constraint), `backend/src/modules/admin/admin.service.ts:183-216` (`updateSplitTier`)

**Issue:**
`SettlementSplitTier` declares:

```prisma
@@unique([module, tierName])
```

`AdminService.updateSplitTier()` (and the controller docstring `admin.controller.ts:111`, "creates new active row, deactivates prior — D-05 audit trail") implements the split-tier edit flow as:

```ts
return this.prisma.$transaction(async (tx) => {
  await tx.settlementSplitTier.update({ where: { id: prior.id }, data: { isActive: false } });
  return tx.settlementSplitTier.create({
    data: {
      module: prior.module,
      tierName: prior.tierName,   // <-- identical to the row just deactivated
      ...
      isActive: true,
    },
  });
});
```

The prior row is **deactivated, not deleted** — it remains in the table with the same `(module, tierName)` pair. The subsequent `create()` call inserts a *second* row with that exact same `(module, tierName)` pair, which Postgres will reject with a unique-constraint violation (`P2002`) on `settlement_split_tiers_module_tierName_key`, since the constraint has no `isActive` component and Prisma does not support partial/filtered unique indexes via `@@unique`.

Concretely: once `migrate-settlement-split-tiers.ts` has seeded the initial `(module='transport', tierName='default')` row (which happens as part of this phase's rollout), **every subsequent call to `PATCH /admin/settlement-splits/:id` for that module will throw an unhandled `PrismaClientKnownRequestError` (P2002)**, surfacing as an uncaught 500 to the SUPER_ADMIN caller. `admin.service.spec.ts`'s "inserts a new active row and deactivates the prior row inside a transaction" test does not catch this because `mockTx.settlementSplitTier.create` is a bare `jest.fn()` with no unique-constraint semantics.

**Fix:** The constraint needs to allow multiple historical (inactive) rows per `(module, tierName)` while still giving Prisma a usable key for `findUnique`/`upsert` in the migration script. Two viable directions:

1. Replace the Prisma-level `@@unique` with a Postgres **partial unique index** (`CREATE UNIQUE INDEX ... ON settlement_split_tiers(module, tierName) WHERE "isActive" = true;`), added via a raw SQL migration, and drop `tierName` from `resolveSplit()`'s filter (already filters on `isActive: true`) so a `findFirst({ where: { module, isActive: true } })` remains a safe, singular lookup. The migration script's `upsert` `where: { module_tierName: ... } }` would then need to become a `findFirst` + conditional `create`/`update`, since Prisma can no longer generate a compound `where` against a partial index.
2. Keep the current unique constraint but change `updateSplitTier()` to hard-delete (or actually version the `tierName`, e.g. `default-v{n}`) instead of soft-deactivating, if a full audit trail of every historical split is not actually required.

Either way, add an integration/e2e-level test (or at minimum wire a real SQLite/Postgres test DB) that exercises `updateSplitTier()` twice in a row against a real unique index — the current mocked unit test provides false confidence.

## Warnings

### WR-01: Mass-assignment risk on `PATCH /admin/studio/slots/:id` — no DTO/class-validator whitelist

**File:** `backend/src/modules/admin/admin.controller.ts:81-88`, `backend/src/modules/admin/admin.service.ts:156-158`

**Issue:** `updateStudioSlot` takes `@Body() data: { isActive?: boolean; isGovernmentPriority?: boolean; pricePerHour?: number }` — a plain TypeScript type annotation, not a `class-validator`-decorated DTO class. NestJS's global `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true })` only strips/validates properties when the target parameter type is a class with reflectable metadata; a bare object-literal type is passed through untouched. `AdminService.updateStudioSlot(id, data)` then forwards `data` verbatim into `this.prisma.studioSlot.update({ where: { id }, data })` with no field allowlisting at the service layer either. A caller (SUPER_ADMIN or LGA_ADMIN — the latter a lower-trust role in this app's hierarchy) can smuggle arbitrary extra fields (e.g. `deletedAt: null`, `metadata`, or any other `StudioSlot` column) into the same request body and have them written straight to the row.

**Fix:** Introduce a real `UpdateStudioSlotDto` class with `@IsOptional() @IsBoolean()` / `@IsOptional() @IsNumber()` decorators (mirroring `UpdateSplitTierDto`'s pattern already used elsewhere in this same file), and use it in place of the inline type. This restores whitelist stripping and type coercion for this endpoint.

### WR-02: `resolveSplit()`'s `amountNgn` parameter is unused — tiering columns are dead

**File:** `backend/src/common/services/settlement.service.ts:339-365`

**Issue:** `resolveSplit(module: string, amountNgn: number)` never reads `amountNgn` — the query is `findFirst({ where: { module, isActive: true, tierName: 'default' }, orderBy: { effectiveFrom: 'desc' } })`, ignoring the amount entirely. Meanwhile the `SettlementSplitTier` model carries `minAmountNgn`/`maxAmountNgn` columns (`schema.prisma:699-700`) that strongly imply amount-based tier selection (e.g. progressive commission bands) was intended. Every call site (transport, delivery, events, marketplace, stays, studio) computes and threads a real amount (`fare`, `fee`, `ticketPrice`, `total`) into this call purely to have it discarded. If an operator ever populates `minAmountNgn`/`maxAmountNgn` on a second tier row expecting amount-based routing to kick in, it will silently never be honored — a plausible future misconfiguration with no test or runtime guard against it.

**Fix:** Either (a) implement the amount-range filter now (`minAmountNgn <= amountNgn AND (maxAmountNgn IS NULL OR maxAmountNgn > amountNgn)`), or (b) if amount-tiering is deliberately out of scope for this phase, add a code comment on the `resolveSplit()` signature stating the parameter is reserved/unused for MVP, and consider marking `minAmountNgn`/`maxAmountNgn` as unused-for-now in the schema comment so future readers don't assume the feature already works.

### WR-03: Inconsistent float-drift guard on `amountKobo` passed into `SettlementService.settle()`

**File:** `backend/src/modules/events/events.service.ts:269`, `backend/src/modules/marketplace/marketplace.service.ts:288`, `backend/src/modules/studio/studio.service.ts:188` vs. `backend/src/modules/transport/transport.service.ts:596`, `backend/src/modules/delivery/delivery.service.ts:627`

**Issue:** `transport.service.ts` and `delivery.service.ts` both wrap their `amountKobo` computation with `Math.round(fare * 100)` / `Math.round(fee * 100)`, explicitly commented `// WR-03: avoid IEEE-754 float drift crossing into SettlementService`. The other three call sites that were migrated in this same phase do **not** apply the same guard:

```ts
// events.service.ts:269
amountKobo: ticketPrice * 100,
// marketplace.service.ts:288
amountKobo: Number(order.totalAmount) * 100,
// studio.service.ts:188
amountKobo: total * 100,
```

Any of `ticketPrice`, `order.totalAmount`, or `total` derived from a Prisma `Decimal` with a fractional NGN value (e.g. ₦19.99) can produce IEEE-754 noise when multiplied by 100 in JS (`19.99 * 100 !== 1999` exactly, in general). `SettlementService.settle()`'s drift-tolerance assert (`±₦0.02`) makes this unlikely to trip in practice, but it's precisely the class of bug the sibling modules' own `WR-03` comment was written to prevent, and its absence here is an inconsistency introduced by this same migration, not merely inherited pre-existing code.

**Fix:** Apply `Math.round(x * 100)` uniformly at all five `settle()` call sites for consistency and defense-in-depth, matching the pattern already established (and commented) in transport/delivery.

### WR-04: `resolveMinistryWallet()` reads a `tour.*`-prefixed config key even though `SettlementService` is now shared by six modules

**File:** `backend/src/common/services/settlement.service.ts:328-335`

**Issue:** `resolveMinistryWallet()` resolves the single shared Ministry wallet via `PlatformConfig.findUnique({ where: { key: 'tour.government_wallet_user_id' } })`. This key name is a holdover from the original `TourSettlementService` this engine was generalized from (per the file's own architectural-commitments comment), but `SettlementService` is now invoked by transport, delivery, events, marketplace, stays, and studio — none of which are "tour". A future maintainer skimming `PlatformConfig` rows or writing a new module integration could reasonably assume a module-scoped key exists (e.g. `transport.government_wallet_user_id`) and be confused when it doesn't, or accidentally create a duplicate/unused key.

**Fix:** Rename the config key to something module-agnostic (e.g. `settlement.ministry_wallet_user_id`) with a one-time data migration, or at minimum add an inline comment at the call site explicitly noting the key name is legacy-named but intentionally shared across all modules, to head off confusion.

## Info

### IN-01: `migrate-settlement-split-tiers.ts`'s `main()` duplicates `migrateModule()`'s upsert call

**File:** `backend/scripts/migrate-settlement-split-tiers.ts:139-182`

**Issue:** `migrateModule(module)` and `main()` both build and issue an essentially identical `prisma.settlementSplitTier.upsert({...})` call independently, rather than `main()` looping over `migrateModule()`. This appears intentional (the file's own comment explains `main()` must compute every module's split *before* writing any of them, for all-or-nothing atomicity, which `migrateModule()` alone doesn't provide), but it still means the upsert shape has to be kept in sync by hand in two places.

**Fix:** Extract a small shared `writeTier(module, split)` helper used by both `migrateModule()` and `main()`'s write loop, so the upsert payload only needs to change in one place.

### IN-02: Redundant `@ValidateIf` + `@IsOptional()` combination on `platformPct`

**File:** `backend/src/modules/admin/dto/update-split-tier.dto.ts:19-25`

**Issue:**
```ts
@ValidateIf((o) => o.platformPct !== null)
@IsNumber()
@IsOptional()
@Min(0)
@Max(1)
platformPct?: number | null;
```
`class-validator`'s `@IsOptional()` already skips all validators on a property when its value is `null` or `undefined`, making the `@ValidateIf((o) => o.platformPct !== null)` guard redundant in practice (both mechanisms produce the same "skip validation for `null`" outcome). It's not incorrect, but it reads as if the two decorators are doing different jobs when they overlap, which can mislead a future editor into thinking removing one changes behavior.

**Fix:** Either drop the `@ValidateIf` guard (relying solely on `@IsOptional()`'s built-in null/undefined handling) or add a one-line comment explaining why both are kept (e.g. if there was a specific `class-validator` version issue that motivated the belt-and-suspenders approach).

### IN-03: Authorization failure surfaced as `BadRequestException` instead of `ForbiddenException`

**File:** `backend/src/modules/studio/studio.service.ts:276-278`

**Issue:** `publishContent()`'s ownership check —
```ts
if (content.uploadedById !== userId) {
  throw new BadRequestException('Not your content');
}
```
— is semantically an authorization failure (403) but is thrown as a 400. Every other ownership check reviewed in this phase's files (`events.service.ts`, `stays.service.ts`, `marketplace.service.ts`, `transport.service.ts`) correctly uses `ForbiddenException` for the identical pattern (`Not your event` / `Not your property` / `Not your product`), making this one inconsistent with the codebase's own convention.

**Fix:** Change to `throw new ForbiddenException('Not your content')` for consistency with sibling modules' ownership checks.

---

_Reviewed: 2026-07-19T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
