import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  TourSettlementService,
  TourBookingPaymentPayload,
} from '../tour-settlement.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { RefundService } from '../../../common/services/refund.service';
import { KafkaService } from '../../../kafka/kafka.service';

/**
 * 09-06 — TourSettlementService spec.
 *
 * Eleven scenarios. The wallet invariant (TOUR-10) is proven by extracting
 * every CREDIT row written to `prisma.transaction.create` (vendor + platform)
 * and asserting the sum of their `amount` equals `payload.amount / 100`.
 */

// ── Fixtures ────────────────────────────────────────────────────────────────

const BOOKING_ID = 'BKG-1';
const BUYER_USER_ID = 'USR-BUYER';
const BUYER_WALLET_ID = 'WAL-BUYER';
const PAYSTACK_REF = 'ISY-TOUR-ABC123456789';

const GUIDE_VENDOR_ID = 'TG-1';
const GUIDE_USER_ID = 'USR-GUIDE';
const GUIDE_WALLET_ID = 'WAL-GUIDE';

const HOST_PROPERTY_ID = 'PROP-1';
const HOST_USER_ID = 'USR-HOST';
const HOST_WALLET_ID = 'WAL-HOST';

const ORGANISER_EVENT_ID = 'EV-1';
const ORGANISER_USER_ID = 'USR-ORG';
const ORGANISER_WALLET_ID = 'WAL-ORG';

const ATTRACTION_VENDOR_ID = 'ATR-1';
const GOV_WALLET_USER_ID = 'USR-GOV';
const GOV_WALLET_ID = 'WAL-GOV';

const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000001';
const SYSTEM_WALLET_ID = 'WAL-SYSTEM';

interface BookingOverrides {
  split?: any[];
  snapshotName?: string;
  passengerCount?: number;
  splitBillPaidUserIds?: string[];
  metadata?: any;
}

function buildBooking(o: BookingOverrides = {}) {
  return {
    id: BOOKING_ID,
    buyerUserId: BUYER_USER_ID,
    passengerCount: o.passengerCount ?? 1,
    splitBillPaidUserIds: o.splitBillPaidUserIds ?? [],
    snapshot: {
      name: o.snapshotName ?? 'Heritage Walk',
      settlementSplit: o.split ?? [
        { vendorType: 'GUIDE', vendorId: GUIDE_VENDOR_ID, percentage: 100 },
      ],
    },
    metadata: o.metadata ?? {},
  };
}

function buildPayload(over: Partial<TourBookingPaymentPayload> = {}): TourBookingPaymentPayload {
  return {
    reference: PAYSTACK_REF,
    amount: 1_000_000, // ₦10,000 in kobo
    metadata: { type: 'tour_booking', bookingId: BOOKING_ID, module: 'tour' },
    ...over,
  };
}

// ── Mock Prisma surface ─────────────────────────────────────────────────────

type AnyFn = jest.Mock;
interface MockPrisma {
  tourBooking: { findUnique: AnyFn; update: AnyFn };
  transaction: { findFirst: AnyFn; create: AnyFn };
  tourGuide: { findUnique: AnyFn };
  property: { findUnique: AnyFn };
  event: { findUnique: AnyFn };
  platformConfig: { findUnique: AnyFn };
  wallet: { findUnique: AnyFn; update: AnyFn; upsert: AnyFn };
  user: { upsert: AnyFn };
  $transaction: AnyFn;
  $executeRaw: AnyFn;
}

let mockPrisma: MockPrisma;
let mockRefund: { refund: AnyFn };
let mockEvents: { emit: AnyFn };
let mockKafka: { consume: AnyFn; emit: AnyFn };

// Helpers — capture writes performed inside the $transaction callback.
interface TxnCapture {
  walletUpdates: { id: string; balance: number }[];
  transactionCreates: any[];
  bookingUpdates: any[];
  executeRawCalls: string[];
}
let txn: TxnCapture;

/**
 * Configures `$transaction(async cb => cb(tx))` such that every Prisma op the
 * settlement service issues against `tx` is captured into `txn` for assertions.
 *
 * Wallet balances are tracked so that successive credits accumulate correctly
 * within a single transaction (e.g. vendor + system wallet writes).
 */
function wireTransaction(opts: { failOnWalletUpdate?: string } = {}) {
  // Per-wallet running balance — initially 0 for all wallets.
  const balances: Record<string, number> = {
    [GUIDE_WALLET_ID]: 0,
    [HOST_WALLET_ID]: 0,
    [ORGANISER_WALLET_ID]: 0,
    [GOV_WALLET_ID]: 0,
    [SYSTEM_WALLET_ID]: 0,
  };
  mockPrisma.$transaction.mockImplementation(async (cb: any) => {
    const tx: any = {
      $executeRaw: jest.fn(async (strings: any) => {
        // The tagged template comes through as a TemplateStringsArray plus values.
        txn.executeRawCalls.push((strings as TemplateStringsArray).join('?'));
        return 1;
      }),
      wallet: {
        findUnique: jest.fn(async ({ where }: any) => ({
          id: where.id,
          balance: balances[where.id] ?? 0,
        })),
        update: jest.fn(async ({ where, data }: any) => {
          if (opts.failOnWalletUpdate && where.id === opts.failOnWalletUpdate) {
            throw new Error('boom — vendor wallet update failed');
          }
          balances[where.id] = Number(data.balance);
          txn.walletUpdates.push({ id: where.id, balance: Number(data.balance) });
          return { id: where.id, balance: balances[where.id] };
        }),
      },
      transaction: {
        create: jest.fn(async ({ data }: any) => {
          txn.transactionCreates.push(data);
          return { id: 'TXN-' + txn.transactionCreates.length, ...data };
        }),
      },
      tourBooking: {
        update: jest.fn(async ({ where, data }: any) => {
          txn.bookingUpdates.push({ where, data, source: 'tx' });
          return { id: where.id, ...data };
        }),
      },
    };
    return cb(tx);
  });
}

// ── Module setup ────────────────────────────────────────────────────────────

async function makeService(): Promise<TourSettlementService> {
  mockPrisma = {
    tourBooking: { findUnique: jest.fn(), update: jest.fn() },
    transaction: { findFirst: jest.fn(), create: jest.fn() },
    tourGuide: { findUnique: jest.fn() },
    property: { findUnique: jest.fn() },
    event: { findUnique: jest.fn() },
    platformConfig: { findUnique: jest.fn() },
    wallet: {
      findUnique: jest.fn(),
      update: jest.fn(),
      // upsert returns the system wallet during onModuleInit
      upsert: jest.fn().mockResolvedValue({ id: SYSTEM_WALLET_ID }),
    },
    user: { upsert: jest.fn().mockResolvedValue({ id: SYSTEM_USER_ID }) },
    $transaction: jest.fn(),
    $executeRaw: jest.fn(),
  };
  mockRefund = { refund: jest.fn().mockResolvedValue({}) };
  mockEvents = { emit: jest.fn() };
  mockKafka = { consume: jest.fn().mockResolvedValue(undefined), emit: jest.fn() };

  const moduleRef: TestingModule = await Test.createTestingModule({
    providers: [
      TourSettlementService,
      { provide: PrismaService, useValue: mockPrisma },
      { provide: RefundService, useValue: mockRefund },
      { provide: EventEmitter2, useValue: mockEvents },
      { provide: KafkaService, useValue: mockKafka },
    ],
  }).compile();
  const svc = moduleRef.get(TourSettlementService);
  await svc.onModuleInit(); // resolves systemWalletId
  return svc;
}

// Default vendor wallet resolver — caller sets vendor IDs found below.
function primeVendorResolvers() {
  mockPrisma.tourGuide.findUnique.mockImplementation(async ({ where }: any) =>
    where.id === GUIDE_VENDOR_ID ? { userId: GUIDE_USER_ID } : null,
  );
  mockPrisma.property.findUnique.mockImplementation(async ({ where }: any) =>
    where.id === HOST_PROPERTY_ID ? { hostId: HOST_USER_ID } : null,
  );
  mockPrisma.event.findUnique.mockImplementation(async ({ where }: any) =>
    where.id === ORGANISER_EVENT_ID ? { organizerId: ORGANISER_USER_ID } : null,
  );
  // Outer wallet.findUnique resolves by userId for vendor wallets and
  // by id for the buyer-wallet lookup in handleSettlementFailure.
  mockPrisma.wallet.findUnique.mockImplementation(async ({ where }: any) => {
    if (where.userId === GUIDE_USER_ID) return { id: GUIDE_WALLET_ID, balance: 0 };
    if (where.userId === HOST_USER_ID) return { id: HOST_WALLET_ID, balance: 0 };
    if (where.userId === ORGANISER_USER_ID) return { id: ORGANISER_WALLET_ID, balance: 0 };
    if (where.userId === GOV_WALLET_USER_ID) return { id: GOV_WALLET_ID, balance: 0 };
    if (where.userId === BUYER_USER_ID) return { id: BUYER_WALLET_ID, balance: 0 };
    return null;
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  txn = {
    walletUpdates: [],
    transactionCreates: [],
    bookingUpdates: [],
    executeRawCalls: [],
  };
});

// ── Tests ───────────────────────────────────────────────────────────────────

describe('TourSettlementService', () => {
  // 1. Wallet invariant — 100% split, solo booking
  it('1. wallet invariant — 100% split (GUIDE 60 + HOST 30 + ATTRACTION 10), platform 0', async () => {
    const svc = await makeService();
    primeVendorResolvers();
    mockPrisma.tourBooking.findUnique.mockResolvedValueOnce(
      buildBooking({
        split: [
          { vendorType: 'GUIDE', vendorId: GUIDE_VENDOR_ID, percentage: 60 },
          { vendorType: 'HOST', vendorId: HOST_PROPERTY_ID, percentage: 30 },
          { vendorType: 'ATTRACTION', vendorId: ATTRACTION_VENDOR_ID, percentage: 10 },
        ],
      }),
    );
    mockPrisma.transaction.findFirst.mockResolvedValue(null); // no idempotency hit
    mockPrisma.platformConfig.findUnique.mockResolvedValueOnce({
      value: GOV_WALLET_USER_ID,
    });
    wireTransaction();

    await svc.handleTourBookingPayment(buildPayload());

    const credits = txn.transactionCreates;
    const sum = credits.reduce((s, c) => s + Number(c.amount), 0);
    expect(sum).toBe(10_000); // exactly the charge in NGN

    // Three vendor rows + one platform row.
    expect(credits.filter((c) => c.reference.includes('-V-'))).toHaveLength(3);
    expect(credits.filter((c) => c.reference.endsWith('-PLAT'))).toHaveLength(1);

    const plat = credits.find((c) => c.reference.endsWith('-PLAT'));
    expect(Number(plat.amount)).toBe(0); // 100% claimed → 0 platform
  });

  // 2. Wallet invariant — partial split (sum < 100), platform absorbs the rest.
  it('2. wallet invariant — partial split (GUIDE 50 + HOST 30), platform takes 20%', async () => {
    const svc = await makeService();
    primeVendorResolvers();
    mockPrisma.tourBooking.findUnique.mockResolvedValueOnce(
      buildBooking({
        split: [
          { vendorType: 'GUIDE', vendorId: GUIDE_VENDOR_ID, percentage: 50 },
          { vendorType: 'HOST', vendorId: HOST_PROPERTY_ID, percentage: 30 },
        ],
      }),
    );
    mockPrisma.transaction.findFirst.mockResolvedValue(null);
    mockPrisma.platformConfig.findUnique.mockResolvedValueOnce(null);
    wireTransaction();

    await svc.handleTourBookingPayment(buildPayload());

    const sum = txn.transactionCreates.reduce(
      (s, c) => s + Number(c.amount),
      0,
    );
    expect(sum).toBe(10_000);

    const plat = txn.transactionCreates.find((c) =>
      c.reference.endsWith('-PLAT'),
    );
    expect(Number(plat.amount)).toBe(2_000);
  });

  // 3. ATTRACTION fallback — gov wallet unset rolls into platform.
  it('3. ATTRACTION fallback rolls share into platform when gov wallet PlatformConfig is unset', async () => {
    const svc = await makeService();
    primeVendorResolvers();
    const warnSpy = jest.spyOn((svc as any).logger, 'warn');
    mockPrisma.tourBooking.findUnique.mockResolvedValueOnce(
      buildBooking({
        split: [
          { vendorType: 'GUIDE', vendorId: GUIDE_VENDOR_ID, percentage: 60 },
          { vendorType: 'ATTRACTION', vendorId: ATTRACTION_VENDOR_ID, percentage: 40 },
        ],
      }),
    );
    mockPrisma.transaction.findFirst.mockResolvedValue(null);
    mockPrisma.platformConfig.findUnique.mockResolvedValueOnce({ value: null });
    wireTransaction();

    await svc.handleTourBookingPayment(buildPayload());

    const vendorRows = txn.transactionCreates.filter((c) =>
      c.reference.includes('-V-'),
    );
    // Only GUIDE wrote a vendor row — ATTRACTION rolled into platform.
    expect(vendorRows).toHaveLength(1);
    expect(Number(vendorRows[0].amount)).toBe(6_000);

    const plat = txn.transactionCreates.find((c) =>
      c.reference.endsWith('-PLAT'),
    );
    expect(Number(plat.amount)).toBe(4_000);

    // Sum to-the-kobo
    const sum = txn.transactionCreates.reduce(
      (s, c) => s + Number(c.amount),
      0,
    );
    expect(sum).toBe(10_000);

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('tour.government_wallet_user_id'),
    );

    // Audit trail in platform metadata captures the unresolved attraction id.
    expect(plat.metadata.attractionsRolledIn).toContain(ATTRACTION_VENDOR_ID);
  });

  // 4. Idempotency — replay returns early, no writes.
  it('4. idempotency — replay with existing -V-0 row is a no-op', async () => {
    const svc = await makeService();
    primeVendorResolvers();
    mockPrisma.tourBooking.findUnique.mockResolvedValueOnce(buildBooking());
    mockPrisma.transaction.findFirst.mockResolvedValueOnce({ id: 'TXN-old' });
    wireTransaction();

    await svc.handleTourBookingPayment(buildPayload());

    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(mockRefund.refund).not.toHaveBeenCalled();
    expect(mockPrisma.tourBooking.update).not.toHaveBeenCalled();
  });

  // 5. Refund on failure — vendor wallet update throws → rollback → refund + REFUNDED.
  it('5. refund on failure — mid-transaction throw triggers RefundService + status REFUNDED', async () => {
    const svc = await makeService();
    primeVendorResolvers();
    mockPrisma.tourBooking.findUnique.mockResolvedValueOnce(
      buildBooking({
        split: [
          { vendorType: 'GUIDE', vendorId: GUIDE_VENDOR_ID, percentage: 70 },
        ],
      }),
    );
    mockPrisma.transaction.findFirst.mockResolvedValue(null);
    mockPrisma.platformConfig.findUnique.mockResolvedValueOnce(null);
    wireTransaction({ failOnWalletUpdate: GUIDE_WALLET_ID });

    await expect(
      svc.handleTourBookingPayment(buildPayload()),
    ).rejects.toThrow(/boom/);

    expect(mockRefund.refund).toHaveBeenCalledTimes(1);
    expect(mockRefund.refund).toHaveBeenCalledWith(
      expect.objectContaining({
        paystackReference: PAYSTACK_REF,
        amountKobo: 1_000_000,
        walletId: BUYER_WALLET_ID,
        reason: expect.stringContaining('tour_booking_settlement_failed'),
      }),
    );

    expect(mockPrisma.tourBooking.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: BOOKING_ID },
        data: expect.objectContaining({ status: 'REFUNDED' }),
      }),
    );
  });

  // 6. SELECT FOR UPDATE invocation count — N vendors + 1 system wallet.
  it('6. SELECT FOR UPDATE fires once per vendor + once for system wallet (N+1)', async () => {
    const svc = await makeService();
    primeVendorResolvers();
    mockPrisma.tourBooking.findUnique.mockResolvedValueOnce(
      buildBooking({
        split: [
          { vendorType: 'GUIDE', vendorId: GUIDE_VENDOR_ID, percentage: 40 },
          { vendorType: 'HOST', vendorId: HOST_PROPERTY_ID, percentage: 30 },
          { vendorType: 'ORGANISER', vendorId: ORGANISER_EVENT_ID, percentage: 20 },
        ],
      }),
    );
    mockPrisma.transaction.findFirst.mockResolvedValue(null);
    mockPrisma.platformConfig.findUnique.mockResolvedValueOnce(null);
    wireTransaction();

    await svc.handleTourBookingPayment(buildPayload());

    // 3 vendor wallets + 1 system wallet = 4 locks
    expect(txn.executeRawCalls).toHaveLength(4);
    // Every locking string mentions FOR UPDATE
    for (const sql of txn.executeRawCalls) {
      expect(sql).toContain('FOR UPDATE');
    }
  });

  // 7. Solo booking transitions to CONFIRMED INSIDE the $transaction.
  it('7. solo booking flips status=CONFIRMED inside the $transaction', async () => {
    const svc = await makeService();
    primeVendorResolvers();
    mockPrisma.tourBooking.findUnique.mockResolvedValueOnce(buildBooking());
    mockPrisma.transaction.findFirst.mockResolvedValue(null);
    mockPrisma.platformConfig.findUnique.mockResolvedValueOnce(null);
    wireTransaction();

    await svc.handleTourBookingPayment(buildPayload());

    const confirmInsideTxn = txn.bookingUpdates.find(
      (u) => u.data.status === 'CONFIRMED',
    );
    expect(confirmInsideTxn).toBeDefined();
    expect(confirmInsideTxn.data.paymentReference).toBe(PAYSTACK_REF);

    // Outer prisma.tourBooking.update is only used by the split-bill path
    // (or the failure path) — not solo.
    expect(mockPrisma.tourBooking.update).not.toHaveBeenCalled();
  });

  // 8. Split-bill child — first share doesn't move to CONFIRMED.
  it('8. split-bill first share appends shareKey but does NOT flip to CONFIRMED', async () => {
    const svc = await makeService();
    primeVendorResolvers();
    const booking = buildBooking({
      passengerCount: 4,
      splitBillPaidUserIds: [],
    });
    mockPrisma.tourBooking.findUnique
      .mockResolvedValueOnce(booking) // entry resolution
      .mockResolvedValueOnce({ metadata: {} }); // outside-txn metadata reread
    mockPrisma.transaction.findFirst.mockResolvedValue(null);
    mockPrisma.platformConfig.findUnique.mockResolvedValueOnce(null);
    wireTransaction();

    // Outside-txn updates use prisma.tourBooking.update directly — first returns
    // the post-push array (1 < 4) so CONFIRMED is NOT issued.
    mockPrisma.tourBooking.update.mockResolvedValueOnce({
      splitBillPaidUserIds: ['USR-A'],
      passengerCount: 4,
    });

    await svc.handleTourBookingPayment(
      buildPayload({
        metadata: {
          type: 'tour_booking',
          bookingId: BOOKING_ID,
          shareKey: 'USR-A',
          parentReference: 'ISY-TOUR-PARENT0',
          module: 'tour',
        },
      }),
    );

    // The wallet $transaction must NOT have flipped status inside (split-bill child).
    expect(
      txn.bookingUpdates.find((u) => u.data.status === 'CONFIRMED'),
    ).toBeUndefined();

    // Outer update fired exactly once (the array push) — no second CONFIRMED update.
    expect(mockPrisma.tourBooking.update).toHaveBeenCalledTimes(1);
    const pushCall = mockPrisma.tourBooking.update.mock.calls[0][0];
    expect(pushCall.data.splitBillPaidUserIds).toEqual({ push: 'USR-A' });

    // No tour_booking.confirmed event fired yet.
    expect(mockEvents.emit).not.toHaveBeenCalledWith(
      'tour_booking.confirmed',
      expect.any(Object),
    );
  });

  // 9. Split-bill child — last share triggers CONFIRMED + emits event.
  it('9. split-bill final share flips status=CONFIRMED + emits tour_booking.confirmed', async () => {
    const svc = await makeService();
    primeVendorResolvers();
    const booking = buildBooking({
      passengerCount: 4,
      splitBillPaidUserIds: ['USR-A', 'USR-B', 'USR-C'],
    });
    mockPrisma.tourBooking.findUnique
      .mockResolvedValueOnce(booking)
      .mockResolvedValueOnce({ metadata: { shares: {} } });
    mockPrisma.transaction.findFirst.mockResolvedValue(null);
    mockPrisma.platformConfig.findUnique.mockResolvedValueOnce(null);
    wireTransaction();

    // Outer update returns post-push array (length 4 == passengerCount).
    mockPrisma.tourBooking.update
      .mockResolvedValueOnce({
        splitBillPaidUserIds: ['USR-A', 'USR-B', 'USR-C', 'USR-D'],
        passengerCount: 4,
      })
      // Second outer update is the CONFIRMED flip.
      .mockResolvedValueOnce({ id: BOOKING_ID, status: 'CONFIRMED' });

    await svc.handleTourBookingPayment(
      buildPayload({
        reference: 'ISY-TOUR-CHILD4',
        metadata: {
          type: 'tour_booking',
          bookingId: BOOKING_ID,
          shareKey: 'USR-D',
          parentReference: 'ISY-TOUR-PARENT0',
          module: 'tour',
        },
      }),
    );

    expect(mockPrisma.tourBooking.update).toHaveBeenCalledTimes(2);
    const secondCall = mockPrisma.tourBooking.update.mock.calls[1][0];
    expect(secondCall.data.status).toBe('CONFIRMED');
    expect(secondCall.data.paymentReference).toBe('ISY-TOUR-PARENT0');

    expect(mockEvents.emit).toHaveBeenCalledWith(
      'tour_booking.confirmed',
      expect.objectContaining({
        bookingId: BOOKING_ID,
        reference: 'ISY-TOUR-PARENT0',
      }),
    );
  });

  // 10. Missing bookingId — handler logs and returns; no DB writes.
  it('10. missing bookingId — handler returns without DB writes', async () => {
    const svc = await makeService();
    mockPrisma.tourBooking.findUnique.mockClear();

    await svc.handleTourBookingPayment({
      reference: PAYSTACK_REF,
      amount: 500_000,
      metadata: { type: 'tour_booking' }, // no bookingId
    });

    expect(mockPrisma.tourBooking.findUnique).not.toHaveBeenCalled();
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(mockRefund.refund).not.toHaveBeenCalled();
  });

  // 11. Reference shape — every CREDIT row matches the documented scheme.
  it('11. reference shape — vendor rows are <ref>-V-<idx>, platform row is <ref>-PLAT', async () => {
    const svc = await makeService();
    primeVendorResolvers();
    mockPrisma.tourBooking.findUnique.mockResolvedValueOnce(
      buildBooking({
        split: [
          { vendorType: 'GUIDE', vendorId: GUIDE_VENDOR_ID, percentage: 40 },
          { vendorType: 'HOST', vendorId: HOST_PROPERTY_ID, percentage: 30 },
        ],
      }),
    );
    mockPrisma.transaction.findFirst.mockResolvedValue(null);
    mockPrisma.platformConfig.findUnique.mockResolvedValueOnce(null);
    wireTransaction();

    await svc.handleTourBookingPayment(buildPayload());

    const refs = txn.transactionCreates.map((c) => c.reference);
    expect(refs).toEqual(
      expect.arrayContaining([
        `${PAYSTACK_REF}-V-0`,
        `${PAYSTACK_REF}-V-1`,
        `${PAYSTACK_REF}-PLAT`,
      ]),
    );
    // gatewayRef on every row equals the original Paystack reference (audit trail).
    for (const create of txn.transactionCreates) {
      expect(create.gatewayRef).toBe(PAYSTACK_REF);
      expect(create.gateway).toBe('PAYSTACK');
      expect(create.type).toBe('CREDIT');
      expect(create.status).toBe('SUCCESS');
      expect(create.currency).toBe('NGN');
    }
  });

  // Defensive guard — split percentages > 100 rejected before wallet writes.
  it('rejects split percentages totalling > 100 (defence-in-depth above DB CHECK)', async () => {
    const svc = await makeService();
    primeVendorResolvers();
    mockPrisma.tourBooking.findUnique.mockResolvedValueOnce(
      buildBooking({
        split: [
          { vendorType: 'GUIDE', vendorId: GUIDE_VENDOR_ID, percentage: 70 },
          { vendorType: 'HOST', vendorId: HOST_PROPERTY_ID, percentage: 40 },
        ],
      }),
    );
    mockPrisma.transaction.findFirst.mockResolvedValue(null);
    wireTransaction();

    await expect(
      svc.handleTourBookingPayment(buildPayload()),
    ).rejects.toThrow(/sum to 110/);

    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(mockRefund.refund).toHaveBeenCalledTimes(1);
  });
});
