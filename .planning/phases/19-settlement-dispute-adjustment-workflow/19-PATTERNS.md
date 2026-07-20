# Phase 19: Settlement Dispute & Adjustment Workflow - Pattern Map

**Mapped:** 2026-07-19
**Files analyzed:** 9 (5 new, 4 modified)
**Analogs found:** 9 / 9

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `backend/src/modules/settlement-disputes/settlement-disputes.module.ts` | module | request-response | `backend/src/modules/reviews/reviews.module.ts` | exact |
| `backend/src/modules/settlement-disputes/settlement-disputes.controller.ts` | controller | request-response | `backend/src/modules/reviews/reviews.controller.ts` (`ReviewsAdminController`) + `backend/src/modules/admin/admin.controller.ts` (role-gating) | exact |
| `backend/src/modules/settlement-disputes/settlement-disputes.service.ts` | service | CRUD + state-machine | `backend/src/modules/reviews/reviews.service.ts` (`findFlagQueue`/`findFlagById`/`resolveFlag`) | exact |
| `backend/src/modules/settlement-disputes/dto/raise-dispute.dto.ts` | dto | request-response | `backend/src/modules/reviews/dto/create-review.dto.ts` | role-match |
| `backend/src/modules/settlement-disputes/dto/resolve-dispute.dto.ts` | dto | request-response | `backend/src/modules/reviews/dto/resolve-flag.dto.ts` | exact |
| `backend/src/common/services/settlement.service.ts` (`adjust()` method, additive) | service | CRUD (compensating-transaction) | `backend/src/common/services/refund.service.ts` (`refund()`) + `settlement.service.ts`'s own `settle()` | exact |
| `backend/prisma/schema.prisma` (`SettlementDispute` model, additive) | model | CRUD | `AdminReviewFlag` model (line 1115) | exact |
| `backend/src/app.module.ts` (register `SettlementDisputesModule`) | config | — | existing `ReviewsModule`/`AdminModule` registration lines | exact |
| `backend/src/modules/settlement-disputes/__tests__/settlement-disputes.service.spec.ts` | test | — | `backend/src/modules/users/__tests__/kyc.service.spec.ts` (audit-log assertions) | role-match |

## Pattern Assignments

### `backend/src/modules/settlement-disputes/settlement-disputes.module.ts` (module, request-response)

**Analog:** `backend/src/modules/reviews/reviews.module.ts` (full file, 30 lines)

```typescript
import { Module } from '@nestjs/common';
import { ReviewsService } from './reviews.service';
import {
  ReviewsController,
  ReviewsAdminController,
} from './reviews.controller';

/**
 * ...
 * No extra `imports`: PrismaService (PrismaModule @Global), EventEmitter2
 * (EventEmitterModule.forRoot() in AppModule) and the auth/roles guards
 * are all globally available.
 */
@Module({
  controllers: [ReviewsController, ReviewsAdminController],
  providers: [ReviewsService],
  exports: [ReviewsService],
})
export class ReviewsModule {}
```

**Apply to `settlement-disputes.module.ts`:** single controller (`SettlementDisputesController`), single service (`SettlementDisputesService`), no `imports:` array needed — `PrismaModule` and `CommonModule` (which provides `SettlementService`, confirmed `@Global()` and exported in `backend/src/common/common.module.ts` lines 22-64) are both global. Register the new module in `backend/src/app.module.ts` alongside `ReviewsModule`/`AdminModule` (see below).

---

### `backend/src/modules/settlement-disputes/settlement-disputes.controller.ts` (controller, request-response)

**Analog 1 — route/guard shape:** `backend/src/modules/reviews/reviews.controller.ts` lines 94-143 (`ReviewsAdminController`)

**Analog 2 — exact role restriction to mirror (SUPER_ADMIN only, not LGA_ADMIN+):** `backend/src/modules/admin/admin.controller.ts` lines 1-15, 102-115 (the most recent, Phase-18-shipped precedent for a `SUPER_ADMIN`-only mutating admin endpoint)

Imports pattern (from `reviews.controller.ts` lines 1-28):
```typescript
import {
  Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query,
  UseGuards, DefaultValuePipe, ParseIntPipe,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
```

Class-level guard + role restriction — copy the SUPER_ADMIN-only shape verbatim from `admin.controller.ts` (D-02: no `STATE_ADMIN` this phase, unlike Reviews' `LGA_ADMIN, STATE_ADMIN, SUPER_ADMIN` list):
```typescript
@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN)
@Controller('admin/settlement-disputes')
export class SettlementDisputesController {
  constructor(private readonly service: SettlementDisputesService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  raise(@CurrentUser() user: { userId: string }, @Body() dto: RaiseDisputeDto) {
    return this.service.raise(user.userId, dto);
  }

  @Get('queue')
  getQueue(@Query('status') status?: string, /* page/limit like reviews.controller.ts lines 111-117 */) {
    return this.service.findQueue({ status });
  }

  @Get(':id')
  getById(@Param('id') id: string) {
    return this.service.findById(id);
  }

  @Post(':id/review')
  @HttpCode(HttpStatus.OK)
  review(@Param('id') id: string, @CurrentUser() user: { userId: string }) {
    return this.service.moveToReview(id, user.userId);
  }

  @Post(':id/resolve')
  @HttpCode(HttpStatus.OK)
  resolve(@Param('id') id: string, @CurrentUser() user: { userId: string }, @Body() dto: ResolveDisputeDto) {
    return this.service.resolve(id, user.userId, dto);
  }

  @Post(':id/dismiss')
  @HttpCode(HttpStatus.OK)
  dismiss(@Param('id') id: string, @CurrentUser() user: { userId: string }, @Body() dto: ResolveDisputeDto) {
    return this.service.dismiss(id, user.userId, dto);
  }
}
```

Note: unlike `reviews.controller.ts` (two controllers, one public), this phase needs only ONE controller (D-02: `SUPER_ADMIN` raises, reviews, resolves, dismisses — no separate citizen-facing "raise" surface per D-06/deferred SETTLE-10f). The `admin.controller.ts` single-controller, `@Roles(UserRole.SUPER_ADMIN)`-at-class-level shape is the tighter match than Reviews' two-controller split.

---

### `backend/src/modules/settlement-disputes/settlement-disputes.service.ts` (service, CRUD + state-machine)

**Analog:** `backend/src/modules/reviews/reviews.service.ts` lines 259-339 (`findFlagQueue`, `findFlagById`, `resolveFlag`)

Queue pattern (lines 263-292, near-verbatim target per CONTEXT.md D-discretion note):
```typescript
async findFlagQueue(opts: { status?: string; page?: number; limit?: number } = {}) {
  const status = opts.status ?? 'OPEN';
  const page = Math.max(1, opts.page ?? 1);
  const limit = Math.min(50, Math.max(1, opts.limit ?? 24));
  const skip = (page - 1) * limit;

  const [rows, total] = await Promise.all([
    this.prisma.adminReviewFlag.findMany({
      where: { status },
      orderBy: { createdAt: 'asc' }, // oldest first — review backlog
      skip,
      take: limit,
      include: { /* ... */ },
    }),
    this.prisma.adminReviewFlag.count({ where: { status } }),
  ]);

  return { data: rows, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
}
```

Get-by-id pattern (lines 297-312) — 404 if missing, no include-deps for SettlementDispute beyond `raisedBy` user relation.

Resolve/state-transition pattern (lines 320-339) — 409 if not in an actionable state:
```typescript
async resolveFlag(flagId: string, actorUserId: string, dto: ResolveFlagDto) {
  const flag = await this.prisma.adminReviewFlag.findUnique({
    where: { id: flagId },
    select: { id: true, status: true },
  });
  if (!flag) throw new NotFoundException('Flag not found');
  if (flag.status !== 'OPEN' && flag.status !== 'IN_REVIEW') {
    throw new ConflictException(`Flag is already ${flag.status}`);
  }

  return this.prisma.adminReviewFlag.update({
    where: { id: flagId },
    data: {
      status: dto.decision,
      assignedTo: actorUserId,
      resolvedAt: new Date(),
      resolution: dto.resolution ?? null,
    },
  });
}
```

**Adapt for `SettlementDisputeService.resolve()` (D-01, D-04, D-05):**
- Guard clause differs: `resolve()` is callable from `OPEN`, `IN_REVIEW`, **and `BLOCKED`** (D-05: BLOCKED is retryable) — only `RESOLVED`/`DISMISSED` are terminal (409).
- Unlike `resolveFlag()` (pure DB update, reviewer-supplied decision), `resolve()` must:
  1. Load the `SettlementDispute` row.
  2. Look up the original settlement's amount (from the `Transaction` row(s) matching `settlementReference`).
  3. Call `this.settlementService.resolveSplit(dispute.module, originalAmountNgn)` (already shipped, `settlement.service.ts:339-365`) to get the system-computed correct split.
  4. Diff against what was actually paid (recoverable from the original settlement's recipient `Transaction` rows/amounts).
  5. Call `this.settlementService.adjust(...)` (new method, see below) with the derived `{ walletId, deltaNgn }` line(s).
  6. On success → `status: 'RESOLVED'`, `adjustmentReference` recorded, `AuditLog` written.
  7. On `adjust()`'s insufficient-funds failure → `status: 'BLOCKED'` (not `DISMISSED`, not left `IN_REVIEW` — D-04), `AuditLog` written for the failed attempt too (D-05: "every attempt ... logged").
- Every transition (raise, review, resolve success, resolve→BLOCKED, dismiss, BLOCKED-retry) writes one `AuditLog` row — see Shared Patterns below for the exact `auditLog.create()` shape to copy.

Imports pattern (from `reviews.service.ts` lines 1-12, adapted — no `EventEmitter2` needed for this phase, dispute resolution is synchronous):
```typescript
import {
  BadRequestException, ConflictException, ForbiddenException,
  Injectable, Logger, NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SettlementService } from '../../common/services/settlement.service';
import { RaiseDisputeDto } from './dto/raise-dispute.dto';
import { ResolveDisputeDto } from './dto/resolve-dispute.dto';
```

---

### `backend/src/modules/settlement-disputes/dto/raise-dispute.dto.ts` (dto, request-response)

**Analog:** `backend/src/modules/reviews/dto/create-review.dto.ts` (full file, 78 lines)

Pattern to copy (class-validator decorators + `@ApiProperty`/`@ApiPropertyOptional`, per-field validation, exported literal union + const array for enum-like string fields):
```typescript
import { IsEnum, IsOptional, IsString, IsUUID, IsNumber, MaxLength, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export type SettlementDisputeModuleLiteral =
  'transport' | 'delivery' | 'events' | 'marketplace' | 'stays' | 'studio' | 'tour';
export const SETTLEMENT_DISPUTE_MODULES: SettlementDisputeModuleLiteral[] =
  ['transport', 'delivery', 'events', 'marketplace', 'stays', 'studio', 'tour'];

export class RaiseDisputeDto {
  @ApiProperty({ description: 'Original settlement Transaction.reference prefix being disputed' })
  @IsString()
  settlementReference!: string;

  @ApiProperty({ enum: SETTLEMENT_DISPUTE_MODULES })
  @IsEnum(SETTLEMENT_DISPUTE_MODULES)
  module!: SettlementDisputeModuleLiteral;

  @ApiProperty({ maxLength: 1000 })
  @IsString()
  @MaxLength(1000)
  reason!: string;

  @ApiPropertyOptional({
    description:
      'Informational only (D-01) — the system computes the actual adjustment via resolveSplit(), this value is not used to derive it.',
  })
  @IsOptional()
  @IsNumber()
  requestedAdjustmentNgn?: number;
}
```

---

### `backend/src/modules/settlement-disputes/dto/resolve-dispute.dto.ts` (dto, request-response)

**Analog:** `backend/src/modules/reviews/dto/resolve-flag.dto.ts` (full file, 23 lines) — near-verbatim, extended for the 5-value state machine:
```typescript
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class ResolveDisputeDto {
  @ApiPropertyOptional({ maxLength: 500, description: 'Optional reviewer note, not a decision override (D-01)' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  resolution?: string;
}
```
Note: unlike `ResolveFlagDto` (which has a required `@IsEnum(FLAG_DECISIONS) decision` field, since a human picks RESOLVED/DISMISSED), this phase's D-01 means the *route* (`/resolve` vs `/dismiss`) determines the decision, not a body field — no manual amount-entry or decision-enum field belongs in this DTO (see Deferred in CONTEXT.md).

---

### `backend/src/common/services/settlement.service.ts` — `adjust()` method (service, CRUD/compensating-transaction, additive)

**Analog 1 (compensating-transaction shape):** `backend/src/common/services/refund.service.ts` — `refund()`, full file lines 64-143

**Analog 2 (lock order + idempotency + reference-suffix precheck, LOCKED commitments):** `settlement.service.ts`'s own `settle()`, lines 91-265, especially:
- Idempotency precheck (lines 92-103):
```typescript
const existing = await this.prisma.transaction.findFirst({
  where: { reference: { startsWith: `${input.reference}-` } },
  select: { id: true },
});
if (existing) {
  this.logger.log(`Settlement already applied for ${input.reference} ... replay no-op`);
  return { status: 'REPLAYED', ... };
}
```
- Canonical sorted-by-walletId lock order (lines 158-172, MUST be reused verbatim per D-discretion note — "same canonical sorted-by-walletId lock order settle() already uses, line ~159 — must be reused verbatim to avoid the exact deadlock class settle()'s own comment describes"):
```typescript
const recipientsWithWallet = input.recipients.filter((x) => x.walletId);
const lockOrder = [...recipientsWithWallet].sort((a, b) =>
  a.walletId! < b.walletId! ? -1 : a.walletId! > b.walletId! ? 1 : 0,
);
for (const r of lockOrder) {
  await tx.$executeRaw`SELECT id FROM wallets WHERE id = ${r.walletId} FOR UPDATE`;
}
```
- P2002 idempotency fallback (lines 242-261) — reuse verbatim, checking `err.meta?.target` includes `'reference'`.

**Design for `adjust()` (per ARCHITECTURE.md lines 111-118, D-discretion notes in CONTEXT.md):**
```typescript
export interface SettlementAdjustmentLine {
  walletId: string;
  deltaNgn: number; // positive = credit, negative = debit (unlike settle(), both signs allowed)
}
export interface SettlementAdjustmentInput {
  originalReference: string; // must already exist as a settled Transaction
  module: string;
  lines: SettlementAdjustmentLine[];
  reason: string;
  metadata?: { disputeId: string; adjustmentReason?: string; [k: string]: unknown };
}

async adjust(input: SettlementAdjustmentInput): Promise<SettlementResult> {
  // 1. Idempotency precheck — same startsWith(`${originalReference}-ADJ-`) shape as settle()'s `${reference}-` precheck.
  // 2. Verify originalReference exists as a settled Transaction — reject if not (dispute can't target a non-existent settlement).
  // 3. For any negative deltaNgn (debit), pre-check sufficient balance BEFORE entering the $transaction —
  //    this is the one deviation from settle() (which is credit-only and has no debit path per its
  //    "negative recipient amount must never silently debit" guard, lines 105-122). Insufficient balance
  //    throws a typed error the caller (SettlementDisputeService.resolve()) catches to set status=BLOCKED (D-04).
  // 4. $transaction: SELECT FOR UPDATE in the SAME canonical sorted-by-walletId order as settle() (verbatim reuse).
  // 5. Write Transaction rows: reference `${originalReference}-ADJ-${n}`, type: deltaNgn >= 0 ? 'CREDIT' : 'DEBIT',
  //    metadata: { module, disputeId, adjustmentReason, ...input.metadata }.
  // 6. P2002 fallback identical to settle()'s (lines 242-261).
}
```
Per ARCHITECTURE.md line 150, the insufficient-funds path is a typed/catchable error (not a generic throw) so `SettlementDisputeService.resolve()` can distinguish "system error" from "recipient balance too low, needs BLOCKED not a 500."

---

### `backend/prisma/schema.prisma` — `SettlementDispute` model (model, CRUD, additive)

**Analog:** `AdminReviewFlag` (lines 1115-1128) — string-based `status` field (not a Prisma enum, matching codebase's documented preference for flexibility on this specific field), `assignedTo`, `resolution`, `resolvedAt`.

```prisma
model AdminReviewFlag {
  id         String    @id @default(uuid())
  reviewId   String    @unique
  review     Review    @relation(fields: [reviewId], references: [id])
  status     String    @default("OPEN") // OPEN | IN_REVIEW | RESOLVED | DISMISSED
  assignedTo String? // LGA_ADMIN userId
  resolution String?
  resolvedAt DateTime?
  createdAt  DateTime  @default(now())
  updatedAt  DateTime  @updatedAt

  @@index([status])
  @@map("admin_review_flags")
}
```

**Adapt for `SettlementDispute`** — copy the exact model proposed in `ARCHITECTURE.md` lines 121-143 verbatim (already vetted against this exact phase), extending `status` with the 5th value `BLOCKED` per D-04:
```prisma
model SettlementDispute {
  id                     String    @id @default(uuid())
  settlementReference    String    // the original Transaction.reference prefix this dispute targets
  module                 String    // 'transport' | 'delivery' | 'events' | 'marketplace' | 'stays' | 'studio' | 'tour'
  raisedByUserId         String
  raisedBy               User      @relation(fields: [raisedByUserId], references: [id])
  reason                 String
  status                 String    @default("OPEN") // OPEN | IN_REVIEW | RESOLVED | DISMISSED | BLOCKED
  requestedAdjustmentNgn Decimal?
  assignedTo             String?   // SUPER_ADMIN userId (D-02: no STATE_ADMIN this phase)
  resolution             String?
  resolvedAt             DateTime?
  adjustmentReference    String?   // set once resolved+applied — the `${originalReference}-ADJ-*` prefix actually written
  metadata               Json?
  createdAt              DateTime  @default(now())
  updatedAt              DateTime  @updatedAt

  @@index([status])
  @@index([settlementReference])
  @@map("settlement_disputes")
}
```
Colocate this model next to `AdminReviewFlag`/`ShadowSettlementComparison` in `schema.prisma` (near line 1115), per CONTEXT.md Integration Points. Also note the sibling `SettlementSplitTier` model (lines 695-719, already shipped Phase 18) demonstrates the codebase's precedent for a state/audit-trail-bearing settlement-adjacent table using string statuses + `@@index` on the query-filter columns — same shape to follow.

---

### `backend/src/app.module.ts` (config, additive)

**Analog:** existing `ReviewsModule`/`AdminModule` registration (`app.module.ts` lines 18, 24, 54, 62)

```typescript
import { ReviewsModule } from './modules/reviews/reviews.module';
// ...
import { AdminModule } from './modules/admin/admin.module';
// ...
@Module({
  imports: [
    // ...
    ReviewsModule,
    // ...
    AdminModule,
    // ...
  ],
})
```
Add `import { SettlementDisputesModule } from './modules/settlement-disputes/settlement-disputes.module';` and insert `SettlementDisputesModule` into the `imports` array in the same alphabetized/grouped position as the other feature modules.

---

## Shared Patterns

### AuditLog write (SETTLE-10e — every dispute transition logged)
**Source:** `backend/src/modules/users/kyc.service.ts` lines 110-122
**Apply to:** Every state-transition method in `SettlementDisputesService` (raise, moveToReview, resolve success, resolve→BLOCKED, dismiss, BLOCKED-retry)
```typescript
// Audit log — silent fallback per CLAUDE.md (audit failures must not break the primary flow)
try {
  await this.prisma.auditLog.create({
    data: {
      userId: actorUserId,
      action: 'SETTLEMENT_DISPUTE_RESOLVED', // or _RAISED / _REVIEWED / _BLOCKED / _DISMISSED
      entity: 'SettlementDispute',
      entityId: disputeId,
      newValue: { status, adjustmentReference, deltaNgn } as any,
      metadata: { module, settlementReference },
    },
  });
} catch (err) {
  this.logger.error(`Dispute audit log failed for disputeId=${disputeId}`, err);
}
```
Note the codebase convention: audit log writes are wrapped in try/catch and logged on failure, never allowed to fail the primary transition — copy this exactly (do not let an AuditLog write failure roll back or block a dispute state change).

### Role-gating (SUPER_ADMIN only — D-02)
**Source:** `backend/src/modules/admin/admin.controller.ts` lines 1-15, 102-114 (Phase 18's `SettlementSplitTier` endpoints — the most recent SUPER_ADMIN-only precedent, not Reviews' broader `LGA_ADMIN, STATE_ADMIN, SUPER_ADMIN` list)
```typescript
@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN)
```
Apply at controller-class level in `settlement-disputes.controller.ts` (no per-route `@Roles` override needed — every route in this phase is SUPER_ADMIN-only per D-02).

### Compensating-transaction / never-mutate-original-rows invariant
**Source:** `backend/src/common/services/refund.service.ts` header comment (lines 39-51) and `settlement.service.ts` LOCKED commitments comment (lines 14-30)
**Apply to:** `SettlementService.adjust()` — every correction is a NEW `Transaction` row referencing the original via a reference suffix (`-ADJ-${n}`, parallel to `refund.service.ts`'s `-RFND`), never an `UPDATE` on a settled row. This is a hard architectural invariant repeated in both source files' comments, not a per-phase choice.

### Idempotency precheck + P2002 fallback
**Source:** `backend/src/common/services/settlement.service.ts` lines 92-103 (precheck) and 242-261 (P2002 fallback)
**Apply to:** `adjust()` — reuse both blocks verbatim, substituting the reference prefix (`${originalReference}-ADJ-` instead of `${reference}-`).

### Wallet lock order (deadlock avoidance)
**Source:** `backend/src/common/services/settlement.service.ts` lines 158-172
**Apply to:** `adjust()` — sort all touched wallets by `walletId` ascending before issuing `SELECT ... FOR UPDATE`, exactly as `settle()` does. This is called out in CONTEXT.md as "a locked architectural precedent, not an open choice."

## No Analog Found

None — every file in this phase's scope has a strong (exact or role-match) existing analog; the codebase's Reviews module (state machine + admin queue) and Refund/Settlement services (compensating-transaction + wallet-locking) together cover 100% of the new surface.

## Metadata

**Analog search scope:** `backend/src/modules/reviews/`, `backend/src/modules/admin/`, `backend/src/common/services/settlement.service.ts`, `backend/src/common/services/refund.service.ts`, `backend/src/modules/users/kyc.service.ts`, `backend/prisma/schema.prisma`, `backend/src/app.module.ts`, `backend/src/common/common.module.ts`
**Files scanned:** 11 read directly (reviews.service.ts, reviews.controller.ts, reviews.module.ts, create-review.dto.ts, resolve-flag.dto.ts, settlement.service.ts, refund.service.ts, admin.service.ts, admin.controller.ts, kyc.service.ts, common.module.ts) + schema.prisma targeted sections (UserRole enum, Wallet/Transaction/SettlementSplitTier/ShadowSettlementComparison/AuditLog/AdminReviewFlag models)
**Pattern extraction date:** 2026-07-19
