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
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { randomInt } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { WalletService } from '../wallet/wallet.service';
import { S3Service } from '../../common/services/s3.service';
import { ResilienceService } from '../../resilience/resilience.service';
import { SettlementService, SettlementRecipient } from '../../common/services/settlement.service';
import { DeliveryGateway } from './delivery.gateway';
import { CreateDeliveryRiderDto } from './dto/create-delivery-rider.dto';
import { ApproveDeliveryRiderDto } from './dto/approve-delivery-rider.dto';
import { RiderGoOnlineDto } from './dto/rider-go-online.dto';
import { RequestDeliveryDto } from './dto/request-delivery.dto';
import { CompleteDeliveryDto } from './dto/complete-delivery.dto';
import { VerifyDeliveryOtpDto } from './dto/verify-delivery-otp.dto';
import { RateDeliveryDto } from './dto/rate-delivery.dto';

// ── Redis key constants ───────────────────────────────────────────────────────

const RIDER_HEARTBEAT = (id: string) => `rider:heartbeat:${id}`;
const DELIVERY_OTP = (orderId: string) => `delivery:otp:${orderId}`;
const DELIVERY_OTP_ATTEMPTS = (orderId: string) => `delivery:otp:attempts:${orderId}`;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface FeeEstimate {
  baseFee: number;
  weightKg: number;
  perKgRate: number;
  weightSurcharge: number;
  distanceKm: number;
  totalFee: number;
}

export interface RiderEarningsResponse {
  totalEarnings: number;
  deliveryCount: number;
  acceptanceRate: number;
  avgRating: number;
}

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable()
export class DeliveryService {
  private readonly logger = new Logger(DeliveryService.name);

  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private walletService: WalletService,
    private s3Service: S3Service,
    private config: ConfigService,
    private resilience: ResilienceService,
    private settlementService: SettlementService,
    @Inject(forwardRef(() => DeliveryGateway)) private gateway: DeliveryGateway,
  ) {}

  // ── haversineDistanceKm ───────────────────────────────────────────────────

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

  // ── attemptMatchOrder ─────────────────────────────────────────────────────

  /**
   * Offers the order to the nearest not-yet-tried online rider, or expires it once
   * the configured retry budget is exhausted. Called from requestDelivery (first
   * offer), declineOrder (immediate re-match), and sweepUnmatchedOrders
   * (distributed-safe timeout — see that cron for why this replaced the old
   * in-process setTimeout/SchedulerRegistry mechanism). Mirrors
   * TransportService.attemptMatchTrip's design exactly.
   */
  private async attemptMatchOrder(orderId: string): Promise<void> {
    try {
      const order = await this.prisma.deliveryOrder.findFirst({ where: { id: orderId } });
      if (!order || order.status !== 'SEARCHING') return;

      const maxAttemptsCfg = await this.prisma.platformConfig.findUnique({
        where: { key: 'delivery.match_max_retry_attempts' },
      });
      const maxAttempts = maxAttemptsCfg ? Number(maxAttemptsCfg.value) : 3;

      if (order.matchAttempts >= maxAttempts) {
        await this.prisma.deliveryOrder.update({
          where: { id: orderId },
          data: { status: 'EXPIRED' as any },
        });
        await this.prisma.deliveryEvent.create({
          data: {
            orderId,
            event: 'ORDER_EXPIRED',
            metadata: { reason: 'max_attempts_exhausted', attempts: order.matchAttempts },
          },
        });
        if (this.gateway?.server) {
          this.gateway.server.to(`delivery:${orderId}`).emit('delivery:expired', { orderId });
          this.gateway.server.to(`user:${order.senderId}`).emit('delivery:expired', { orderId });
        }
        this.logger.log(`DeliveryOrder ${orderId} expired — exhausted ${order.matchAttempts} match attempt(s)`);
        return;
      }

      const radiusCfg = await this.prisma.platformConfig.findUnique({
        where: { key: 'delivery_match_radius_km' },
      });
      const radiusKm = radiusCfg ? Number(radiusCfg.value) : 5;

      const nearby = await this.redis.geosearch(
        'riders:online',
        Number(order.pickupLng),
        Number(order.pickupLat),
        radiusKm,
      );
      const excluded = new Set(order.excludedRiderIds);
      const candidate = nearby.find((id) => !excluded.has(id));

      const nextAttempts = order.matchAttempts + 1;
      const nextDeadline = new Date(Date.now() + 60_000);

      if (candidate) {
        await this.prisma.deliveryOrder.update({
          where: { id: orderId },
          data: {
            matchAttempts: nextAttempts,
            matchDeadlineAt: nextDeadline,
            excludedRiderIds: { push: candidate },
          },
        });
        await this.prisma.deliveryEvent.create({
          data: { orderId, event: 'RIDER_OFFERED', metadata: { riderId: candidate, attempt: nextAttempts } },
        });
        if (this.gateway?.server) {
          this.gateway.server.to(`rider:${candidate}`).emit('delivery:request', order);
        }
      } else {
        await this.prisma.deliveryOrder.update({
          where: { id: orderId },
          data: { matchAttempts: nextAttempts, matchDeadlineAt: nextDeadline },
        });
        await this.prisma.deliveryEvent.create({
          data: { orderId, event: 'NO_RIDERS_AVAILABLE', metadata: { attempt: nextAttempts } },
        });
      }
    } catch (err) {
      this.logger.error(`attemptMatchOrder failed for order ${orderId}`, (err as Error).message);
    }
  }

  // ── getMyRiderProfile ─────────────────────────────────────────────────────

  async getMyRiderProfile(userId: string) {
    return this.prisma.deliveryRider.findFirst({
      where: { userId, deletedAt: null },
    });
  }

  // ── createDeliveryRider ───────────────────────────────────────────────────

  async createDeliveryRider(userId: string, dto: CreateDeliveryRiderDto) {
    const existing = await this.prisma.deliveryRider.findFirst({
      where: { userId, deletedAt: null },
    });
    if (existing) throw new ConflictException('Delivery rider profile already exists for this user');

    return this.prisma.deliveryRider.create({
      data: {
        userId,
        status: 'PENDING_REVIEW' as any,
        isOnline: false,
        totalDeliveries: 0,
        avgRating: 0,
        acceptanceRate: 0,
        ...(dto.metadata && { metadata: dto.metadata }),
      },
    });
  }

  // ── approveDeliveryRider ──────────────────────────────────────────────────

  async approveDeliveryRider(riderId: string, lgaAdminId: string, dto: ApproveDeliveryRiderDto) {
    const rider = await this.prisma.deliveryRider.findUnique({ where: { id: riderId } });
    if (!rider) throw new NotFoundException('Delivery rider not found');

    return this.prisma.deliveryRider.update({
      where: { id: riderId },
      data: {
        status: dto.approved ? ('APPROVED' as any) : ('REJECTED' as any),
        approvedById: lgaAdminId,
        approvedAt: new Date(),
      },
    });
  }

  // ── goOnline / goOffline ──────────────────────────────────────────────────

  async goOnline(userId: string, dto: RiderGoOnlineDto): Promise<{ online: true }> {
    const rider = await this.prisma.deliveryRider.findFirst({
      where: { userId, deletedAt: null },
    });
    if (!rider) throw new NotFoundException('Delivery rider profile not found');
    if (rider.status !== 'APPROVED') {
      throw new ForbiddenException('Rider must be approved to go online');
    }

    const now = new Date();

    await this.redis.geoadd('riders:online', dto.lng, dto.lat, rider.id);
    await this.redis.set(RIDER_HEARTBEAT(rider.id), now.toISOString(), 90);

    await this.prisma.deliveryRider.update({
      where: { id: rider.id },
      data: { isOnline: true, lastSeenAt: now } as any,
    });

    return { online: true };
  }

  async goOffline(userId: string): Promise<{ online: false }> {
    const rider = await this.prisma.deliveryRider.findFirst({
      where: { userId, deletedAt: null },
    });
    if (!rider) throw new NotFoundException('Delivery rider profile not found');

    await this.redis.zrem('riders:online', rider.id);
    // Expire the heartbeat key immediately by setting TTL to 1 second
    await this.redis.set(RIDER_HEARTBEAT(rider.id), 'offline', 1);

    await this.prisma.deliveryRider.update({
      where: { id: rider.id },
      data: { isOnline: false },
    });

    return { online: false };
  }

  // ── getFeeEstimate ────────────────────────────────────────────────────────

  async getFeeEstimate(query: {
    pickupLat: number;
    pickupLng: number;
    dropoffLat: number;
    dropoffLng: number;
    weightKg: number;
  }): Promise<FeeEstimate> {
    const [baseFeeCfg, perKgCfg] = await Promise.all([
      this.prisma.platformConfig.findUnique({ where: { key: 'delivery_base_fee' } }),
      this.prisma.platformConfig.findUnique({ where: { key: 'delivery_per_kg_rate' } }),
    ]);

    const baseFee = baseFeeCfg ? Number(baseFeeCfg.value) : 300;
    const perKgRate = perKgCfg ? Number(perKgCfg.value) : 50;

    // Weight-based surcharge: first 2 kg free, then perKgRate per extra kg
    const weightSurcharge = Math.max(0, query.weightKg - 2) * perKgRate;

    const distanceKm = Math.round(
      this.haversineDistanceKm(
        query.pickupLat,
        query.pickupLng,
        query.dropoffLat,
        query.dropoffLng,
      ) * 100,
    ) / 100;

    const totalFee = Math.round((baseFee + weightSurcharge) * 100) / 100;

    return {
      baseFee,
      weightKg: query.weightKg,
      perKgRate,
      weightSurcharge,
      distanceKm,
      totalFee,
    };
  }

  // ── requestDelivery ───────────────────────────────────────────────────────

  async requestDelivery(userId: string, dto: RequestDeliveryDto) {
    // 1. Calculate fee
    const feeEstimate = await this.getFeeEstimate({
      pickupLat: dto.pickupLat,
      pickupLng: dto.pickupLng,
      dropoffLat: dto.dropoffLat,
      dropoffLng: dto.dropoffLng,
      weightKg: dto.weightKg,
    });

    // 2. Create DeliveryOrder with SEARCHING status
    const order = await this.prisma.deliveryOrder.create({
      data: {
        senderId: userId,
        pickupLat: dto.pickupLat,
        pickupLng: dto.pickupLng,
        pickupAddress: dto.pickupAddress,
        dropoffLat: dto.dropoffLat,
        dropoffLng: dto.dropoffLng,
        dropoffAddress: dto.dropoffAddress,
        itemDescription: dto.itemDescription,
        weightKg: dto.weightKg,
        recipientPhone: dto.recipientPhone,
        fee: feeEstimate.totalFee,
        status: 'SEARCHING' as any,
      },
    });

    // 3. Generate 6-digit OTP and store in Redis. TTL is configurable (real delivery
    // lifecycles — match, collect, transit, dropoff — routinely exceed a fixed 5-minute
    // window; a resendOtp() escape hatch exists below for whenever it does expire anyway.
    // C-06: use crypto.randomInt (CSPRNG) instead of Math.random()
    const otpTtlCfg = await this.prisma.platformConfig.findUnique({
      where: { key: 'delivery.otp_ttl_seconds' },
    });
    const otpTtlSeconds = otpTtlCfg ? Number(otpTtlCfg.value) : 1800;
    const otp = randomInt(100000, 1000000).toString();
    await this.redis.set(DELIVERY_OTP(order.id), otp, otpTtlSeconds);

    // 4. Send OTP via Termii to recipientPhone (NOT sender's phone)
    await this.sendTermiiDeliveryOtp(dto.recipientPhone, otp);

    // 5. First match attempt — same re-match logic the decline path and the
    // distributed sweep cron reuse for every subsequent attempt.
    await this.attemptMatchOrder(order.id);

    return this.prisma.deliveryOrder.findFirst({ where: { id: order.id } });
  }

  // ── sendTermiiDeliveryOtp ─────────────────────────────────────────────────

  private async sendTermiiDeliveryOtp(phone: string, otp: string): Promise<void> {
    const apiKey = this.config.get<string>('TERMII_API_KEY');
    if (!apiKey) {
      this.logger.warn(`[TERMII STUB] Delivery OTP ${otp} for ${phone} — set TERMII_API_KEY to send live SMS`);
      return;
    }

    try {
      const response = await this.resilience.execute('termiiDelivery', ({ signal }) =>
        fetch('https://v3.api.termii.com/api/sms/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: phone,
            from: this.config.get('TERMII_SENDER_ID', 'ISEYAA'),
            sms: `Your Iṣẹ́yáá delivery code is ${otp}. Share with the rider to complete delivery.`,
            type: 'plain',
            channel: 'generic',
            api_key: apiKey,
          }),
          signal,
        }),
      );
      if (!response.ok) {
        this.logger.error(`Termii error: ${response.status} ${await response.text()}`);
      }
    } catch (err) {
      this.logger.error('Termii delivery OTP request failed', err);
    }
  }

  // ── acceptOrder ───────────────────────────────────────────────────────────

  async acceptOrder(orderId: string, riderUserId: string) {
    const rider = await this.prisma.deliveryRider.findFirst({
      where: { userId: riderUserId, deletedAt: null },
    });
    if (!rider) throw new NotFoundException('Delivery rider profile not found');
    if (rider.status !== 'APPROVED') {
      throw new ForbiddenException('Rider must be approved to accept orders');
    }

    // H-01: atomic updateMany with WHERE status='SEARCHING' prevents TOCTOU race
    // where two riders both pass the status check and both write their riderId.
    const now = new Date();
    const updated = await this.prisma.deliveryOrder.updateMany({
      where: { id: orderId, status: 'SEARCHING' as any },
      data: { riderId: rider.id, status: 'MATCHED' as any, matchedAt: now },
    });
    if (updated.count === 0) {
      throw new BadRequestException('Order already matched or expired');
    }

    await this.prisma.deliveryEvent.create({
      data: { orderId, event: 'RIDER_MATCHED' },
    });

    const updatedOrder = await this.prisma.deliveryOrder.findFirst({ where: { id: orderId } });

    // Notify sender
    this.gateway.server.to(`delivery:${orderId}`).emit('rider:assigned', { rider, order: updatedOrder });

    return updatedOrder;
  }

  // ── declineOrder ──────────────────────────────────────────────────────────

  async declineOrder(orderId: string, riderUserId: string): Promise<{ declined: true }> {
    const rider = await this.prisma.deliveryRider.findFirst({
      where: { userId: riderUserId, deletedAt: null },
    });
    if (!rider) throw new NotFoundException('Delivery rider profile not found');

    const order = await this.prisma.deliveryOrder.findFirst({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Delivery order not found');

    // Update rider acceptance rate — order stays SEARCHING for another rider
    const newRate = Number(rider.acceptanceRate) > 0
      ? Math.round(Number(rider.acceptanceRate) * (rider.totalDeliveries / (rider.totalDeliveries + 1)) * 100) / 100
      : 0;

    await this.prisma.deliveryRider.update({
      where: { id: rider.id },
      data: { acceptanceRate: newRate },
    });

    // Record decline event — rider was already excluded when offered, so the
    // immediate re-match below naturally skips them.
    await this.prisma.deliveryEvent.create({
      data: { orderId, event: 'RIDER_DECLINED', metadata: { riderId: rider.id } },
    });

    this.logger.log(`Rider ${rider.id} declined order ${orderId} — attempting re-match`);
    await this.attemptMatchOrder(orderId);

    return { declined: true };
  }

  // ── cancelOrder ───────────────────────────────────────────────────────────

  async cancelOrder(orderId: string, userId: string): Promise<{ cancelled: true }> {
    const order = await this.prisma.deliveryOrder.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Delivery order not found');

    const terminalStatuses = ['DELIVERED', 'CANCELLED'];
    if (terminalStatuses.includes(order.status as string)) {
      throw new BadRequestException(`Cannot cancel an order in status: ${order.status}`);
    }

    await this.prisma.$transaction([
      this.prisma.deliveryOrder.update({
        where: { id: orderId },
        data: { status: 'CANCELLED' as any, cancelReason: `Cancelled by user ${userId}` },
      }),
      this.prisma.deliveryEvent.create({
        data: { orderId, event: 'ORDER_CANCELLED' },
      }),
    ]);

    this.logger.log(`Order ${orderId} cancelled by userId=${userId}`);

    this.gateway.server.to(`delivery:${orderId}`).emit('delivery:cancelled', { orderId });

    return { cancelled: true };
  }

  // ── collectParcel ─────────────────────────────────────────────────────────

  async collectParcel(orderId: string, riderUserId: string) {
    const rider = await this.prisma.deliveryRider.findFirst({
      where: { userId: riderUserId, deletedAt: null },
    });
    if (!rider) throw new NotFoundException('Delivery rider profile not found');

    const order = await this.prisma.deliveryOrder.findFirst({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Delivery order not found');

    if (order.riderId !== rider.id) {
      throw new ForbiddenException('You are not the assigned rider for this order');
    }

    const now = new Date();

    // WR-05: atomic updateMany with WHERE status='MATCHED' — mirrors acceptOrder's
    // H-01 pattern — prevents two concurrent/duplicate collectParcel calls from
    // both succeeding and both emitting a PARCEL_COLLECTED event.
    const updated = await this.prisma.deliveryOrder.updateMany({
      where: { id: orderId, status: 'MATCHED' as any },
      data: { status: 'COLLECTING' as any, collectedAt: now },
    });
    if (updated.count === 0) {
      throw new BadRequestException(`Order cannot be collected in status: ${order.status}`);
    }

    await this.prisma.deliveryEvent.create({
      data: { orderId, event: 'PARCEL_COLLECTED' },
    });

    const updatedOrder = await this.prisma.deliveryOrder.findFirst({ where: { id: orderId } });

    this.gateway.server.to(`delivery:${orderId}`).emit('delivery:collecting', { orderId });

    return updatedOrder;
  }

  // ── verifyOtp ─────────────────────────────────────────────────────────────

  async verifyOtp(orderId: string, dto: VerifyDeliveryOtpDto): Promise<{ verified: true }> {
    const order = await this.prisma.deliveryOrder.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Delivery order not found');

    // C-03: brute-force limit — mirrors auth.service.ts OTP lockout pattern
    const attemptsKey = DELIVERY_OTP_ATTEMPTS(orderId);
    const attemptsStr = await this.redis.get(attemptsKey);
    const attempts = parseInt(attemptsStr ?? '0', 10);
    if (attempts >= 5) {
      throw new BadRequestException('Too many OTP attempts — order is locked. Contact support.');
    }

    const storedOtp = await this.redis.get(DELIVERY_OTP(orderId));
    if (storedOtp === null) {
      throw new BadRequestException(
        'OTP expired. Ask the driver to request a fresh code via resend-otp.',
      );
    }
    if (storedOtp !== dto.otp) {
      // Increment attempt counter with the same TTL as the OTP itself, whatever that
      // currently configured TTL is — keeping the lockout window tied 1:1 to the
      // OTP's real validity window rather than a stale hardcoded value.
      const otpTtlCfg = await this.prisma.platformConfig.findUnique({
        where: { key: 'delivery.otp_ttl_seconds' },
      });
      const otpTtlSeconds = otpTtlCfg ? Number(otpTtlCfg.value) : 1800;
      await this.redis.set(attemptsKey, String(attempts + 1), otpTtlSeconds);
      throw new BadRequestException(`Incorrect OTP. Ask the recipient to check their SMS. ${5 - attempts - 1} attempt(s) remaining.`);
    }

    // Correct OTP — clear attempt counter
    await this.redis.del(attemptsKey);

    // Mark OTP as verified in DB — DO NOT delete Redis key (completeDelivery checks otpVerifiedAt field)
    await this.prisma.deliveryOrder.update({
      where: { id: orderId },
      data: { otpVerifiedAt: new Date() },
    });

    return { verified: true };
  }

  // ── resendOtp ─────────────────────────────────────────────────────────────

  /**
   * The rider-facing escape hatch for the OTP TTL problem: even a generous
   * default (30 min) can still be outlived by a slow delivery. Regenerates the
   * code, resets its TTL and the brute-force attempt counter, and re-sends via
   * the same Termii path as the original request.
   */
  async resendOtp(orderId: string, riderUserId: string): Promise<{ resent: true }> {
    const rider = await this.prisma.deliveryRider.findFirst({
      where: { userId: riderUserId, deletedAt: null },
    });
    if (!rider) throw new NotFoundException('Delivery rider profile not found');

    const order = await this.prisma.deliveryOrder.findFirst({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Delivery order not found');
    if (order.riderId !== rider.id) {
      throw new ForbiddenException('You are not the assigned rider for this order');
    }
    if (!(['MATCHED', 'COLLECTING', 'IN_TRANSIT'] as string[]).includes(order.status as string)) {
      throw new BadRequestException(`Cannot resend OTP for an order in status: ${order.status}`);
    }

    const otpTtlCfg = await this.prisma.platformConfig.findUnique({
      where: { key: 'delivery.otp_ttl_seconds' },
    });
    const otpTtlSeconds = otpTtlCfg ? Number(otpTtlCfg.value) : 1800;

    const otp = randomInt(100000, 1000000).toString();
    await this.redis.set(DELIVERY_OTP(orderId), otp, otpTtlSeconds);
    await this.redis.del(DELIVERY_OTP_ATTEMPTS(orderId));

    await this.sendTermiiDeliveryOtp(order.recipientPhone, otp);

    await this.prisma.deliveryEvent.create({
      data: { orderId, event: 'OTP_RESENT' },
    });

    return { resent: true };
  }

  // ── startTransit ──────────────────────────────────────────────────────────

  /**
   * COLLECTING → IN_TRANSIT. This status existed in the enum but no code path ever
   * set it — every order previously jumped straight from COLLECTING to DELIVERED.
   */
  async startTransit(orderId: string, riderUserId: string) {
    const rider = await this.prisma.deliveryRider.findFirst({
      where: { userId: riderUserId, deletedAt: null },
    });
    if (!rider) throw new NotFoundException('Delivery rider profile not found');

    const order = await this.prisma.deliveryOrder.findFirst({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Delivery order not found');
    if (order.riderId !== rider.id) {
      throw new ForbiddenException('You are not the assigned rider for this order');
    }

    const updated = await this.prisma.deliveryOrder.updateMany({
      where: { id: orderId, status: 'COLLECTING' as any },
      data: { status: 'IN_TRANSIT' as any },
    });
    if (updated.count === 0) {
      throw new BadRequestException(`Order cannot start transit in status: ${order.status}`);
    }

    await this.prisma.deliveryEvent.create({
      data: { orderId, event: 'TRANSIT_STARTED' },
    });

    const updatedOrder = await this.prisma.deliveryOrder.findFirst({ where: { id: orderId } });
    this.gateway.server.to(`delivery:${orderId}`).emit('delivery:in_transit', { orderId });

    return updatedOrder;
  }

  // ── completeDelivery ──────────────────────────────────────────────────────

  async completeDelivery(orderId: string, riderUserId: string, dto: CompleteDeliveryDto) {
    const rider = await this.prisma.deliveryRider.findFirst({
      where: { userId: riderUserId, deletedAt: null },
    });
    if (!rider) throw new NotFoundException('Delivery rider profile not found');

    const order = await this.prisma.deliveryOrder.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Delivery order not found');

    // H-11: check order is in a completable status — prevents earning on cancelled orders
    // CR-01: 'PICKED_UP' is not a valid DeliveryOrderStatus enum member — removed.
    if (!(['COLLECTING', 'IN_TRANSIT'] as string[]).includes(order.status as string)) {
      throw new BadRequestException(`Order cannot be completed in status: ${order.status}`);
    }

    // DUAL-GATE: OTP must be verified before completing delivery
    if (!order.otpVerifiedAt) {
      throw new BadRequestException('OTP must be verified before completing delivery');
    }

    // DUAL-GATE: Proof-of-delivery photo is required
    if (!dto.proofPhotoBase64) {
      throw new BadRequestException('Proof-of-delivery photo is required');
    }

    // Upload proof photo to S3
    const photoBuffer = Buffer.from(dto.proofPhotoBase64, 'base64');
    const proofPhotoUrl = await this.s3Service.upload(
      `delivery-proof/${orderId}-${Date.now()}.jpg`,
      photoBuffer,
      'image/jpeg',
    );

    const now = new Date();
    const fee = Number(order.fee);
    const riderWallet = await this.prisma.wallet.findFirst({ where: { userId: riderUserId } });

    // WR-02: a missing rider wallet must not silently drop the rider's earnings —
    // both branches below would otherwise transition the order to DELIVERED while
    // computing money owed to the rider that never lands anywhere (legacy: the
    // `if (riderWallet)` guard is a silent no-op; cutover: `walletId: null` makes
    // SettlementService route the share to the platform wallet instead).
    if (!riderWallet) {
      this.logger.error(
        `completeDelivery: rider ${riderUserId} (riderId=${rider.id}) has no wallet — refusing to complete order ${orderId} without a payout destination`,
      );
      throw new BadRequestException('Rider wallet not found — cannot complete delivery settlement');
    }

    let riderEarnings: number;
    let totalCommission: number;

    // 13-03: read the cutover flag from PlatformConfig — NEVER hardcode.
    const cutoverCfg = await this.prisma.platformConfig.findUnique({
      where: { key: 'delivery.settlement_engine_enabled' },
    });
    // WR-01: strict equality avoids Boolean("false") === true footgun on the
    // untyped Json PlatformConfig column for this safety-critical flag.
    const cutoverEnabled = cutoverCfg?.value === true;

    if (cutoverEnabled) {
      // ── Post-cutover: delegate the rider/Ministry/platform 3-way split to
      //    SettlementService.settle() (Phase 12). Preserve Delivery's own
      //    MULTIPLY-FIRST rounding order exactly (Pitfall 1 — do not switch to
      //    Transport's subtract-first order).
      // SETTLE-11b: centralized resolver replaces the 2× inline PlatformConfig
      // reads that used to live here. resolveSplit() returns 0-1 fractions
      // (D-03) — convert back to whole-number percent for the existing
      // multiply-first arithmetic below, which is left byte-for-byte unchanged
      // (Pitfall 1 — do not switch to Transport's subtract-first order).
      const { ministryPct, platformPct } = await this.settlementService.resolveSplit('delivery', fee);
      const govtLevyPct = ministryPct * 100;
      const platformFeePct = (platformPct ?? 0) * 100;
      const totalCommissionPct = govtLevyPct + platformFeePct; // = 20, matches today's feePct

      riderEarnings = Math.round(fee * (1 - totalCommissionPct / 100) * 100) / 100;
      totalCommission = Math.round((fee - riderEarnings) * 100) / 100;
      const govtLevyNgn = Math.round(fee * (govtLevyPct / 100) * 100) / 100;

      const ministryWallet = await this.settlementService.resolveMinistryWallet();

      const recipients: SettlementRecipient[] = [
        {
          tag: 'RIDER',
          refSuffix: 'RDR',
          walletId: riderWallet?.id ?? null,
          amountNgn: riderEarnings,
          metadata: { orderId },
        },
        {
          tag: 'MINISTRY',
          refSuffix: 'MINISTRY',
          walletId: ministryWallet?.id ?? null,
          amountNgn: govtLevyNgn,
          metadata: { orderId },
        },
      ];

      await this.settlementService.settle({
        module: 'delivery',
        reference: `ISY-DLV-${orderId}`, // deterministic — SettlementService idempotency precheck (Pitfall 2)
        gateway: 'INTERNAL',
        amountKobo: Math.round(fee * 100), // WR-03: avoid IEEE-754 float drift crossing into SettlementService
        recipients,
        buyerWalletId: null, // D-04 — no real buyer wallet debit exists for a delivery fee
        description: 'Delivery completion settlement',
        platformMetadata: { orderId, riderUserId },
        onSettled: async (tx) => {
          // CR-02: atomic status-guarded update — mirrors Transport's onSettled
          // updateMany + count check — closes the TOCTOU window where two
          // concurrent completeDelivery calls could both pass the upfront
          // findUnique check and both credit the rider.
          const result = await tx.deliveryOrder.updateMany({
            where: { id: orderId, status: { in: ['COLLECTING', 'IN_TRANSIT'] } },
            data: {
              status: 'DELIVERED' as any,
              completedAt: now,
              proofPhotoUrl,
              platformFee: totalCommission,
              riderEarnings,
              ...(dto.senderRating && { senderRating: dto.senderRating }),
            },
          });
          if (result.count === 0) {
            throw new BadRequestException('Order already delivered or not in a completable status');
          }
          await tx.deliveryEvent.create({
            data: { orderId, event: 'DELIVERY_COMPLETED' },
          });
        },
        onFailure: async () => {
          // Revert to a retryable status — SettlementService's idempotency precheck
          // makes a client retry's wallet-crediting half a safe no-op replay (Pitfall 4).
          // CR-01: 'PICKED_UP' is not a valid DeliveryOrderStatus enum member; revert to
          // 'IN_TRANSIT', the existing pre-terminal status this order was completable from.
          // Post-verification fix (mirrors CR-03's guard on Transport's onFailure): only
          // revert if the order is not already in a terminal state. onSettled's atomic
          // guard throws (count===0) when the order was NOT actually COLLECTING/IN_TRANSIT
          // at settlement time (e.g. a concurrent duplicate call already delivered it, or
          // it was legitimately cancelled) — in that case the order's current status is
          // authoritative and must not be clobbered back to IN_TRANSIT, or a stray/duplicate
          // completeDelivery call could resurrect a cancelled/terminal order into a
          // retryable state and pay the rider for a delivery that should never have paid.
          const result = await this.prisma.deliveryOrder.updateMany({
            where: { id: orderId, status: { notIn: ['DELIVERED', 'CANCELLED', 'EXPIRED'] } },
            data: { status: 'IN_TRANSIT' as any },
          });
          if (result.count === 0) {
            this.logger.warn(
              `completeDelivery onFailure: not reverting order ${orderId} — already in a terminal state`,
            );
          }
        },
      });
    } else {
      // ── Pre-cutover: EXISTING inline $transaction path, byte-for-byte unchanged.
      const feeCfg = await this.prisma.platformConfig.findUnique({
        where: { key: 'delivery_platform_fee_pct' },
      });
      const feePct = feeCfg ? Number(feeCfg.value) : 20;

      riderEarnings = Math.round(fee * (1 - feePct / 100) * 100) / 100;
      totalCommission = Math.round((fee - riderEarnings) * 100) / 100;

      const ref = `ISY-RDR-${uuidv4().replace(/-/g, '').slice(0, 12).toUpperCase()}`;

      // C-09: run order status update AND wallet credit inside the same interactive
      // transaction so a crash between the two cannot leave the order DELIVERED but
      // the rider unpaid (or paid twice on retry).
      await this.prisma.$transaction(async (tx) => {
        await tx.deliveryOrder.update({
          where: { id: orderId },
          data: {
            status: 'DELIVERED' as any,
            completedAt: now,
            proofPhotoUrl,
            platformFee: totalCommission,
            riderEarnings,
            ...(dto.senderRating && { senderRating: dto.senderRating }),
          },
        });
        await tx.deliveryEvent.create({
          data: { orderId, event: 'DELIVERY_COMPLETED' },
        });

        // Credit rider wallet within the same transaction (SELECT FOR UPDATE inside creditWallet
        // handles the row-lock, but since we are already inside a transaction, use raw update here)
        if (riderWallet) {
          await tx.$executeRaw`SELECT id FROM wallets WHERE id = ${riderWallet.id} FOR UPDATE`;
          const lockedWallet = await tx.wallet.findUnique({ where: { id: riderWallet.id } });
          if (lockedWallet) {
            const balanceBefore = Number(lockedWallet.balance);
            const balanceAfter = balanceBefore + riderEarnings;
            await tx.wallet.update({ where: { id: riderWallet.id }, data: { balance: balanceAfter } });
            await tx.transaction.create({
              data: {
                walletId: riderWallet.id,
                type: 'CREDIT',
                status: 'SUCCESS',
                amount: riderEarnings,
                currency: 'NGN',
                reference: ref,
                gateway: 'INTERNAL',
                description: `Delivery earnings — ${orderId}`,
                balanceBefore,
                balanceAfter,
                metadata: { module: 'delivery' },
              },
            });
          }
        }
      });

      // Stage-2 shadow comparison — best-effort, fire-and-forget, OUTSIDE the
      // $transaction above so a shadow-write failure can never roll back or block
      // the live rider credit (Pitfall 5 — matches the project's existing
      // audit-log-failures-are-swallowed convention).
      try {
        const shadowLevyCfg = await this.prisma.platformConfig.findUnique({
          where: { key: 'delivery.govt_levy_pct' },
        });
        const shadowPlatformFeeCfg = await this.prisma.platformConfig.findUnique({
          where: { key: 'delivery.platform_fee_pct' },
        });
        const shadowGovtLevyPct = shadowLevyCfg ? Number(shadowLevyCfg.value) : 5;
        const shadowPlatformFeePct = shadowPlatformFeeCfg ? Number(shadowPlatformFeeCfg.value) : 15;
        const shadowTotalCommissionPct = shadowGovtLevyPct + shadowPlatformFeePct;
        const shadowRiderEarnings = Math.round(fee * (1 - shadowTotalCommissionPct / 100) * 100) / 100;

        await this.prisma.shadowSettlementComparison.create({
          data: {
            module: 'delivery',
            sourceId: orderId,
            oldEarnerAmount: riderEarnings,
            newEarnerAmount: shadowRiderEarnings,
            matched: riderEarnings === shadowRiderEarnings,
          },
        });
      } catch (err) {
        this.logger.error(`Stage-2 shadow-settlement write failed for order ${orderId}`, (err as Error).message);
      }
    }

    this.logger.log(`Order ${orderId} completed — ₦${riderEarnings} credited to rider ${riderUserId}`);

    this.gateway.server.to(`delivery:${orderId}`).emit('delivery:completed', { orderId, riderEarnings });

    const updatedOrder = await this.prisma.deliveryOrder.findFirst({ where: { id: orderId } });
    return updatedOrder;
  }

  // ── rateDelivery ──────────────────────────────────────────────────────────

  async rateDelivery(orderId: string, userId: string, dto: RateDeliveryDto) {
    const order = await this.prisma.deliveryOrder.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Delivery order not found');
    if (order.senderId !== userId) {
      throw new ForbiddenException('Only the sender can rate this delivery');
    }

    return this.prisma.deliveryOrder.update({
      where: { id: orderId },
      data: { senderRating: dto.rating },
    });
  }

  // ── getRiderEarnings ──────────────────────────────────────────────────────

  async getRiderEarnings(userId: string, period: 'today' | 'week' = 'today'): Promise<RiderEarningsResponse> {
    const rider = await this.prisma.deliveryRider.findFirst({
      where: { userId, deletedAt: null },
    });
    if (!rider) throw new NotFoundException('Delivery rider profile not found');

    // Compute start date
    let startDate: Date;
    if (period === 'today') {
      startDate = new Date();
      startDate.setHours(0, 0, 0, 0);
    } else {
      startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    }

    // Aggregate earnings
    const aggregation = await this.prisma.deliveryOrder.aggregate({
      where: {
        riderId: rider.id,
        status: 'DELIVERED' as any,
        completedAt: { gte: startDate },
      },
      _sum: { riderEarnings: true },
      _count: { id: true },
    });

    return {
      totalEarnings: Number(aggregation._sum.riderEarnings ?? 0),
      deliveryCount: Number(aggregation._count.id ?? 0),
      acceptanceRate: Number(rider.acceptanceRate),
      avgRating: Number(rider.avgRating),
    };
  }

  // ── cleanStaleRiderHeartbeats (cron) ──────────────────────────────────────

  @Cron(CronExpression.EVERY_30_SECONDS)
  async cleanStaleRiderHeartbeats(): Promise<void> {
    try {
      const acquired = await this.redis.setNx('cron-lock:cleanStaleRiderHeartbeats', '1', 25);
      if (!acquired) {
        this.logger.debug('cleanStaleRiderHeartbeats: lock held by another replica — skipping this tick');
        return;
      }

      // Get all online riders from geo set using a global search radius
      const allRiderIds = await this.redis.geosearch('riders:online', 0, 0, 20000);

      for (const riderId of allRiderIds) {
        const heartbeat = await this.redis.get(RIDER_HEARTBEAT(riderId));
        if (heartbeat === null) {
          // Heartbeat expired — remove from geo set and mark offline
          await this.redis.zrem('riders:online', riderId);
          await this.prisma.deliveryRider.update({
            where: { id: riderId },
            data: { isOnline: false },
          });
          this.logger.log(`Stale rider ${riderId} removed from online set`);
        }
      }
    } catch (err) {
      this.logger.error('cleanStaleRiderHeartbeats failed', err.message);
    }
  }

  // ── sweepUnmatchedOrders (cron) ───────────────────────────────────────────

  /**
   * Distributed-safe replacement for the old in-process setTimeout/SchedulerRegistry
   * match timeout — mirrors TransportService.sweepUnmatchedTrips exactly, including
   * the cron-lock:<methodName> naming convention.
   */
  @Cron(CronExpression.EVERY_10_SECONDS)
  async sweepUnmatchedOrders(): Promise<void> {
    try {
      const acquired = await this.redis.setNx('cron-lock:sweepUnmatchedOrders', '1', 8);
      if (!acquired) {
        this.logger.debug('sweepUnmatchedOrders: lock held by another replica — skipping this tick');
        return;
      }

      const dueOrders = await this.prisma.deliveryOrder.findMany({
        where: { status: 'SEARCHING' as any, matchDeadlineAt: { lte: new Date() } },
        select: { id: true },
      });

      for (const { id } of dueOrders) {
        await this.attemptMatchOrder(id);
      }
    } catch (err) {
      this.logger.error('sweepUnmatchedOrders failed', err.message);
    }
  }
}
