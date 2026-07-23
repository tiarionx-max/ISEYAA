// PLAN-04 will create '../transport.service' and '../transport.gateway'.
// Until then, this spec is RED — it will fail with "Cannot find module".

import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { TransportService } from '../transport.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { RedisService } from '../../../redis/redis.service';
import { WalletService } from '../../wallet/wallet.service';
import { TransportGateway } from '../transport.gateway';
import { SettlementService } from '../../../common/services/settlement.service';
import { NotificationsClientService } from '../../notifications-client/notifications-client.service';

// ── Fixture IDs ────────────────────────────────────────────────────────────────

const USER_ID     = 'user-uuid-001';
const DRIVER_ID   = 'driver-uuid-001';
const TRIP_ID     = 'trip-uuid-001';
const WALLET_ID   = 'wallet-uuid-001';
const VEHICLE_ID  = 'vehicle-uuid-001';

// ── Mock fixtures ──────────────────────────────────────────────────────────────

const mockDriver = {
  id: DRIVER_ID,
  userId: USER_ID,
  licenceNumber: 'LIC-001',
  licenceExpiry: new Date('2028-06-30'),
  status: 'APPROVED',
  isOnline: false,
  avgRating: 4.5,
  totalTrips: 10,
  acceptanceRate: 0.9,
  approvedById: null,
  approvedAt: null,
  deletedAt: null,
};

const mockVehicle = {
  id: VEHICLE_ID,
  driverId: DRIVER_ID,
  type: 'CAR',
  make: 'Toyota',
  model: 'Camry',
  year: 2020,
  plateNumber: 'ABC-123-XY',
  colour: 'Silver',
  isActive: true,
  deletedAt: null,
};

const mockTrip = {
  id: TRIP_ID,
  riderId: 'rider-uuid-001',
  driverId: DRIVER_ID,
  vehicleId: VEHICLE_ID,
  vehicleType: 'CAR',
  pickupLat: 7.1608,
  pickupLng: 3.3475,
  dropoffLat: 7.2571,
  dropoffLng: 3.4167,
  fare: 1500,
  surgeMultiplier: 1.0,
  platformFee: 225,
  driverEarnings: 1275,
  status: 'IN_PROGRESS',
  requestedAt: new Date(),
  matchedAt: new Date(),
  arrivedAt: new Date(),
  startedAt: new Date(),
  completedAt: null,
  deletedAt: null,
};

const mockPlatformConfig = (key: string, value: number | boolean) => ({
  id: `cfg-${key}`,
  key,
  value,
  isPublic: false,
});

// ── Mock objects ───────────────────────────────────────────────────────────────

const mockPrisma = {
  driver: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  vehicle: {
    create: jest.fn(),
    findFirst: jest.fn(),
  },
  trip: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    count: jest.fn(),
    aggregate: jest.fn(),
    findMany: jest.fn(),
  },
  tripEvent: {
    create: jest.fn(),
  },
  wallet: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
  },
  platformConfig: {
    findUnique: jest.fn(),
  },
  shadowSettlementComparison: {
    create: jest.fn().mockResolvedValue({}),
  },
  $transaction: jest.fn(),
};

const mockSettlement = {
  settle: jest.fn().mockResolvedValue({ status: 'SETTLED', platformAmountNgn: 0, recipientCredits: [] }),
  resolveMinistryWallet: jest.fn().mockResolvedValue({ id: 'WAL-MINISTRY' }),
  resolveSplit: jest.fn().mockResolvedValue({ earnerPct: 0.85, ministryPct: 0.05, platformPct: 0.1 }),
};

const mockRedis = {
  geoadd: jest.fn().mockResolvedValue(undefined),
  geosearch: jest.fn().mockResolvedValue([]),
  zrem: jest.fn().mockResolvedValue(undefined),
  get: jest.fn(),
  set: jest.fn(),
  setNx: jest.fn().mockResolvedValue(true),
};

const mockWallet = {
  creditWallet: jest.fn().mockResolvedValue(undefined),
};

const mockNotifications = { sendPush: jest.fn().mockResolvedValue({ sent: true }) };

const mockGateway = {
  server: {
    to: jest.fn().mockReturnValue({ emit: jest.fn() }),
  },
};

// ── Test suite ─────────────────────────────────────────────────────────────────

describe('TransportService', () => {
  let service: TransportService;

  // Keyed platformConfig lookup — robust against call-order changes, unlike chained
  // mockResolvedValueOnce(). Individual tests can override specific keys afterward.
  const DEFAULT_CONFIG: Record<string, number> = {
    transport_base_fare_car: 500,
    transport_per_km_car: 120,
    transport_surge_threshold: 1.5,
    transport_match_radius_km: 5,
    'transport.match_max_retry_attempts': 3,
  };

  function mockConfigDefaults(overrides: Record<string, number> = {}) {
    const merged = { ...DEFAULT_CONFIG, ...overrides };
    mockPrisma.platformConfig.findUnique.mockImplementation(({ where }: any) =>
      Promise.resolve(where.key in merged ? mockPlatformConfig(where.key, merged[where.key]) : null),
    );
  }

  beforeEach(async () => {
    jest.clearAllMocks();
    // Reset the to().emit chain after clearAllMocks
    const mockEmit = jest.fn();
    const mockTo = jest.fn().mockReturnValue({ emit: mockEmit });
    mockGateway.server.to = mockTo;
    // Reset mockSettlement.settle's implementation after clearAllMocks (clearAllMocks
    // does not remove a custom .mockImplementation set by an earlier test).
    mockSettlement.settle.mockResolvedValue({ status: 'SETTLED', platformAmountNgn: 0, recipientCredits: [] });
    mockSettlement.resolveMinistryWallet.mockResolvedValue({ id: 'WAL-MINISTRY' });
    mockSettlement.resolveSplit.mockResolvedValue({ earnerPct: 0.85, ministryPct: 0.05, platformPct: 0.1 });
    mockConfigDefaults();
    mockPrisma.trip.count.mockResolvedValue(0);
    // Default: the CAS-guarded updateMany in attemptMatchTrip "wins the race" unless a
    // specific test overrides this to simulate a concurrent call already advancing state.
    mockPrisma.trip.updateMany.mockResolvedValue({ count: 1 });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransportService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RedisService, useValue: mockRedis },
        { provide: WalletService, useValue: mockWallet },
        { provide: TransportGateway, useValue: mockGateway },
        { provide: SettlementService, useValue: mockSettlement },
        { provide: NotificationsClientService, useValue: mockNotifications },
      ],
    }).compile();

    service = module.get<TransportService>(TransportService);
  });

  // ── findMine ─────────────────────────────────────────────────────────────

  describe('findMine', () => {
    it('returns the rider’s trips with active trips surfaced first', async () => {
      const searching = { id: 't-1', status: 'SEARCHING', requestedAt: new Date('2026-01-03') };
      const completed = { id: 't-2', status: 'COMPLETED', requestedAt: new Date('2026-01-02') };
      const inProgress = { id: 't-3', status: 'IN_PROGRESS', requestedAt: new Date('2026-01-01') };
      mockPrisma.trip.findMany.mockResolvedValue([searching, completed, inProgress]);

      const result = await service.findMine('rider-1');

      expect(mockPrisma.trip.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { riderId: 'rider-1', deletedAt: null } }),
      );
      expect(result.map((t: any) => t.id)).toEqual(['t-1', 't-3', 't-2']);
    });

    it('returns an empty array when the rider has no trips', async () => {
      mockPrisma.trip.findMany.mockResolvedValue([]);
      await expect(service.findMine('rider-1')).resolves.toEqual([]);
    });
  });

  // ── createDriver ───────────────────────────────────────────────────────────

  describe('createDriver', () => {
    it('creates Driver row with PENDING_REVIEW when no profile exists', async () => {
      mockPrisma.driver.findFirst.mockResolvedValue(null);
      mockPrisma.driver.create.mockResolvedValue({
        ...mockDriver,
        status: 'PENDING_REVIEW',
      });

      const dto = { licenceNumber: 'LIC-001', licenceExpiry: '2028-06-30' };
      const result = await service.createDriver(USER_ID, dto as any);

      expect(mockPrisma.driver.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: USER_ID,
            licenceNumber: 'LIC-001',
          }),
        }),
      );
      expect(result.status).toBe('PENDING_REVIEW');
    });

    it('throws ConflictException when driver profile already exists for userId', async () => {
      mockPrisma.driver.findFirst.mockResolvedValue(mockDriver);

      const dto = { licenceNumber: 'LIC-001', licenceExpiry: '2028-06-30' };
      await expect(service.createDriver(USER_ID, dto as any)).rejects.toThrow(ConflictException);
    });
  });

  // ── createVehicle ──────────────────────────────────────────────────────────

  describe('createVehicle', () => {
    it('creates a Vehicle row linked to the Driver profile when caller owns the driver', async () => {
      mockPrisma.driver.findFirst.mockResolvedValue(mockDriver);
      mockPrisma.vehicle.create.mockResolvedValue(mockVehicle);

      const dto = {
        type: 'CAR',
        make: 'Toyota',
        model: 'Camry',
        year: 2020,
        plateNumber: 'ABC-123-XY',
        colour: 'Silver',
      };

      const result = await service.createVehicle(DRIVER_ID, USER_ID, dto as any);

      expect(mockPrisma.vehicle.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            driverId: DRIVER_ID,
            make: 'Toyota',
            isActive: true,
          }),
        }),
      );
      expect(result.id).toBe(VEHICLE_ID);
    });

    it('throws ForbiddenException when the Driver record userId does not match caller userId', async () => {
      mockPrisma.driver.findFirst.mockResolvedValue({
        ...mockDriver,
        userId: 'another-user-uuid',
      });

      const dto = { type: 'CAR', make: 'Toyota', model: 'Camry', year: 2020, plateNumber: 'ABC', colour: 'Silver' };
      await expect(
        service.createVehicle(DRIVER_ID, USER_ID, dto as any),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFoundException when driverId does not exist', async () => {
      mockPrisma.driver.findFirst.mockResolvedValue(null);

      const dto = { type: 'CAR', make: 'Toyota', model: 'Camry', year: 2020, plateNumber: 'ABC', colour: 'Silver' };
      await expect(
        service.createVehicle('nonexistent-driver', USER_ID, dto as any),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ── approveDriver ──────────────────────────────────────────────────────────

  describe('approveDriver', () => {
    it('transitions PENDING_REVIEW → APPROVED when caller is LGA_ADMIN; sets approvedById and approvedAt', async () => {
      const pendingDriver = { ...mockDriver, status: 'PENDING_REVIEW' };
      mockPrisma.driver.findUnique.mockResolvedValue(pendingDriver);
      mockPrisma.driver.update.mockResolvedValue({
        ...pendingDriver,
        status: 'APPROVED',
        approvedById: 'admin-uuid-001',
        approvedAt: new Date(),
      });

      const dto = { status: 'APPROVED' };
      const result = await service.approveDriver(DRIVER_ID, 'admin-uuid-001', dto as any);

      expect(mockPrisma.driver.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: DRIVER_ID },
          data: expect.objectContaining({
            status: 'APPROVED',
            approvedById: 'admin-uuid-001',
            approvedAt: expect.any(Date),
          }),
        }),
      );
      expect(result.status).toBe('APPROVED');
    });
  });

  // ── goOnline ───────────────────────────────────────────────────────────────

  describe('goOnline', () => {
    it('throws ForbiddenException when driver.status !== APPROVED', async () => {
      mockPrisma.driver.findFirst.mockResolvedValue({ ...mockDriver, status: 'PENDING_REVIEW' });

      await expect(
        service.goOnline(USER_ID, { lat: 7.1608, lng: 3.3475 } as any),
      ).rejects.toThrow(ForbiddenException);
    });

    it('calls redis.geoadd and updates driver.isOnline=true when status is APPROVED', async () => {
      mockPrisma.driver.findFirst.mockResolvedValue(mockDriver);
      mockPrisma.driver.update.mockResolvedValue({ ...mockDriver, isOnline: true });

      await service.goOnline(USER_ID, { lat: 7.1608, lng: 3.3475 } as any);

      expect(mockRedis.geoadd).toHaveBeenCalledWith(
        'drivers:online',
        3.3475,
        7.1608,
        DRIVER_ID,
      );
      expect(mockPrisma.driver.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ isOnline: true }),
        }),
      );
    });
  });

  // ── goOffline ──────────────────────────────────────────────────────────────

  describe('goOffline', () => {
    it('calls redis.zrem and updates driver.isOnline=false', async () => {
      mockPrisma.driver.findFirst.mockResolvedValue({ ...mockDriver, isOnline: true });
      mockPrisma.driver.update.mockResolvedValue({ ...mockDriver, isOnline: false });

      await service.goOffline(USER_ID);

      expect(mockRedis.zrem).toHaveBeenCalledWith('drivers:online', DRIVER_ID);
      expect(mockPrisma.driver.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ isOnline: false }),
        }),
      );
    });
  });

  // ── getFareEstimate ────────────────────────────────────────────────────────

  describe('getFareEstimate', () => {
    it('returns object with baseFare, distanceKm, perKmFare, surgeMultiplier, totalFare', async () => {
      mockPrisma.platformConfig.findUnique
        .mockResolvedValueOnce(mockPlatformConfig('transport_base_fare_car', 500))
        .mockResolvedValueOnce(mockPlatformConfig('transport_per_km_car', 120));
      mockPrisma.trip.count.mockResolvedValue(0);
      mockRedis.geosearch.mockResolvedValue([DRIVER_ID]);

      const result = await service.getFareEstimate({
        vehicleType: 'CAR',
        pickupLat: 7.1608,
        pickupLng: 3.3475,
        dropoffLat: 7.1608,
        dropoffLng: 3.3475,
      } as any);

      expect(result).toHaveProperty('baseFare');
      expect(result).toHaveProperty('distanceKm');
      expect(result).toHaveProperty('perKmFare');
      expect(result).toHaveProperty('surgeMultiplier');
      expect(result).toHaveProperty('totalFare');
    });

    it('reads transport_base_fare_<type> and transport_per_km_<type> from PlatformConfig', async () => {
      mockPrisma.platformConfig.findUnique
        .mockResolvedValueOnce(mockPlatformConfig('transport_base_fare_bike', 200))
        .mockResolvedValueOnce(mockPlatformConfig('transport_per_km_bike', 50));
      mockPrisma.trip.count.mockResolvedValue(0);
      mockRedis.geosearch.mockResolvedValue([]);

      await service.getFareEstimate({
        vehicleType: 'BIKE',
        pickupLat: 7.0,
        pickupLng: 3.0,
        dropoffLat: 7.1,
        dropoffLng: 3.1,
      } as any);

      expect(mockPrisma.platformConfig.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { key: 'transport_base_fare_bike' } }),
      );
    });

    it('computes distanceKm within ±0.5 of 10 for a ~10km coordinate pair', async () => {
      mockPrisma.platformConfig.findUnique
        .mockResolvedValueOnce(mockPlatformConfig('transport_base_fare_car', 500))
        .mockResolvedValueOnce(mockPlatformConfig('transport_per_km_car', 120));
      mockPrisma.trip.count.mockResolvedValue(0);
      mockRedis.geosearch.mockResolvedValue([]);

      // Approximately 10km apart in Ogun State
      const result = await service.getFareEstimate({
        vehicleType: 'CAR',
        pickupLat: 7.1608,
        pickupLng: 3.3475,
        dropoffLat: 7.2508,
        dropoffLng: 3.3475,
      } as any);

      expect(result.distanceKm).toBeGreaterThan(9.5);
      expect(result.distanceKm).toBeLessThan(10.5);
    });
  });

  // ── getSurgeMultiplier ─────────────────────────────────────────────────────

  describe('getSurgeMultiplier', () => {
    it('returns 1.0 when supply >= demand / threshold', async () => {
      mockRedis.geosearch.mockResolvedValue([DRIVER_ID, 'driver-2', 'driver-3']);
      mockPrisma.trip.count.mockResolvedValue(1); // demand=1, supply=3 → ratio 0.33 < 1.5

      const result = await service.getSurgeMultiplier(7.1608, 3.3475);

      expect(result).toBe(1.0);
    });

    it('returns 2.0 (cap) when supply === 0', async () => {
      mockRedis.geosearch.mockResolvedValue([]); // no online drivers
      mockPrisma.trip.count.mockResolvedValue(5);

      const result = await service.getSurgeMultiplier(7.1608, 3.3475);

      expect(result).toBe(2.0);
    });

    it('returns surge between 1.0 and 2.0 when ratio exceeds threshold', async () => {
      mockRedis.geosearch.mockResolvedValue([DRIVER_ID]); // supply=1
      mockPrisma.trip.count.mockResolvedValue(3); // demand=3, ratio=3.0 > 1.5

      const result = await service.getSurgeMultiplier(7.1608, 3.3475);

      expect(result).toBeGreaterThan(1.0);
      expect(result).toBeLessThanOrEqual(2.0);
    });
  });

  // ── requestRide ────────────────────────────────────────────────────────────

  describe('requestRide', () => {
    const dto = {
      pickupLat: 7.1608,
      pickupLng: 3.3475,
      dropoffLat: 7.2571,
      dropoffLng: 3.4167,
      vehicleType: 'CAR',
    };

    function mockCreatedTrip(overrides: any = {}) {
      return {
        ...mockTrip,
        id: TRIP_ID,
        status: 'SEARCHING',
        driverId: null,
        matchAttempts: 0,
        excludedDriverIds: [],
        pickupLat: dto.pickupLat,
        pickupLng: dto.pickupLng,
        ...overrides,
      };
    }

    it('calls redis.geosearch with pickup coords via the first match attempt', async () => {
      mockRedis.geosearch.mockResolvedValue([]);
      const created = mockCreatedTrip();
      mockPrisma.trip.create.mockResolvedValue(created);
      mockPrisma.trip.findFirst.mockResolvedValue(created);

      await service.requestRide('rider-uuid-001', dto as any);

      expect(mockRedis.geosearch).toHaveBeenCalledWith('drivers:online', dto.pickupLng, dto.pickupLat, 5);
    });

    it('returns trip with status SEARCHING and matchAttempts=1 when no drivers found', async () => {
      mockRedis.geosearch.mockResolvedValue([]);
      const created = mockCreatedTrip();
      mockPrisma.trip.create.mockResolvedValue(created);
      mockPrisma.trip.findFirst.mockResolvedValue(created);

      const result = await service.requestRide('rider-uuid-001', dto as any);

      expect(result?.status).toBe('SEARCHING');
      expect(mockPrisma.trip.updateMany).toHaveBeenCalledWith({
        where: { id: TRIP_ID, status: 'SEARCHING', matchAttempts: 0 },
        data: { matchAttempts: 1, matchDeadlineAt: expect.any(Date) },
      });
      expect(mockPrisma.tripEvent.create).toHaveBeenCalledWith({
        data: { tripId: TRIP_ID, event: 'NO_DRIVERS_AVAILABLE', metadata: { attempt: 1 } },
      });
    });

    it('offers the trip to the nearest driver, excludes them, and sets a 60s matchDeadlineAt', async () => {
      mockRedis.geosearch.mockResolvedValue([DRIVER_ID]);
      const created = mockCreatedTrip();
      mockPrisma.trip.create.mockResolvedValue(created);
      mockPrisma.trip.findFirst.mockResolvedValue(created);

      await service.requestRide('rider-uuid-001', dto as any);

      expect(mockGateway.server.to).toHaveBeenCalledWith(`driver:${DRIVER_ID}`);
      expect(mockPrisma.trip.updateMany).toHaveBeenCalledWith({
        where: { id: TRIP_ID, status: 'SEARCHING', matchAttempts: 0 },
        data: { matchAttempts: 1, matchDeadlineAt: expect.any(Date), excludedDriverIds: { push: DRIVER_ID } },
      });
      expect(mockPrisma.tripEvent.create).toHaveBeenCalledWith({
        data: { tripId: TRIP_ID, event: 'DRIVER_OFFERED', metadata: { driverId: DRIVER_ID, attempt: 1 } },
      });
    });

    it('does not double-offer when a concurrent call already advanced the trip (CAS guard loses the race)', async () => {
      mockRedis.geosearch.mockResolvedValue([DRIVER_ID]);
      const created = mockCreatedTrip();
      mockPrisma.trip.create.mockResolvedValue(created);
      mockPrisma.trip.findFirst.mockResolvedValue(created);
      mockPrisma.trip.updateMany.mockResolvedValueOnce({ count: 0 });

      await service.requestRide('rider-uuid-001', dto as any);

      expect(mockGateway.server.to).not.toHaveBeenCalledWith(`driver:${DRIVER_ID}`);
      expect(mockPrisma.tripEvent.create).not.toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ event: 'DRIVER_OFFERED' }) }),
      );
    });

    it('does not offer to a driver already in excludedDriverIds (re-match skips previously-tried drivers)', async () => {
      mockRedis.geosearch.mockResolvedValue([DRIVER_ID, 'driver-uuid-002']);
      const created = mockCreatedTrip({ excludedDriverIds: [DRIVER_ID] });
      mockPrisma.trip.create.mockResolvedValue(created);
      mockPrisma.trip.findFirst.mockResolvedValue(created);

      await service.requestRide('rider-uuid-001', dto as any);

      expect(mockGateway.server.to).toHaveBeenCalledWith('driver:driver-uuid-002');
      expect(mockGateway.server.to).not.toHaveBeenCalledWith(`driver:${DRIVER_ID}`);
    });
  });

  // ── acceptTrip ─────────────────────────────────────────────────────────────

  describe('acceptTrip', () => {
    it('updates trip status to MATCHED, sets matchedAt, emits driver:matched to trip room', async () => {
      mockPrisma.driver.findFirst.mockResolvedValue(mockDriver);
      mockPrisma.trip.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.trip.findFirst.mockResolvedValueOnce({ ...mockTrip, status: 'SEARCHING', driverId: null })
                                .mockResolvedValueOnce({ ...mockTrip, status: 'MATCHED', matchedAt: new Date() });
      mockPrisma.$transaction.mockResolvedValue([]);

      await service.acceptTrip(TRIP_ID, USER_ID);

      expect(mockGateway.server.to).toHaveBeenCalledWith(`trip:${TRIP_ID}`);
    });
  });

  // ── declineTrip ────────────────────────────────────────────────────────────

  describe('declineTrip', () => {
    it('logs DRIVER_DECLINED and immediately attempts to re-match with the next driver', async () => {
      mockPrisma.driver.findFirst.mockResolvedValue(mockDriver);
      const trip = {
        ...mockTrip,
        id: TRIP_ID,
        status: 'SEARCHING',
        matchAttempts: 1,
        excludedDriverIds: [DRIVER_ID],
        pickupLat: 7.1608,
        pickupLng: 3.3475,
      };
      mockPrisma.trip.findFirst.mockResolvedValue(trip);
      mockRedis.geosearch.mockResolvedValue(['driver-uuid-002']);

      const result = await service.declineTrip(TRIP_ID, USER_ID);

      expect(result).toEqual({ declined: true });
      expect(mockPrisma.tripEvent.create).toHaveBeenCalledWith({
        data: { tripId: TRIP_ID, event: 'DRIVER_DECLINED', metadata: { driverId: DRIVER_ID } },
      });
      // Immediate re-match offers the next (not-yet-excluded) driver, doesn't wait for the sweep cron.
      expect(mockGateway.server.to).toHaveBeenCalledWith('driver:driver-uuid-002');
    });
  });

  // ── sweepUnmatchedTrips ────────────────────────────────────────────────────

  describe('sweepUnmatchedTrips', () => {
    it('skips the tick when the distributed lock is already held by another replica', async () => {
      mockRedis.setNx.mockResolvedValue(false);

      await service.sweepUnmatchedTrips();

      expect(mockPrisma.trip.findMany).not.toHaveBeenCalled();
    });

    it('re-attempts matching for every SEARCHING trip past its matchDeadlineAt', async () => {
      mockRedis.setNx.mockResolvedValue(true);
      mockPrisma.trip.findMany.mockResolvedValue([{ id: 'trip-a' }, { id: 'trip-b' }]);
      mockPrisma.trip.findFirst.mockResolvedValue({
        ...mockTrip,
        status: 'SEARCHING',
        matchAttempts: 3,
        excludedDriverIds: [],
      });

      await service.sweepUnmatchedTrips();

      expect(mockPrisma.trip.findMany).toHaveBeenCalledWith({
        where: { status: 'SEARCHING', matchDeadlineAt: { lte: expect.any(Date) } },
        select: { id: true },
      });
      // Both due trips exhausted their retry budget (matchAttempts=3 >= default max 3) — both expire.
      expect(mockPrisma.trip.updateMany).toHaveBeenCalledWith({
        where: { id: 'trip-a', status: 'SEARCHING', matchAttempts: 3 },
        data: { status: 'EXPIRED' },
      });
      expect(mockPrisma.trip.updateMany).toHaveBeenCalledWith({
        where: { id: 'trip-b', status: 'SEARCHING', matchAttempts: 3 },
        data: { status: 'EXPIRED' },
      });
    });
  });

  // ── arrivedAtPickup ────────────────────────────────────────────────────────

  describe('arrivedAtPickup', () => {
    it('transitions trip MATCHED → ARRIVED, sets arrivedAt, emits driver:arrived to trip room', async () => {
      mockPrisma.trip.findFirst.mockResolvedValue({ ...mockTrip, status: 'MATCHED' });
      mockPrisma.driver.findFirst.mockResolvedValue(mockDriver);
      mockPrisma.trip.update.mockResolvedValue({ ...mockTrip, status: 'ARRIVED', arrivedAt: new Date() });

      await service.arrivedAtPickup(TRIP_ID, USER_ID);

      expect(mockPrisma.trip.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'ARRIVED',
            arrivedAt: expect.any(Date),
          }),
        }),
      );
      expect(mockGateway.server.to).toHaveBeenCalledWith(`trip:${TRIP_ID}`);
    });

    it('throws ForbiddenException when calling driver is not the assigned trip.driverId', async () => {
      const anotherDriver = { ...mockDriver, id: 'another-driver-uuid', userId: 'another-user' };
      mockPrisma.trip.findFirst.mockResolvedValue({ ...mockTrip, status: 'MATCHED' });
      mockPrisma.driver.findFirst.mockResolvedValue(anotherDriver);

      await expect(service.arrivedAtPickup(TRIP_ID, 'another-user')).rejects.toThrow(ForbiddenException);
    });

    it('throws BadRequestException when trip.status !== MATCHED', async () => {
      mockPrisma.trip.findFirst.mockResolvedValue({ ...mockTrip, status: 'SEARCHING' });
      mockPrisma.driver.findFirst.mockResolvedValue(mockDriver);

      await expect(service.arrivedAtPickup(TRIP_ID, USER_ID)).rejects.toThrow(BadRequestException);
    });
  });

  // ── startTrip ─────────────────────────────────────────────────────────────

  describe('startTrip', () => {
    it('transitions trip ARRIVED → IN_PROGRESS, sets startedAt, emits trip:started to trip room', async () => {
      mockPrisma.trip.findFirst.mockResolvedValue({ ...mockTrip, status: 'ARRIVED' });
      mockPrisma.driver.findFirst.mockResolvedValue(mockDriver);
      mockPrisma.trip.update.mockResolvedValue({ ...mockTrip, status: 'IN_PROGRESS', startedAt: new Date() });

      await service.startTrip(TRIP_ID, USER_ID);

      expect(mockPrisma.trip.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'IN_PROGRESS',
            startedAt: expect.any(Date),
          }),
        }),
      );
      expect(mockGateway.server.to).toHaveBeenCalledWith(`trip:${TRIP_ID}`);
    });

    it('throws ForbiddenException when calling driver is not the assigned trip.driverId', async () => {
      const anotherDriver = { ...mockDriver, id: 'another-driver-uuid', userId: 'another-user' };
      mockPrisma.trip.findFirst.mockResolvedValue({ ...mockTrip, status: 'ARRIVED' });
      mockPrisma.driver.findFirst.mockResolvedValue(anotherDriver);

      await expect(service.startTrip(TRIP_ID, 'another-user')).rejects.toThrow(ForbiddenException);
    });

    it('throws BadRequestException when trip.status !== ARRIVED', async () => {
      mockPrisma.trip.findFirst.mockResolvedValue({ ...mockTrip, status: 'SEARCHING' });
      mockPrisma.driver.findFirst.mockResolvedValue(mockDriver);

      await expect(service.startTrip(TRIP_ID, USER_ID)).rejects.toThrow(BadRequestException);
    });
  });

  // ── completeTrip ───────────────────────────────────────────────────────────

  describe('completeTrip', () => {
    it('delegates to SettlementService.settle() with DRIVER/MINISTRY recipients when transport.settlement_engine_enabled is true', async () => {
      mockPrisma.trip.findFirst.mockResolvedValue({ ...mockTrip, status: 'IN_PROGRESS' });
      mockPrisma.driver.findFirst.mockResolvedValue(mockDriver);
      mockPrisma.wallet.findFirst.mockResolvedValue({ id: WALLET_ID, userId: USER_ID, balance: 0 });
      mockPrisma.platformConfig.findUnique.mockImplementation((args: any) => {
        const key = args.where.key;
        if (key === 'transport.settlement_engine_enabled') return mockPlatformConfig(key, true);
        if (key === 'transport.govt_levy_pct') return mockPlatformConfig(key, 5);
        if (key === 'transport.platform_fee_pct') return mockPlatformConfig(key, 10);
        return null;
      });
      mockSettlement.settle.mockImplementation(async (input: any) => {
        const tx = { trip: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) }, tripEvent: { create: jest.fn() } };
        await input.onSettled?.(tx);
        return { status: 'SETTLED', platformAmountNgn: 0, recipientCredits: [] };
      });

      await service.completeTrip(TRIP_ID, USER_ID);

      // fare=1500: govtLevy 5%=75, platformFee 10%=150, driverEarnings=1500-225=1275
      expect(mockSettlement.settle).toHaveBeenCalledWith(
        expect.objectContaining({
          reference: `ISY-TRP-${TRIP_ID}`,
          recipients: expect.arrayContaining([
            expect.objectContaining({ tag: 'DRIVER', amountNgn: 1275 }),
            expect.objectContaining({ tag: 'MINISTRY', amountNgn: 75 }),
          ]),
        }),
      );
    });

    it('credits driver wallet 85% and writes a Stage-2 shadow comparison when transport.settlement_engine_enabled is false/unset', async () => {
      mockPrisma.trip.findFirst.mockResolvedValue({ ...mockTrip, status: 'IN_PROGRESS' });
      mockPrisma.driver.findFirst.mockResolvedValue(mockDriver);
      mockPrisma.wallet.findFirst.mockResolvedValue({ id: WALLET_ID, userId: USER_ID, balance: 0 });
      mockPrisma.platformConfig.findUnique.mockImplementation((args: any) => {
        const key = args.where.key;
        if (key === 'transport.settlement_engine_enabled') return null; // unset → false
        if (key === 'transport_platform_fee_pct') return mockPlatformConfig(key, 15);
        if (key === 'transport.govt_levy_pct') return mockPlatformConfig(key, 5);
        if (key === 'transport.platform_fee_pct') return mockPlatformConfig(key, 10);
        return null;
      });
      const mockTripUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
      const mockWalletFindUnique = jest.fn().mockResolvedValue({ id: WALLET_ID, balance: 0 });
      const mockWalletUpdate = jest.fn().mockResolvedValue({});
      const mockTripEventCreate = jest.fn().mockResolvedValue({});
      const mockTransactionCreate = jest.fn().mockResolvedValue({});
      mockPrisma.$transaction.mockImplementation(async (fn) => {
        const tx = {
          trip: { updateMany: mockTripUpdateMany },
          tripEvent: { create: mockTripEventCreate },
          wallet: { findUnique: mockWalletFindUnique, update: mockWalletUpdate },
          transaction: { create: mockTransactionCreate },
          $executeRaw: jest.fn().mockResolvedValue(1),
        };
        return fn(tx);
      });

      await service.completeTrip(TRIP_ID, USER_ID);

      expect(mockTripUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ status: 'IN_PROGRESS' }) }),
      );
      // Driver earns 85% of fare=1500 = 1275
      expect(mockWalletUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ balance: 1275 }) }),
      );
      expect(mockPrisma.shadowSettlementComparison.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ module: 'transport', matched: true }),
        }),
      );
    });

    it('throws BadRequestException when trip is already completed (count=0 from updateMany)', async () => {
      mockPrisma.trip.findFirst.mockResolvedValue({ ...mockTrip, status: 'IN_PROGRESS', driverId: mockDriver.id });
      mockPrisma.driver.findFirst.mockResolvedValue(mockDriver);
      mockPrisma.wallet.findFirst.mockResolvedValue({ id: WALLET_ID, userId: USER_ID, balance: 0 });
      mockPrisma.platformConfig.findUnique.mockImplementation((args: any) => {
        const key = args.where.key;
        if (key === 'transport.settlement_engine_enabled') return null; // unset → false
        if (key === 'transport_platform_fee_pct') return mockPlatformConfig(key, 15);
        return null;
      });
      mockPrisma.$transaction.mockImplementation(async (fn) => {
        const tx = {
          trip: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
          tripEvent: { create: jest.fn() },
          wallet: { findUnique: jest.fn(), update: jest.fn() },
          transaction: { create: jest.fn() },
          $executeRaw: jest.fn().mockResolvedValue(1),
        };
        return fn(tx);
      });

      await expect(service.completeTrip(TRIP_ID, USER_ID)).rejects.toThrow(BadRequestException);
    });

    // CR-03 regression coverage — WR-04
    it('throws BadRequestException before entering the cutover branch when trip is not IN_PROGRESS', async () => {
      mockPrisma.trip.findFirst.mockResolvedValue({ ...mockTrip, status: 'CANCELLED', driverId: mockDriver.id });
      mockPrisma.driver.findFirst.mockResolvedValue(mockDriver);

      await expect(service.completeTrip(TRIP_ID, USER_ID)).rejects.toThrow(BadRequestException);

      // Must fail before any settlement/earnings computation happens.
      expect(mockPrisma.wallet.findFirst).not.toHaveBeenCalled();
      expect(mockSettlement.settle).not.toHaveBeenCalled();
    });

    it('does not resurrect a trip already in a terminal state when the cutover onFailure handler runs', async () => {
      mockPrisma.trip.findFirst.mockResolvedValue({ ...mockTrip, status: 'IN_PROGRESS' });
      mockPrisma.driver.findFirst.mockResolvedValue(mockDriver);
      mockPrisma.wallet.findFirst.mockResolvedValue({ id: WALLET_ID, userId: USER_ID, balance: 0 });
      mockPrisma.platformConfig.findUnique.mockImplementation((args: any) => {
        const key = args.where.key;
        if (key === 'transport.settlement_engine_enabled') return mockPlatformConfig(key, true);
        if (key === 'transport.govt_levy_pct') return mockPlatformConfig(key, 5);
        if (key === 'transport.platform_fee_pct') return mockPlatformConfig(key, 10);
        return null;
      });
      // Simulate: a concurrent duplicate completeTrip call already won the race and
      // completed the trip — onSettled's guard already threw (count=0), so
      // onFailure's own guarded revert must also find count=0 (trip is COMPLETED,
      // which is excluded from the notIn revert filter) and must NOT force it
      // back to IN_PROGRESS.
      mockPrisma.trip.updateMany.mockResolvedValue({ count: 0 });
      mockSettlement.settle.mockImplementation(async (input: any) => {
        await input.onFailure?.(new Error('trip already completed or not in progress'));
        throw new Error('trip already completed or not in progress');
      });

      await expect(service.completeTrip(TRIP_ID, USER_ID)).rejects.toThrow(
        'trip already completed or not in progress',
      );

      expect(mockPrisma.trip.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: TRIP_ID, status: { notIn: ['COMPLETED', 'CANCELLED', 'EXPIRED'] } },
          data: { status: 'IN_PROGRESS' },
        }),
      );
    });

    it('reverts trip to IN_PROGRESS when a non-guard settlement failure occurs and the trip is not terminal', async () => {
      mockPrisma.trip.findFirst.mockResolvedValue({ ...mockTrip, status: 'IN_PROGRESS' });
      mockPrisma.driver.findFirst.mockResolvedValue(mockDriver);
      mockPrisma.wallet.findFirst.mockResolvedValue({ id: WALLET_ID, userId: USER_ID, balance: 0 });
      mockPrisma.platformConfig.findUnique.mockImplementation((args: any) => {
        const key = args.where.key;
        if (key === 'transport.settlement_engine_enabled') return mockPlatformConfig(key, true);
        if (key === 'transport.govt_levy_pct') return mockPlatformConfig(key, 5);
        if (key === 'transport.platform_fee_pct') return mockPlatformConfig(key, 10);
        return null;
      });
      // Simulate: an unrelated failure (e.g. DB error) before the atomic guard ever
      // ran — the whole $transaction rolled back, so the trip is genuinely still
      // IN_PROGRESS in the DB. The guarded revert (notIn terminal statuses) must
      // find count=1 and safely set it back to IN_PROGRESS (a no-op in practice).
      mockPrisma.trip.updateMany.mockResolvedValue({ count: 1 });
      mockSettlement.settle.mockImplementation(async (input: any) => {
        await input.onFailure?.(new Error('DB error'));
        throw new Error('DB error');
      });

      await expect(service.completeTrip(TRIP_ID, USER_ID)).rejects.toThrow('DB error');

      expect(mockPrisma.trip.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: TRIP_ID, status: { notIn: ['COMPLETED', 'CANCELLED', 'EXPIRED'] } },
          data: { status: 'IN_PROGRESS' },
        }),
      );
    });

    // SETTLE-11b regression coverage — 18-02-PLAN.md Task 1
    it('computes driverEarnings=850/totalCommission=150 via resolveSplit for fare=1000 (byte-identical to pre-migration govtLevyPct=5/platformFeePct=10 subtract-first formula)', async () => {
      mockPrisma.trip.findFirst.mockResolvedValue({ ...mockTrip, status: 'IN_PROGRESS', fare: 1000 });
      mockPrisma.driver.findFirst.mockResolvedValue(mockDriver);
      mockPrisma.wallet.findFirst.mockResolvedValue({ id: WALLET_ID, userId: USER_ID, balance: 0 });
      mockPrisma.platformConfig.findUnique.mockImplementation((args: any) => {
        const key = args.where.key;
        if (key === 'transport.settlement_engine_enabled') return mockPlatformConfig(key, true);
        return null;
      });
      mockSettlement.resolveSplit.mockResolvedValueOnce({ earnerPct: 0.85, ministryPct: 0.05, platformPct: 0.1 });
      mockSettlement.settle.mockImplementation(async (input: any) => {
        const tx = { trip: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) }, tripEvent: { create: jest.fn() } };
        await input.onSettled?.(tx);
        return { status: 'SETTLED', platformAmountNgn: 0, recipientCredits: [] };
      });

      await service.completeTrip(TRIP_ID, USER_ID);

      expect(mockSettlement.resolveSplit).toHaveBeenCalledWith('transport', 1000);
      expect(mockSettlement.settle).toHaveBeenCalledWith(
        expect.objectContaining({
          recipients: expect.arrayContaining([
            expect.objectContaining({ tag: 'DRIVER', amountNgn: 850 }),
            expect.objectContaining({ tag: 'MINISTRY', amountNgn: 50 }),
          ]),
        }),
      );
    });

    it('no longer reads transport.govt_levy_pct/transport.platform_fee_pct from PlatformConfig in the cutover branch', async () => {
      mockPrisma.trip.findFirst.mockResolvedValue({ ...mockTrip, status: 'IN_PROGRESS' });
      mockPrisma.driver.findFirst.mockResolvedValue(mockDriver);
      mockPrisma.wallet.findFirst.mockResolvedValue({ id: WALLET_ID, userId: USER_ID, balance: 0 });
      mockPrisma.platformConfig.findUnique.mockImplementation((args: any) => {
        const key = args.where.key;
        if (key === 'transport.settlement_engine_enabled') return mockPlatformConfig(key, true);
        return null;
      });
      mockSettlement.settle.mockImplementation(async (input: any) => {
        const tx = { trip: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) }, tripEvent: { create: jest.fn() } };
        await input.onSettled?.(tx);
        return { status: 'SETTLED', platformAmountNgn: 0, recipientCredits: [] };
      });

      await service.completeTrip(TRIP_ID, USER_ID);

      const calledKeys = mockPrisma.platformConfig.findUnique.mock.calls.map((c: any) => c[0].where.key);
      expect(calledKeys).not.toContain('transport.govt_levy_pct');
      expect(calledKeys).not.toContain('transport.platform_fee_pct');
      expect(mockSettlement.resolveSplit).toHaveBeenCalledWith('transport', 1500);
    });
  });

  // ── getDriverEarnings ──────────────────────────────────────────────────────

  describe('getDriverEarnings', () => {
    it('aggregates Trip.driverEarnings for "today" period returning totalEarnings, tripCount, acceptanceRate, avgRating', async () => {
      mockPrisma.driver.findFirst.mockResolvedValue(mockDriver);
      mockPrisma.trip.aggregate.mockResolvedValue({
        _sum: { driverEarnings: 5000 },
        _count: { id: 4 },
      });

      const result = await service.getDriverEarnings(USER_ID, 'today');

      expect(result).toHaveProperty('totalEarnings');
      expect(result).toHaveProperty('tripCount');
      expect(result).toHaveProperty('acceptanceRate');
      expect(result).toHaveProperty('avgRating');
    });

    it('aggregates over last 7 days for "week" period', async () => {
      mockPrisma.driver.findFirst.mockResolvedValue(mockDriver);
      mockPrisma.trip.aggregate.mockResolvedValue({
        _sum: { driverEarnings: 25000 },
        _count: { id: 18 },
      });

      const result = await service.getDriverEarnings(USER_ID, 'week');

      expect(mockPrisma.trip.aggregate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            driverId: DRIVER_ID,
            completedAt: expect.objectContaining({ gte: expect.any(Date) }),
          }),
        }),
      );
      expect(result.totalEarnings).toBeDefined();
    });
  });

  // ── cleanStaleDriverHeartbeats (cron lock guard) ────────────────────────────

  describe('cleanStaleDriverHeartbeats', () => {
    it('acquires the cron lock and runs existing pass-through behavior unchanged when lock is granted', async () => {
      mockRedis.geosearch.mockResolvedValue([]);

      await service.cleanStaleDriverHeartbeats();

      expect(mockRedis.setNx).toHaveBeenCalledWith('cron-lock:cleanStaleDriverHeartbeats', '1', 25);
      expect(mockRedis.geosearch).toHaveBeenCalledWith('drivers:online', 0, 0, 20000);
    });

    it('skips the tick without calling geosearch when the lock is held by another replica', async () => {
      mockRedis.setNx.mockResolvedValueOnce(false);

      await service.cleanStaleDriverHeartbeats();

      expect(mockRedis.setNx).toHaveBeenCalledWith('cron-lock:cleanStaleDriverHeartbeats', '1', 25);
      expect(mockRedis.geosearch).not.toHaveBeenCalled();
    });
  });
});
