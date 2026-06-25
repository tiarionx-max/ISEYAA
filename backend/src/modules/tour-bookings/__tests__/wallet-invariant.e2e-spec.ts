/**
 * 09-12 — TOUR-10 Wallet Invariant Regression Specs
 *
 * Proves the core settlement invariant:
 *   sum(vendor credits) + platform commission == chargeAmount (NGN)
 *
 * These run as unit tests with a mocked PrismaService so they execute without
 * a live database. The mocks exercise the real TourSettlementService code paths.
 *
 * Six invariant scenarios (named to match the TOUR-10 spec):
 *   INV-1  100% split — credits sum exactly to chargeAmount, platform = 0
 *   INV-2  Partial split — platform absorbs the unclaimed remainder
 *   INV-3  ATTRACTION fallback — unset gov wallet rolls into platform, not lost
 *   INV-4  Idempotency — second call with same reference is a no-op
 *   INV-5  Rollback on failure — wallet update error triggers refund
 *   INV-6  Multiple charge amounts — invariant holds for 1000, 50000, 1000000 NGN
 */

import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  TourSettlementService,
  TourBookingPaymentPayload,
} from '../tour-settlement.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { RefundService } from '../../../common/services/refund.service';
import { KafkaService } from '../../../kafka/kafka.service';

// ── Fixtures ─────────────────────────────────────────────────────────────────

const BOOKING_ID      = 'BKG-INV-001';
const BUYER_USER_ID   = 'USR-INV-BUYER';
const BUYER_WALLET_ID = 'WAL-INV-BUYER';
const PAYSTACK_REF    = 'ISY-TOUR-INV00001';

const GUIDE_VENDOR_ID   = 'TG-INV-1';
const GUIDE_USER_ID     = 'USR-INV-GUIDE';
const GUIDE_WALLET_ID   = 'WAL-INV-GUIDE';

const HOST_PROPERTY_ID  = 'PROP-INV-1';
const HOST_USER_ID      = 'USR-INV-HOST';
const HOST_WALLET_ID    = 'WAL-INV-HOST';

const ATTRACTION_VENDOR_ID = 'ATR-INV-1';
const GOV_WALLET_USER_ID   = 'USR-INV-GOV';
const GOV_WALLET_ID        = 'WAL-INV-GOV';

const SYSTEM_USER_ID   = '00000000-0000-0000-0000-000000000001';
const SYSTEM_WALLET_ID = 'WAL-INV-SYSTEM';

// ── Mock interfaces ───────────────────────────────────────────────────────────

type AnyFn = jest.Mock;

interface MockPrisma {
  tourBooking:    { findUnique: AnyFn; update: AnyFn };
  transaction:    { findFirst: AnyFn; create: AnyFn };
  tourGuide:      { findUnique: AnyFn };
  property:       { findUnique: AnyFn };
  event:          { findUnique: AnyFn };
  platformConfig: { findUnique: AnyFn };
  wallet:         { findUnique: AnyFn; update: AnyFn; upsert: AnyFn };
  user:           { upsert: AnyFn };
  $transaction:   AnyFn;
  $executeRaw:    AnyFn;
}

interface TxnCapture {
  walletUpdates:      { id: string; balance: number }[];
  transactionCreates: any[];
  bookingUpdates:     any[];
}

let mockPrisma:  MockPrisma;
let mockRefund:  { refund: AnyFn };
let mockEvents:  { emit: AnyFn };
let mockKafka:   { consume: AnyFn; emit: AnyFn };
let txn:         TxnCapture;

// ── Transaction wire helper ───────────────────────────────────────────────────

/**
 * Wires `$transaction(async cb => cb(tx))` so every Prisma op inside the
 * settlement callback is captured into `txn`. Wallet balances are tracked
 * so successive credits within a single transaction accumulate correctly.
 */
function wireTransaction(opts: { failOnWalletUpdate?: string } = {}) {
  const balances: Record<string, number> = {
    [GUIDE_WALLET_ID]:  0,
    [HOST_WALLET_ID]:   0,
    [GOV_WALLET_ID]:    0,
    [SYSTEM_WALLET_ID]: 0,
  };

  mockPrisma.$transaction.mockImplementation(async (cb: any) => {
    const tx: any = {
      $executeRaw: jest.fn(async (strings: any) => {
        // Tagged template comes through as TemplateStringsArray; join to a string.
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

// ── Booking / payload builders ────────────────────────────────────────────────

function buildBooking(split: any[] = []) {
  return {
    id: BOOKING_ID,
    buyerUserId: BUYER_USER_ID,
    passengerCount: 1,
    splitBillPaidUserIds: [],
    snapshot: {
      name: 'Heritage Walk',
      settlementSplit: split,
    },
    metadata: {},
  };
}

function buildPayload(
  overrides: Partial<TourBookingPaymentPayload> = {},
  amountKobo = 1_000_000,
): TourBookingPaymentPayload {
  return {
    reference: PAYSTACK_REF,
    amount: amountKobo,
    metadata: { type: 'tour_booking', bookingId: BOOKING_ID, module: 'tour' },
    ...overrides,
  };
}

// ── Service factory ───────────────────────────────────────────────────────────

async function makeService(): Promise<TourSettlementService> {
  mockPrisma = {
    tourBooking:    { findUnique: jest.fn(), update: jest.fn() },
    transaction:    { findFirst: jest.fn(), create: jest.fn() },
    tourGuide:      { findUnique: jest.fn() },
    property:       { findUnique: jest.fn() },
    event:          { findUnique: jest.fn() },
    platformConfig: { findUnique: jest.fn() },
    wallet: {
      findUnique: jest.fn(),
      update:     jest.fn(),
      upsert:     jest.fn().mockResolvedValue({ id: SYSTEM_WALLET_ID }),
    },
    user: { upsert: jest.fn().mockResolvedValue({ id: SYSTEM_USER_ID }) },
    $transaction: jest.fn(),
    $executeRaw:  jest.fn(),
  };
  mockRefund = { refund: jest.fn().mockResolvedValue({}) };
  mockEvents = { emit: jest.fn() };
  mockKafka  = { consume: jest.fn().mockResolvedValue(undefined), emit: jest.fn() };

  const moduleRef: TestingModule = await Test.createTestingModule({
    providers: [
      TourSettlementService,
      { provide: PrismaService,  useValue: mockPrisma },
      { provide: RefundService,  useValue: mockRefund },
      { provide: EventEmitter2,  useValue: mockEvents },
      { provide: KafkaService,   useValue: mockKafka },
    ],
  }).compile();

  const svc = moduleRef.get(TourSettlementService);
  await svc.onModuleInit(); // resolves systemWalletId
  return svc;
}

// ── Default vendor resolver wiring ────────────────────────────────────────────

function primeVendorResolvers() {
  mockPrisma.tourGuide.findUnique.mockImplementation(async ({ where }: any) =>
    where.id === GUIDE_VENDOR_ID ? { userId: GUIDE_USER_ID } : null,
  );
  mockPrisma.property.findUnique.mockImplementation(async ({ where }: any) =>
    where.id === HOST_PROPERTY_ID ? { hostId: HOST_USER_ID } : null,
  );
  mockPrisma.event.findUnique.mockReturnValue(null);
  mockPrisma.wallet.findUnique.mockImplementation(async ({ where }: any) => {
    if (where.userId === GUIDE_USER_ID)    return { id: GUIDE_WALLET_ID,  balance: 0 };
    if (where.userId === HOST_USER_ID)     return { id: HOST_WALLET_ID,   balance: 0 };
    if (where.userId === GOV_WALLET_USER_ID) return { id: GOV_WALLET_ID, balance: 0 };
    if (where.userId === BUYER_USER_ID)    return { id: BUYER_WALLET_ID,  balance: 0 };
    return null;
  });
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  txn = { walletUpdates: [], transactionCreates: [], bookingUpdates: [] };
});

// ── TOUR-10 Invariant tests ───────────────────────────────────────────────────

describe('TOUR-10 Wallet Invariant', () => {
  // INV-1: 100% split — vendor credits + platform row sum to chargeAmount exactly.
  it('INV-1: 100% split (GUIDE 70 + HOST 30) — all credits sum to chargeAmount, platform = 0', async () => {
    const svc = await makeService();
    primeVendorResolvers();

    mockPrisma.tourBooking.findUnique.mockResolvedValueOnce(
      buildBooking([
        { vendorType: 'GUIDE', vendorId: GUIDE_VENDOR_ID, percentage: 70 },
        { vendorType: 'HOST',  vendorId: HOST_PROPERTY_ID, percentage: 30 },
      ]),
    );
    mockPrisma.transaction.findFirst.mockResolvedValue(null);
    mockPrisma.platformConfig.findUnique.mockResolvedValueOnce(null);
    wireTransaction();

    await svc.handleTourBookingPayment(buildPayload({}, 1_000_000)); // ₦10,000

    const sum = txn.transactionCreates.reduce((s, c) => s + Number(c.amount), 0);
    expect(sum).toBe(10_000); // invariant: credits == chargeAmount (NGN)

    const plat = txn.transactionCreates.find((c) => c.reference.endsWith('-PLAT'));
    expect(plat).toBeDefined();
    expect(Number(plat.amount)).toBe(0); // 100% claimed → platform gets 0

    // 2 vendor rows + 1 platform row
    expect(txn.transactionCreates.filter((c) => c.reference.includes('-V-'))).toHaveLength(2);
    expect(txn.transactionCreates.filter((c) => c.reference.endsWith('-PLAT'))).toHaveLength(1);
  });

  // INV-2: Partial split (sum < 100) — remaining percentage goes to platform.
  it('INV-2: partial split (GUIDE 50 + HOST 30) — platform absorbs remaining 20%', async () => {
    const svc = await makeService();
    primeVendorResolvers();

    mockPrisma.tourBooking.findUnique.mockResolvedValueOnce(
      buildBooking([
        { vendorType: 'GUIDE', vendorId: GUIDE_VENDOR_ID, percentage: 50 },
        { vendorType: 'HOST',  vendorId: HOST_PROPERTY_ID, percentage: 30 },
      ]),
    );
    mockPrisma.transaction.findFirst.mockResolvedValue(null);
    mockPrisma.platformConfig.findUnique.mockResolvedValueOnce(null);
    wireTransaction();

    await svc.handleTourBookingPayment(buildPayload({}, 1_000_000)); // ₦10,000

    const sum = txn.transactionCreates.reduce((s, c) => s + Number(c.amount), 0);
    expect(sum).toBe(10_000); // invariant holds

    const plat = txn.transactionCreates.find((c) => c.reference.endsWith('-PLAT'));
    expect(Number(plat.amount)).toBe(2_000); // 20% of ₦10,000
  });

  // INV-3: ATTRACTION fallback — when gov wallet PlatformConfig is unset,
  //        the attraction share rolls into platform (not dropped/lost).
  it('INV-3: ATTRACTION with unset gov wallet — share rolls to platform, sum still exact', async () => {
    const svc = await makeService();
    primeVendorResolvers();

    mockPrisma.tourBooking.findUnique.mockResolvedValueOnce(
      buildBooking([
        { vendorType: 'GUIDE',      vendorId: GUIDE_VENDOR_ID,    percentage: 60 },
        { vendorType: 'ATTRACTION', vendorId: ATTRACTION_VENDOR_ID, percentage: 40 },
      ]),
    );
    mockPrisma.transaction.findFirst.mockResolvedValue(null);
    // null value means gov wallet user id is unset
    mockPrisma.platformConfig.findUnique.mockResolvedValueOnce({ value: null });
    wireTransaction();

    await svc.handleTourBookingPayment(buildPayload({}, 500_000)); // ₦5,000

    const sum = txn.transactionCreates.reduce((s, c) => s + Number(c.amount), 0);
    expect(sum).toBe(5_000); // invariant: no NGN is lost

    // Only GUIDE gets a vendor row — ATTRACTION has no wallet
    const vendorRows = txn.transactionCreates.filter((c) => c.reference.includes('-V-'));
    expect(vendorRows).toHaveLength(1);
    expect(Number(vendorRows[0].amount)).toBe(3_000); // 60% of ₦5,000

    // Platform absorbs both its own 0% plus the ATTRACTION's 40%
    const plat = txn.transactionCreates.find((c) => c.reference.endsWith('-PLAT'));
    expect(Number(plat.amount)).toBe(2_000); // 40% rolled in
    expect(plat.metadata.attractionsRolledIn).toContain(ATTRACTION_VENDOR_ID);
  });

  // INV-4: Idempotency — second settlement call with same reference is a no-op;
  //        no additional wallet writes are performed.
  it('INV-4: idempotency — replay with existing -V-0 row is a strict no-op', async () => {
    const svc = await makeService();
    primeVendorResolvers();

    mockPrisma.tourBooking.findUnique.mockResolvedValueOnce(
      buildBooking([
        { vendorType: 'GUIDE', vendorId: GUIDE_VENDOR_ID, percentage: 100 },
      ]),
    );
    // Simulate an already-settled reference row
    mockPrisma.transaction.findFirst.mockResolvedValueOnce({ id: 'TXN-ALREADY-SETTLED' });
    wireTransaction();

    await svc.handleTourBookingPayment(buildPayload());

    // No $transaction callback should have been invoked
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    // No wallet writes
    expect(txn.transactionCreates).toHaveLength(0);
    expect(txn.walletUpdates).toHaveLength(0);
    // No refund attempted
    expect(mockRefund.refund).not.toHaveBeenCalled();
  });

  // INV-5: Rollback on failure — wallet update throws → RefundService is called
  //        and the booking transitions to REFUNDED.
  it('INV-5: wallet update failure triggers RefundService.refund and REFUNDED status', async () => {
    const svc = await makeService();
    primeVendorResolvers();

    mockPrisma.tourBooking.findUnique.mockResolvedValueOnce(
      buildBooking([
        { vendorType: 'GUIDE', vendorId: GUIDE_VENDOR_ID, percentage: 80 },
      ]),
    );
    mockPrisma.transaction.findFirst.mockResolvedValue(null);
    mockPrisma.platformConfig.findUnique.mockResolvedValueOnce(null);
    wireTransaction({ failOnWalletUpdate: GUIDE_WALLET_ID });

    await expect(
      svc.handleTourBookingPayment(buildPayload({}, 2_000_000)), // ₦20,000
    ).rejects.toThrow(/boom/);

    // Refund must fire exactly once with the correct buyer wallet and amount
    expect(mockRefund.refund).toHaveBeenCalledTimes(1);
    expect(mockRefund.refund).toHaveBeenCalledWith(
      expect.objectContaining({
        paystackReference: PAYSTACK_REF,
        amountKobo: 2_000_000,
        walletId: BUYER_WALLET_ID,
        reason: expect.stringContaining('tour_booking_settlement_failed'),
      }),
    );

    // Booking status must be flipped to REFUNDED (via the outer prisma, not tx)
    expect(mockPrisma.tourBooking.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: BOOKING_ID },
        data: expect.objectContaining({ status: 'REFUNDED' }),
      }),
    );
  });

  // INV-6: Multiple charge amounts — invariant holds for ₦1,000, ₦50,000, ₦1,000,000.
  it('INV-6: invariant holds across 1000 NGN / 50000 NGN / 1000000 NGN charge amounts', async () => {
    // Test amounts in kobo (Paystack unit)
    const testCases: [number, number][] = [
      [100_000,     1_000],    // ₦1,000
      [5_000_000,   50_000],   // ₦50,000
      [100_000_000, 1_000_000], // ₦1,000,000
    ];

    for (const [amountKobo, expectedNgn] of testCases) {
      jest.clearAllMocks();
      txn = { walletUpdates: [], transactionCreates: [], bookingUpdates: [] };

      const svc = await makeService();
      primeVendorResolvers();

      mockPrisma.tourBooking.findUnique.mockResolvedValueOnce(
        buildBooking([
          { vendorType: 'GUIDE', vendorId: GUIDE_VENDOR_ID, percentage: 60 },
          { vendorType: 'HOST',  vendorId: HOST_PROPERTY_ID, percentage: 25 },
        ]),
      );
      mockPrisma.transaction.findFirst.mockResolvedValue(null);
      mockPrisma.platformConfig.findUnique.mockResolvedValueOnce(null);
      wireTransaction();

      await svc.handleTourBookingPayment(
        buildPayload({ reference: `${PAYSTACK_REF}-${amountKobo}` }, amountKobo),
      );

      const sum = txn.transactionCreates.reduce((s, c) => s + Number(c.amount), 0);
      // Assert to within ₦0.02 to accommodate float rounding (service guard is ₦0.02)
      expect(Math.abs(sum - expectedNgn)).toBeLessThanOrEqual(0.02);
    }
  });
});
