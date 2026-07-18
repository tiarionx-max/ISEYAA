import { Test, TestingModule } from '@nestjs/testing';
import { DbMetricsService } from '../db-metrics.service';
import { PrismaService } from '../../../prisma/prisma.service';

const mockPrisma = {
  $queryRaw: jest.fn(),
};

describe('DbMetricsService', () => {
  let service: DbMetricsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DbMetricsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    service = module.get<DbMetricsService>(DbMetricsService);
  });

  // ── pollOpenConnections ────────────────────────────────────────────────────

  describe('pollOpenConnections', () => {
    it('queries pg_stat_activity and stores the Number-converted count', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([{ count: 7n }]);

      await service.pollOpenConnections();

      expect(mockPrisma.$queryRaw).toHaveBeenCalled();
      expect(service.getCurrentOpenConnections()).toBe(7);
    });

    it('does not throw when $queryRaw rejects, logs only the message, and retains prior value', async () => {
      const loggerErrorSpy = jest
        .spyOn((service as any).logger, 'error')
        .mockImplementation(() => undefined);
      mockPrisma.$queryRaw.mockRejectedValue(new Error('connection refused'));

      await expect(service.pollOpenConnections()).resolves.toBeUndefined();

      expect(service.getCurrentOpenConnections()).toBe(0);
      expect(loggerErrorSpy).toHaveBeenCalledTimes(1);
      const loggedArg = loggerErrorSpy.mock.calls[0][0];
      expect(String(loggedArg)).toContain('connection refused');
      expect(loggedArg).not.toBeInstanceOf(Error);
    });
  });

  // ── getCurrentOpenConnections ──────────────────────────────────────────────

  describe('getCurrentOpenConnections', () => {
    it('defaults to 0 before any poll', () => {
      expect(service.getCurrentOpenConnections()).toBe(0);
    });
  });
});
