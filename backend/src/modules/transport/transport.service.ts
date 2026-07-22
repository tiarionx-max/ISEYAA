import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { Cron, CronExpression, SchedulerRegistry } from '@nestjs/schedule';
import { v4 as uuidv4 } from 'uuid';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { WalletService } from '../wallet/wallet.service';
import { SettlementService, SettlementRecipient } from '../../common/services/settlement.service';
import { TransportGateway } from './transport.gateway';
import { TripStatus, VehicleType } from '@prisma/client';
import { CreateDriverDto } from './dto/create-driver.dto';
import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { ApproveDriverDto } from './dto/approve-driver.dto';
import { GoOnlineDto } from './dto/go-online.dto';
import { RequestRideDto } from './dto/request-ride.dto';
import { CompleteTripDto } from './dto/complete-trip.dto';

// ── Types ────────────────────────────────────────────────────────────────────

export interface FareEstimate {
  baseFare: number;
  distanceKm: number;
  perKmFare: number;
  surgeMultiplier: number;
  totalFare: number;
}

export interface EarningsResponse {
  totalEarnings: number;
  tripCount: number;
  acceptanceRate: number;
  avgRating: number;
}

// ── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class TransportService {
  private readonly logger = new Logger(TransportService.name);

  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private walletService: WalletService,
    private schedulerRegistry: SchedulerRegistry,
    @Inject(forwardRef(() => TransportGateway)) private gateway: TransportGateway,
    private settlementService: SettlementService,
  ) {}

  // ── haversineDistanceKm ──────────────────────────────────────────────────

  private haversineDistanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371; // Earth radius in km
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  // ── scheduleMatchTimeout ──────────────────────────────────────────────────

  private scheduleMatchTimeout(tripId: string): void {
    const timeoutId = setTimeout(async () => {
      await this.expireUnmatchedTrip(tripId);
    }, 60_000);
    this.schedulerRegistry.addTimeout(`match:${tripId}`, timeoutId);
  }

  // ── expireUnmatchedTrip ───────────────────────────────────────────────────

  private async expireUnmatchedTrip(tripId: string): Promise<void> {
    try {
      const trip = await this.prisma.trip.findFirst({ where: { id: tripId } });
      if (!trip || trip.status !== 'SEARCHING') return;

      await this.prisma.trip.update({
        where: { id: tripId },
        data: { status: 'EXPIRED' as any },
      });

      this.gateway.server.to(`trip:${tripId}`).emit('trip:expired');
      this.logger.log(`Trip ${tripId} expired — no driver matched within 60s`);
    } catch (err) {
      this.logger.error(`expireUnmatchedTrip failed for trip ${tripId}`, err.message);
    }
  }

  // ── cancelMatchTimeout ────────────────────────────────────────────────────

  private cancelMatchTimeout(tripId: string): void {
    if (this.schedulerRegistry.doesExist('timeout', `match:${tripId}`)) {
      this.schedulerRegistry.deleteTimeout(`match:${tripId}`);
    }
  }

  // ── findMine ──────────────────────────────────────────────────────────────

  /** The current rider's trips, most recent first — active (non-terminal) trip surfaces first. */
  async findMine(riderId: string) {
    const trips = await this.prisma.trip.findMany({
      where: { riderId, deletedAt: null },
      include: { driver: { select: { id: true, licenceNumber: true } } },
      orderBy: { requestedAt: 'desc' },
      take: 20,
    });
    const activeStatuses = ['SEARCHING', 'MATCHED', 'ARRIVED', 'IN_PROGRESS'];
    return trips.sort((a, b) => {
      const aActive = activeStatuses.includes(a.status) ? 0 : 1;
      const bActive = activeStatuses.includes(b.status) ? 0 : 1;
      return aActive - bActive;
    });
  }

  // ── getMyDriverProfile ────────────────────────────────────────────────────

  async getMyDriverProfile(userId: string) {
    return this.prisma.driver.findFirst({
      where: { userId, deletedAt: null },
      include: { vehicles: true },
    });
  }

  // ── createDriver ──────────────────────────────────────────────────────────

  async createDriver(userId: string, dto: CreateDriverDto) {
    const existing = await this.prisma.driver.findFirst({
      where: { userId, deletedAt: null },
    });
    if (existing) throw new ConflictException('Driver profile already exists for this user');

    return this.prisma.driver.create({
      data: {
        userId,
        licenceNumber: dto.licenceNumber,
        licenceExpiry: new Date(dto.licenceExpiry),
        status: 'PENDING_REVIEW' as any,
        isOnline: false,
        totalTrips: 0,
        avgRating: 0,
        acceptanceRate: 0,
      },
    });
  }

  // ── createVehicle ─────────────────────────────────────────────────────────

  async createVehicle(driverId: string, userId: string, dto: CreateVehicleDto) {
    const driver = await this.prisma.driver.findFirst({
      where: { id: driverId, deletedAt: null },
    });
    if (!driver) throw new NotFoundException('Driver profile not found');
    if (driver.userId !== userId) throw new ForbiddenException('Not your driver profile');

    return this.prisma.vehicle.create({
      data: {
        driverId,
        type: dto.type as any,
        make: dto.make,
        model: dto.model,
        year: dto.year,
        plateNumber: dto.plateNumber,
        colour: dto.colour,
        imageUrl: dto.imageUrl,
        isActive: true,
      },
    });
  }

  // ── approveDriver ─────────────────────────────────────────────────────────

  async approveDriver(driverId: string, lgaAdminId: string, dto: ApproveDriverDto) {
    const driver = await this.prisma.driver.findUnique({ where: { id: driverId } });
    if (!driver) throw new NotFoundException('Driver not found');

    return this.prisma.driver.update({
      where: { id: driverId },
      data: {
        status: dto.status as any,
        approvedById: lgaAdminId,
        approvedAt: new Date(),
      },
    });
  }

  // ── goOnline / goOffline ──────────────────────────────────────────────────

  async goOnline(userId: string, dto: GoOnlineDto): Promise<{ online: true }> {
    const driver = await this.prisma.driver.findFirst({
      where: { userId, deletedAt: null },
    });
    if (!driver) throw new NotFoundException('Driver profile not found');
    if (driver.status !== 'APPROVED') {
      throw new ForbiddenException('Driver must be approved to go online');
    }

    const now = new Date();

    await this.redis.geoadd('drivers:online', dto.lng, dto.lat, driver.id);
    await this.redis.set(`driver:heartbeat:${driver.id}`, now.toISOString(), 90);

    await this.prisma.driver.update({
      where: { id: driver.id },
      data: { isOnline: true, lastSeenAt: now },
    });

    return { online: true };
  }

  async goOffline(userId: string): Promise<{ online: false }> {
    const driver = await this.prisma.driver.findFirst({
      where: { userId, deletedAt: null },
    });
    if (!driver) throw new NotFoundException('Driver profile not found');

    await this.redis.zrem('drivers:online', driver.id);
    // Expire the heartbeat key immediately by setting TTL to 1 second
    await this.redis.set(`driver:heartbeat:${driver.id}`, 'offline', 1);

    await this.prisma.driver.update({
      where: { id: driver.id },
      data: { isOnline: false },
    });

    return { online: false };
  }

  // ── getFareEstimate / getSurgeMultiplier ──────────────────────────────────

  // Nigerian market defaults per vehicle class — overridden by platformConfig rows
  private readonly FARE_DEFAULTS: Record<string, { base: number; perKm: number }> = {
    bike:     { base: 200, perKm: 50  },
    tricycle: { base: 350, perKm: 80  },
    car:      { base: 500, perKm: 120 },
    minibus:  { base: 700, perKm: 150 },
  };

  async getFareEstimate(query: {
    vehicleType: string;
    pickupLat: number;
    pickupLng: number;
    dropoffLat: number;
    dropoffLng: number;
  }): Promise<FareEstimate> {
    const typeKey = query.vehicleType.toLowerCase();
    const defaults = this.FARE_DEFAULTS[typeKey] ?? { base: 500, perKm: 120 };

    const [baseFareCfg, perKmCfg] = await Promise.all([
      this.prisma.platformConfig.findUnique({ where: { key: `transport_base_fare_${typeKey}` } }),
      this.prisma.platformConfig.findUnique({ where: { key: `transport_per_km_${typeKey}` } }),
    ]);

    const baseFare = baseFareCfg ? Number(baseFareCfg.value) : defaults.base;
    const perKmFare = perKmCfg ? Number(perKmCfg.value) : defaults.perKm;

    const distanceKm = Math.round(
      this.haversineDistanceKm(
        query.pickupLat,
        query.pickupLng,
        query.dropoffLat,
        query.dropoffLng,
      ) * 100,
    ) / 100;

    // H-12: pass vehicleType so surge demand is filtered per vehicle class
    const surgeMultiplier = await this.getSurgeMultiplier(query.pickupLat, query.pickupLng, query.vehicleType);

    const totalFare = Math.round((baseFare + distanceKm * perKmFare) * surgeMultiplier * 100) / 100;

    return { baseFare, distanceKm, perKmFare, surgeMultiplier, totalFare };
  }

  async getSurgeMultiplier(lat: number, lng: number, vehicleType?: string): Promise<number> {
    try {
      const [thresholdCfg, radiusCfg] = await Promise.all([
        this.prisma.platformConfig.findUnique({ where: { key: 'transport_surge_threshold' } }),
        this.prisma.platformConfig.findUnique({ where: { key: 'transport_match_radius_km' } }),
      ]);

      const threshold = thresholdCfg ? Number(thresholdCfg.value) : 1.5;
      const radiusKm = radiusCfg ? Number(radiusCfg.value) : 5;

      const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);

      const parsedVehicleType = vehicleType && Object.values(VehicleType).includes(vehicleType as VehicleType)
        ? (vehicleType as VehicleType)
        : undefined;

      const [nearbyDrivers, demand] = await Promise.all([
        this.redis.geosearch('drivers:online', lng, lat, radiusKm),
        this.prisma.trip.count({
          where: {
            status: { in: [TripStatus.SEARCHING, TripStatus.MATCHED] },
            requestedAt: { gte: fiveMinAgo },
            ...(parsedVehicleType && { vehicleType: parsedVehicleType }),
          },
        }),
      ]);

      const supply = nearbyDrivers.length;

      if (supply === 0) return 2.0;

      const ratio = demand / supply;
      if (ratio <= threshold) return 1.0;

      return Math.min(Math.round((ratio / threshold) * 10) / 10, 2.0);
    } catch (err) {
      this.logger.warn(`getSurgeMultiplier failed, defaulting to 1.0: ${(err as Error).message}`);
      return 1.0;
    }
  }

  // ── requestRide / matchTimeout ────────────────────────────────────────────

  async requestRide(userId: string, dto: RequestRideDto) {
    // Compute fare estimate
    const fareEstimate = await this.getFareEstimate({
      vehicleType: dto.vehicleType as string,
      pickupLat: dto.pickupLat,
      pickupLng: dto.pickupLng,
      dropoffLat: dto.dropoffLat,
      dropoffLng: dto.dropoffLng,
    });

    // Read match radius from PlatformConfig
    const radiusCfg = await this.prisma.platformConfig.findUnique({
      where: { key: 'transport_match_radius_km' },
    });
    const radiusKm = radiusCfg ? Number(radiusCfg.value) : 5;

    // Create trip record
    const trip = await this.prisma.trip.create({
      data: {
        riderId: userId,
        vehicleType: dto.vehicleType as any,
        pickupLat: dto.pickupLat,
        pickupLng: dto.pickupLng,
        pickupAddress: dto.pickupAddress,
        dropoffLat: dto.dropoffLat,
        dropoffLng: dto.dropoffLng,
        dropoffAddress: dto.dropoffAddress,
        distanceKm: fareEstimate.distanceKm,
        fare: fareEstimate.totalFare,
        surgeMultiplier: fareEstimate.surgeMultiplier,
        status: 'SEARCHING' as any,
      },
    });

    // Find nearby drivers
    const nearbyDrivers = await this.redis.geosearch(
      'drivers:online',
      dto.pickupLng,
      dto.pickupLat,
      radiusKm,
    );

    // Notify nearest driver if available
    if (nearbyDrivers.length > 0) {
      const nearestDriverId = nearbyDrivers[0];
      this.gateway.server.to(`driver:${nearestDriverId}`).emit('ride:request', trip);
    }

    // Schedule 60s match timeout
    this.scheduleMatchTimeout(trip.id);

    return trip;
  }

  // ── acceptTrip ────────────────────────────────────────────────────────────

  async acceptTrip(tripId: string, driverUserId: string) {
    const driver = await this.prisma.driver.findFirst({
      where: { userId: driverUserId, deletedAt: null },
    });
    if (!driver) throw new NotFoundException('Driver profile not found');
    if (driver.status !== 'APPROVED') {
      throw new ForbiddenException('Driver must be approved to accept trips');
    }

    // Verify the trip exists before attempting atomic update
    const tripExists = await this.prisma.trip.findFirst({ where: { id: tripId } });
    if (!tripExists) throw new NotFoundException('Trip not found');

    // H-02: atomic updateMany with WHERE status='SEARCHING' eliminates TOCTOU race
    // where two drivers both pass the status check and both write their driverId.
    const now = new Date();
    const updated = await this.prisma.trip.updateMany({
      where: { id: tripId, status: 'SEARCHING' as any },
      data: { driverId: driver.id, status: 'MATCHED' as any, matchedAt: now },
    });
    if (updated.count === 0) {
      throw new BadRequestException('Trip already matched or expired');
    }

    await this.prisma.tripEvent.create({
      data: { tripId, event: 'DRIVER_MATCHED' },
    });

    // Cancel match timeout
    this.cancelMatchTimeout(tripId);

    const updatedTrip = await this.prisma.trip.findFirst({ where: { id: tripId } });

    // Notify rider
    this.gateway.server.to(`trip:${tripId}`).emit('driver:matched', { driver, trip: updatedTrip });

    return updatedTrip;
  }

  // ── declineTrip ───────────────────────────────────────────────────────────

  async declineTrip(tripId: string, driverUserId: string): Promise<{ declined: true }> {
    const driver = await this.prisma.driver.findFirst({
      where: { userId: driverUserId, deletedAt: null },
    });
    if (!driver) throw new NotFoundException('Driver profile not found');

    const trip = await this.prisma.trip.findFirst({ where: { id: tripId } });
    if (!trip) throw new NotFoundException('Trip not found');

    // Record decline event — trip stays SEARCHING
    await this.prisma.tripEvent.create({
      data: {
        tripId,
        event: 'DRIVER_DECLINED',
        metadata: { driverId: driver.id },
      },
    });

    this.logger.log(`Driver ${driver.id} declined trip ${tripId}`);

    return { declined: true };
  }

  // ── arrivedAtPickup ───────────────────────────────────────────────────────

  async arrivedAtPickup(tripId: string, driverUserId: string) {
    const trip = await this.prisma.trip.findFirst({ where: { id: tripId } });
    if (!trip) throw new NotFoundException('Trip not found');

    const driver = await this.prisma.driver.findFirst({
      where: { userId: driverUserId, deletedAt: null },
    });
    if (!driver) throw new NotFoundException('Driver profile not found');

    if (trip.driverId !== driver.id) {
      throw new ForbiddenException('You are not the assigned driver for this trip');
    }

    if (trip.status !== 'MATCHED') {
      throw new BadRequestException(`Trip must be in MATCHED state to mark arrived; current: ${trip.status}`);
    }

    const now = new Date();

    const [updatedTrip] = await Promise.all([
      this.prisma.trip.update({
        where: { id: tripId },
        data: { status: 'ARRIVED' as any, arrivedAt: now },
      }),
      this.prisma.tripEvent.create({
        data: { tripId, event: 'DRIVER_ARRIVED' },
      }),
    ]);

    this.gateway.server.to(`trip:${tripId}`).emit('driver:arrived', { tripId });

    return updatedTrip;
  }

  // ── startTrip ─────────────────────────────────────────────────────────────

  async startTrip(tripId: string, driverUserId: string) {
    const trip = await this.prisma.trip.findFirst({ where: { id: tripId } });
    if (!trip) throw new NotFoundException('Trip not found');

    const driver = await this.prisma.driver.findFirst({
      where: { userId: driverUserId, deletedAt: null },
    });
    if (!driver) throw new NotFoundException('Driver profile not found');

    if (trip.driverId !== driver.id) {
      throw new ForbiddenException('You are not the assigned driver for this trip');
    }

    if (trip.status !== 'ARRIVED') {
      throw new BadRequestException(`Trip must be in ARRIVED state to start; current: ${trip.status}`);
    }

    const now = new Date();

    const [updatedTrip] = await Promise.all([
      this.prisma.trip.update({
        where: { id: tripId },
        data: { status: 'IN_PROGRESS' as any, startedAt: now },
      }),
      this.prisma.tripEvent.create({
        data: { tripId, event: 'TRIP_STARTED' },
      }),
    ]);

    this.gateway.server.to(`trip:${tripId}`).emit('trip:started', { tripId });

    return updatedTrip;
  }

  // ── completeTrip ──────────────────────────────────────────────────────────

  async completeTrip(tripId: string, driverUserId: string, dto?: CompleteTripDto) {
    const trip = await this.prisma.trip.findFirst({ where: { id: tripId } });
    if (!trip) throw new NotFoundException('Trip not found');

    const driver = await this.prisma.driver.findFirst({
      where: { userId: driverUserId, deletedAt: null },
    });
    if (!driver) throw new NotFoundException('Driver profile not found');

    if (trip.driverId !== driver.id) {
      throw new ForbiddenException('You are not the assigned driver for this trip');
    }

    // CR-03: explicit status precondition — mirrors arrivedAtPickup/startTrip.
    // Without this, the cutover branch below would unconditionally compute
    // earnings and call settle() for a trip that is CANCELLED/COMPLETED/etc.
    if (trip.status !== 'IN_PROGRESS') {
      throw new BadRequestException(`Trip must be IN_PROGRESS to complete; current: ${trip.status}`);
    }

    const now = new Date();
    const fare = Number(trip.fare);

    // D-07: cutover-flag gate — read fresh on every call, never cached.
    const cutoverCfg = await this.prisma.platformConfig.findUnique({
      where: { key: 'transport.settlement_engine_enabled' },
    });
    // WR-01: strict equality avoids Boolean("false") === true footgun on the
    // untyped Json PlatformConfig column for this safety-critical flag.
    const cutoverEnabled = cutoverCfg?.value === true;

    // Fetched once, reused by both branches.
    const driverWallet = await this.prisma.wallet.findFirst({ where: { userId: driverUserId } });

    // WR-02: a missing driver wallet must not silently drop the driver's earnings —
    // both branches below would otherwise transition the trip to COMPLETED while
    // computing money owed to the driver that never lands anywhere (legacy: the
    // `if (driverWallet)` guard is a silent no-op; cutover: `walletId: null` makes
    // SettlementService route the share to the platform wallet instead).
    if (!driverWallet) {
      this.logger.error(
        `completeTrip: driver ${driverUserId} (driverId=${driver.id}) has no wallet — refusing to complete trip ${tripId} without a payout destination`,
      );
      throw new BadRequestException('Driver wallet not found — cannot complete trip settlement');
    }

    let driverEarnings: number;
    let totalCommission: number;

    if (cutoverEnabled) {
      // ── SettlementService-delegated path ────────────────────────────────
      // SETTLE-11b: centralized resolver replaces the 2× inline PlatformConfig
      // reads that used to live here. resolveSplit() returns 0-1 fractions
      // (D-03) — convert back to whole-number percent for the existing
      // subtract-first arithmetic below, which is left byte-for-byte unchanged.
      const { ministryPct, platformPct } = await this.settlementService.resolveSplit('transport', fare);
      const govtLevyPct = ministryPct * 100;
      const platformFeePct = (platformPct ?? 0) * 100;

      // D-01/Pitfall-1: SUBTRACT-FIRST — must match today's exact formula order.
      const totalCommissionPct = govtLevyPct + platformFeePct;
      totalCommission = Math.round(fare * (totalCommissionPct / 100) * 100) / 100;
      driverEarnings = Math.round((fare - totalCommission) * 100) / 100;
      const govtLevyNgn = Math.round(fare * (govtLevyPct / 100) * 100) / 100;

      const ministryWallet = await this.settlementService.resolveMinistryWallet();

      const recipients: SettlementRecipient[] = [
        {
          tag: 'DRIVER',
          refSuffix: 'DRV',
          walletId: driverWallet?.id ?? null,
          amountNgn: driverEarnings,
          metadata: { tripId },
        },
        {
          tag: 'MINISTRY',
          refSuffix: 'MINISTRY',
          walletId: ministryWallet?.id ?? null,
          amountNgn: govtLevyNgn,
          metadata: { tripId },
        },
      ];

      const capturedDriverEarnings = driverEarnings;
      const capturedTotalCommission = totalCommission;

      await this.settlementService.settle({
        module: 'transport',
        reference: `ISY-TRP-${tripId}`,
        gateway: 'INTERNAL',
        amountKobo: Math.round(fare * 100), // WR-03: avoid IEEE-754 float drift crossing into SettlementService
        recipients,
        buyerWalletId: null,
        description: 'Trip completion settlement',
        platformMetadata: { tripId, driverUserId },
        onSettled: async (tx) => {
          const result = await tx.trip.updateMany({
            where: { id: tripId, status: 'IN_PROGRESS' as any },
            data: {
              status: 'COMPLETED' as any,
              completedAt: now,
              platformFee: capturedTotalCommission,
              driverEarnings: capturedDriverEarnings,
              ...(dto?.driverRating && { driverRating: dto.driverRating }),
            },
          });
          if (result.count === 0) {
            throw new BadRequestException('Trip already completed or not in progress');
          }
          await tx.tripEvent.create({ data: { tripId, event: 'TRIP_COMPLETED' } });
        },
        onFailure: async () => {
          // CR-03: only revert to IN_PROGRESS if the trip is not already in a
          // terminal state. onSettled's atomic guard throws (count===0) when the
          // trip was NOT actually IN_PROGRESS at settlement time (e.g. a
          // concurrent duplicate call already completed it, or it was
          // legitimately cancelled) — in that case the trip's current status is
          // authoritative and must not be clobbered back to IN_PROGRESS, or a
          // stray/duplicate completeTrip call could resurrect a terminal trip
          // into a retryable state and enable a second payout. If the failure
          // was unrelated to the guard (e.g. a DB error before the guard ran),
          // the whole $transaction rolled back and the trip is still genuinely
          // IN_PROGRESS in the DB, so this update is a safe no-op in that case.
          const result = await this.prisma.trip.updateMany({
            where: { id: tripId, status: { notIn: ['COMPLETED', 'CANCELLED', 'EXPIRED'] } },
            data: { status: 'IN_PROGRESS' as any },
          });
          if (result.count === 0) {
            this.logger.warn(
              `completeTrip onFailure: not reverting trip ${tripId} — already in a terminal state`,
            );
          }
        },
      });
    } else {
      // ── Legacy inline-transaction path (UNCHANGED) ──────────────────────
      // Read platform fee from PlatformConfig — NEVER hardcode
      const feeCfg = await this.prisma.platformConfig.findUnique({
        where: { key: 'transport_platform_fee_pct' },
      });
      const feePct = feeCfg ? Number(feeCfg.value) : 15;

      const platformFee = Math.round(fare * (feePct / 100) * 100) / 100;
      driverEarnings = Math.round((fare - platformFee) * 100) / 100;
      totalCommission = platformFee;

      const ref = `ISY-DRV-${uuidv4().replace(/-/g, '').slice(0, 12).toUpperCase()}`;

      // H-10: use updateMany with WHERE status='IN_PROGRESS' and check count to prevent
      // double-earnings if completeTrip is called twice (e.g. retry after partial failure).
      // C-09: driver wallet credit runs inside the same interactive transaction so a crash
      // between the trip update and the credit cannot leave the driver unpaid.
      await this.prisma.$transaction(async (tx) => {
        // H-10: atomic update — only succeeds if trip is still IN_PROGRESS
        const result = await tx.trip.updateMany({
          where: { id: tripId, status: 'IN_PROGRESS' as any },
          data: {
            status: 'COMPLETED' as any,
            completedAt: now,
            platformFee,
            driverEarnings,
            ...(dto?.driverRating && { driverRating: dto.driverRating }),
          },
        });
        if (result.count === 0) {
          throw new BadRequestException('Trip already completed or not in progress');
        }

        await tx.tripEvent.create({ data: { tripId, event: 'TRIP_COMPLETED' } });

        // C-09: credit driver wallet within the same transaction with row-lock
        if (driverWallet) {
          await tx.$executeRaw`SELECT id FROM wallets WHERE id = ${driverWallet.id} FOR UPDATE`;
          const lockedWallet = await tx.wallet.findUnique({ where: { id: driverWallet.id } });
          if (lockedWallet) {
            const balanceBefore = Number(lockedWallet.balance);
            const balanceAfter = balanceBefore + driverEarnings;
            await tx.wallet.update({ where: { id: driverWallet.id }, data: { balance: balanceAfter } });
            await tx.transaction.create({
              data: {
                walletId: driverWallet.id,
                type: 'CREDIT',
                status: 'SUCCESS',
                amount: driverEarnings,
                currency: 'NGN',
                reference: ref,
                gateway: 'INTERNAL',
                description: `Trip earnings — ${tripId}`,
                balanceBefore,
                balanceAfter,
                metadata: { module: 'transport' },
              },
            });
          }
        }
      });

      // Stage-2 shadow-comparison write — best-effort, OUTSIDE the live-crediting
      // transaction so a shadow-write failure never blocks or rolls back the real
      // driver credit (Pitfall 5).
      try {
        const shadowLevyCfg = await this.prisma.platformConfig.findUnique({
          where: { key: 'transport.govt_levy_pct' },
        });
        const shadowGovtLevyPct = shadowLevyCfg ? Number(shadowLevyCfg.value) : 5;
        const shadowPlatformFeeCfg = await this.prisma.platformConfig.findUnique({
          where: { key: 'transport.platform_fee_pct' },
        });
        const shadowPlatformFeePct = shadowPlatformFeeCfg ? Number(shadowPlatformFeeCfg.value) : 10;

        const shadowTotalCommissionPct = shadowGovtLevyPct + shadowPlatformFeePct;
        const shadowTotalCommission = Math.round(fare * (shadowTotalCommissionPct / 100) * 100) / 100;
        const shadowDriverEarnings = Math.round((fare - shadowTotalCommission) * 100) / 100;

        await this.prisma.shadowSettlementComparison.create({
          data: {
            module: 'transport',
            sourceId: tripId,
            oldEarnerAmount: driverEarnings,
            newEarnerAmount: shadowDriverEarnings,
            matched: driverEarnings === shadowDriverEarnings,
          },
        });
      } catch (err) {
        this.logger.error(`Stage-2 shadow settlement comparison failed for trip ${tripId}`, (err as Error).message);
      }
    }

    this.logger.log(`Trip ${tripId} completed — ₦${driverEarnings} credited to driver ${driverUserId}`);

    this.gateway.server.to(`trip:${tripId}`).emit('trip:completed', { tripId, driverEarnings });

    const updatedTrip = await this.prisma.trip.findFirst({ where: { id: tripId } });
    return updatedTrip;
  }

  // ── cancelTrip ────────────────────────────────────────────────────────────

  async cancelTrip(tripId: string, userId: string) {
    const trip = await this.prisma.trip.findFirst({ where: { id: tripId } });
    if (!trip) throw new NotFoundException('Trip not found');

    // Only the rider or the matched driver can cancel
    const driver = await this.prisma.driver.findFirst({
      where: { userId, deletedAt: null },
    });

    const isRider = trip.riderId === userId;
    const isDriver = driver && trip.driverId === driver.id;

    if (!isRider && !isDriver) {
      throw new ForbiddenException('Only the rider or assigned driver can cancel this trip');
    }

    // Cancel match timeout if trip is still searching
    if (trip.status === 'SEARCHING' || trip.status === 'MATCHED') {
      this.cancelMatchTimeout(tripId);
    }

    const updatedTrip = await this.prisma.trip.update({
      where: { id: tripId },
      data: {
        status: 'CANCELLED' as any,
      },
    });

    await this.prisma.tripEvent.create({
      data: { tripId, event: 'TRIP_CANCELLED', metadata: { cancelledBy: userId } },
    });

    this.gateway.server.to(`trip:${tripId}`).emit('trip:cancelled', { tripId });

    return updatedTrip;
  }

  // ── getDriverEarnings ─────────────────────────────────────────────────────

  async getDriverEarnings(userId: string, period: 'today' | 'week' = 'today'): Promise<EarningsResponse> {
    const driver = await this.prisma.driver.findFirst({
      where: { userId, deletedAt: null },
    });
    if (!driver) throw new NotFoundException('Driver profile not found');

    // Compute start date
    let startDate: Date;
    if (period === 'today') {
      startDate = new Date();
      startDate.setHours(0, 0, 0, 0);
    } else {
      startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    }

    // Aggregate earnings
    const aggregation = await this.prisma.trip.aggregate({
      where: {
        driverId: driver.id,
        status: 'COMPLETED' as any,
        completedAt: { gte: startDate },
      },
      _sum: { driverEarnings: true },
      _count: { id: true },
    });

    // Use stored acceptance rate from driver profile
    const acceptanceRate = Number(driver.acceptanceRate);

    return {
      totalEarnings: Number(aggregation._sum.driverEarnings ?? 0),
      tripCount: Number(aggregation._count.id ?? 0),
      acceptanceRate: Number(acceptanceRate),
      avgRating: Number(driver.avgRating),
    };
  }

  // ── cleanStaleDriverHeartbeats (cron) ─────────────────────────────────────

  @Cron(CronExpression.EVERY_30_SECONDS)
  async cleanStaleDriverHeartbeats(): Promise<void> {
    try {
      const acquired = await this.redis.setNx('cron-lock:cleanStaleDriverHeartbeats', '1', 25);
      if (!acquired) {
        this.logger.debug('cleanStaleDriverHeartbeats: lock held by another replica — skipping this tick');
        return;
      }

      // Get all online drivers from geo set using a global search radius
      const allDriverIds = await this.redis.geosearch('drivers:online', 0, 0, 20000);

      for (const driverId of allDriverIds) {
        const heartbeat = await this.redis.get(`driver:heartbeat:${driverId}`);
        if (heartbeat === null) {
          // Heartbeat expired — remove from geo set and mark offline
          await this.redis.zrem('drivers:online', driverId);
          await this.prisma.driver.update({
            where: { id: driverId },
            data: { isOnline: false },
          });
          this.logger.log(`Stale driver ${driverId} removed from online set`);
        }
      }
    } catch (err) {
      this.logger.error('cleanStaleDriverHeartbeats failed', err.message);
    }
  }
}
