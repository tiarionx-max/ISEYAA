# Phase 18: Settlement Split Centralization - Pattern Map

**Mapped:** 2026-07-19
**Files analyzed:** 15 (1 schema, 1 migration script, 1 service, 6 call sites, 2 admin files, 1 DTO, 3 test files/extensions)
**Analogs found:** 15 / 15 (all files have a strong in-repo analog — this phase is a pure mechanical refactor of existing patterns, no new architecture)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|-----------------|---------------|
| `backend/prisma/schema.prisma` (+`SettlementSplitTier` model) | model | CRUD | `PlatformConfig` model (same file, line 682) + `ShadowSettlementComparison` (line 695) | exact |
| `backend/scripts/migrate-settlement-split-tiers.ts` | utility (one-off migration) | batch | `backend/scripts/shadow-settlement-verify.ts` | exact |
| `backend/src/common/services/settlement.service.ts` (+`resolveSplit()`, +NaN guard) | service | request-response | `resolveMinistryWallet()` in the same file (line 321) | exact |
| `backend/src/modules/transport/transport.service.ts` (call site) | service | CRUD | itself (existing `cutoverEnabled` block, lines 554-568) | exact (self-modify) |
| `backend/src/modules/delivery/delivery.service.ts` (call site) | service | CRUD | itself (lines 590-597) | exact (self-modify) |
| `backend/src/modules/marketplace/marketplace.service.ts` (call site) | service | event-driven (`@OnEvent`) | itself (lines 192-196) | exact (self-modify) |
| `backend/src/modules/events/events.service.ts` (call site) | service | event-driven (`@OnEvent`) | itself (lines 246-249) | exact (self-modify) |
| `backend/src/modules/stays/stays.service.ts` (call site — booking creation) | service | CRUD (snapshot-at-write) | itself (line 192) | exact (self-modify) |
| `backend/src/modules/studio/studio.service.ts` (call site) | service | event-driven (`@OnEvent`) | itself (lines 172-175) | exact (self-modify) |
| `backend/src/modules/admin/admin.controller.ts` (+2 routes) | controller | request-response | `getConfig()`/`setConfig()` routes in same file (lines 89-99) | exact |
| `backend/src/modules/admin/admin.service.ts` (+2 methods) | service | CRUD | `getConfig()`/`setConfig()` in same file (lines 161-171) | exact |
| `backend/src/modules/admin/dto/update-split-tier.dto.ts` (new) | model (DTO) | request-response | `backend/src/modules/events/dto/create-event.dto.ts` | role-match |
| `backend/src/common/services/__tests__/settlement.service.spec.ts` (extend) | test | request-response | itself (existing Scenarios A-J, header lines 1-90) | exact |
| `backend/scripts/__tests__/migrate-settlement-split-tiers.spec.ts` (new) | test | batch | `backend/scripts/shadow-settlement-verify.ts` (structure to test against) | role-match |
| 6× `backend/src/modules/*/__tests__/*.service.spec.ts` (extend) | test | CRUD/event-driven | `backend/src/modules/transport/__tests__/transport.service.spec.ts` (existing) | exact |

## Pattern Assignments

### `backend/prisma/schema.prisma` (model, CRUD)

**Analog:** `PlatformConfig` model (line 682) and `ShadowSettlementComparison` model (line 695) — both colocated, both use the project's UUID-PK + `@@map(snake_case)` convention.

**Existing model style to copy** (lines 682-707):
```prisma
model PlatformConfig {
  id        String    @id @default(uuid())
  key       String    @unique
  value     Json
  isPublic  Boolean   @default(false)
  metadata  Json?
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
  deletedAt DateTime?

  @@map("platform_configs")
}

model ShadowSettlementComparison {
  id              String   @id @default(uuid())
  module          String // 'transport' | 'delivery'
  sourceId        String // Trip.id or DeliveryOrder.id this comparison is for
  oldEarnerAmount Decimal
  newEarnerAmount Decimal
  matched         Boolean
  comparedAt      DateTime @default(now())

  @@index([module, comparedAt])
  @@index([module, matched])
  @@map("shadow_settlement_comparisons")
}
```

**Related decimal-percentage columns to match numeric type** (`Booking.govtLevyPct` line 472, `Vendor.govtLevyPct` line 500):
```prisma
govtLevyPct      Decimal       @default(0.05)   // Booking — 0-1 fraction
govtLevyPct    Decimal      @default(0)          // Vendor — 0-1 fraction
```
Use `Decimal` (not `Float`) for `earnerPct`/`ministryPct`/`platformPct` — matches every existing percentage column in the schema, avoids IEEE-754 drift on money-adjacent config.

**New model to add** (place directly after `PlatformConfig`, colocated per RESEARCH.md's Recommended Project Structure):
```prisma
model SettlementSplitTier {
  id            String    @id @default(uuid())
  module        String    // 'transport' | 'delivery' | 'events' | 'marketplace' | 'stays' | 'studio'
  tierName      String    @default("default")
  minAmountNgn  Decimal?
  maxAmountNgn  Decimal?
  earnerPct     Decimal
  ministryPct   Decimal
  platformPct   Decimal?
  isActive      Boolean   @default(true)
  effectiveFrom DateTime  @default(now())
  metadata      Json?
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  @@unique([module, tierName])
  @@index([module, isActive])
  @@map("settlement_split_tiers")
}
```
Note: D-05 requires insert-new-row/deactivate-old semantics on update (never delete/overwrite) — the `@@unique([module, tierName])` constraint means the admin `updateSplitTier()` service method (not the schema) must enforce "only one active row per (module, tierName)" at the application level, since Prisma can't express a partial-unique-on-active-only index without a raw migration addition (out of scope, per RESEARCH.md Open Question 2).

Run `npx prisma migrate dev --name add_settlement_split_tier` from `backend/` to generate the migration — do not hand-write the migration SQL (matches how every other model in this schema was added).

---

### `backend/scripts/migrate-settlement-split-tiers.ts` (utility, batch)

**Analog:** `backend/scripts/shadow-settlement-verify.ts` (full file read — this is the only existing one-off script in `backend/scripts/`, and its shape is the exact precedent to copy: raw `PrismaClient` import, no NestJS DI, `if (require.main === module)` runner guard, `.finally(() => prisma.$disconnect())`).

**Imports + top-of-file structure pattern** (lines 1-17):
```typescript
// ── Stage 1 shadow-mode batch verification script (SETTLE-09) ──────────────
// [comment block explaining purpose, critical constraints, and source pattern]
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
```

**Runner-guard pattern** (lines 136-142):
```typescript
if (require.main === module) {
  Promise.all([verifyTransportShadow(), verifyDeliveryShadow()])
    .then(([transportOk, deliveryOk]) => {
      process.exitCode = transportOk && deliveryOk ? 0 : 1;
    })
    .finally(() => prisma.$disconnect());
}
```

**Per-module read pattern to copy exactly** (Transport, lines 30-38 — this is the SAME `platformConfig.findUnique()` pair the new script must read from, before writing to `SettlementSplitTier`):
```typescript
const govtLevyCfg = await prisma.platformConfig.findUnique({
  where: { key: 'transport.govt_levy_pct' },
});
const platformFeeCfg = await prisma.platformConfig.findUnique({
  where: { key: 'transport.platform_fee_pct' },
});
const govtLevyPct = govtLevyCfg ? Number(govtLevyCfg.value) : 5;
const platformFeePct = platformFeeCfg ? Number(platformFeeCfg.value) : 10;
```

**Full recommended implementation** — RESEARCH.md's `## Code Examples` section already contains a complete, ready-to-adapt script (the `MODULE_CONFIG` table + `main()` loop with `Number.isFinite()` guard + idempotent `upsert()`). Copy that shape directly; it already follows this analog's conventions. **Caveat the planner must resolve concretely** (RESEARCH.md flags this explicitly): confirm `earnerPct` derivation per module against each call site's actual `recipients` array before finalizing — Studio has NO earner recipient today (only `MINISTRY` — see `studio.service.ts:187-195` excerpt below), so its `SettlementSplitTier.earnerPct` should be set to `0` explicitly (not derived), per RESEARCH.md's Open Question 1 recommendation.

**Idempotent upsert pattern (from RESEARCH.md, matches `AdminService.setConfig()`'s upsert style below):**
```typescript
await prisma.settlementSplitTier.upsert({
  where: { module_tierName: { module, tierName: 'default' } },
  update: {}, // do not overwrite if already migrated — script is idempotent
  create: { module, tierName: 'default', earnerPct, ministryPct, platformPct: finalPlatformPct, isActive: true },
});
```

---

### `backend/src/common/services/settlement.service.ts` — add `resolveSplit()` (service, request-response)

**Analog:** `resolveMinistryWallet()` in the same file (lines 321-328) — the exact "always fresh, never cached, throw-loud-on-missing" precedent named by CONTEXT.md D-05/RESEARCH.md as the pattern to mirror.

**Pattern to copy exactly:**
```typescript
// ── Ministry wallet resolution — always fresh, never cached (Pitfall 2) ────

async resolveMinistryWallet(): Promise<{ id: string } | null> {
  const cfg = await this.prisma.platformConfig.findUnique({
    where: { key: 'tour.government_wallet_user_id' },
  });
  const userId = (cfg?.value as string | null | undefined) ?? null;
  if (!userId) return null;
  return this.prisma.wallet.findUnique({ where: { userId }, select: { id: true } });
}
```

**New `resolveSplit()` — place immediately after `resolveMinistryWallet()`, same "── Section ──" comment-divider convention used throughout this file:**
```typescript
// ── Split-tier resolution — always fresh, never cached (mirrors resolveMinistryWallet) ─

async resolveSplit(module: string, amountNgn: number): Promise<{
  earnerPct: number;
  ministryPct: number;
  platformPct: number | null;
}> {
  const tier = await this.prisma.settlementSplitTier.findFirst({
    where: { module, isActive: true, tierName: 'default' },
    orderBy: { effectiveFrom: 'desc' },
  });
  if (!tier) {
    throw new Error(`No active SettlementSplitTier found for module="${module}" — refusing to settle with an undefined split`);
  }
  const earnerPct = Number(tier.earnerPct);
  const ministryPct = Number(tier.ministryPct);
  const platformPct = tier.platformPct != null ? Number(tier.platformPct) : null;
  if (!Number.isFinite(earnerPct) || !Number.isFinite(ministryPct) || (platformPct !== null && !Number.isFinite(platformPct))) {
    throw new Error(`Malformed SettlementSplitTier for module="${module}" (id=${tier.id}) — non-finite percentage value, refusing to settle`);
  }
  return { earnerPct, ministryPct, platformPct };
}
```
(`amountNgn` param is accepted but unused this phase — reserved for SETTLE-11e amount-based tiering, per D-05/deferred scope. Keep the signature forward-compatible per RESEARCH.md's explicit method-signature recommendation.)

**Error-handling pattern to match:** This file never uses NestJS `HttpException` subclasses inside `SettlementService` itself — it throws plain `Error` and lets `handleSettlementFailure()` catch/log/refund at the call boundary (see lines 108-116, 125-131, 138-144 for the existing "compute → validate → throw plain Error → call `handleSettlementFailure`" pattern). `resolveSplit()` should follow the same plain-`Error`-throw convention (not a NestJS exception), since it is not itself an HTTP-boundary method.

**SETTLE-11d NaN guard — add inside the existing loop at lines 108-116** (Negative-amount check is the analog; extend it, don't replace it):
```typescript
// EXISTING (lines 108-116) — extend with a sibling check, do not remove:
for (const r of input.recipients) {
  if (!Number.isFinite(r.amountNgn)) {
    const err = new Error(
      `Non-finite recipient amount for ${r.tag} (${r.refSuffix}), module=${input.module}, ref=${input.reference}) — programming error (NaN/Infinity reached settle())`,
    );
    await this.handleSettlementFailure(input, err);
    throw err;
  }
  if (r.amountNgn < 0) {
    // existing check, unchanged
    const err = new Error(
      `Negative recipient amount for ${r.tag} (${r.refSuffix}), module=${input.module}, ref=${input.reference}) — programming error`,
    );
    await this.handleSettlementFailure(input, err);
    throw err;
  }
}
```

---

### 6 call sites — mechanical migration pattern (service, CRUD/event-driven)

**Shared pattern across all 6:** every call site currently does 1-2 `this.prisma.platformConfig.findUnique({ where: { key: '<module>.<name>_pct' } })` calls immediately before building the `SettlementRecipient[]` array and calling `this.settlementService.settle(...)`. The migration replaces only the read block — the recipients array shape and `settle()` call are byte-for-byte unchanged.

#### `backend/src/modules/transport/transport.service.ts` (lines 556-568, inside `completeTrip()`'s `cutoverEnabled` branch)

**Current read pattern (to be replaced):**
```typescript
const levyCfg = await this.prisma.platformConfig.findUnique({
  where: { key: 'transport.govt_levy_pct' },
});
const govtLevyPct = levyCfg ? Number(levyCfg.value) : 5;
const platformFeeCfg = await this.prisma.platformConfig.findUnique({
  where: { key: 'transport.platform_fee_pct' },
});
const platformFeePct = platformFeeCfg ? Number(platformFeeCfg.value) : 10;

// D-01/Pitfall-1: SUBTRACT-FIRST — must match today's exact formula order.
const totalCommissionPct = govtLevyPct + platformFeePct;
totalCommission = Math.round(fare * (totalCommissionPct / 100) * 100) / 100;
driverEarnings = Math.round((fare - totalCommission) * 100) / 100;
const govtLevyNgn = Math.round(fare * (govtLevyPct / 100) * 100) / 100;
```
**Critical: preserve subtract-first rounding order exactly.** Only the config-lookup lines change; `resolveSplit()` returns a 0-1 fraction (D-03) so downstream math must convert `* 100` where the existing code expects whole-number percent, per RESEARCH.md Pattern 2's worked example.

#### `backend/src/modules/delivery/delivery.service.ts` (lines 590-602, inside `completeDelivery()`'s `cutoverEnabled` branch)

**Current read pattern (to be replaced):**
```typescript
const levyCfg = await this.prisma.platformConfig.findUnique({
  where: { key: 'delivery.govt_levy_pct' },
});
const platformFeeCfg = await this.prisma.platformConfig.findUnique({
  where: { key: 'delivery.platform_fee_pct' },
});
const govtLevyPct = levyCfg ? Number(levyCfg.value) : 5;
const platformFeePct = platformFeeCfg ? Number(platformFeeCfg.value) : 15;
const totalCommissionPct = govtLevyPct + platformFeePct; // = 20, matches today's feePct

riderEarnings = Math.round(fee * (1 - totalCommissionPct / 100) * 100) / 100;
totalCommission = Math.round((fee - riderEarnings) * 100) / 100;
const govtLevyNgn = Math.round(fee * (govtLevyPct / 100) * 100) / 100;
```
**Critical: preserve MULTIPLY-FIRST rounding order — do NOT normalize to Transport's subtract-first order** (explicit Anti-Pattern in RESEARCH.md, Pitfall 1).

#### `backend/src/modules/marketplace/marketplace.service.ts` (lines 189-196, inside `handleOrderPayment()`)

**Current read pattern (to be replaced) — D-02: keep `vendor.govtLevyPct` read as-is, only replace `platformFeePct`:**
```typescript
// Fetch fee config from platform_config — NEVER hardcode. Key follows the
// `module.key_name` convention used by every other module in this phase.
const feeConfig = await this.prisma.platformConfig.findUnique({
  where: { key: 'marketplace.platform_fee_pct' },
});
const platformFeePct = feeConfig ? Number(feeConfig.value) : 0.10;
const govtLevyPct = Number(vendor.govtLevyPct); // D-02 — UNCHANGED, do not route through resolveSplit()
```
`resolveSplit('marketplace', total)` replaces only the `feeConfig` read; `vendor.govtLevyPct` stays a direct Prisma read exactly as today (D-02 explicit constraint).

#### `backend/src/modules/events/events.service.ts` (lines 246-249, inside a `@OnEvent('payment.ticket_purchase')` handler)

**Current read pattern (to be replaced):**
```typescript
const feeCfg = await this.prisma.platformConfig.findUnique({ where: { key: 'events.platform_fee_pct' } });
const platformFeePct = feeCfg ? Number(feeCfg.value) : 0.1;
const levyCfg = await this.prisma.platformConfig.findUnique({ where: { key: 'events.govt_levy_pct' } });
const govtLevyPct = levyCfg ? Number(levyCfg.value) : 0.05;
const ticketPrice = Number(ticket.ticketType.price);
const govtLevyNgn = +(ticketPrice * govtLevyPct).toFixed(2);
const platformFeeNgn = +(ticketPrice * platformFeePct).toFixed(2);
const organiserAmountNgn = +(ticketPrice - platformFeeNgn - govtLevyNgn).toFixed(2);
```
Already 0-1 fractions (matches D-03's canonical unit) — no conversion needed, straight swap of the two `findUnique()` calls for one `resolveSplit('events', ticketPrice)` call.

#### `backend/src/modules/stays/stays.service.ts` (line 192, inside booking-creation method — **NOT** inside `releaseEscrow()`)

**Current read pattern (to be replaced) — CRITICAL PLACEMENT WARNING:**
```typescript
const levyCfg = await this.prisma.platformConfig.findUnique({ where: { key: 'stays.govt_levy_pct' } });
const govtLevyPct = levyCfg ? Number(levyCfg.value) : 0.05;
// ... stored into booking.create({ data: { ..., govtLevyPct, ... } })  (line 225)
```
`resolveSplit('stays', totalPrice)` replaces this read **at booking-creation time only**. Do NOT move the call into `releaseEscrow()` (lines 325-381) — `releaseEscrow()`'s existing read of the stored `booking.govtLevyPct` (line 350) must remain completely unchanged:
```typescript
// releaseEscrow() — leave this exactly as-is, do not add a resolveSplit() call here:
const govtLevyPct = Number(booking.govtLevyPct);
const govtLevyNgn = +(total * govtLevyPct).toFixed(2);
const hostAmountNgn = +(total - govtLevyNgn).toFixed(2);
```
This is the one call site where the resolver call site and the `settle()` call site are in two different methods, separated by a `@Cron`-driven delay — see RESEARCH.md's "Pitfall: Stays' Snapshot-at-Booking-Time Pattern" for the full rationale.

#### `backend/src/modules/studio/studio.service.ts` (lines 172-175, inside `@OnEvent('payment.studio_booking')` handler)

**Current read pattern (to be replaced) — D-01: `platformFeePct` fetched but never applied to the split math:**
```typescript
const feeCfg = await this.prisma.platformConfig.findUnique({ where: { key: 'studio.platform_fee_pct' } });
const platformFeePct = feeCfg ? Number(feeCfg.value) : 0.10;
const levyCfg = await this.prisma.platformConfig.findUnique({ where: { key: 'studio.govt_levy_pct' } });
const govtLevyPct = levyCfg ? Number(levyCfg.value) : 0.05;
const total = Number(booking.totalPrice);
const govtLevyNgn = +(total * govtLevyPct).toFixed(2);
// platformFeePct is only used in platformMetadata.configuredPlatformFeePct (line 198),
// NEVER in the actual split math — recipients array has ONLY a MINISTRY tag (lines 187-195).
```
Preserve D-01 exactly: `resolveSplit('studio', total)`'s `platformPct` will be `null` for the `'studio'` tier row (per the migration script), and the resulting `platformFeePct` value used for `platformMetadata.configuredPlatformFeePct` logging must still reflect whatever the tier's `platformPct` is configured as (even though it's null / unused in the math) — do not silently start crediting an `EARNER`/`HOST` recipient here; Studio's `recipients` array structurally has only `MINISTRY` today and that must not change this phase.

---

### `backend/src/modules/admin/admin.controller.ts` (controller, request-response)

**Analog:** `getConfig()`/`setConfig()` routes, same file (lines 89-99).

**Imports already present (no new imports needed beyond what's already in the file, lines 1-10):**
```typescript
import {
  Controller, Get, Patch, Body, Param, Query, UseGuards,
  ParseIntPipe, DefaultValuePipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
```

**Class-level guard/role pattern (lines 12-17) — note the class default is `SUPER_ADMIN, LGA_ADMIN`, but the money-sensitive `getRevenue()` route overrides narrower:**
```typescript
@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN, UserRole.LGA_ADMIN)
@Controller('admin')
export class AdminController {
```

**Precedent for narrowing to SUPER_ADMIN-only on a money-adjacent route** (lines 26-31):
```typescript
@Get('revenue')
@Roles(UserRole.SUPER_ADMIN)
@ApiOperation({ summary: 'Revenue breakdown: govt levy total, by LGA, by category, by month' })
getRevenue() {
  return this.adminService.getRevenue();
}
```
**Apply this same narrowing to the new routes** — RESEARCH.md's Drift Check explicitly recommends `@Roles(UserRole.SUPER_ADMIN)` only (excluding `LGA_ADMIN`) for the new `SettlementSplitTier` endpoints, since they control money-flow config directly (more sensitive than the read-only revenue report).

**Existing untyped-config-editor precedent to follow the *shape* of, but upgrade the body param to a validated DTO (see V5 Input Validation note below)** (lines 89-99):
```typescript
@Get('config')
@ApiOperation({ summary: 'Get platform configuration' })
getConfig() {
  return this.adminService.getConfig();
}

@Patch('config/:key')
@ApiOperation({ summary: 'Upsert platform config value' })
setConfig(@Param('key') key: string, @Body('value') value: any) {
  return this.adminService.setConfig(key, value);
}
```

**New routes to add (SUPER_ADMIN-only, DTO-validated body):**
```typescript
@Get('settlement-splits')
@Roles(UserRole.SUPER_ADMIN)
@ApiOperation({ summary: 'List settlement split tiers, optionally filtered by module' })
listSplitTiers(@Query('module') module?: string) {
  return this.adminService.listSplitTiers(module);
}

@Patch('settlement-splits/:id')
@Roles(UserRole.SUPER_ADMIN)
@ApiOperation({ summary: 'Update a settlement split tier (creates new active row, deactivates prior — D-05 audit trail)' })
updateSplitTier(@Param('id') id: string, @Body() dto: UpdateSplitTierDto) {
  return this.adminService.updateSplitTier(id, dto);
}
```

---

### `backend/src/modules/admin/admin.service.ts` (service, CRUD)

**Analog:** `getConfig()`/`setConfig()`, same file (lines 161-171).

**Existing upsert pattern to copy the style of:**
```typescript
// ── Platform Config ────────────────────────────────────────────────────────

getConfig() {
  return this.prisma.platformConfig.findMany({ where: { deletedAt: null } });
}

setConfig(key: string, value: any) {
  return this.prisma.platformConfig.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  });
}
```

**New methods to add — note `updateSplitTier` must NOT be a naive in-place `update()` per D-05's audit-history requirement (RESEARCH.md's explicit correction of its own illustrative code example):**
```typescript
// ── Settlement Split Tiers ─────────────────────────────────────────────────

listSplitTiers(module?: string) {
  return this.prisma.settlementSplitTier.findMany({
    where: module ? { module } : undefined,
    orderBy: [{ module: 'asc' }, { effectiveFrom: 'desc' }],
  });
}

async updateSplitTier(id: string, dto: UpdateSplitTierDto) {
  // D-05: never delete/overwrite — insert a new active row, deactivate the prior one.
  const prior = await this.prisma.settlementSplitTier.findUnique({ where: { id } });
  if (!prior) throw new NotFoundException('Settlement split tier not found');

  return this.prisma.$transaction(async (tx) => {
    await tx.settlementSplitTier.update({ where: { id: prior.id }, data: { isActive: false } });
    return tx.settlementSplitTier.create({
      data: {
        module: prior.module,
        tierName: prior.tierName,
        earnerPct: dto.earnerPct ?? prior.earnerPct,
        ministryPct: dto.ministryPct ?? prior.ministryPct,
        platformPct: dto.platformPct !== undefined ? dto.platformPct : prior.platformPct,
        isActive: true,
        effectiveFrom: new Date(),
      },
    });
  });
}
```
Note: the `@@unique([module, tierName])` constraint means the new row cannot be created while the old row is still active — the `isActive: false` update must run first, inside the same `$transaction`, exactly as shown (mirrors `SettlementService.settle()`'s own "$transaction wraps all writes" discipline, though this is a much simpler 2-statement case, not the full SELECT-FOR-UPDATE lock-order pattern).

---

### `backend/src/modules/admin/dto/update-split-tier.dto.ts` (new file) (model/DTO, request-response)

**Analog:** `backend/src/modules/events/dto/create-event.dto.ts` — the project's standard `class-validator` DTO shape.

**Import + decorator pattern to copy:**
```typescript
import { IsString, IsNotEmpty, IsOptional, IsDateString, IsUUID, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateEventDto {
  @ApiProperty({ example: 'Ogun Cultural Festival 2026' })
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  title: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  description?: string;
  // ...
}
```

**New DTO to write (per RESEARCH.md's Security Domain V5 recommendation — `@IsNumber()`/`@Min(0)`/`@Max(1)`, matching D-03's 0-1 fraction convention, NOT the untyped `Body() data: {...}` shape used by the existing `updateStudioSlot`/`setConfig` routes, which RESEARCH.md explicitly flags as "a minor existing deviation, not a precedent to extend"):**
```typescript
import { IsNumber, IsOptional, Min, Max } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateSplitTierDto {
  @ApiPropertyOptional({ example: 0.85, description: 'Earner (vendor/rider/host) share, 0-1 fraction' })
  @IsNumber()
  @IsOptional()
  @Min(0)
  @Max(1)
  earnerPct?: number;

  @ApiPropertyOptional({ example: 0.05, description: 'Government/ministry levy share, 0-1 fraction' })
  @IsNumber()
  @IsOptional()
  @Min(0)
  @Max(1)
  ministryPct?: number;

  @ApiPropertyOptional({ example: 0.10, description: 'Explicit platform cut, 0-1 fraction; omit/null = platform absorbs remainder' })
  @IsNumber()
  @IsOptional()
  @Min(0)
  @Max(1)
  platformPct?: number | null;
}
```
Add a service-level cross-field check (not expressible in `class-validator` alone) inside `updateSplitTier()`: reject if `earnerPct + ministryPct + (platformPct ?? 0) > 1` — RESEARCH.md's Security Domain section flags this as a NEW check with no existing call-site precedent (today's inline math never sums-and-validates before calling `settle()`).

---

## Shared Patterns

### "Always fresh, never cached" DB reads for money-adjacent config
**Source:** `SettlementService.resolveMinistryWallet()` (`settlement.service.ts:321-328`)
**Apply to:** `resolveSplit()` — no in-memory caching, no TTL, every call hits Postgres directly. This is the single most important pattern in this phase; every call site's migration and the resolver itself must follow it.

### `Number.isFinite()` defense-in-depth (two independent guard points)
**Source:** New pattern this phase (SETTLE-11d), placed alongside the existing negative-amount check in `SettlementService.settle()` (lines 108-116)
**Apply to:** Both `resolveSplit()` (guards its own DB read) AND `settle()` (guards its input regardless of source) — per RESEARCH.md's explicit "Pitfall: NaN Guard Placed in the Wrong Method" warning, both guards must exist independently.

### Idempotent one-off migration scripts (raw `PrismaClient`, no NestJS DI)
**Source:** `backend/scripts/shadow-settlement-verify.ts` (full file)
**Apply to:** `backend/scripts/migrate-settlement-split-tiers.ts` — same `if (require.main === module)` runner guard, same `.finally(() => prisma.$disconnect())`, same "read live PlatformConfig, never seed.ts defaults" discipline.

### Money-config admin routes narrowed to `SUPER_ADMIN` only
**Source:** `AdminController.getRevenue()` (`admin.controller.ts:26-31`) — the one existing route that overrides the class-level `@Roles(SUPER_ADMIN, LGA_ADMIN)` default to `@Roles(SUPER_ADMIN)` only
**Apply to:** Both new `settlement-splits` routes — this is a deliberate divergence from the controller's class-level default, matching the one existing precedent for money-sensitive data.

### `class-validator` DTOs for all mutating request bodies
**Source:** `backend/src/modules/events/dto/create-event.dto.ts` (project-wide convention — every feature module's mutating endpoints use a DTO class; `AdminController`'s existing untyped `Body() data: {...}` on `setConfig`/`updateStudioSlot`/`updateVendorStatus` is called out by RESEARCH.md as a pre-existing minor deviation, not a pattern to extend)
**Apply to:** `UpdateSplitTierDto` — first admin-module DTO of this phase; sets a better precedent than the existing untyped routes.

### `SettlementRecipient[]` + `settle()` call shape — UNCHANGED across all 6 modules
**Source:** Every one of the 6 call sites (see per-file excerpts above)
**Apply to:** Nothing changes here — this is the explicit boundary of the refactor. Only the 1-2 `platformConfig.findUnique()` lines immediately before the recipients array are replaced with 1 `resolveSplit()` call; the array construction and `settle()` invocation itself must be byte-for-byte identical before/after migration (this is what the SETTLE-11b regression tests assert).

## No Analog Found

None — every file in this phase has a strong, directly-applicable in-repo analog. This phase is explicitly scoped (per CONTEXT.md) as a mechanical centralization of existing duplicated patterns, not new architecture.

## Metadata

**Analog search scope:** `backend/prisma/schema.prisma`, `backend/src/common/services/`, `backend/src/modules/{transport,delivery,marketplace,events,stays,studio,admin}/`, `backend/scripts/`, `backend/src/modules/events/dto/`, `backend/src/common/enums/`, `backend/src/common/decorators/`
**Files scanned:** 15 read directly (full or targeted ranges); 6 call sites cross-referenced against RESEARCH.md's already-verified line numbers (no re-read of ranges RESEARCH.md had already quoted verbatim, per no-duplicate-read discipline)
**Pattern extraction date:** 2026-07-19
