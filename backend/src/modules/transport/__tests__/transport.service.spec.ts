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
import { SchedulerRegistry } from '@nestjs/schedule';
import { TransportGateway } from '../transport.gateway';
import { SettlementService } from '../../../common/services/settlement.service';

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
};

const mockRedis = {
  geoadd: jest.fn().mockResolvedValue(undefined),
  geosearch: jest.fn().mockResolvedValue([]),
  zrem: jest.fn().mockResolvedValue(undefined),
  get: jest.fn(),
  set: jest.fn(),
};

const mockWallet = {
  creditWallet: jest.fn().mockResolvedValue(undefined),
};

const mockScheduler = {
  addTimeout: jest.fn(),
  deleteTimeout: jest.fn(),
  doesExist: jest.fn().mockReturnValue(false),
};

const mockGateway = {
  server: {
    to: jest.fn().mockReturnValue({ emit: jest.fn() }),
  },
};

// ── Test suite ─────────────────────────────────────────────────────────────────

describe('TransportService', () => {
  let service: TransportService;

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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransportService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RedisService, useValue: mockRedis },
        { provide: WalletService, useValue: mockWallet },
        { provide: SchedulerRegistry, useValue: mockScheduler },
        { provide: TransportGateway, useValue: mockGateway },
        { provide: SettlementService, useValue: mockSettlement },
      ],
    }).compile();

    service = module.get<TransportService>(TransportService);
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
    it('calls redis.geosearch with pickup coords', async () => {
      mockRedis.geosearch.mockResolvedValue([]);
      mockPrisma.trip.create.mockResolvedValue({ ...mockTrip, status: 'SEARCHING', driverId: null });
      mockPrisma.platformConfig.findUnique
        .mockResolvedValueOnce(mockPlatformConfig('transport_base_fare_car', 500))
        .mockResolvedValueOnce(mockPlatformConfig('transport_per_km_car', 120))
        .mockResolvedValueOnce(mockPlatformConfig('transport_match_radius_km', 5));
      mockPrisma.trip.count.mockResolvedValue(0);

      const dto = {
        pickupLat: 7.1608,
        pickupLng: 3.3475,
        dropoffLat: 7.2571,
        dropoffLng: 3.4167,
        vehicleType: 'CAR',
      };

      await service.requestRide('rider-uuid-001', dto as any);

      expect(mockRedis.geosearch).toHaveBeenCalledWith(
        'drivers:online',
        expect.any(Number),
        expect.any(Number),
        expect.any(Number),
      );
    });

    it('returns trip with status SEARCHING when no drivers found', async () => {
      mockRedis.geosearch.mockResolvedValue([]);
      mockPrisma.trip.create.mockResolvedValue({ ...mockTrip, status: 'SEARCHING', driverId: null });
      mockPrisma.platformConfig.findUnique
        .mockResolvedValueOnce(mockPlatformConfig('transport_base_fare_car', 500))
        .mockResolvedValueOnce(mockPlatformConfig('transport_per_km_car', 120))
        .mockResolvedValueOnce(mockPlatformConfig('transport_match_radius_km', 5));
      mockPrisma.trip.count.mockResolvedValue(0);

      const dto = {
        pickupLat: 7.1608,
        pickupLng: 3.3475,
        dropoffLat: 7.2571,
        dropoffLng: 3.4167,
        vehicleType: 'CAR',
      };

      const result = await service.requestRide('rider-uuid-001', dto as any);

      expect(result.status).toBe('SEARCHING');
    });

    it('notifies first driver via gateway.server.to("driver:{driverId}").emit when geosearch returns a driver', async () => {
      mockRedis.geosearch.mockResolvedValue([DRIVER_ID]);
      mockPrisma.trip.create.mockResolvedValue({ ...mockTrip, status: 'SEARCHING' });
      mockPrisma.platformConfig.findUnique
        .mockResolvedValueOnce(mockPlatformConfig('transport_base_fare_car', 500))
        .mockResolvedValueOnce(mockPlatformConfig('transport_per_km_car', 120))
        .mockResolvedValueOnce(mockPlatformConfig('transport_match_radius_km', 5));
      mockPrisma.trip.count.mockResolvedValue(0);

      const dto = {
        pickupLat: 7.1608,
        pickupLng: 3.3475,
        dropoffLat: 7.2571,
        dropoffLng: 3.4167,
        vehicleType: 'CAR',
      };

      await service.requestRide('rider-uuid-001', dto as any);

      expect(mockGateway.server.to).toHaveBeenCalledWith(`driver:${DRIVER_ID}`);
    });

    it('calls schedulerRegistry.addTimeout("match:{tripId}", anything) to register 60s timeout', async () => {
      mockRedis.geosearch.mockResolvedValue([]);
      mockPrisma.trip.create.mockResolvedValue({ ...mockTrip, id: TRIP_ID, status: 'SEARCHING', driverId: null });
      mockPrisma.platformConfig.findUnique
        .mockResolvedValueOnce(mockPlatformConfig('transport_base_fare_car', 500))
        .mockResolvedValueOnce(mockPlatformConfig('transport_per_km_car', 120))
        .mockResolvedValueOnce(mockPlatformConfig('transport_match_radius_km', 5));
      mockPrisma.trip.count.mockResolvedValue(0);

      const dto = {
        pickupLat: 7.1608,
        pickupLng: 3.3475,
        dropoffLat: 7.2571,
        dropoffLng: 3.4167,
        vehicleType: 'CAR',
      };

      await service.requestRide('rider-uuid-001', dto as any);

      expect(mockScheduler.addTimeout).toHaveBeenCalledWith(
        `match:${TRIP_ID}`,
        expect.anything(),
      );
    });
  });

  // ── acceptTrip ─────────────────────────────────────────────────────────────

  describe('acceptTrip', () => {
    it('updates trip status to MATCHED, sets matchedAt, cancels timeout, emits driver:matched to trip room', async () => {
      mockPrisma.trip.findFirst.mockResolvedValue({ ...mockTrip, status: 'SEARCHING', driverId: null });
      mockPrisma.driver.findFirst.mockResolvedValue(mockDriver);
      mockScheduler.doesExist.mockReturnValue(true);
      mockPrisma.trip.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.trip.findFirst.mockResolvedValueOnce({ ...mockTrip, status: 'SEARCHING', driverId: null })
                                .mockResolvedValueOnce({ ...mockTrip, status: 'MATCHED', matchedAt: new Date() });
      mockPrisma.$transaction.mockResolvedValue([]);

      await service.acceptTrip(TRIP_ID, USER_ID);

      expect(mockScheduler.deleteTimeout).toHaveBeenCalledWith(`match:${TRIP_ID}`);
      expect(mockGateway.server.to).toHaveBeenCalledWith(`trip:${TRIP_ID}`);
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
});
