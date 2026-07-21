import { Test, TestingModule } from '@nestjs/testing';
import { MinistryExportSchedulerService } from '../ministry-export-scheduler.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { MinistryService } from '../ministry.service';
import { MinistryPdfService } from '../../../common/services/ministry-pdf.service';
import { CsvExportService } from '../../../common/services/csv-export.service';
import { SendgridService } from '../../../common/services/sendgrid.service';
import { ResilienceService } from '../../../resilience/resilience.service';
import { RedisService } from '../../../redis/redis.service';

/**
 * 22-03 — MinistryExportSchedulerService spec.
 *
 * Task 1 scenarios: setNx() lock guard (acquired vs. not-acquired) and
 * per-subscription due-filtering (due vs. not-due, by cadence + lastSentAt
 * window). Task 2 adds the processSubscription() gather/render/send suite
 * to this same file.
 */

const NOW = new Date('2026-07-21T06:00:00.000Z');

interface MockPrisma {
  ministryExportSubscription: { findMany: jest.Mock; update: jest.Mock };
}

let mockPrisma: MockPrisma;
let mockMinistryService: {
  getVisitorEntriesByLgaAndMonth: jest.Mock;
  getPurposeBreakdown: jest.Mock;
  getRevenueToGovernment: jest.Mock;
};
let mockPdf: { renderPdf: jest.Mock };
let mockCsv: { toCsv: jest.Mock };
let mockSendgrid: { sendMinistryDigest: jest.Mock };
let mockResilience: { execute: jest.Mock };
let mockRedis: { setNx: jest.Mock };

async function makeService(): Promise<MinistryExportSchedulerService> {
  mockPrisma = {
    ministryExportSubscription: {
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({}),
    },
  };
  mockMinistryService = {
    getVisitorEntriesByLgaAndMonth: jest.fn().mockResolvedValue([]),
    getPurposeBreakdown: jest.fn().mockResolvedValue([]),
    getRevenueToGovernment: jest.fn().mockResolvedValue({ byModule: [], byMonth: [], byModuleLga: [] }),
  };
  mockPdf = { renderPdf: jest.fn().mockResolvedValue(Buffer.from('pdf')) };
  mockCsv = { toCsv: jest.fn().mockResolvedValue('csv') };
  mockSendgrid = { sendMinistryDigest: jest.fn().mockResolvedValue(undefined) };
  mockResilience = { execute: jest.fn().mockImplementation((_vendor, fn) => fn({ signal: undefined })) };
  mockRedis = { setNx: jest.fn().mockResolvedValue(true) };

  const moduleRef: TestingModule = await Test.createTestingModule({
    providers: [
      MinistryExportSchedulerService,
      { provide: PrismaService, useValue: mockPrisma },
      { provide: MinistryService, useValue: mockMinistryService },
      { provide: MinistryPdfService, useValue: mockPdf },
      { provide: CsvExportService, useValue: mockCsv },
      { provide: SendgridService, useValue: mockSendgrid },
      { provide: ResilienceService, useValue: mockResilience },
      { provide: RedisService, useValue: mockRedis },
    ],
  }).compile();

  return moduleRef.get(MinistryExportSchedulerService);
}

function buildSubscription(o: Partial<{ id: string; lastSentAt: Date | null; cadence: 'WEEKLY' | 'MONTHLY' | 'QUARTERLY'; createdAt: Date; recipients: string[]; isActive: boolean }> = {}) {
  return {
    id: o.id ?? 'SUB-1',
    recipients: o.recipients ?? ['ministry@example.com'],
    cadence: o.cadence ?? 'WEEKLY',
    isActive: o.isActive ?? true,
    lastSentAt: o.lastSentAt === undefined ? null : o.lastSentAt,
    lastStatus: 'PENDING',
    lastError: null,
    createdAt: o.createdAt ?? new Date(NOW.getTime() - 10 * 24 * 3_600_000),
    updatedAt: NOW,
  };
}

let realDateNow: () => number;

beforeEach(() => {
  realDateNow = Date.now;
  Date.now = jest.fn(() => NOW.getTime());
});

afterEach(() => {
  Date.now = realDateNow;
  jest.restoreAllMocks();
});

describe('MinistryExportSchedulerService.checkSubscriptionsDue', () => {
  it('acquires the setNx lock and queries active subscriptions when acquired', async () => {
    const service = await makeService();
    mockPrisma.ministryExportSubscription.findMany.mockResolvedValue([]);

    await service.checkSubscriptionsDue();

    expect(mockRedis.setNx).toHaveBeenCalledWith('cron-lock:checkMinistryExportSubscriptions', '1', 86000);
    expect(mockPrisma.ministryExportSubscription.findMany).toHaveBeenCalledWith({
      where: { isActive: true },
    });
  });

  it('returns immediately without querying subscriptions or calling SendGrid when the lock is not acquired', async () => {
    const service = await makeService();
    mockRedis.setNx.mockResolvedValue(false);

    await service.checkSubscriptionsDue();

    expect(mockPrisma.ministryExportSubscription.findMany).not.toHaveBeenCalled();
    expect(mockSendgrid.sendMinistryDigest).not.toHaveBeenCalled();
  });

  it('treats a subscription with lastSentAt: null as due, and skips a not-yet-due subscription entirely', async () => {
    const service = await makeService();
    const processSpy = jest
      .spyOn(service as any, 'processSubscription')
      .mockResolvedValue(undefined);

    const dueSub = buildSubscription({
      id: 'SUB-DUE',
      lastSentAt: null,
      cadence: 'WEEKLY',
      createdAt: new Date(NOW.getTime() - 10 * 24 * 3_600_000), // 10 days ago, WEEKLY (7d) -> due
    });
    const notDueSub = buildSubscription({
      id: 'SUB-NOT-DUE',
      lastSentAt: new Date(NOW.getTime() - 2 * 24 * 3_600_000), // 2 days ago
      cadence: 'WEEKLY', // 7-day interval -> not due
    });

    mockPrisma.ministryExportSubscription.findMany.mockResolvedValue([dueSub, notDueSub]);

    await service.checkSubscriptionsDue();

    expect(processSpy).toHaveBeenCalledTimes(1);
    expect(processSpy).toHaveBeenCalledWith(dueSub);
    expect(mockMinistryService.getVisitorEntriesByLgaAndMonth).not.toHaveBeenCalled();
    expect(mockSendgrid.sendMinistryDigest).not.toHaveBeenCalled();
  });
});
