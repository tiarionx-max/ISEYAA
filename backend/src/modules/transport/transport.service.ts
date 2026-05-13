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
import { TransportGateway } from './transport.gateway';
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

  async getFareEstimate(query: {
    vehicleType: string;
    pickupLat: number;
    pickupLng: number;
    dropoffLat: number;
    dropoffLng: number;
  }): Promise<FareEstimate> {
    const typeKey = query.vehicleType.toLowerCase();

    const [baseFareCfg, perKmCfg] = await Promise.all([
      this.prisma.platformConfig.findUnique({ where: { key: `transport_base_fare_${typeKey}` } }),
      this.prisma.platformConfig.findUnique({ where: { key: `transport_per_km_${typeKey}` } }),
    ]);

    const baseFare = baseFareCfg ? Number(baseFareCfg.value) : 500;
    const perKmFare = perKmCfg ? Number(perKmCfg.value) : 120;

    const distanceKm = Math.round(
      this.haversineDistanceKm(
        query.pickupLat,
        query.pickupLng,
        query.dropoffLat,
        query.dropoffLng,
      ) * 100,
    ) / 100;

    const surgeMultiplier = await this.getSurgeMultiplier(query.pickupLat, query.pickupLng);

    const totalFare = Math.round((baseFare + distanceKm * perKmFare) * surgeMultiplier * 100) / 100;

    return { baseFare, distanceKm, perKmFare, surgeMultiplier, totalFare };
  }

  async getSurgeMultiplier(lat: number, lng: number): Promise<number> {
    const [thresholdCfg, radiusCfg] = await Promise.all([
      this.prisma.platformConfig.findUnique({ where: { key: 'transport_surge_threshold' } }),
      this.prisma.platformConfig.findUnique({ where: { key: 'transport_match_radius_km' } }),
    ]);

    const threshold = thresholdCfg ? Number(thresholdCfg.value) : 1.5;
    const radiusKm = radiusCfg ? Number(radiusCfg.value) : 5;

    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);

    const [nearbyDrivers, demand] = await Promise.all([
      this.redis.geosearch('drivers:online', lng, lat, radiusKm),
      this.prisma.trip.count({
        where: {
          status: { in: ['SEARCHING', 'MATCHED'] as any },
          requestedAt: { gte: fiveMinAgo },
        },
      }),
    ]);

    const supply = nearbyDrivers.length;

    if (supply === 0) return 2.0;

    const ratio = demand / supply;
    if (ratio <= threshold) return 1.0;

    return Math.min(Math.round((ratio / threshold) * 10) / 10, 2.0);
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

    const trip = await this.prisma.trip.findFirst({ where: { id: tripId } });
    if (!trip) throw new NotFoundException('Trip not found');

    const now = new Date();

    await this.prisma.$transaction([
      this.prisma.trip.update({
        where: { id: tripId },
        data: {
          driverId: driver.id,
          status: 'MATCHED' as any,
          matchedAt: now,
        },
      }),
      this.prisma.tripEvent.create({
        data: {
          tripId,
          event: 'DRIVER_MATCHED',
        },
      }),
    ]);

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

    if (trip.status !== 'IN_PROGRESS') {
      throw new BadRequestException(`Trip must be IN_PROGRESS to complete; current: ${trip.status}`);
    }

    if (trip.driverId !== driver.id) {
      throw new ForbiddenException('You are not the assigned driver for this trip');
    }

    // Read platform fee from PlatformConfig — NEVER hardcode
    const feeCfg = await this.prisma.platformConfig.findUnique({
      where: { key: 'transport_platform_fee_pct' },
    });
    const feePct = feeCfg ? Number(feeCfg.value) : 15;

    const fare = Number(trip.fare);
    const platformFee = Math.round(fare * (feePct / 100) * 100) / 100;
    const driverEarnings = Math.round((fare - platformFee) * 100) / 100;

    const ref = `ISY-DRV-${uuidv4().replace(/-/g, '').slice(0, 12).toUpperCase()}`;
    const now = new Date();

    await this.prisma.$transaction([
      this.prisma.trip.update({
        where: { id: tripId },
        data: {
          status: 'COMPLETED' as any,
          completedAt: now,
          platformFee,
          driverEarnings,
          ...(dto?.driverRating && { driverRating: dto.driverRating }),
        },
      }),
      this.prisma.tripEvent.create({
        data: { tripId, event: 'TRIP_COMPLETED' },
      }),
    ]);

    // Credit driver wallet — gateway='INTERNAL' for internal transfers
    const driverWallet = await this.prisma.wallet.findFirst({ where: { userId: driverUserId } });
    if (driverWallet) {
      await this.walletService.creditWallet(
        driverWallet.id,
        driverEarnings,
        ref,
        `Trip earnings — ${tripId}`,
        'transport',
        'INTERNAL',
      );
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
