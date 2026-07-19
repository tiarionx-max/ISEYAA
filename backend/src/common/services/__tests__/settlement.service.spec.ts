import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import {
  SettlementService,
  SettlementInput,
  SettlementRecipient,
} from '../settlement.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { RefundService } from '../refund.service';

/**
 * 12-01 — SettlementService spec.
 *
 * Ten scenarios (A-J) proving SETTLE-01/02/08's contract: atomic N-way wallet
 * fan-out, idempotency (including the P2002 race fix — Pitfall 1), drift-tolerance
 * assertion, live (never-cached) Ministry wallet resolution (Pitfall 2), and the
 * `onSettled`/`onFailure` extension points every downstream caller (Plans 12-03..07)
 * will wire into.
 *
 * Mirrors `tour-settlement.service.spec.ts`'s `wireTransaction()` mock-capture
 * technique: `$transaction(cb)` invokes `cb` against a `tx` object that records
 * every `wallet.update` / `transaction.create` / `$executeRaw` call into `txn`.
 */

// ── Fixtures ────────────────────────────────────────────────────────────────

const REFERENCE = 'ISY-ORD-ABC123456789';
const BUYER_WALLET_ID = 'WAL-BUYER';

const WAL_1 = 'WAL-VENDOR-1';
const WAL_2 = 'WAL-VENDOR-2';
const WAL_3 = 'WAL-VENDOR-3';

const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000001';
const SYSTEM_WALLET_ID = 'WAL-SYSTEM';

function buildInput(over: Partial<SettlementInput> = {}): SettlementInput {
  return {
    module: 'marketplace',
    reference: REFERENCE,
    gateway: 'PAYSTACK',
    amountKobo: 1_000_000, // ₦10,000
    recipients: [
      { tag: 'VENDOR', refSuffix: 'V-0', walletId: WAL_1, amountNgn: 6000 },
      { tag: 'HOST', refSuffix: 'V-1', walletId: WAL_2, amountNgn: 3000 },
    ],
    buyerWalletId: BUYER_WALLET_ID,
    description: 'Order payment settlement',
    ...over,
  };
}

// ── Mock Prisma surface ─────────────────────────────────────────────────────

type AnyFn = jest.Mock;
interface MockPrisma {
  transaction: { findFirst: AnyFn; create: AnyFn };
  platformConfig: { findUnique: AnyFn };
  settlementSplitTier: { findFirst: AnyFn };
  wallet: { findUnique: AnyFn; update: AnyFn; upsert: AnyFn };
  user: { upsert: AnyFn };
  $transaction: AnyFn;
  $executeRaw: AnyFn;
}

let mockPrisma: MockPrisma;
let mockRefund: { refund: AnyFn };

interface TxnCapture {
  walletUpdates: { id: string; balance: number }[];
  transactionCreates: any[];
  executeRawCalls: string[];
}
let txn: TxnCapture;

/**
 * Configures `$transaction(async cb => cb(tx))` such that every Prisma op the
 * settlement service issues against `tx` is captured into `txn` for assertions.
 *
 * `opts.failOnWalletId` simulates a mid-transaction throw on that specific wallet's
 * `wallet.update` call — a plain `Error` by default, or a `Prisma.PrismaClientKnownRequestError`
 * with `code: 'P2002'` when `opts.failWithP2002` is set (Scenario F — the race-condition
 * benign-replay path, Pitfall 1 from RESEARCH.md).
 */
function wireTransaction(
  opts: { failOnWalletId?: string; failWithP2002?: boolean } = {},
) {
  const balances: Record<string, number> = {};
  mockPrisma.$transaction.mockImplementation(async (cb: any) => {
    const tx: any = {
      $executeRaw: jest.fn(async (strings: any) => {
        txn.executeRawCalls.push((strings as TemplateStringsArray).join('?'));
        return 1;
      }),
      wallet: {
        findUnique: jest.fn(async ({ where }: any) => ({
          id: where.id,
          balance: balances[where.id] ?? 0,
        })),
        update: jest.fn(async ({ where, data }: any) => {
          if (opts.failOnWalletId && where.id === opts.failOnWalletId) {
            if (opts.failWithP2002) {
              // meta.target mirrors what Prisma actually populates for a real Postgres
              // unique-constraint violation on Transaction.reference — WR-01 narrows the
              // catch to inspect this field, so the mock must set it realistically.
              throw new Prisma.PrismaClientKnownRequestError(
                'Unique constraint failed on the fields: (`reference`)',
                { code: 'P2002', clientVersion: '5.11.0', meta: { target: ['reference'] } },
              );
            }
            throw new Error('boom — settlement transaction failed');
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
    };
    return cb(tx);
  });
}

// ── Module setup ────────────────────────────────────────────────────────────

async function makeService(): Promise<SettlementService> {
  mockPrisma = {
    transaction: { findFirst: jest.fn(), create: jest.fn() },
    platformConfig: { findUnique: jest.fn() },
    settlementSplitTier: { findFirst: jest.fn() },
    wallet: {
      findUnique: jest.fn(),
      update: jest.fn(),
      upsert: jest.fn().mockResolvedValue({ id: SYSTEM_WALLET_ID }),
    },
    user: { upsert: jest.fn().mockResolvedValue({ id: SYSTEM_USER_ID }) },
    $transaction: jest.fn(),
    $executeRaw: jest.fn(),
  };
  mockRefund = { refund: jest.fn().mockResolvedValue({}) };

  const moduleRef: TestingModule = await Test.createTestingModule({
    providers: [
      SettlementService,
      { provide: PrismaService, useValue: mockPrisma },
      { provide: RefundService, useValue: mockRefund },
    ],
  }).compile();
  const svc = moduleRef.get(SettlementService);
  await svc.onModuleInit(); // resolves + caches systemWalletId
  return svc;
}

beforeEach(() => {
  jest.clearAllMocks();
  txn = { walletUpdates: [], transactionCreates: [], executeRawCalls: [] };
});

// ── Tests ───────────────────────────────────────────────────────────────────

describe('SettlementService', () => {
  // Scenario A — happy path, 2 recipients.
  it('A. happy path — 2 recipients settle atomically, each with its own reference suffix', async () => {
    const svc = await makeService();
    mockPrisma.transaction.findFirst.mockResolvedValue(null);
    wireTransaction();

    const input = buildInput();
    const result = await svc.settle(input);

    expect(result.status).toBe('SETTLED');
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    expect(txn.transactionCreates).toHaveLength(3);

    const vendorRow = txn.transactionCreates.find((c) => c.reference === `${REFERENCE}-V-0`);
    const hostRow = txn.transactionCreates.find((c) => c.reference === `${REFERENCE}-V-1`);
    const platRow = txn.transactionCreates.find((c) => c.reference === `${REFERENCE}-PLAT`);
    expect(vendorRow).toBeDefined();
    expect(hostRow).toBeDefined();
    expect(platRow).toBeDefined();
    expect(Number(platRow.amount)).toBe(1000);

    const sum = txn.transactionCreates.reduce((s, c) => s + Number(c.amount), 0);
    expect(sum).toBe(10_000); // input.amountKobo / 100
  });

  // Scenario B — unresolved recipient rolls into platform.
  it('B. unresolved recipient (walletId: null) rolls its share into the platform wallet', async () => {
    const svc = await makeService();
    mockPrisma.transaction.findFirst.mockResolvedValue(null);
    wireTransaction();

    const input = buildInput({
      recipients: [
        { tag: 'VENDOR', refSuffix: 'V-0', walletId: WAL_1, amountNgn: 6000 },
        { tag: 'ATTRACTION', refSuffix: 'V-1', walletId: null, amountNgn: 4000 },
      ],
    });
    const result = await svc.settle(input);

    const vendorRows = txn.transactionCreates.filter((c) => c.reference.includes('-V-'));
    expect(vendorRows).toHaveLength(1);
    expect(vendorRows[0].reference).toBe(`${REFERENCE}-V-0`);

    const platRow = txn.transactionCreates.find((c) => c.reference === `${REFERENCE}-PLAT`);
    expect(Number(platRow.amount)).toBe(4000);
    expect(result.recipientCredits).toHaveLength(1);
  });

  // Scenario C (SETTLE-08) — zero drift across non-round NGN amounts.
  describe('C. SETTLE-08 — N-way splits sum exactly to the buyer-paid amount, zero drift', () => {
    const amounts = [9999.99, 10000.01, 33333.33, 7.77, 1000000.13];

    it.each(amounts)(
      'splits %f NGN across a 33/33/34 3-recipient split with zero drift',
      async (amountNgn) => {
        const svc = await makeService();
        mockPrisma.transaction.findFirst.mockResolvedValue(null);
        wireTransaction();

        const amountKobo = Math.round(amountNgn * 100);
        const share = (pct: number) => Math.round((pct / 100) * amountNgn * 100) / 100;
        const recipients: SettlementRecipient[] = [
          { tag: 'R1', refSuffix: 'V-0', walletId: WAL_1, amountNgn: share(33) },
          { tag: 'R2', refSuffix: 'V-1', walletId: WAL_2, amountNgn: share(33) },
          { tag: 'R3', refSuffix: 'V-2', walletId: WAL_3, amountNgn: share(34) },
        ];
        const input = buildInput({
          amountKobo,
          recipients,
          reference: `ISY-ORD-C-${amountKobo}`,
        });

        await svc.settle(input);

        const sum = txn.transactionCreates.reduce((s, c) => s + Number(c.amount), 0);
        expect(sum).toBeCloseTo(amountKobo / 100, 2);
      },
    );
  });

  // Scenario D — drift exceeded.
  it('D. drift exceeding ₦0.02 throws before entering the $transaction and triggers a refund', async () => {
    const svc = await makeService();
    mockPrisma.transaction.findFirst.mockResolvedValue(null);
    // Force a bogus platformAmountNgn out of the single Math.round call in the
    // drift-tolerance calculation — the only way to trip this defensive assert,
    // since chargeAmountNgn/claimedAmountNgn arithmetic alone can never legitimately
    // drift by more than half a kobo.
    const roundSpy = jest.spyOn(Math, 'round').mockReturnValueOnce(999_999);

    const input = buildInput();

    await expect(svc.settle(input)).rejects.toThrow(/drift/i);

    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(mockRefund.refund).toHaveBeenCalledTimes(1);
    expect(mockRefund.refund).toHaveBeenCalledWith(
      expect.objectContaining({
        paystackReference: input.reference,
        amountKobo: input.amountKobo,
        walletId: input.buyerWalletId,
        reason: expect.stringContaining(`${input.module}_settlement_failed`),
      }),
    );

    roundSpy.mockRestore();
  });

  // Scenario E — idempotency replay.
  it('E. idempotency replay — existing row matching the reference prefix short-circuits settle()', async () => {
    const svc = await makeService();
    mockPrisma.transaction.findFirst.mockResolvedValueOnce({ id: 'TXN-old' });

    const result = await svc.settle(buildInput());

    expect(result).toEqual({ status: 'REPLAYED', platformAmountNgn: 0, recipientCredits: [] });
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(mockRefund.refund).not.toHaveBeenCalled();
  });

  // Scenario F — mid-transaction P2002 race (Pitfall 1).
  it('F. mid-transaction P2002 unique-constraint race is treated as a benign replay, not a failure', async () => {
    const svc = await makeService();
    mockPrisma.transaction.findFirst.mockResolvedValue(null);
    wireTransaction({ failOnWalletId: WAL_2, failWithP2002: true });

    const result = await svc.settle(buildInput());

    expect(result).toEqual({ status: 'REPLAYED', platformAmountNgn: 0, recipientCredits: [] });
    expect(mockRefund.refund).not.toHaveBeenCalled();
  });

  // Scenario G — mid-transaction non-P2002 throw.
  it('G. mid-transaction non-P2002 throw triggers refund + onFailure, then rethrows', async () => {
    const svc = await makeService();
    mockPrisma.transaction.findFirst.mockResolvedValue(null);
    wireTransaction({ failOnWalletId: WAL_2 });
    const onFailure = jest.fn().mockResolvedValue(undefined);

    const input = buildInput({ onFailure });

    await expect(svc.settle(input)).rejects.toThrow(/boom/);

    expect(mockRefund.refund).toHaveBeenCalledTimes(1);
    expect(mockRefund.refund).toHaveBeenCalledWith(
      expect.objectContaining({
        paystackReference: input.reference,
        amountKobo: input.amountKobo,
        walletId: BUYER_WALLET_ID,
        reason: expect.stringContaining(`${input.module}_settlement_failed`),
      }),
    );
    expect(onFailure).toHaveBeenCalledTimes(1);
    expect(onFailure.mock.calls[0][0]).toBeInstanceOf(Error);
  });

  // Scenario H — onSettled runs inside the same $transaction, after all wallet writes.
  it('H. onSettled callback runs inside the $transaction, after wallet writes, receiving the tx client', async () => {
    const svc = await makeService();
    mockPrisma.transaction.findFirst.mockResolvedValue(null);
    wireTransaction();
    let capturedTx: any = null;
    let writesAtCallTime = -1;
    const onSettled = jest.fn(async (tx: any) => {
      capturedTx = tx;
      writesAtCallTime = txn.transactionCreates.length;
    });

    await svc.settle(buildInput({ onSettled }));

    expect(onSettled).toHaveBeenCalledTimes(1);
    expect(capturedTx).toBeDefined();
    expect(capturedTx.wallet).toBeDefined();
    expect(capturedTx.transaction).toBeDefined();
    // All wallet CREDIT rows were already written by the time onSettled ran.
    expect(writesAtCallTime).toBe(3);
  });

  // Scenario I — resolveMinistryWallet() never caches.
  describe('I. resolveMinistryWallet()', () => {
    it('resolves the Ministry wallet fresh from PlatformConfig on every call (no caching)', async () => {
      const svc = await makeService();
      mockPrisma.platformConfig.findUnique.mockResolvedValueOnce({ value: 'USR-GOV' });
      mockPrisma.wallet.findUnique.mockResolvedValueOnce({ id: 'WAL-GOV' });

      const first = await svc.resolveMinistryWallet();
      expect(first).toEqual({ id: 'WAL-GOV' });
      expect(mockPrisma.platformConfig.findUnique).toHaveBeenCalledTimes(1);

      mockPrisma.platformConfig.findUnique.mockResolvedValueOnce(null);

      const second = await svc.resolveMinistryWallet();
      expect(second).toBeNull();
      // A second real DB hit proves no caching across calls (Pitfall 2).
      expect(mockPrisma.platformConfig.findUnique).toHaveBeenCalledTimes(2);
    });
  });

  // Scenario J — buyerWalletId omitted.
  it('J. buyerWalletId omitted — refund is skipped on failure, but onFailure still runs and the error still rethrows', async () => {
    const svc = await makeService();
    mockPrisma.transaction.findFirst.mockResolvedValue(null);
    wireTransaction({ failOnWalletId: WAL_2 });
    const onFailure = jest.fn().mockResolvedValue(undefined);

    const input = buildInput({ buyerWalletId: undefined, onFailure });

    await expect(svc.settle(input)).rejects.toThrow(/boom/);

    expect(mockRefund.refund).not.toHaveBeenCalled();
    expect(onFailure).toHaveBeenCalledTimes(1);
    expect(onFailure.mock.calls[0][0]).toBeInstanceOf(Error);
  });

  // ── resolveSplit() — SETTLE-11a/11b ─────────────────────────────────────────
  describe('resolveSplit()', () => {
    it('resolves the active default tier for a module, Number-parsed, via a fresh findFirst query', async () => {
      const svc = await makeService();
      mockPrisma.settlementSplitTier.findFirst.mockResolvedValueOnce({
        id: 'TIER-1',
        earnerPct: '0.85',
        ministryPct: '0.05',
        platformPct: '0.10',
      });

      const result = await svc.resolveSplit('transport', 1000);

      expect(result).toEqual({ earnerPct: 0.85, ministryPct: 0.05, platformPct: 0.1 });
      expect(mockPrisma.settlementSplitTier.findFirst).toHaveBeenCalledWith({
        where: { module: 'transport', isActive: true, tierName: 'default' },
        orderBy: { effectiveFrom: 'desc' },
      });
    });

    it('returns platformPct: null when the tier row has a null platformPct (e.g. Studio)', async () => {
      const svc = await makeService();
      mockPrisma.settlementSplitTier.findFirst.mockResolvedValueOnce({
        id: 'TIER-STUDIO',
        earnerPct: '0',
        ministryPct: '0.05',
        platformPct: null,
      });

      const result = await svc.resolveSplit('studio', 1000);

      expect(result).toEqual({ earnerPct: 0, ministryPct: 0.05, platformPct: null });
    });

    it('throws "No active SettlementSplitTier found" when findFirst resolves null', async () => {
      const svc = await makeService();
      mockPrisma.settlementSplitTier.findFirst.mockResolvedValueOnce(null);

      await expect(svc.resolveSplit('transport', 1000)).rejects.toThrow(
        /No active SettlementSplitTier found for module="transport"/,
      );
    });

    it('throws "Malformed SettlementSplitTier" when the resolved row has a non-finite earnerPct', async () => {
      const svc = await makeService();
      mockPrisma.settlementSplitTier.findFirst.mockResolvedValueOnce({
        id: 'TIER-BAD',
        earnerPct: NaN,
        ministryPct: '0.05',
        platformPct: '0.10',
      });

      await expect(svc.resolveSplit('transport', 1000)).rejects.toThrow(
        /Malformed SettlementSplitTier/,
      );
    });

    it('throws "Malformed SettlementSplitTier" when the resolved row has a non-finite ministryPct', async () => {
      const svc = await makeService();
      mockPrisma.settlementSplitTier.findFirst.mockResolvedValueOnce({
        id: 'TIER-BAD',
        earnerPct: '0.85',
        ministryPct: NaN,
        platformPct: '0.10',
      });

      await expect(svc.resolveSplit('transport', 1000)).rejects.toThrow(
        /Malformed SettlementSplitTier/,
      );
    });

    it('throws "Malformed SettlementSplitTier" when the resolved row has a non-finite non-null platformPct', async () => {
      const svc = await makeService();
      mockPrisma.settlementSplitTier.findFirst.mockResolvedValueOnce({
        id: 'TIER-BAD',
        earnerPct: '0.85',
        ministryPct: '0.05',
        platformPct: Infinity,
      });

      await expect(svc.resolveSplit('transport', 1000)).rejects.toThrow(
        /Malformed SettlementSplitTier/,
      );
    });
  });

  // Scenario K — SETTLE-11d NaN/Infinity recipient amount guard.
  describe('K. settle() rejects a non-finite recipient amount before any wallet mutation', () => {
    it.each([NaN, Infinity])(
      'throws before $transaction is entered when a recipient amountNgn is %p, and refunds the buyer',
      async (badAmount) => {
        const svc = await makeService();
        mockPrisma.transaction.findFirst.mockResolvedValue(null);
        wireTransaction();

        const input = buildInput({
          recipients: [
            { tag: 'VENDOR', refSuffix: 'V-0', walletId: WAL_1, amountNgn: badAmount },
            { tag: 'HOST', refSuffix: 'V-1', walletId: WAL_2, amountNgn: 3000 },
          ],
        });

        await expect(svc.settle(input)).rejects.toThrow(/Non-finite recipient amount/);

        expect(mockPrisma.$transaction).not.toHaveBeenCalled();
        expect(mockRefund.refund).toHaveBeenCalledTimes(1);
        expect(mockRefund.refund).toHaveBeenCalledWith(
          expect.objectContaining({
            paystackReference: input.reference,
            amountKobo: input.amountKobo,
            walletId: input.buyerWalletId,
            reason: expect.stringContaining(`${input.module}_settlement_failed`),
          }),
        );
      },
    );
  });

  // Scenario L — SETTLE-11c cross-module immutability regression.
  it(
    'L. immutability — a settled Transaction row is unaffected by a later SettlementSplitTier update ' +
      '(resolveSplit() stays live/fresh, but settle() never re-reads config for an already-persisted row)',
    async () => {
      const svc = await makeService();
      mockPrisma.transaction.findFirst.mockResolvedValue(null);
      wireTransaction();

      mockPrisma.settlementSplitTier.findFirst.mockResolvedValueOnce({
        id: 'TIER-1',
        earnerPct: '0.85',
        ministryPct: '0.05',
        platformPct: '0.10',
      });
      const originalSplit = await svc.resolveSplit('transport', 10000);
      expect(originalSplit).toEqual({ earnerPct: 0.85, ministryPct: 0.05, platformPct: 0.1 });

      const reference = 'ISY-TRP-L-TEST';
      const input = buildInput({
        module: 'transport',
        reference,
        amountKobo: 1_000_000,
        recipients: [
          { tag: 'DRIVER', refSuffix: 'V-0', walletId: WAL_1, amountNgn: 8500 },
        ],
      });

      await svc.settle(input);

      const originalTransactionArgs = txn.transactionCreates.find(
        (c) => c.reference === `${reference}-V-0`,
      );
      expect(originalTransactionArgs).toBeDefined();
      expect(Number(originalTransactionArgs.amount)).toBe(8500);
      const createCountAfterSettle = txn.transactionCreates.length;

      // Reconfigure the mock to resolve a DIFFERENT split — proves the resolver
      // itself is live/always-fresh, not memoized.
      mockPrisma.settlementSplitTier.findFirst.mockResolvedValueOnce({
        id: 'TIER-2',
        earnerPct: '0.70',
        ministryPct: '0.10',
        platformPct: '0.20',
      });
      const newSplit = await svc.resolveSplit('transport', 10000);
      expect(newSplit).toEqual({ earnerPct: 0.7, ministryPct: 0.1, platformPct: 0.2 });

      // The already-persisted Transaction row is untouched — no second
      // transaction.create/update call was ever made for that reference.
      expect(txn.transactionCreates).toHaveLength(createCountAfterSettle);
      const reInspected = txn.transactionCreates.find((c) => c.reference === `${reference}-V-0`);
      expect(reInspected).toEqual(originalTransactionArgs);
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    },
  );
});
