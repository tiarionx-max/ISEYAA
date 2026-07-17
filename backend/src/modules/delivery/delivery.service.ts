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
const DELIVERY_MATCH_TIMEOUT = (orderId: string) => `delivery-match:${orderId}`;

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
    private schedulerRegistry: SchedulerRegistry,
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

  // ── scheduleMatchTimeout ──────────────────────────────────────────────────

  private scheduleMatchTimeout(orderId: string): void {
    const timeoutId = setTimeout(async () => {
      await this.expireUnmatchedOrder(orderId);
    }, 60_000);
    this.schedulerRegistry.addTimeout(DELIVERY_MATCH_TIMEOUT(orderId), timeoutId);
  }

  // ── expireUnmatchedOrder ──────────────────────────────────────────────────

  private async expireUnmatchedOrder(orderId: string): Promise<void> {
    try {
      const order = await this.prisma.deliveryOrder.findFirst({ where: { id: orderId } });
      if (!order || order.status !== 'SEARCHING') return;

      await this.prisma.deliveryOrder.update({
        where: { id: orderId },
        data: { status: 'EXPIRED' as any },
      });

      // L-05: null guard on gateway.server — gateway may not be initialised at expiry time
      if (!this.gateway?.server) return;

      // H-04: emit to both the order room AND the sender's user room to handle the
      // race where the client joins the room after the expiry event fires
      this.gateway.server.to(`delivery:${orderId}`).emit('delivery:expired', { orderId });
      this.gateway.server.to(`user:${order.senderId}`).emit('delivery:expired', { orderId });
      this.logger.log(`DeliveryOrder ${orderId} expired — no rider matched within 60s`);
    } catch (err) {
      this.logger.error(`expireUnmatchedOrder failed for order ${orderId}`, err.message);
    }
  }

  // ── cancelMatchTimeout ────────────────────────────────────────────────────

  private cancelMatchTimeout(orderId: string): void {
    if (this.schedulerRegistry.doesExist('timeout', DELIVERY_MATCH_TIMEOUT(orderId))) {
      this.schedulerRegistry.deleteTimeout(DELIVERY_MATCH_TIMEOUT(orderId));
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

    // 2. Read match radius from PlatformConfig
    const radiusCfg = await this.prisma.platformConfig.findUnique({
      where: { key: 'delivery_match_radius_km' },
    });
    const radiusKm = radiusCfg ? Number(radiusCfg.value) : 5;

    // 3. Create DeliveryOrder with SEARCHING status
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

    // 4. Generate 6-digit OTP and store in Redis with 300s TTL
    // C-06: use crypto.randomInt (CSPRNG) instead of Math.random()
    const otp = randomInt(100000, 1000000).toString();
    await this.redis.set(DELIVERY_OTP(order.id), otp, 300);

    // 5. Send OTP via Termii to recipientPhone (NOT sender's phone)
    await this.sendTermiiDeliveryOtp(dto.recipientPhone, otp);

    // 6. GEOSEARCH riders:online for nearest rider
    const nearbyRiders = await this.redis.geosearch(
      'riders:online',
      dto.pickupLng,
      dto.pickupLat,
      radiusKm,
    );

    // 7. Notify nearest rider if available
    if (nearbyRiders.length > 0) {
      const nearestRiderId = nearbyRiders[0];
      this.gateway.server.to(`rider:${nearestRiderId}`).emit('delivery:request', order);
    }

    // 8. Schedule 60s match timeout
    this.scheduleMatchTimeout(order.id);

    return order;
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

    // Cancel match timeout
    this.cancelMatchTimeout(orderId);

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

    this.logger.log(`Rider ${rider.id} declined order ${orderId}`);

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

    this.cancelMatchTimeout(orderId);

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

    const [updatedOrder] = await Promise.all([
      this.prisma.deliveryOrder.update({
        where: { id: orderId },
        data: { status: 'COLLECTING' as any, collectedAt: now },
      }),
      this.prisma.deliveryEvent.create({
        data: { orderId, event: 'PARCEL_COLLECTED' },
      }),
    ]);

    this.gateway.server.to(`delivery:${order.senderId}`).emit('delivery:collecting', { orderId });

    return updatedOrder;
  }

  // ── verifyOtp ─────────────────────────────────────────────────────────────

  async verifyOtp(orderId: string, dto: VerifyDeliveryOtpDto): Promise<{ verified: true }> {
    const order = await this.prisma.deliveryOrder.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Delivery order not found');

    // C-03: brute-force limit — mirrors auth.service.ts OTP lockout pattern
    const attemptsKey = `delivery:otp:attempts:${orderId}`;
    const attemptsStr = await this.redis.get(attemptsKey);
    const attempts = parseInt(attemptsStr ?? '0', 10);
    if (attempts >= 5) {
      throw new BadRequestException('Too many OTP attempts — order is locked. Contact support.');
    }

    const storedOtp = await this.redis.get(DELIVERY_OTP(orderId));
    if (storedOtp === null) {
      throw new BadRequestException('OTP expired. Request a new delivery to get a fresh code.');
    }
    if (storedOtp !== dto.otp) {
      // Increment attempt counter with same TTL as OTP (300s)
      await this.redis.set(attemptsKey, String(attempts + 1), 300);
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

  // ── completeDelivery ──────────────────────────────────────────────────────

  async completeDelivery(orderId: string, riderUserId: string, dto: CompleteDeliveryDto) {
    const rider = await this.prisma.deliveryRider.findFirst({
      where: { userId: riderUserId, deletedAt: null },
    });
    if (!rider) throw new NotFoundException('Delivery rider profile not found');

    const order = await this.prisma.deliveryOrder.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Delivery order not found');

    // H-11: check order is in a completable status — prevents earning on cancelled orders
    if (!(['COLLECTING', 'IN_TRANSIT', 'PICKED_UP'] as string[]).includes(order.status as string)) {
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

    let riderEarnings: number;
    let totalCommission: number;

    // 13-03: read the cutover flag from PlatformConfig — NEVER hardcode.
    const cutoverCfg = await this.prisma.platformConfig.findUnique({
      where: { key: 'delivery.settlement_engine_enabled' },
    });
    const cutoverEnabled = cutoverCfg ? Boolean(cutoverCfg.value) : false;

    if (cutoverEnabled) {
      // ── Post-cutover: delegate the rider/Ministry/platform 3-way split to
      //    SettlementService.settle() (Phase 12). Preserve Delivery's own
      //    MULTIPLY-FIRST rounding order exactly (Pitfall 1 — do not switch to
      //    Transport's subtract-first order).
      const levyCfg = await this.prisma.platformConfig.findUnique({
        where: { key: 'delivery.govt_levy_pct' },
      });
      const platformFeeCfg = await this.prisma.platformConfig.findUnique({
        where: { key: 'delivery.platform_fee_pct' },
      });
      const govtLevyPct = levyCfg ? Number(levyCfg.value) : 5;
      const platformFeePct = platformFeeCfg ? Number(platformFeeCfg.value) : 15;
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
        amountKobo: fee * 100,
        recipients,
        buyerWalletId: null, // D-04 — no real buyer wallet debit exists for a delivery fee
        description: 'Delivery completion settlement',
        platformMetadata: { orderId, riderUserId },
        onSettled: async (tx) => {
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
        },
        onFailure: async () => {
          // Revert to a retryable status — SettlementService's idempotency precheck
          // makes a client retry's wallet-crediting half a safe no-op replay (Pitfall 4).
          await this.prisma.deliveryOrder.update({
            where: { id: orderId },
            data: { status: 'PICKED_UP' as any },
          });
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
}
