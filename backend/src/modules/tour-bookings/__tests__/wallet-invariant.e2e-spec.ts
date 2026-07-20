/**
 * 09-12 / 20-04 — TOUR-10 Wallet Invariant Regression Specs
 *
 * Proves the core settlement invariant at TourSettlementService's actual
 * boundary: the `recipients` array (and `onSettled`/`onFailure` callbacks)
 * it hands to the shared `SettlementService.settle()` — NOT a local
 * `$transaction` (that primitive moved to `SettlementService` in Phase 12/18
 * and is already covered by `settlement.service.spec.ts`).
 *
 * These run as unit tests with a mocked PrismaService/SettlementService/
 * VisitorLogService so they execute without a live database. The mocks
 * exercise the real TourSettlementService vendor-resolution code path.
 *
 * Six invariant scenarios (named to match the TOUR-10 spec):
 *   INV-1  100% split — recipients sum exactly to chargeAmount, nothing unclaimed
 *   INV-2  Partial split — unclaimed remainder deliberately absent from recipients
 *   INV-3  ATTRACTION fallback — unset gov wallet included with walletId null, rolled into attractionsRolledIn
 *   INV-4  Delegated idempotency — TourSettlementService always calls settle() once, regardless of REPLAYED/SETTLED result
 *   INV-5  Rollback on failure — settle()'s onFailure callback flips booking to REFUNDED
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
import { SettlementService } from '../../../common/services/settlement.service';
import { VisitorLogService } from '../../../common/services/visitor-log.service';

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

let mockPrisma:            MockPrisma;
let mockRefund:            { refund: AnyFn };
let mockEvents:            { emit: AnyFn };
let mockKafka:             { consume: AnyFn; emit: AnyFn };
let mockSettlementService: { settle: AnyFn; resolveMinistryWallet: AnyFn; resolveSplit: AnyFn };
let mockVisitorLog:        { record: AnyFn };

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
  mockSettlementService = {
    settle: jest.fn().mockResolvedValue({ status: 'SETTLED', platformAmountNgn: 0, recipientCredits: [] }),
    resolveMinistryWallet: jest.fn(),
    resolveSplit: jest.fn(),
  };
  mockVisitorLog = { record: jest.fn().mockResolvedValue(undefined) };

  const moduleRef: TestingModule = await Test.createTestingModule({
    providers: [
      TourSettlementService,
      { provide: PrismaService,        useValue: mockPrisma },
      { provide: RefundService,        useValue: mockRefund },
      { provide: EventEmitter2,        useValue: mockEvents },
      { provide: KafkaService,         useValue: mockKafka },
      { provide: SettlementService,    useValue: mockSettlementService },
      { provide: VisitorLogService,    useValue: mockVisitorLog },
    ],
  }).compile();

  const svc = moduleRef.get(TourSettlementService);
  await svc.onModuleInit(); // resolves systemWalletId (kafka.consume only, no-op here)
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
});

// ── TOUR-10 Invariant tests ───────────────────────────────────────────────────

describe('TOUR-10 Wallet Invariant', () => {
  // INV-1: 100% split — recipients sum exactly to chargeAmount, nothing unclaimed.
  it('INV-1: 100% split (GUIDE 70 + HOST 30) — recipients sum to chargeAmount exactly', async () => {
    const svc = await makeService();
    primeVendorResolvers();

    mockPrisma.tourBooking.findUnique.mockResolvedValueOnce(
      buildBooking([
        { vendorType: 'GUIDE', vendorId: GUIDE_VENDOR_ID, percentage: 70 },
        { vendorType: 'HOST',  vendorId: HOST_PROPERTY_ID, percentage: 30 },
      ]),
    );
    mockPrisma.platformConfig.findUnique.mockResolvedValueOnce(null);

    await svc.handleTourBookingPayment(buildPayload({}, 1_000_000)); // ₦10,000

    expect(mockSettlementService.settle).toHaveBeenCalledTimes(1);
    const input = mockSettlementService.settle.mock.calls[0][0];

    expect(input.recipients).toHaveLength(2);

    const guideEntry = input.recipients.find((r: any) => r.tag === 'GUIDE');
    expect(guideEntry).toMatchObject({
      tag: 'GUIDE',
      refSuffix: 'V-0',
      walletId: GUIDE_WALLET_ID,
      amountNgn: 7000,
    });

    const hostEntry = input.recipients.find((r: any) => r.tag === 'HOST');
    expect(hostEntry).toMatchObject({
      tag: 'HOST',
      refSuffix: 'V-1',
      walletId: HOST_WALLET_ID,
      amountNgn: 3000,
    });

    const sum = input.recipients.reduce((s: number, r: any) => s + r.amountNgn, 0);
    expect(sum).toBe(10_000); // invariant: a 100%-claimed split leaves nothing for platform to absorb
  });

  // INV-2: Partial split (sum < 100) — unclaimed remainder is deliberately NOT
  //        present in recipients (platform absorbs it inside SettlementService.settle()).
  it('INV-2: partial split (GUIDE 50 + HOST 30) — unclaimed 20% absent from recipients', async () => {
    const svc = await makeService();
    primeVendorResolvers();

    mockPrisma.tourBooking.findUnique.mockResolvedValueOnce(
      buildBooking([
        { vendorType: 'GUIDE', vendorId: GUIDE_VENDOR_ID, percentage: 50 },
        { vendorType: 'HOST',  vendorId: HOST_PROPERTY_ID, percentage: 30 },
      ]),
    );
    mockPrisma.platformConfig.findUnique.mockResolvedValueOnce(null);

    await svc.handleTourBookingPayment(buildPayload({}, 1_000_000)); // ₦10,000

    expect(mockSettlementService.settle).toHaveBeenCalledTimes(1);
    const input = mockSettlementService.settle.mock.calls[0][0];

    const sum = input.recipients.reduce((s: number, r: any) => s + r.amountNgn, 0);
    expect(sum).toBe(8_000); // 50% + 30% claimed — unclaimed ₦2,000 (20%) not in recipients
  });

  // INV-3: ATTRACTION fallback — when gov wallet PlatformConfig is unset, the
  //        ATTRACTION entry is still included in recipients with walletId: null
  //        (NOT filtered out), and rolled into attractionsRolledIn metadata.
  it('INV-3: ATTRACTION with unset gov wallet — included with walletId null, rolled into attractionsRolledIn', async () => {
    const svc = await makeService();
    primeVendorResolvers();

    mockPrisma.tourBooking.findUnique.mockResolvedValueOnce(
      buildBooking([
        { vendorType: 'GUIDE',      vendorId: GUIDE_VENDOR_ID,      percentage: 60 },
        { vendorType: 'ATTRACTION', vendorId: ATTRACTION_VENDOR_ID, percentage: 40 },
      ]),
    );
    // null value means gov wallet user id is unset
    mockPrisma.platformConfig.findUnique.mockResolvedValueOnce({ value: null });

    await svc.handleTourBookingPayment(buildPayload({}, 500_000)); // ₦5,000

    expect(mockSettlementService.settle).toHaveBeenCalledTimes(1);
    const input = mockSettlementService.settle.mock.calls[0][0];

    expect(input.recipients).toHaveLength(2); // GUIDE resolved + ATTRACTION included with null walletId

    const guideEntry = input.recipients.find((r: any) => r.tag === 'GUIDE');
    expect(guideEntry.amountNgn).toBe(3_000); // 60% of ₦5,000
    expect(guideEntry.walletId).toBe(GUIDE_WALLET_ID);

    const attractionEntry = input.recipients.find((r: any) => r.tag === 'ATTRACTION');
    expect(attractionEntry.amountNgn).toBe(2_000); // 40% of ₦5,000
    expect(attractionEntry.walletId).toBeNull();

    expect(input.platformMetadata.attractionsRolledIn).toContain(ATTRACTION_VENDOR_ID);
  });

  // INV-4: Delegated idempotency — TourSettlementService has no local idempotency
  //        precheck of its own; it always calls settle() once with the correctly
  //        resolved recipients, regardless of whether settle() itself reports a
  //        fresh SETTLED result or a REPLAYED no-op (idempotency lives entirely
  //        inside SettlementService now).
  it('INV-4: always delegates to settle() exactly once, even when settle() reports REPLAYED', async () => {
    const svc = await makeService();
    primeVendorResolvers();

    mockSettlementService.settle.mockResolvedValueOnce({
      status: 'REPLAYED',
      platformAmountNgn: 0,
      recipientCredits: [],
    });

    mockPrisma.tourBooking.findUnique.mockResolvedValueOnce(
      buildBooking([
        { vendorType: 'GUIDE', vendorId: GUIDE_VENDOR_ID, percentage: 100 },
      ]),
    );
    mockPrisma.platformConfig.findUnique.mockResolvedValueOnce(null);

    await svc.handleTourBookingPayment(buildPayload());

    // TourSettlementService always delegates to SettlementService's own idempotency
    // check rather than adding a redundant local one.
    expect(mockSettlementService.settle).toHaveBeenCalledTimes(1);
    const input = mockSettlementService.settle.mock.calls[0][0];
    expect(input.recipients).toHaveLength(1);
    expect(input.recipients[0]).toMatchObject({
      tag: 'GUIDE',
      refSuffix: 'V-0',
      walletId: GUIDE_WALLET_ID,
      amountNgn: 10_000,
    });
  });

  // INV-5: Rollback on failure — settle()'s onFailure callback (invoked internally
  //        by the real SettlementService on drift/transaction failure, simulated
  //        here via the mock) flips the booking to REFUNDED via TourSettlementService's
  //        own onFailure handler. The real RefundService.refund() call for this path
  //        now happens inside SettlementService.settle() itself (mocked out here,
  //        already covered by settlement.service.spec.ts).
  it('INV-5: settle() failure triggers onFailure callback and REFUNDED status', async () => {
    const svc = await makeService();
    primeVendorResolvers();

    mockPrisma.tourBooking.findUnique.mockResolvedValueOnce(
      buildBooking([
        { vendorType: 'GUIDE', vendorId: GUIDE_VENDOR_ID, percentage: 80 },
      ]),
    );
    mockPrisma.platformConfig.findUnique.mockResolvedValueOnce(null);

    mockSettlementService.settle.mockImplementationOnce(async (input: any) => {
      await input.onFailure(new Error('boom — vendor wallet update failed'));
      throw new Error('boom — vendor wallet update failed');
    });

    await expect(
      svc.handleTourBookingPayment(buildPayload({}, 2_000_000)), // ₦20,000
    ).rejects.toThrow(/boom/);

    // Booking status must be flipped to REFUNDED by TourSettlementService's own
    // onFailure handler (unchanged code path — untouched by Phase 12/18).
    expect(mockPrisma.tourBooking.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: BOOKING_ID },
        data: expect.objectContaining({ status: 'REFUNDED' }),
      }),
    );
  });

  // INV-6: Multiple charge amounts — invariant holds for ₦1,000, ₦50,000, ₦1,000,000.
  //        85% claimed (GUIDE 60 + HOST 25) — unclaimed 15% deliberately absent
  //        from recipients, same as INV-2.
  it('INV-6: invariant holds across 1000 NGN / 50000 NGN / 1000000 NGN charge amounts', async () => {
    // Test amounts in kobo (Paystack unit)
    const testCases: [number, number][] = [
      [100_000,     1_000],    // ₦1,000
      [5_000_000,   50_000],   // ₦50,000
      [100_000_000, 1_000_000], // ₦1,000,000
    ];

    for (let i = 0; i < testCases.length; i++) {
      const [amountKobo, expectedNgn] = testCases[i];
      jest.clearAllMocks();

      const svc = await makeService();
      primeVendorResolvers();

      mockPrisma.tourBooking.findUnique.mockResolvedValueOnce(
        buildBooking([
          { vendorType: 'GUIDE', vendorId: GUIDE_VENDOR_ID, percentage: 60 },
          { vendorType: 'HOST',  vendorId: HOST_PROPERTY_ID, percentage: 25 },
        ]),
      );
      mockPrisma.platformConfig.findUnique.mockResolvedValueOnce(null);

      await svc.handleTourBookingPayment(
        buildPayload({ reference: `${PAYSTACK_REF}-${amountKobo}` }, amountKobo),
      );

      expect(mockSettlementService.settle).toHaveBeenCalledTimes(1);
      const input = mockSettlementService.settle.mock.calls[0][0];
      const sum = input.recipients.reduce((s: number, r: any) => s + r.amountNgn, 0);
      // Assert to within ₦0.02 to accommodate float rounding (service guard is ₦0.02)
      expect(Math.abs(sum - expectedNgn * 0.85)).toBeLessThanOrEqual(0.02);
    }
  });
});
