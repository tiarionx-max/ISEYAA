import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { SettlementDisputesService } from '../settlement-disputes.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { SettlementService } from '../../../common/services/settlement.service';

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
