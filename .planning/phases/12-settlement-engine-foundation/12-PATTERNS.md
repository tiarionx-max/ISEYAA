# Phase 12: Settlement Engine Foundation - Pattern Map

**Mapped:** 2026-07-17
**Files analyzed:** 15 (create/modify)
**Analogs found:** 15 / 15 (1 partial — no controller-spec precedent exists yet)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `backend/src/common/services/settlement.service.ts` (NEW) | service | event-driven (atomic fan-out) | `backend/src/modules/tour-bookings/tour-settlement.service.ts` | exact — this IS the extraction source |
| `backend/src/common/services/__tests__/settlement.service.spec.ts` (NEW) | test | unit | `backend/src/modules/tour-bookings/__tests__/tour-settlement.service.spec.ts` | exact |
| `backend/src/modules/tour-bookings/tour-settlement.service.ts` (MODIFIED — delegate to shared service) | service | event-driven | itself (pre-refactor) + new `settlement.service.ts` | exact |
| `backend/src/modules/marketplace/marketplace.service.ts` (MODIFIED — add `@OnEvent`, wire settlement) | service | event-driven + CRUD | `tour-settlement.service.ts` (OnEvent+settle wiring) | role-match |
| `backend/src/modules/events/events.service.ts` (MODIFIED — add fee config + `@OnEvent`) | service | event-driven + CRUD | `tour-settlement.service.ts` + `transport.service.ts` (PlatformConfig fee read) | role-match |
| `backend/src/modules/studio/studio.service.ts` (MODIFIED — add fee config + `@OnEvent`, 2-way split) | service | event-driven + CRUD | `tour-settlement.service.ts` (subset: platform+Ministry only) | role-match |
| `backend/src/modules/stays/stays.service.ts` (MODIFIED — fix `releaseEscrow()`, add `@OnEvent`) | service | event-driven + batch (cron) | `tour-settlement.service.ts` (fan-out) + itself (buggy cron to replace) | exact for fan-out / role-match for cron |
| `backend/prisma/schema.prisma` (MODIFIED — `Booking.govtLevyPct`) | model | CRUD | `Vendor.govtLevyPct` field (lines 456-477) | exact |
| `backend/prisma/seed.ts` (MODIFIED — Ministry User+Wallet, new PlatformConfig keys) | config/seed | batch | `systemUser` upsert (1420-1440) + `tour.government_wallet_user_id` upsert (1380-1394) | exact |
| `backend/prisma/migrations/<ts>_settlement_engine_foundation/` (NEW) | migration | — | N/A — Prisma auto-generates from schema diff | no analog needed |
| `backend/src/common/controllers/settlement.controller.ts` (NEW — SETTLE-07 statement endpoint) | controller | request-response | `admin.controller.ts` (`@Roles`/`RolesGuard`) + `wallet.controller.ts` (`@CurrentUser` self-scoped query) + `upload.controller.ts` (CommonModule controller shape) | role-match |
| `backend/src/common/controllers/__tests__/settlement.controller.spec.ts` (NEW) | test | unit | `marketplace.service.spec.ts` / `stays.service.spec.ts` (NestJS TestingModule + mock-Prisma structure) | partial — no controller `.spec.ts` exists anywhere in the repo yet |
| `backend/src/common/common.module.ts` (MODIFIED — register `SettlementService` + `SettlementController`) | config (module wiring) | — | itself | exact |
| `backend/src/modules/marketplace/__tests__/marketplace.service.spec.ts` (MODIFIED — add settlement test cases) | test | unit | itself + `tour-settlement.service.spec.ts` (wallet-invariant-sum technique) | exact |
| `backend/src/modules/events/__tests__/events.service.spec.ts`, `backend/src/modules/studio/__tests__/studio.service.spec.ts`, `backend/src/modules/stays/__tests__/stays.service.spec.ts` (MODIFIED) | test | unit | `tour-settlement.service.spec.ts` (drift/sum assertions) | role-match |

## Pattern Assignments

### `backend/src/common/services/settlement.service.ts` (service, event-driven fan-out) — NEW

**Analog:** `backend/src/modules/tour-bookings/tour-settlement.service.ts` (494 lines) — this file **is** the generalization target. D-01/D-02 require extracting its transactional core verbatim, not reinventing it.

**Imports pattern** (source lines 1-9):
```typescript
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import { RefundService } from '../../common/services/refund.service';
import { KafkaService } from '../../kafka/kafka.service';
```
For the new `CommonModule`-resident file, imports become relative to `backend/src/common/services/`:
```typescript
import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RefundService } from './refund.service';
```

**SELECT FOR UPDATE wallet lock + credit — copy exactly** (source lines 256-294):
```typescript
for (const r of resolved.filter((x) => x.walletId)) {
  // SELECT FOR UPDATE — prevents concurrent writes to the same vendor wallet.
  await tx.$executeRaw`SELECT id FROM wallets WHERE id = ${r.walletId} FOR UPDATE`;
  const w = await tx.wallet.findUnique({ where: { id: r.walletId! } });
  if (!w) throw new Error(`Vendor wallet vanished mid-transaction: ${r.walletId}`);
  const before = Number(w.balance);
  const after = before + r.amountNgn;
  await tx.wallet.update({ where: { id: r.walletId! }, data: { balance: after } });
  await tx.transaction.create({
    data: {
      walletId: r.walletId!, type: 'CREDIT', status: 'SUCCESS',
      amount: r.amountNgn, currency: 'NGN',
      reference: `${payload.reference}-V-${r.idx}`, // generalize to `-<TAG><idx>`
      gateway: 'PAYSTACK', gatewayRef: payload.reference,
      description: `Tour booking commission (${r.entry.vendorType})`,
      balanceBefore: before, balanceAfter: after,
      metadata: { module: 'tour', bookingId: booking.id, vendorType: r.entry.vendorType, percentage: r.entry.percentage },
    },
  });
}
```

**Platform commission row (absorbs drift + unresolved shares)** — source lines 296-331. Reuse identically; the `systemWalletId` is bootstrapped once via `ensureSystemWallet()` (source lines 471-492, D-07: do NOT re-architect this into a `SystemWallet` model this phase — the well-known `SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000001'` constant stays).

**Drift assertion (D-03, ≤₦0.02) — copy exactly** (source lines 236-249):
```typescript
const claimedAmountNgn = resolved.filter((r) => r.walletId).reduce((s, r) => s + r.amountNgn, 0);
const platformAmountNgn = Math.round((chargeAmountNgn - claimedAmountNgn) * 100) / 100;
const drift = chargeAmountNgn - claimedAmountNgn - platformAmountNgn;
if (Math.abs(drift) > 0.02) {
  const err = new Error(`Settlement drift exceeded ₦0.02 (drift=${drift}) — programming error`);
  await this.handleSettlementFailure(payload, booking, err);
  throw err;
}
```

**Idempotency precheck** (source lines 127-151) — RESEARCH.md Pattern 2 recommends collapsing Tour's two-query precheck into one `startsWith` query since every settlement reference shares the `${paystackReference}-` prefix:
```typescript
const existing = await this.prisma.transaction.findFirst({
  where: { reference: { startsWith: `${input.paystackReference}-` } },
  select: { id: true },
});
if (existing) { /* replay no-op */ return; }
```
**Pitfall to fix during extraction (not in Tour today):** catch `Prisma.PrismaClientKnownRequestError` with `code === 'P2002'` on the `Transaction.reference` unique constraint inside the `$transaction` try/catch and treat as benign replay — do NOT route into `handleSettlementFailure`/refund (see RESEARCH.md Pitfall 1).

**Failure/refund path — reuse exactly** (source lines 409-467, calls `RefundService.refund()`):
```typescript
await this.refundService.refund({
  paystackReference: payload.reference,
  amountKobo: payload.amount,
  walletId: buyerWallet.id,
  reason: `settlement_failed: ${err.message}`,
  metadata: { bookingId: booking.id, failedAt: 'settlement_transaction', module: '<caller-supplied>' },
});
```

**Ministry wallet resolution — live read every call, never cache** (source lines 171-175, D-03/Pitfall 2):
```typescript
const govWalletConfig = await this.prisma.platformConfig.findUnique({
  where: { key: 'tour.government_wallet_user_id' },
});
const govWalletUserId = (govWalletConfig?.value as string | null | undefined) ?? null;
```
Extract this as a shared `resolveMinistryWallet()` helper on `SettlementService` per RESEARCH.md — every one of the 5 callers needs it identically. **Do not cache** the resolved id the way `systemWalletId` is cached in `onModuleInit` — this is an operator-configurable `PlatformConfig` value.

---

### `backend/src/modules/tour-bookings/tour-settlement.service.ts` (service, event-driven) — MODIFIED (refactor)

**Analog:** itself (pre-refactor) — D-01 requires this file keep its GUIDE/HOST/ORGANISER/ATTRACTION resolution logic (lines 177-234) but delegate the fan-out (lines 251-349) to `SettlementService.settle()`. The `@OnEvent('payment.tour_booking')` handler (line 97) and `handleTourBookingPaymentEvent` wrapper (lines 98-104) stay unchanged — they are the dual-wire template every other module's `@OnEvent` handler copies verbatim:
```typescript
@OnEvent('payment.tour_booking')
handleTourBookingPaymentEvent(payload: TourBookingPaymentPayload): Promise<void> {
  return this.handleTourBookingPayment(payload).catch((err: Error) => {
    this.logger.error(`tour_booking settlement failed for ${payload.reference}: ${err.message}`);
  });
}
```
The `onModuleInit` Kafka `consume()` call (lines 83-95) stays as-is — do not touch/fix Kafka wiring (RESEARCH.md Anti-Pattern).

**Regression requirement:** all 12 existing scenarios in `tour-settlement.service.spec.ts` must stay green through this refactor — full suite (`npm test`) is the phase gate.

---

### `backend/src/modules/marketplace/marketplace.service.ts` (service, event-driven+CRUD) — MODIFIED

**Analog:** `tour-settlement.service.ts` for the `@OnEvent` dual-wire pattern; itself for the split computation already in place (D-08: no schema change needed).

**Existing imports** (source lines 1-19) — add `SettlementService` and `EventEmitter2`/`OnEvent`:
```typescript
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { SettlementService } from '../../common/services/settlement.service';
```

**Already-correct split computation to reuse (D-08)** (source lines 186-204):
```typescript
const feeConfig = await this.prisma.platformConfig.findUnique({ where: { key: 'PLATFORM_FEE_PCT' } });
const platformFeePct = feeConfig ? Number(feeConfig.value) : 0.10;
const govtLevyPct = Number(vendor.govtLevyPct);
// ...
const platformFee = +(total * platformFeePct).toFixed(2);
const govtLevy = +(total * govtLevyPct).toFixed(2);
const vendorPayout = +(total - platformFee - govtLevy).toFixed(2);
```
`Order.platformFee`/`govtLevy`/`vendorPayout` are already stored at `createOrder()` time — the new `@OnEvent` handler reads them straight off the `Order` row, resolves `Vendor.userId` → wallet, resolves Ministry wallet (shared helper), and calls `SettlementService.settle()`.

**Broken code to fix — `handleOrderPayment` currently never credits any wallet** (source lines 253-281):
```typescript
async handleOrderPayment(payload: { reference: string }) {
  // ...
  await this.prisma.order.update({ where: { id: order.id }, data: { status: 'PROCESSING' } });
  for (const item of order.orderItems) {
    await this.prisma.product.update({ where: { id: item.productId }, data: { stock: { decrement: item.quantity } } });
  }
  await this.notifyOrderUpdate(order.id, 'PROCESSING');
  // ← NO wallet crediting happens here today. This is the entire SETTLE-06 fix for Marketplace.
}
```
Add `@OnEvent('payment.order_payment')` alongside the existing `onModuleInit` Kafka consumer (source lines 36-42) — do not remove the Kafka wiring, dual-wire per D-04. The stock-decrement + status-flip side effects should move into `SettlementService`'s `onSettled` callback so they stay atomic with the wallet writes (mirrors Tour's step 6c, source lines 336-344).

---

### `backend/src/modules/events/events.service.ts` (service, event-driven+CRUD) — MODIFIED

**Analog:** `tour-settlement.service.ts` for `@OnEvent` wiring + `transport.service.ts` for the net-new `PlatformConfig` fee-read pattern (D-09: no existing fee fields on `Event`/`TicketType`, greenfield).

**PlatformConfig fee-read pattern to copy** (`backend/src/modules/transport/transport.service.ts:516-520`):
```typescript
// Read platform fee from PlatformConfig — NEVER hardcode
const feeCfg = await this.prisma.platformConfig.findUnique({
  where: { key: 'transport_platform_fee_pct' },
});
const feePct = feeCfg ? Number(feeCfg.value) : 15;
```
Apply identically for `events.platform_fee_pct` and `events.govt_levy_pct` (dot.case names per CONTEXT.md D-09 / RESEARCH.md Open Question 2 recommendation).

**Existing broken `handleTicketPayment` — status flip only, no split computed, no settlement** (source lines 217-263):
```typescript
async handleTicketPayment(payload: { reference: string }) {
  // ...
  await this.prisma.$transaction([
    this.prisma.ticket.update({ where: { id: ticket.id }, data: { status: 'ISSUED', qrImageUrl } }),
    this.prisma.ticketType.update({ where: { id: ticket.ticketTypeId }, data: { sold: { increment: 1 } } }),
  ]);
  // ← no wallet crediting, no fee/levy computation at all today
}
```
New `@OnEvent('payment.ticket_purchase')` handler: read `TicketType.price` → resolve `Event.organizerId` → wallet (mirrors Tour's ORGANISER resolution, `tour-settlement.service.ts:199-204`), resolve Ministry wallet (shared helper), compute 3-way split (organizer + Ministry + platform per D-09/A1), call `SettlementService.settle()` with `onSettled` moving the ticket-issue + `sold` increment into the callback.

---

### `backend/src/modules/studio/studio.service.ts` (service, event-driven+CRUD) — MODIFIED

**Analog:** `tour-settlement.service.ts`'s fan-out, restricted to a 2-way case (platform + Ministry only — no vendor leg, per D-10 since `StudioSlot` has no owner field).

**Existing broken `handleStudioPayment` — status flip only** (source lines 154-185):
```typescript
async handleStudioPayment(payload: { reference: string }) {
  // ...
  await this.prisma.studioBooking.update({ where: { id: booking.id }, data: { status: 'CONFIRMED' } });
  // ← no wallet crediting today
}
```
New `@OnEvent('payment.studio_booking')` handler reads `StudioBooking.totalPrice`, computes `studio.platform_fee_pct`/`studio.govt_levy_pct` (same `PlatformConfig` read pattern as Events above), resolves only the Ministry wallet (no vendor resolution step — this is what makes Studio structurally simpler than Marketplace/Events/Tour), and calls `SettlementService.settle()` with a 1-recipient `recipients` array (`[{ tag: 'MINISTRY', walletId, amountNgn }]` — platform absorbs the rest automatically).

---

### `backend/src/modules/stays/stays.service.ts` (service, event-driven+batch) — MODIFIED

**Analog:** `tour-settlement.service.ts`'s fan-out for the `releaseEscrow()` fix; itself for the buggy code being replaced and the existing `@Cron` structure.

**Bug to fix — `releaseEscrow()` currently credits host 100%, non-atomic array `$transaction`** (source lines 303-362, replace lines 319-361):
```typescript
@Cron(CronExpression.EVERY_HOUR)
async releaseEscrow(): Promise<void> {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const dueBookings = await this.prisma.booking.findMany({
    where: { checkOut: { lt: cutoff }, status: { in: ['CONFIRMED','CHECKED_IN','CHECKED_OUT'] as any },
      escrowReleasedAt: null, deletedAt: null },
    include: { property: { select: { hostId: true } } },
    take: 100,
  });
  for (const booking of dueBookings) {
    // BUG: credits host the FULL booking.totalPrice, zero govt levy split
    const amount = Number(booking.totalPrice);
    // BUG: array-form $transaction([...]) — not the locked SELECT FOR UPDATE pattern
    await this.prisma.$transaction([
      this.prisma.wallet.update({ where: { id: hostWallet.id }, data: { balance: balanceAfter } }),
      this.prisma.transaction.create({ data: { /* single CREDIT row, no Ministry split */ } }),
      this.prisma.booking.update({ where: { id: booking.id }, data: { escrowReleasedAt: new Date() } }),
    ]);
  }
}
```
**Fix (per RESEARCH.md Pattern 3, D-11):** apply `Booking.govtLevyPct` (new field, snapshotted at `createBooking()` — see schema/seed patterns below) as an N-way fan-out via `SettlementService.settle()`, host + Ministry, platform absorbs drift; `onSettled` callback sets `Booking.escrowReleasedAt` atomically. The `@Cron(CronExpression.EVERY_HOUR)` decorator and the `dueBookings` query (lines 305-317) stay unchanged — only the per-booking settlement body changes.

**Also add `@OnEvent('payment.stay_booking')`** (D-05) alongside the existing `onModuleInit` Kafka consumer (source lines 42-48) — mirrors the other 3 modules' dual-wire fix; `handleStayPayment` itself (source lines 248-301) only flips `status: 'CONFIRMED'` and sends emails, no settlement happens at purchase time (settlement is deferred to the escrow-release cron, unchanged behavior — only the wiring gap is fixed).

**`createBooking()` — add `govtLevyPct` snapshot at creation time** (D-11, insert before `totalPrice` calc, source lines 186-188):
```typescript
const levyCfg = await this.prisma.platformConfig.findUnique({ where: { key: 'stays.govt_levy_pct' } });
const govtLevyPct = levyCfg ? Number(levyCfg.value) : 0.05; // fallback default, still DB-sourced when configured
// ...
// inside tx.booking.create({ data: { ..., govtLevyPct } })
```

---

### `backend/prisma/schema.prisma` (model) — MODIFIED

**Analog:** `Vendor.govtLevyPct` (lines 456-477) — the only existing precedent for a per-record negotiated/snapshotted levy percentage:
```prisma
model Vendor {
  // ...
  commissionRate Decimal @default(10)
  govtLevyPct    Decimal @default(0)
  // ...
}
```
Add to `Booking` (lines 430-454), mirroring the same `Decimal @default(...)` shape:
```prisma
model Booking {
  // ... existing fields ...
  govtLevyPct      Decimal       @default(0.05)  // snapshotted at createBooking() time, D-11
  // ...
}
```
Related models unchanged but referenced: `Wallet` (609-624, `userId @unique`, `balance`), `Transaction` (626-647, `reference @unique`, `metadata: Json?`, `@@index([walletId])`), `PlatformConfig` (649-660, simple KV: `key @unique`, `value: Json`, `isPublic`, `metadata`).

---

### `backend/prisma/seed.ts` (seed/config) — MODIFIED

**Analog — Ministry User+Wallet provisioning:** the existing `systemUser` upsert pattern (lines 1420-1440) is the direct template for D-06's Ministry user:
```typescript
const systemUser = await prisma.user.upsert({
  where: { email: 'system@iseyaa.local' },
  create: {
    email: 'system@iseyaa.local',
    phone: '+2348000000000',
    firstName: 'Iṣẹ́yáá',
    lastName: 'Platform',
    passwordHash: await bcrypt.hash('iseyaa-system-' + Date.now(), 12),
    role: 'STATE_ADMIN' as any,
    registeredRoles: ['ORGANISER', 'HOST', 'STATE_ADMIN'] as any,
    status: 'ACTIVE' as any,
    ndpaConsent: true,
    ndpaConsentAt: new Date(),
  },
  update: {},
  select: { id: true },
});
```
D-06's Ministry user should be non-loginable (government-owned) — adapt with a distinguishing email like `ministry@iseyaa.local`, `role: 'SUPER_ADMIN'` (mirrors `TourSettlementService.ensureSystemWallet()`'s `SYSTEM_USER_ID` upsert shape at `tour-settlement.service.ts:475-490`), then upsert a `Wallet` row keyed on that `userId`, then upsert `PlatformConfig.tour.government_wallet_user_id` to the new user's id.

**Analog — the currently-unset key to fix** (lines 1380-1394):
```typescript
await prisma.platformConfig.upsert({
  where: { key: 'tour.government_wallet_user_id' },
  update: {},
  create: {
    key: 'tour.government_wallet_user_id',
    value: Prisma.JsonNull, // ← D-06 sets this to the new Ministry user's id
    isPublic: false,
    metadata: { module: 'tour', requires_operator_setup: true },
  },
});
```
Update this upsert's `value` to the provisioned Ministry `User.id` and drop/update the `requires_operator_setup` metadata flag.

**Analog — new flat-rate PlatformConfig keys (Events, Studio)** — same KV shape as `tour.platform_commission_pct` (lines 1368-1378):
```typescript
await prisma.platformConfig.upsert({
  where: { key: 'tour.platform_commission_pct' },
  update: {},
  create: {
    key: 'tour.platform_commission_pct',
    value: 0.15,
    isPublic: false,
    metadata: { module: 'tour' },
  },
});
```
Add four new keys following this exact shape: `events.platform_fee_pct`, `events.govt_levy_pct`, `studio.platform_fee_pct`, `studio.govt_levy_pct`, plus `stays.govt_levy_pct` (used at `Booking` creation time, D-11) — dot.case, module-prefixed, per RESEARCH.md Open Question 2 recommendation (matches the `tour.*` keys they sit alongside).

---

### `backend/src/common/controllers/settlement.controller.ts` (controller, request-response) — NEW, SETTLE-07

**Analog 1 — `@Roles`/`RolesGuard` gating with per-route override** (`backend/src/modules/admin/admin.controller.ts:1-31`):
```typescript
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN, UserRole.LGA_ADMIN)
@Controller('admin')
export class AdminController {
  @Get('dashboard')
  getDashboard() { /* ... */ }

  @Get('revenue')
  @Roles(UserRole.SUPER_ADMIN) // route-level override narrows the class-level roles
  getRevenue() { /* ... */ }
}
```

**Analog 2 — self-scoped query via `@CurrentUser()`** (`backend/src/modules/wallet/wallet.controller.ts:1-42`):
```typescript
@ApiTags('wallet')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('wallet')
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @Get('transactions')
  @ApiQuery({ name: 'date_from', required: false })
  @ApiQuery({ name: 'date_to', required: false })
  getTransactions(
    @CurrentUser() user: any,
    @Query('date_from') date_from?: string,
    @Query('date_to') date_to?: string,
  ) {
    return this.walletService.getTransactions(user.userId, { date_from, date_to });
  }
}
```
**Security requirement (V4/IDOR, RESEARCH.md):** the statement endpoint must resolve the requesting user's own `walletId` server-side from `@CurrentUser()` (via their `Vendor`/`Property`/`Event` ownership record) — never accept a raw `walletId` param from non-admin roles. `SUPER_ADMIN`/`LGA_ADMIN` may pass an explicit `walletId` param since `@Roles()` already gates them (mirrors `AdminVendorsController`'s dual-role gate, `marketplace.controller.ts:123-136`):
```typescript
@ApiTags('admin')
@Controller('admin/vendors')
export class AdminVendorsController {
  @Patch(':id/approve')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.LGA_ADMIN, UserRole.SUPER_ADMIN)
  approve(@Param('id') id: string) { /* ... */ }
}
```

**Analog 3 — CommonModule controller shape** (`backend/src/common/controllers/upload.controller.ts`, full file):
```typescript
@ApiTags('Uploads')
@ApiBearerAuth()
@Controller('uploads')
export class UploadController {
  constructor(private uploads: UploadService) {}

  @Post('presigned')
  @UseGuards(JwtAuthGuard)
  async createPresignedUploadUrl(@CurrentUser() user: { userId: string }, @Body() dto: CreatePresignedUploadDto) {
    return this.uploads.createPresignedUploadUrl({ ...dto, userId: user.userId });
  }
}
```
This confirms `CommonModule` already hosts a controller alongside services — `SettlementController` follows the same file placement (`backend/src/common/controllers/`).

**Query shape (per CONTEXT.md discretion note):** filter `Transaction` by `walletId` + date range + `metadata` fields (`recipientType`, `sourceType`, `sourceId`) — no separate statement table. No GIN index needed this phase (RESEARCH.md Pitfall 4 — defer to Phase 14 if slow).

---

### `backend/src/common/common.module.ts` (module registration) — MODIFIED

**Analog:** itself — add `SettlementService` to `providers`+`exports`, add `SettlementController` to `controllers` (mirrors how `UploadController`/`UploadService` are already registered):
```typescript
@Global()
@Module({
  controllers: [UploadController, SettlementController],
  providers: [
    /* ...existing... */
    SettlementService,
  ],
  exports: [
    /* ...existing... */
    SettlementService,
  ],
})
export class CommonModule {}
```
Since `CommonModule` is `@Global()`, no feature module needs an explicit import to inject `SettlementService` (confirmed in RESEARCH.md Architecture Patterns).

---

### Test files — service `.spec.ts` (marketplace/events/studio/stays) — MODIFIED

**Analog — mock-Prisma + NestJS TestingModule scaffold** (`backend/src/modules/marketplace/__tests__/marketplace.service.spec.ts:1-70`):
```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { MarketplaceService } from '../marketplace.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { PaystackService } from '../../../common/services/paystack.service';
import { SendgridService } from '../../../common/services/sendgrid.service';
import { KafkaService } from '../../../kafka/kafka.service';

const mockKafka = { emit: jest.fn().mockResolvedValue(undefined), consume: jest.fn().mockResolvedValue(undefined) };
const mockPrisma = {
  vendor: { findUnique: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
  order: { findFirst: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
  platformConfig: { findUnique: jest.fn() },
  $transaction: jest.fn(),
};
```
Add a mocked `SettlementService` (`{ settle: jest.fn() }`) as a new provider override in each of these 4 spec files, plus `EventEmitter2` if the module doesn't already inject it.

**Analog — wallet-invariant sum assertion technique (SETTLE-08)** (`tour-settlement.service.spec.ts:236-267`):
```typescript
const credits = txn.transactionCreates;
const sum = credits.reduce((s, c) => s + Number(c.amount), 0);
expect(sum).toBe(10_000); // exactly the charge in NGN, zero drift
```
Apply this same pattern inside `settlement.service.spec.ts` (the primary SETTLE-08 test home) — parametrize over non-round amounts (`[9999.99, 10000.01, 33333.33, 7.77, 1000000.13]` per RESEARCH.md) — and reuse the assertion shape in each feature module's spec for its own settlement test case.

---

## Shared Patterns

### `@OnEvent` + Kafka dual-wire (D-04/D-05)
**Source:** `backend/src/modules/tour-bookings/tour-settlement.service.ts:83-104`
**Apply to:** Marketplace, Events, Studio, Stays `@OnEvent` handlers (all 4 net-new)
```typescript
async onModuleInit(): Promise<void> {
  await this.kafka
    .consume('payment.<type>', '<module>-service-prod', (msg) => this.handle<X>Payment(msg as Payload))
    .catch((err) => this.logger.error('Kafka consumer wiring failed for payment.<type>', err));
}

@OnEvent('payment.<type>')
handle<X>PaymentEvent(payload: Payload): Promise<void> {
  return this.handle<X>Payment(payload).catch((err: Error) => {
    this.logger.error(`<type> settlement failed for ${payload.reference}: ${err.message}`);
  });
}
```
Do NOT remove or "fix" the existing Kafka `onModuleInit` consumers — they are correct, just unreachable when `KAFKA_BROKER_URL` is unset (RESEARCH.md Anti-Pattern).

### Atomic wallet fan-out (SELECT FOR UPDATE + drift assertion + audit trail)
**Source:** `backend/src/modules/tour-bookings/tour-settlement.service.ts:236-345` → extracted to `backend/src/common/services/settlement.service.ts`
**Apply to:** every settlement caller (Tour, Marketplace, Events, Studio, Stays) — this is the entire point of SETTLE-01.

### Refund-on-failure
**Source:** `backend/src/common/services/refund.service.ts` (reuse as-is, D-07)
**Apply to:** `SettlementService`'s failure path — same shape as Tour's `handleSettlementFailure` (lines 409-467), generalized to accept a caller-supplied `module` tag in `metadata`.

### PlatformConfig fee/levy read (NEVER hardcode)
**Source:** `backend/src/modules/transport/transport.service.ts:516-520`, `backend/src/modules/marketplace/marketplace.service.ts:186-189`
**Apply to:** Events' and Studio's new fee/levy reads; Stays' `govtLevyPct` snapshot read at `createBooking()` time.
```typescript
const feeCfg = await this.prisma.platformConfig.findUnique({ where: { key: '<module>.platform_fee_pct' } });
const feePct = feeCfg ? Number(feeCfg.value) : <sane-default>;
```

### `@Roles()` + `RolesGuard` + `@CurrentUser()` access control
**Source:** `backend/src/common/guards/roles.guard.ts`, `backend/src/common/decorators/roles.decorator.ts`, `backend/src/common/decorators/current-user.decorator.ts`, applied in `admin.controller.ts:1-31` and `marketplace.controller.ts:123-136`
**Apply to:** the new `SettlementController` statement endpoint — self-scope for recipients, `@Roles(UserRole.SUPER_ADMIN, UserRole.LGA_ADMIN)` for admin override.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `backend/src/common/controllers/__tests__/settlement.controller.spec.ts` | test | request-response | No `*.controller.spec.ts` exists anywhere in the backend today (13 files use `@Roles()` but none have a dedicated controller test) — planner should follow the `Test.createTestingModule` + mocked-service-provider shape from `marketplace.service.spec.ts`/`stays.service.spec.ts` (service-spec convention), adapted for a controller (mock `SettlementService`, assert guard/route wiring via `supertest` or direct method invocation — check for e2e-spec precedent in `tour-bookings/__tests__/wallet-invariant.e2e-spec.ts` if an integration-style test is preferred). |
| `backend/prisma/migrations/<ts>_settlement_engine_foundation/` | migration | — | Prisma auto-generates migration SQL from `schema.prisma` diff via `prisma migrate dev` — no source pattern to copy, just run the CLI after schema edits. |

## Metadata

**Analog search scope:** `backend/src/modules/tour-bookings/`, `backend/src/modules/marketplace/`, `backend/src/modules/events/`, `backend/src/modules/studio/`, `backend/src/modules/stays/`, `backend/src/modules/webhooks/`, `backend/src/modules/transport/`, `backend/src/modules/admin/`, `backend/src/modules/wallet/`, `backend/src/common/`, `backend/prisma/`
**Files scanned:** ~20 (full or targeted reads); grep sweeps across `backend/src` for `@Roles(`, `platformConfig.findUnique`, `*.controller.spec.ts`
**Pattern extraction date:** 2026-07-17
