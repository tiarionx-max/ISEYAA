import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { SettlementDisputesService } from '../settlement-disputes.service';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  SettlementService,
  InsufficientAdjustmentBalanceError,
} from '../../../common/services/settlement.service';

/**
 * 19-03 — SettlementDisputesService spec.
 *
 * Task 1: raise()/findQueue()/findById()/moveToReview() + the writeAudit()
 * silent-fallback helper (7 scenarios).
 * Task 2 (added later in the same plan): computeAdjustmentLines()/resolve()/
 * dismiss() — D-01/D-04/D-05/SETTLE-10c/10d/10e.
 */

type AnyFn = jest.Mock;
interface MockPrisma {
  settlementDispute: {
    findFirst: AnyFn;
    findMany: AnyFn;
    findUnique: AnyFn;
    create: AnyFn;
    update: AnyFn;
    count: AnyFn;
  };
  transaction: { findFirst: AnyFn; findMany: AnyFn };
  auditLog: { create: AnyFn };
}

let mockPrisma: MockPrisma;
let mockSettlementService: { resolveSplit: AnyFn; adjust: AnyFn };
let service: SettlementDisputesService;

const ACTOR_USER_ID = 'USER-ADMIN-1';
const DISPUTE_ID = 'DISPUTE-1';
const SETTLEMENT_REFERENCE = 'ISY-TRP-abc-123';

function buildDispute(over: Record<string, unknown> = {}) {
  return {
    id: DISPUTE_ID,
    settlementReference: SETTLEMENT_REFERENCE,
    module: 'transport',
    raisedByUserId: ACTOR_USER_ID,
    reason: 'Driver split looks wrong',
    status: 'OPEN',
    requestedAdjustmentNgn: null,
    assignedTo: null,
    resolution: null,
    resolvedAt: null,
    adjustmentReference: null,
    metadata: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  };
}

beforeEach(async () => {
  mockPrisma = {
    settlementDispute: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    transaction: { findFirst: jest.fn(), findMany: jest.fn() },
    auditLog: { create: jest.fn().mockResolvedValue({ id: 'AUDIT-1' }) },
  };
  mockSettlementService = { resolveSplit: jest.fn(), adjust: jest.fn() };

  const moduleRef: TestingModule = await Test.createTestingModule({
    providers: [
      SettlementDisputesService,
      { provide: PrismaService, useValue: mockPrisma },
      { provide: SettlementService, useValue: mockSettlementService },
    ],
  }).compile();

  service = moduleRef.get(SettlementDisputesService);
});

describe('raise()', () => {
  it('throws NotFoundException when no settled Transaction matches the reference prefix', async () => {
    mockPrisma.transaction.findFirst.mockResolvedValue(null);

    await expect(
      service.raise(ACTOR_USER_ID, {
        settlementReference: SETTLEMENT_REFERENCE,
        module: 'transport',
        reason: 'bad split',
      }),
    ).rejects.toThrow(NotFoundException);

    expect(mockPrisma.settlementDispute.create).not.toHaveBeenCalled();
  });

  it('throws ConflictException when an active (OPEN/IN_REVIEW/BLOCKED) dispute already exists', async () => {
    mockPrisma.transaction.findFirst.mockResolvedValue({ id: 'TXN-1' });
    mockPrisma.settlementDispute.findFirst.mockResolvedValue({ id: 'EXISTING-DISPUTE' });

    await expect(
      service.raise(ACTOR_USER_ID, {
        settlementReference: SETTLEMENT_REFERENCE,
        module: 'transport',
        reason: 'bad split',
      }),
    ).rejects.toThrow(ConflictException);

    expect(mockPrisma.settlementDispute.create).not.toHaveBeenCalled();
  });

  it('creates an OPEN dispute row and writes exactly one AuditLog row', async () => {
    mockPrisma.transaction.findFirst.mockResolvedValue({ id: 'TXN-1' });
    mockPrisma.settlementDispute.findFirst.mockResolvedValue(null);
    mockPrisma.settlementDispute.create.mockResolvedValue(buildDispute());

    const result = await service.raise(ACTOR_USER_ID, {
      settlementReference: SETTLEMENT_REFERENCE,
      module: 'transport',
      reason: 'Driver split looks wrong',
      requestedAdjustmentNgn: 500,
    });

    expect(result.status).toBe('OPEN');
    expect(mockPrisma.settlementDispute.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          settlementReference: SETTLEMENT_REFERENCE,
          raisedByUserId: ACTOR_USER_ID,
          status: 'OPEN',
        }),
      }),
    );
    expect(mockPrisma.auditLog.create).toHaveBeenCalledTimes(1);
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: ACTOR_USER_ID,
          action: 'SETTLEMENT_DISPUTE_RAISED',
          entity: 'SettlementDispute',
          entityId: DISPUTE_ID,
        }),
      }),
    );
  });
});

describe('findQueue()', () => {
  it('defaults to status OPEN, paginates, and returns { data, pagination }', async () => {
    mockPrisma.settlementDispute.findMany.mockResolvedValue([buildDispute()]);
    mockPrisma.settlementDispute.count.mockResolvedValue(1);

    const result = await service.findQueue({});

    expect(mockPrisma.settlementDispute.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'OPEN' }),
        skip: 0,
      }),
    );
    expect(result).toEqual({
      data: [expect.objectContaining({ id: DISPUTE_ID })],
      pagination: { page: 1, limit: 24, total: 1, pages: 1 },
    });
  });
});

describe('findById()', () => {
  it('throws NotFoundException when the row does not exist', async () => {
    mockPrisma.settlementDispute.findUnique.mockResolvedValue(null);

    await expect(service.findById('missing-id')).rejects.toThrow(NotFoundException);
  });
});

describe('moveToReview()', () => {
  it('throws ConflictException when the dispute is not OPEN', async () => {
    mockPrisma.settlementDispute.findUnique.mockResolvedValue(
      buildDispute({ status: 'IN_REVIEW' }),
    );

    await expect(service.moveToReview(DISPUTE_ID, ACTOR_USER_ID)).rejects.toThrow(
      ConflictException,
    );
    expect(mockPrisma.settlementDispute.update).not.toHaveBeenCalled();
  });

  it('transitions OPEN -> IN_REVIEW, sets assignedTo, and writes an AuditLog row', async () => {
    mockPrisma.settlementDispute.findUnique.mockResolvedValue(buildDispute({ status: 'OPEN' }));
    mockPrisma.settlementDispute.update.mockResolvedValue(
      buildDispute({ status: 'IN_REVIEW', assignedTo: ACTOR_USER_ID }),
    );

    const result = await service.moveToReview(DISPUTE_ID, ACTOR_USER_ID);

    expect(result.status).toBe('IN_REVIEW');
    expect(mockPrisma.settlementDispute.update).toHaveBeenCalledWith({
      where: { id: DISPUTE_ID },
      data: { status: 'IN_REVIEW', assignedTo: ACTOR_USER_ID },
    });
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'SETTLEMENT_DISPUTE_MOVED_TO_REVIEW' }),
      }),
    );
  });
});

describe('writeAudit() silent-fallback (used by raise()/moveToReview())', () => {
  it('does not throw out of raise() when AuditLog.create rejects', async () => {
    mockPrisma.transaction.findFirst.mockResolvedValue({ id: 'TXN-1' });
    mockPrisma.settlementDispute.findFirst.mockResolvedValue(null);
    mockPrisma.settlementDispute.create.mockResolvedValue(buildDispute());
    mockPrisma.auditLog.create.mockRejectedValue(new Error('audit db down'));

    await expect(
      service.raise(ACTOR_USER_ID, {
        settlementReference: SETTLEMENT_REFERENCE,
        module: 'transport',
        reason: 'Driver split looks wrong',
      }),
    ).resolves.toEqual(expect.objectContaining({ id: DISPUTE_ID }));
  });

  it('does not throw out of moveToReview() when AuditLog.create rejects', async () => {
    mockPrisma.settlementDispute.findUnique.mockResolvedValue(buildDispute({ status: 'OPEN' }));
    mockPrisma.settlementDispute.update.mockResolvedValue(
      buildDispute({ status: 'IN_REVIEW', assignedTo: ACTOR_USER_ID }),
    );
    mockPrisma.auditLog.create.mockRejectedValue(new Error('audit db down'));

    await expect(service.moveToReview(DISPUTE_ID, ACTOR_USER_ID)).resolves.toEqual(
      expect.objectContaining({ status: 'IN_REVIEW' }),
    );
  });
});

// ── Task 2: computeAdjustmentLines() / resolve() / dismiss() ────────────────
// D-01 (system-computed, not reviewer-editable), D-04 (5-status machine),
// D-05 (BLOCKED retryable), SETTLE-10c/10d/10e.

const WAL_DRIVER = 'WAL-DRIVER';
const WAL_MINISTRY = 'WAL-MINISTRY';

describe('computeAdjustmentLines()', () => {
  it('single-earner settlement: returns 2 lines when resolveSplit() differs from what was paid', async () => {
    mockPrisma.transaction.findMany.mockResolvedValue([
      {
        id: 'TX-1',
        reference: `${SETTLEMENT_REFERENCE}-DRV`,
        amount: 8500,
        walletId: WAL_DRIVER,
        metadata: { recipientType: 'DRIVER' },
      },
      {
        id: 'TX-2',
        reference: `${SETTLEMENT_REFERENCE}-MINISTRY`,
        amount: 500,
        walletId: WAL_MINISTRY,
        metadata: { recipientType: 'MINISTRY' },
      },
    ]);
    mockSettlementService.resolveSplit.mockResolvedValue({
      earnerPct: 0.9,
      ministryPct: 0.06,
      platformPct: 0.04,
    });

    const { lines, chargeAmountNgn } = await service.computeAdjustmentLines(
      'transport',
      SETTLEMENT_REFERENCE,
    );

    expect(chargeAmountNgn).toBe(9000);
    expect(lines).toHaveLength(2);
    expect(lines).toEqual(
      expect.arrayContaining([
        { walletId: WAL_MINISTRY, deltaNgn: 40 },
        { walletId: WAL_DRIVER, deltaNgn: -400 },
      ]),
    );
  });

  it('returns an empty lines array when resolveSplit() matches what was originally applied', async () => {
    mockPrisma.transaction.findMany.mockResolvedValue([
      {
        id: 'TX-1',
        reference: `${SETTLEMENT_REFERENCE}-DRV`,
        amount: 8500,
        walletId: WAL_DRIVER,
        metadata: { recipientType: 'DRIVER' },
      },
      {
        id: 'TX-2',
        reference: `${SETTLEMENT_REFERENCE}-MINISTRY`,
        amount: 1500,
        walletId: WAL_MINISTRY,
        metadata: { recipientType: 'MINISTRY' },
      },
    ]);
    mockSettlementService.resolveSplit.mockResolvedValue({
      earnerPct: 0.85,
      ministryPct: 0.15,
      platformPct: 0,
    });

    const { lines } = await service.computeAdjustmentLines('transport', SETTLEMENT_REFERENCE);

    expect(lines).toEqual([]);
  });

  it('multi-earner (Tour-style) settlement distributes the delta proportionally, last row absorbs the remainder', async () => {
    const WAL_1 = 'WAL-EARNER-1';
    const WAL_2 = 'WAL-EARNER-2';
    const WAL_3 = 'WAL-EARNER-3';
    mockPrisma.transaction.findMany.mockResolvedValue([
      { id: 'TX-1', reference: `${SETTLEMENT_REFERENCE}-V-0`, amount: 3000, walletId: WAL_1, metadata: {} },
      { id: 'TX-2', reference: `${SETTLEMENT_REFERENCE}-V-1`, amount: 2000, walletId: WAL_2, metadata: {} },
      { id: 'TX-3', reference: `${SETTLEMENT_REFERENCE}-V-2`, amount: 1000, walletId: WAL_3, metadata: {} },
    ]);
    mockSettlementService.resolveSplit.mockResolvedValue({
      earnerPct: 0.9,
      ministryPct: 0,
      platformPct: 0.1,
    });

    const { lines } = await service.computeAdjustmentLines('tour', SETTLEMENT_REFERENCE);

    expect(lines).toEqual([
      { walletId: WAL_1, deltaNgn: -300 },
      { walletId: WAL_2, deltaNgn: -200 },
      { walletId: WAL_3, deltaNgn: -100 },
    ]);
    const sum = lines.reduce((s, l) => s + l.deltaNgn, 0);
    expect(Math.round(sum * 100) / 100).toBe(-600);
  });

  it('skips the ministry line entirely when the original settlement had no MINISTRY-tagged row', async () => {
    mockPrisma.transaction.findMany.mockResolvedValue([
      {
        id: 'TX-1',
        reference: `${SETTLEMENT_REFERENCE}-DRV`,
        amount: 5000,
        walletId: WAL_DRIVER,
        metadata: { recipientType: 'DRIVER' },
      },
    ]);
    mockSettlementService.resolveSplit.mockResolvedValue({
      earnerPct: 0.8,
      ministryPct: 0,
      platformPct: 0.2,
    });

    const { lines } = await service.computeAdjustmentLines('delivery', SETTLEMENT_REFERENCE);

    expect(lines).toEqual([{ walletId: WAL_DRIVER, deltaNgn: -1000 }]);
  });

  it('throws NotFoundException when no Transaction rows at all match the settlementReference prefix', async () => {
    mockPrisma.transaction.findMany.mockResolvedValue([]);

    await expect(
      service.computeAdjustmentLines('transport', SETTLEMENT_REFERENCE),
    ).rejects.toThrow(NotFoundException);
  });
});

describe('resolve()', () => {
  function mockHappyPathTransactionRows() {
    mockPrisma.transaction.findMany.mockResolvedValue([
      {
        id: 'TX-1',
        reference: `${SETTLEMENT_REFERENCE}-DRV`,
        amount: 8500,
        walletId: WAL_DRIVER,
        metadata: { recipientType: 'DRIVER' },
      },
      {
        id: 'TX-2',
        reference: `${SETTLEMENT_REFERENCE}-MINISTRY`,
        amount: 500,
        walletId: WAL_MINISTRY,
        metadata: { recipientType: 'MINISTRY' },
      },
    ]);
    mockSettlementService.resolveSplit.mockResolvedValue({
      earnerPct: 0.9,
      ministryPct: 0.06,
      platformPct: 0.04,
    });
  }

  it('is callable on a BLOCKED dispute (D-05) — not a 409', async () => {
    mockPrisma.settlementDispute.findUnique.mockResolvedValue(
      buildDispute({ status: 'BLOCKED' }),
    );
    mockHappyPathTransactionRows();
    mockSettlementService.adjust.mockResolvedValue({
      status: 'SETTLED',
      platformAmountNgn: 0,
      recipientCredits: [],
    });
    mockPrisma.settlementDispute.update.mockResolvedValue(
      buildDispute({ status: 'RESOLVED', adjustmentReference: `${SETTLEMENT_REFERENCE}-ADJ` }),
    );

    const result = await service.resolve(DISPUTE_ID, ACTOR_USER_ID, {});

    expect(result.status).toBe('RESOLVED');
  });

  it.each(['RESOLVED', 'DISMISSED'])(
    'throws ConflictException when the dispute is already %s (terminal)',
    async (status) => {
      mockPrisma.settlementDispute.findUnique.mockResolvedValue(buildDispute({ status }));

      await expect(service.resolve(DISPUTE_ID, ACTOR_USER_ID, {})).rejects.toThrow(
        ConflictException,
      );
      expect(mockSettlementService.adjust).not.toHaveBeenCalled();
    },
  );

  it('happy path: applies the computed adjustment, sets RESOLVED + adjustmentReference, writes AuditLog', async () => {
    mockPrisma.settlementDispute.findUnique.mockResolvedValue(
      buildDispute({ status: 'IN_REVIEW' }),
    );
    mockHappyPathTransactionRows();
    mockSettlementService.adjust.mockResolvedValue({
      status: 'SETTLED',
      platformAmountNgn: 0,
      recipientCredits: [],
    });
    mockPrisma.settlementDispute.update.mockResolvedValue(
      buildDispute({
        status: 'RESOLVED',
        adjustmentReference: `${SETTLEMENT_REFERENCE}-ADJ`,
        resolution: 'Applying corrected split',
      }),
    );

    const result = await service.resolve(DISPUTE_ID, ACTOR_USER_ID, {
      resolution: 'Applying corrected split',
    });

    expect(mockSettlementService.adjust).toHaveBeenCalledWith(
      expect.objectContaining({
        originalReference: SETTLEMENT_REFERENCE,
        module: 'transport',
        reason: 'Applying corrected split',
        lines: expect.arrayContaining([
          { walletId: WAL_MINISTRY, deltaNgn: 40 },
          { walletId: WAL_DRIVER, deltaNgn: -400 },
        ]),
      }),
    );
    expect(mockPrisma.settlementDispute.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: DISPUTE_ID },
        data: expect.objectContaining({
          status: 'RESOLVED',
          adjustmentReference: `${SETTLEMENT_REFERENCE}-ADJ`,
        }),
      }),
    );
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'SETTLEMENT_DISPUTE_RESOLVED' }),
      }),
    );
    expect(result.status).toBe('RESOLVED');
  });

  it('no-op path: RESOLVED with adjustmentReference null when the computed lines are empty; adjust() never called', async () => {
    mockPrisma.settlementDispute.findUnique.mockResolvedValue(
      buildDispute({ status: 'OPEN' }),
    );
    mockPrisma.transaction.findMany.mockResolvedValue([
      {
        id: 'TX-1',
        reference: `${SETTLEMENT_REFERENCE}-DRV`,
        amount: 8500,
        walletId: WAL_DRIVER,
        metadata: { recipientType: 'DRIVER' },
      },
      {
        id: 'TX-2',
        reference: `${SETTLEMENT_REFERENCE}-MINISTRY`,
        amount: 1500,
        walletId: WAL_MINISTRY,
        metadata: { recipientType: 'MINISTRY' },
      },
    ]);
    mockSettlementService.resolveSplit.mockResolvedValue({
      earnerPct: 0.85,
      ministryPct: 0.15,
      platformPct: 0,
    });
    mockPrisma.settlementDispute.update.mockResolvedValue(
      buildDispute({ status: 'RESOLVED', adjustmentReference: null }),
    );

    const result = await service.resolve(DISPUTE_ID, ACTOR_USER_ID, {});

    expect(mockSettlementService.adjust).not.toHaveBeenCalled();
    expect(mockPrisma.settlementDispute.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'RESOLVED', adjustmentReference: null }),
      }),
    );
    expect(result.status).toBe('RESOLVED');
  });

  it('BLOCKED path (SETTLE-10d): adjust() rejecting with InsufficientAdjustmentBalanceError moves the dispute to BLOCKED, not thrown to the caller', async () => {
    mockPrisma.settlementDispute.findUnique.mockResolvedValue(
      buildDispute({ status: 'IN_REVIEW' }),
    );
    mockHappyPathTransactionRows();
    mockSettlementService.adjust.mockRejectedValue(
      new InsufficientAdjustmentBalanceError(WAL_DRIVER, 400),
    );
    mockPrisma.settlementDispute.update.mockResolvedValue(
      buildDispute({ status: 'BLOCKED' }),
    );

    const result = await expect(
      service.resolve(DISPUTE_ID, ACTOR_USER_ID, {}),
    ).resolves.toEqual(expect.objectContaining({ status: 'BLOCKED' }));

    expect(mockPrisma.settlementDispute.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'BLOCKED' }),
      }),
    );
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'SETTLEMENT_DISPUTE_BLOCKED',
          newValue: expect.objectContaining({ walletId: WAL_DRIVER, shortfallNgn: 400 }),
        }),
      }),
    );
  });
});

describe('dismiss()', () => {
  it.each(['RESOLVED', 'DISMISSED'])(
    'throws ConflictException when the dispute is already %s',
    async (status) => {
      mockPrisma.settlementDispute.findUnique.mockResolvedValue(buildDispute({ status }));

      await expect(service.dismiss(DISPUTE_ID, ACTOR_USER_ID, {})).rejects.toThrow(
        ConflictException,
      );
    },
  );

  it.each(['OPEN', 'IN_REVIEW', 'BLOCKED'])(
    'transitions %s -> DISMISSED, writes AuditLog, and never touches the financial computation path',
    async (status) => {
      mockPrisma.settlementDispute.findUnique.mockResolvedValue(buildDispute({ status }));
      mockPrisma.settlementDispute.update.mockResolvedValue(
        buildDispute({ status: 'DISMISSED' }),
      );

      const result = await service.dismiss(DISPUTE_ID, ACTOR_USER_ID, {
        resolution: 'No adjustment warranted',
      });

      expect(result.status).toBe('DISMISSED');
      expect(mockPrisma.settlementDispute.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'DISMISSED' }),
        }),
      );
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'SETTLEMENT_DISPUTE_DISMISSED' }),
        }),
      );
      expect(mockSettlementService.adjust).not.toHaveBeenCalled();
      expect(mockPrisma.transaction.findMany).not.toHaveBeenCalled();
    },
  );
});
