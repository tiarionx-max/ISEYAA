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

beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
  jest.setSystemTime(NOW);
});

afterEach(() => {
  jest.useRealTimers();
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

describe('MinistryExportSchedulerService.processSubscription', () => {
  it('fetches each report with a from/to window scoped to lastSentAt ?? createdAt, and gives two due subscriptions their own distinct windows', async () => {
    const service = await makeService();

    const subA = buildSubscription({
      id: 'SUB-A',
      lastSentAt: null,
      createdAt: new Date('2026-07-01T00:00:00.000Z'),
    });
    const subB = buildSubscription({
      id: 'SUB-B',
      lastSentAt: new Date('2026-07-10T00:00:00.000Z'),
      createdAt: new Date('2026-06-01T00:00:00.000Z'),
    });

    await (service as any).processSubscription(subA);
    await (service as any).processSubscription(subB);

    const nowIso = NOW.toISOString();

    expect(mockMinistryService.getVisitorEntriesByLgaAndMonth).toHaveBeenNthCalledWith(
      1,
      new Date('2026-07-01T00:00:00.000Z').toISOString(),
      nowIso,
    );
    expect(mockMinistryService.getPurposeBreakdown).toHaveBeenNthCalledWith(
      1,
      new Date('2026-07-01T00:00:00.000Z').toISOString(),
      nowIso,
    );
    expect(mockMinistryService.getRevenueToGovernment).toHaveBeenNthCalledWith(
      1,
      new Date('2026-07-01T00:00:00.000Z').toISOString(),
      nowIso,
    );

    expect(mockMinistryService.getVisitorEntriesByLgaAndMonth).toHaveBeenNthCalledWith(
      2,
      new Date('2026-07-10T00:00:00.000Z').toISOString(),
      nowIso,
    );
    expect(mockMinistryService.getPurposeBreakdown).toHaveBeenNthCalledWith(
      2,
      new Date('2026-07-10T00:00:00.000Z').toISOString(),
      nowIso,
    );
    expect(mockMinistryService.getRevenueToGovernment).toHaveBeenNthCalledWith(
      2,
      new Date('2026-07-10T00:00:00.000Z').toISOString(),
      nowIso,
    );
  });

  it('sends the digest with 2 attachments (PDF + CSV) via resilience.execute("sendgrid", ...) and marks the subscription SUCCESS', async () => {
    const service = await makeService();
    mockMinistryService.getVisitorEntriesByLgaAndMonth.mockResolvedValue([
      { lgaId: 'L1', lgaName: 'Abeokuta', month: '2026-07', userRole: 'TOURIST', count: 5 },
    ]);
    mockCsv.toCsv.mockResolvedValue('a,b,c\n1,2,3');
    mockPdf.renderPdf.mockResolvedValue(Buffer.from('small-pdf'));

    const sub = buildSubscription({ id: 'SUB-OK' });

    await (service as any).processSubscription(sub);

    expect(mockResilience.execute).toHaveBeenCalledWith('sendgrid', expect.any(Function));
    expect(mockSendgrid.sendMinistryDigest).toHaveBeenCalledTimes(1);
    const sendArgs = mockSendgrid.sendMinistryDigest.mock.calls[0][0];
    expect(sendArgs.attachments).toHaveLength(2);
    expect(sendArgs.attachments[0].filename).toBe('ministry-digest.pdf');
    expect(sendArgs.attachments[1].filename).toBe('ministry-digest.csv');

    expect(mockPrisma.ministryExportSubscription.update).toHaveBeenCalledWith({
      where: { id: 'SUB-OK' },
      data: { lastSentAt: NOW, lastStatus: 'SUCCESS', lastError: null },
    });
  });

  it('degrades gracefully when combined raw byte size exceeds the 8MB threshold: sends without attachments, warns, still marks SUCCESS', async () => {
    const service = await makeService();
    const warnSpy = jest.spyOn((service as any).logger, 'warn').mockImplementation(() => undefined);

    mockPdf.renderPdf.mockResolvedValue(Buffer.alloc(9 * 1024 * 1024, 'a')); // 9MB > 8MB threshold
    mockCsv.toCsv.mockResolvedValue('small-csv');

    const sub = buildSubscription({ id: 'SUB-BIG' });

    await (service as any).processSubscription(sub);

    expect(mockSendgrid.sendMinistryDigest).toHaveBeenCalledTimes(1);
    const sendArgs = mockSendgrid.sendMinistryDigest.mock.calls[0][0];
    expect(sendArgs.attachments).toBeUndefined();
    expect(warnSpy).toHaveBeenCalled();

    expect(mockPrisma.ministryExportSubscription.update).toHaveBeenCalledWith({
      where: { id: 'SUB-BIG' },
      data: { lastSentAt: NOW, lastStatus: 'SUCCESS', lastError: null },
    });
  });

  it('marks the subscription FAILED with a truncated error and leaves lastSentAt untouched when resilience.execute rejects', async () => {
    const service = await makeService();
    mockResilience.execute.mockRejectedValue(new Error('SendGrid outage: 503 Service Unavailable'));

    const sub = buildSubscription({ id: 'SUB-FAIL' });

    await (service as any).processSubscription(sub);

    expect(mockPrisma.ministryExportSubscription.update).toHaveBeenCalledTimes(1);
    const updateArgs = mockPrisma.ministryExportSubscription.update.mock.calls[0][0];
    expect(updateArgs.where).toEqual({ id: 'SUB-FAIL' });
    expect(updateArgs.data.lastStatus).toBe('FAILED');
    expect(updateArgs.data.lastError).toBe('SendGrid outage: 503 Service Unavailable');
    expect(updateArgs.data).not.toHaveProperty('lastSentAt');
  });

  it('truncates a lastError longer than 500 characters to exactly 500 characters', async () => {
    const service = await makeService();
    const longMessage = 'x'.repeat(600);
    mockResilience.execute.mockRejectedValue(new Error(longMessage));

    const sub = buildSubscription({ id: 'SUB-LONGERR' });

    await (service as any).processSubscription(sub);

    const updateArgs = mockPrisma.ministryExportSubscription.update.mock.calls[0][0];
    expect(updateArgs.data.lastError).toHaveLength(500);
  });

  it('isolates one subscription failure from the next — the second due subscription is still processed and updated', async () => {
    const service = await makeService();

    const subFail = buildSubscription({ id: 'SUB-ONE-FAILS' });
    const subOk = buildSubscription({ id: 'SUB-TWO-OK' });

    mockMinistryService.getVisitorEntriesByLgaAndMonth
      .mockRejectedValueOnce(new Error('DB blew up'))
      .mockResolvedValue([]);

    mockPrisma.ministryExportSubscription.findMany.mockResolvedValue([subFail, subOk]);

    await service.checkSubscriptionsDue();

    expect(mockPrisma.ministryExportSubscription.update).toHaveBeenCalledTimes(2);
    expect(mockPrisma.ministryExportSubscription.update).toHaveBeenNthCalledWith(1, {
      where: { id: 'SUB-ONE-FAILS' },
      data: { lastStatus: 'FAILED', lastError: 'DB blew up' },
    });
    expect(mockPrisma.ministryExportSubscription.update).toHaveBeenNthCalledWith(2, {
      where: { id: 'SUB-TWO-OK' },
      data: { lastSentAt: NOW, lastStatus: 'SUCCESS', lastError: null },
    });
  });
});
