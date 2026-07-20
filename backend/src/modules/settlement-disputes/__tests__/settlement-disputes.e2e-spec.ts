import { Test, TestingModule } from '@nestjs/testing';
import { SettlementDisputesService } from '../settlement-disputes.service';
import {
  SettlementService,
  SettlementRecipient,
} from '../../../common/services/settlement.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { RefundService } from '../../../common/services/refund.service';

/**
 * 19-04 Task 2 — End-to-end regression: full dispute lifecycle through the
 * REAL `SettlementService` + REAL `SettlementDisputesService` pair.
 *
 * Unlike `settlement-disputes.service.spec.ts` (19-03), which mocks
 * `SettlementService` itself, this spec wires BOTH real service classes
 * through `Test.createTestingModule` — only `PrismaService`/`RefundService`
 * are mocked at the boundary (mirrors `wallet-invariant.e2e-spec.ts`'s exact
 * pattern). This proves the full stack: `settle()` actually persisting
 * Transaction rows that `computeAdjustmentLines()` later reverses, and
 * `adjust()` actually posting the compensating rows `resolve()` derives.
 *
 * 3 scenarios (T-19-11 — repudiation closes the gap between "the service
 * claims to audit" and "the full stack actually does"):
 *   1. Happy path       — settle() -> raise() -> moveToReview() -> resolve() -> RESOLVED
 *   2. BLOCKED -> retry — resolve() from OPEN hits insufficient balance -> BLOCKED,
 *                         then succeeds on retry once the wallet is topped up (D-05)
 *   3. Dismiss          — raise() -> dismiss() -> DISMISSED, adjust() never invoked
 */

// ── In-memory Transaction table ─────────────────────────────────────────────

interface TxnRow {
  id: string;
  reference: string;
  walletId: string;
  type: string;
  status: string;
  amount: number;
  metadata: any;
  [key: string]: any;
}

function matchesWhere(row: TxnRow, where: any): boolean {
  if (where.reference?.startsWith !== undefined) {
    if (!row.reference.startsWith(where.reference.startsWith)) return false;
  }
  if (where.status !== undefined && row.status !== where.status) return false;
  if (where.NOT?.reference?.contains !== undefined) {
    if (row.reference.includes(where.NOT.reference.contains)) return false;
  }
  return true;
}

// ── Fixtures ─────────────────────────────────────────────────────────────────

const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000001';
const SYSTEM_WALLET_ID = 'WAL-E2E-SYSTEM';

const DRIVER_WALLET_ID = 'WAL-E2E-DRIVER';
const MINISTRY_WALLET_ID = 'WAL-E2E-MINISTRY';

const ACTOR_USER_ID = 'USER-E2E-ADMIN';

// ── Mock Prisma surface + stateful in-memory tables ──────────────────────────

type AnyFn = jest.Mock;
interface MockPrisma {
  transaction: { findFirst: AnyFn; findMany: AnyFn; create: AnyFn };
  wallet: { findUnique: AnyFn; update: AnyFn; upsert: AnyFn };
  user: { upsert: AnyFn };
  settlementSplitTier: { findFirst: AnyFn };
  settlementDispute: {
    findFirst: AnyFn;
    findUnique: AnyFn;
    findMany: AnyFn;
    create: AnyFn;
    update: AnyFn;
    count: AnyFn;
  };
  auditLog: { create: AnyFn };
  $transaction: AnyFn;
  $executeRaw: AnyFn;
}

let mockPrisma: MockPrisma;
let mockRefund: { refund: AnyFn };

let transactionRows: TxnRow[];
let txnRowSeq: number;
let balances: Record<string, number>;
let disputeStore: Map<string, any>;
let disputeSeq: number;

/**
 * Wires `$transaction(async cb => cb(tx))` against the shared, module-level
 * `transactionRows`/`balances` state — NOT a fresh reset per call — so a
 * `settle()` call followed by a LATER `adjust()` call in the SAME test sees
 * the wallet balance `settle()` actually left behind. On a callback throw,
 * only the writes issued during THAT invocation are unwound (mirrors
 * `settlement.service.spec.ts`'s rollback semantics) — required by the
 * BLOCKED scenario, where a failed adjust() attempt must leave zero trace.
 */
function wireTransaction() {
  mockPrisma.$transaction.mockImplementation(async (cb: any) => {
    const startRowCount = transactionRows.length;
    const balanceSnapshot = { ...balances };
    const tx: any = {
      $executeRaw: jest.fn(async () => 1),
      wallet: {
        findUnique: jest.fn(async ({ where }: any) => ({
          id: where.id,
          balance: balances[where.id] ?? 0,
        })),
        update: jest.fn(async ({ where, data }: any) => {
          balances[where.id] = Number(data.balance);
          return { id: where.id, balance: balances[where.id] };
        }),
      },
      transaction: {
        create: jest.fn(async ({ data }: any) => {
          txnRowSeq += 1;
          const row: TxnRow = { id: `TXN-${txnRowSeq}`, ...data, amount: Number(data.amount) };
          transactionRows.push(row);
          return row;
        }),
      },
    };
    try {
      return await cb(tx);
    } catch (err) {
      transactionRows.length = startRowCount;
      Object.keys(balances).forEach((k) => delete balances[k]);
      Object.assign(balances, balanceSnapshot);
      throw err;
    }
  });
}

async function makeServices(): Promise<{
  disputesService: SettlementDisputesService;
  settlementService: SettlementService;
}> {
  transactionRows = [];
  txnRowSeq = 0;
  balances = {};
  disputeStore = new Map();
  disputeSeq = 0;

  mockPrisma = {
    transaction: {
      findFirst: jest.fn(async ({ where }: any) => transactionRows.find((r) => matchesWhere(r, where)) ?? null),
      findMany: jest.fn(async ({ where }: any) => transactionRows.filter((r) => matchesWhere(r, where))),
      create: jest.fn(),
    },
    wallet: {
      findUnique: jest.fn(async ({ where }: any) => ({ id: where.id, balance: balances[where.id] ?? 0 })),
      update: jest.fn(async ({ where, data }: any) => {
        balances[where.id] = Number(data.balance);
        return { id: where.id, balance: balances[where.id] };
      }),
      upsert: jest.fn().mockResolvedValue({ id: SYSTEM_WALLET_ID }),
    },
    user: { upsert: jest.fn().mockResolvedValue({ id: SYSTEM_USER_ID }) },
    settlementSplitTier: { findFirst: jest.fn() },
    settlementDispute: {
      findFirst: jest.fn(async ({ where }: any) => {
        for (const row of disputeStore.values()) {
          if (
            row.settlementReference === where.settlementReference &&
            where.status?.in?.includes(row.status)
          ) {
            return row;
          }
        }
        return null;
      }),
      findUnique: jest.fn(async ({ where }: any) => disputeStore.get(where.id) ?? null),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn(async ({ data }: any) => {
        disputeSeq += 1;
        const row = {
          id: `DISPUTE-${disputeSeq}`,
          requestedAdjustmentNgn: null,
          assignedTo: null,
          resolution: null,
          resolvedAt: null,
          adjustmentReference: null,
          metadata: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        };
        disputeStore.set(row.id, row);
        return row;
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const existing = disputeStore.get(where.id);
        const updated = { ...existing, ...data, updatedAt: new Date() };
        disputeStore.set(where.id, updated);
        return updated;
      }),
      count: jest.fn().mockResolvedValue(0),
    },
    auditLog: {
      create: jest.fn(async ({ data }: any) => ({ id: 'AUDIT', ...data })),
    },
    $transaction: jest.fn(),
    $executeRaw: jest.fn(),
  };
  mockRefund = { refund: jest.fn().mockResolvedValue({}) };
  wireTransaction();

  const moduleRef: TestingModule = await Test.createTestingModule({
    providers: [
      { provide: PrismaService, useValue: mockPrisma },
      { provide: RefundService, useValue: mockRefund },
      SettlementService,
      SettlementDisputesService,
    ],
  }).compile();

  const settlementService = moduleRef.get(SettlementService);
  const disputesService = moduleRef.get(SettlementDisputesService);
  await settlementService.onModuleInit(); // resolves + caches the system wallet id

  return { disputesService, settlementService };
}

function auditActions(): string[] {
  return mockPrisma.auditLog.create.mock.calls.map((call: any[]) => call[0].data.action);
}

describe('Settlement disputes e2e — full lifecycle through the real service pair', () => {
  // ── Scenario 1: happy path ──────────────────────────────────────────────
  it('raise -> moveToReview -> resolve settles the derived adjustment and audits every transition', async () => {
    const { disputesService, settlementService } = await makeServices();
    const SETTLEMENT_REFERENCE = 'ISY-TRP-e2e-happy-1';

    const recipients: SettlementRecipient[] = [
      { tag: 'DRIVER', refSuffix: 'V-0', walletId: DRIVER_WALLET_ID, amountNgn: 7500 },
      { tag: 'MINISTRY', refSuffix: 'V-1', walletId: MINISTRY_WALLET_ID, amountNgn: 400 },
    ];
    await settlementService.settle({
      module: 'transport',
      reference: SETTLEMENT_REFERENCE,
      gateway: 'PAYSTACK',
      amountKobo: 1_000_000, // ₦10,000
      recipients,
      description: 'Trip settlement',
    });

    mockPrisma.settlementSplitTier.findFirst.mockResolvedValue({
      id: 'TIER-CORRECT',
      earnerPct: '0.85',
      ministryPct: '0.05',
      platformPct: '0.10',
    });

    const dispute = await disputesService.raise(ACTOR_USER_ID, {
      settlementReference: SETTLEMENT_REFERENCE,
      module: 'transport',
      reason: 'Driver split looks lower than the configured tier',
    });
    expect(dispute.status).toBe('OPEN');

    const inReview = await disputesService.moveToReview(dispute.id, ACTOR_USER_ID);
    expect(inReview.status).toBe('IN_REVIEW');

    const resolved = await disputesService.resolve(dispute.id, ACTOR_USER_ID, {
      resolution: 'Confirmed underpayment, adjustment applied',
    });

    expect(resolved.status).toBe('RESOLVED');
    expect(resolved.adjustmentReference).toBe(`${SETTLEMENT_REFERENCE}-ADJ`);

    const adjRows = transactionRows.filter((r) => r.reference.includes('-ADJ-'));
    expect(adjRows).toHaveLength(3);

    const ministryAdj = adjRows.find((r) => r.walletId === MINISTRY_WALLET_ID);
    const driverAdj = adjRows.find((r) => r.walletId === DRIVER_WALLET_ID);
    const platformAdj = adjRows.find((r) => r.walletId === SYSTEM_WALLET_ID);
    expect(ministryAdj).toBeDefined();
    expect(driverAdj).toBeDefined();
    expect(platformAdj).toBeDefined();
    expect(Number(ministryAdj!.amount)).toBe(100);
    expect(ministryAdj!.type).toBe('CREDIT');
    expect(Number(driverAdj!.amount)).toBe(1000);
    expect(driverAdj!.type).toBe('CREDIT');
    expect(Number(platformAdj!.amount)).toBe(1100);
    expect(platformAdj!.type).toBe('DEBIT');

    const netTotal = adjRows.reduce(
      (s, r) => s + (r.type === 'CREDIT' ? Number(r.amount) : -Number(r.amount)),
      0,
    );
    expect(netTotal).toBe(0);

    expect(auditActions()).toEqual([
      'SETTLEMENT_DISPUTE_RAISED',
      'SETTLEMENT_DISPUTE_MOVED_TO_REVIEW',
      'SETTLEMENT_DISPUTE_RESOLVED',
    ]);
  });

  // ── Scenario 2: BLOCKED -> retry -> RESOLVED (D-05) ─────────────────────
  it('resolve() from OPEN BLOCKs on insufficient balance, then RESOLVEs on retry once topped up', async () => {
    const { disputesService, settlementService } = await makeServices();
    const SETTLEMENT_REFERENCE = 'ISY-TRP-e2e-blocked-1';

    const recipients: SettlementRecipient[] = [
      { tag: 'DRIVER', refSuffix: 'V-0', walletId: DRIVER_WALLET_ID, amountNgn: 9000 },
      { tag: 'MINISTRY', refSuffix: 'V-1', walletId: MINISTRY_WALLET_ID, amountNgn: 500 },
    ];
    await settlementService.settle({
      module: 'transport',
      reference: SETTLEMENT_REFERENCE,
      gateway: 'PAYSTACK',
      amountKobo: 1_000_000, // ₦10,000
      recipients,
      description: 'Trip settlement',
    });
    expect(balances[DRIVER_WALLET_ID]).toBe(9000);

    mockPrisma.settlementSplitTier.findFirst.mockResolvedValue({
      id: 'TIER-LOWER',
      earnerPct: '0.50',
      ministryPct: '0.05',
      platformPct: '0.45',
    });

    const dispute = await disputesService.raise(ACTOR_USER_ID, {
      settlementReference: SETTLEMENT_REFERENCE,
      module: 'transport',
      reason: 'Suspected overpayment to driver',
    });

    // Simulate the driver having already withdrawn most of the payout before
    // the dispute resolves — the computed ₦4,000 debit now exceeds the wallet's
    // current balance.
    balances[DRIVER_WALLET_ID] = 1000;

    const blocked = await disputesService.resolve(dispute.id, ACTOR_USER_ID, {});
    expect(blocked.status).toBe('BLOCKED');
    expect(transactionRows.some((r) => r.reference.includes('-ADJ-'))).toBe(false);
    expect(auditActions()).toEqual([
      'SETTLEMENT_DISPUTE_RAISED',
      'SETTLEMENT_DISPUTE_BLOCKED',
    ]);

    // Top up the wallet — the debit can now be satisfied.
    balances[DRIVER_WALLET_ID] = 10_000;

    const resolved = await disputesService.resolve(dispute.id, ACTOR_USER_ID, {});
    expect(resolved.status).toBe('RESOLVED');
    expect(resolved.adjustmentReference).toBe(`${SETTLEMENT_REFERENCE}-ADJ`);

    const adjRows = transactionRows.filter((r) => r.reference.includes('-ADJ-'));
    expect(adjRows).toHaveLength(2);

    const driverAdj = adjRows.find((r) => r.walletId === DRIVER_WALLET_ID);
    const platformAdj = adjRows.find((r) => r.walletId === SYSTEM_WALLET_ID);
    expect(driverAdj).toBeDefined();
    expect(platformAdj).toBeDefined();
    expect(Number(driverAdj!.amount)).toBe(4000);
    expect(driverAdj!.type).toBe('DEBIT');
    expect(Number(platformAdj!.amount)).toBe(4000);
    expect(platformAdj!.type).toBe('CREDIT');

    const netTotal = adjRows.reduce(
      (s, r) => s + (r.type === 'CREDIT' ? Number(r.amount) : -Number(r.amount)),
      0,
    );
    expect(netTotal).toBe(0);

    expect(auditActions()).toEqual([
      'SETTLEMENT_DISPUTE_RAISED',
      'SETTLEMENT_DISPUTE_BLOCKED',
      'SETTLEMENT_DISPUTE_RESOLVED',
    ]);
  });

  // ── Scenario 3: dismiss (SETTLE-10e completeness) ───────────────────────
  it('dismiss() transitions to DISMISSED and never invokes the settlement adjust primitive', async () => {
    const { disputesService, settlementService } = await makeServices();
    const SETTLEMENT_REFERENCE = 'ISY-TRP-e2e-dismiss-1';

    const recipients: SettlementRecipient[] = [
      { tag: 'DRIVER', refSuffix: 'V-0', walletId: DRIVER_WALLET_ID, amountNgn: 8500 },
      { tag: 'MINISTRY', refSuffix: 'V-1', walletId: MINISTRY_WALLET_ID, amountNgn: 500 },
    ];
    await settlementService.settle({
      module: 'transport',
      reference: SETTLEMENT_REFERENCE,
      gateway: 'PAYSTACK',
      amountKobo: 1_000_000,
      recipients,
      description: 'Trip settlement',
    });

    const dispute = await disputesService.raise(ACTOR_USER_ID, {
      settlementReference: SETTLEMENT_REFERENCE,
      module: 'transport',
      reason: 'Reviewer says split matches the configured tier, no adjustment warranted',
    });
    expect(dispute.status).toBe('OPEN');

    const adjustSpy = jest.spyOn(settlementService, 'adjust');

    const dismissed = await disputesService.dismiss(dispute.id, ACTOR_USER_ID, {
      resolution: 'No discrepancy found',
    });

    expect(dismissed.status).toBe('DISMISSED');
    expect(adjustSpy).not.toHaveBeenCalled();
    expect(auditActions()).toEqual([
      'SETTLEMENT_DISPUTE_RAISED',
      'SETTLEMENT_DISPUTE_DISMISSED',
    ]);
  });
});
