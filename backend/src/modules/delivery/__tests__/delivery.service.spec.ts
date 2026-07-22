// Plan 04-04 will create '../delivery.service' and '../delivery.gateway'.
// Until then, this spec is RED — it will fail with "Cannot find module".

import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { DeliveryService } from '../delivery.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { RedisService } from '../../../redis/redis.service';
import { WalletService } from '../../wallet/wallet.service';
import { DeliveryGateway } from '../delivery.gateway';
import { ConfigService } from '@nestjs/config';
import { S3Service } from '../../../common/services/s3.service';
import { ResilienceService } from '../../../resilience/resilience.service';
import { SettlementService } from '../../../common/services/settlement.service';

// ── Fixture IDs ────────────────────────────────────────────────────────────────

const USER_ID    = 'user-uuid-001';
const RIDER_ID   = 'rider-uuid-001';
const ORDER_ID   = 'order-uuid-001';
const WALLET_ID  = 'wallet-uuid-001';

// ── Mock fixtures ──────────────────────────────────────────────────────────────

const mockRider = {
  id: RIDER_ID,
  userId: USER_ID,
  status: 'APPROVED',
  isOnline: false,
  avgRating: 4.5,
  totalDeliveries: 10,
  acceptanceRate: 0.9,
  approvedById: null,
  approvedAt: null,
  metadata: null,
  deletedAt: null,
};

const mockOrder = {
  id: ORDER_ID,
  senderId: USER_ID,
  riderId: RIDER_ID,
  pickupAddress: '1 Ake Road, Abeokuta',
  pickupLat: 7.1608,
  pickupLng: 3.3475,
  dropoffAddress: 'Olumo Rock, Abeokuta',
  dropoffLat: 7.2571,
  dropoffLng: 3.4167,
  itemDescription: 'Electronics — laptop and charger',
  weightKg: 2.5,
  recipientPhone: '+2348012345678',
  fee: 800,
  platformFee: 160,
  riderEarnings: 640,
  status: 'IN_TRANSIT',
  proofPhotoUrl: null,
  otpVerifiedAt: new Date(),
  requestedAt: new Date(),
  matchedAt: new Date(),
  collectedAt: new Date(),
  completedAt: null,
  cancelReason: null,
  senderRating: null,
  metadata: null,
  deletedAt: null,
};

const mockPlatformConfig = (key: string, value: number | boolean) => ({
  id: `cfg-${key}`,
  key,
  value,
  isPublic: false,
});

// ── Mock objects ───────────────────────────────────────────────────────────────

const mockTx = {
  deliveryOrder: { update: jest.fn().mockResolvedValue({}) },
  deliveryEvent: { create: jest.fn().mockResolvedValue({}) },
  wallet: { findUnique: jest.fn(), update: jest.fn().mockResolvedValue({}) },
  transaction: { create: jest.fn().mockResolvedValue({}) },
  $executeRaw: jest.fn().mockResolvedValue(1),
};

const mockPrisma = {
  deliveryRider: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  deliveryOrder: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    aggregate: jest.fn(),
    findMany: jest.fn(),
  },
  deliveryEvent: {
    create: jest.fn(),
  },
  wallet: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
  },
  transaction: {
    create: jest.fn(),
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
  resolveSplit: jest.fn().mockResolvedValue({ earnerPct: 0.8, ministryPct: 0.05, platformPct: 0.15 }),
};

const mockRedis = {
  geoadd: jest.fn().mockResolvedValue(undefined),
  geosearch: jest.fn().mockResolvedValue([]),
  zrem: jest.fn().mockResolvedValue(undefined),
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
  setNx: jest.fn().mockResolvedValue(true),
};

const mockWallet = {
  creditWallet: jest.fn().mockResolvedValue(undefined),
};

const mockGateway = {
  server: {
    to: jest.fn().mockReturnValue({ emit: jest.fn() }),
  },
};

const mockS3 = {
  upload: jest.fn().mockResolvedValue('https://cdn.example.com/delivery-proof/order-uuid-001.jpg'),
};

const mockConfig = {
  get: jest.fn().mockReturnValue(undefined),
};

const mockResilience = {
  execute: jest.fn((vendor: string, fn: (context: { signal: AbortSignal | undefined }) => any) =>
    fn({ signal: undefined }),
  ),
};

// ── Test suite ─────────────────────────────────────────────────────────────────

describe('DeliveryService', () => {
  let service: DeliveryService;

  // Keyed platformConfig lookup — robust against call-order changes, unlike chained
  // mockResolvedValueOnce(). Individual tests can override specific keys afterward.
  const DEFAULT_CONFIG: Record<string, number> = {
    delivery_base_fee: 300,
    delivery_per_kg_rate: 50,
    delivery_match_radius_km: 5,
    'delivery.match_max_retry_attempts': 3,
    'delivery.otp_ttl_seconds': 1800,
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
    // Wire $transaction as interactive callback so completeDelivery tx works
    mockPrisma.$transaction.mockImplementation(async (fn: any) => {
      if (typeof fn === 'function') return fn(mockTx);
      return fn;
    });
    // Reset mockSettlement's implementations after clearAllMocks (clearAllMocks does
    // not remove a custom .mockImplementation set by an earlier test — mirrors
    // transport.service.spec.ts's beforeEach reset).
    mockSettlement.settle.mockResolvedValue({ status: 'SETTLED', platformAmountNgn: 0, recipientCredits: [] });
    mockSettlement.resolveMinistryWallet.mockResolvedValue({ id: 'WAL-MINISTRY' });
    mockSettlement.resolveSplit.mockResolvedValue({ earnerPct: 0.8, ministryPct: 0.05, platformPct: 0.15 });
    mockConfigDefaults();
    // Default: the CAS-guarded updateMany in attemptMatchOrder "wins the race" unless a
    // specific test overrides this to simulate a concurrent call already advancing state.
    mockPrisma.deliveryOrder.updateMany.mockResolvedValue({ count: 1 });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DeliveryService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RedisService, useValue: mockRedis },
        { provide: WalletService, useValue: mockWallet },
        { provide: DeliveryGateway, useValue: mockGateway },
        { provide: ConfigService, useValue: mockConfig },
        { provide: S3Service, useValue: mockS3 },
        { provide: ResilienceService, useValue: mockResilience },
        { provide: SettlementService, useValue: mockSettlement },
      ],
    }).compile();

    service = module.get<DeliveryService>(DeliveryService);
  });

  // ── requestDelivery ────────────────────────────────────────────────────────

  describe('requestDelivery', () => {
    const dto = {
      pickupLat: 7.1608,
      pickupLng: 3.3475,
      pickupAddress: '1 Ake Road, Abeokuta',
      dropoffLat: 7.2571,
      dropoffLng: 3.4167,
      dropoffAddress: 'Olumo Rock, Abeokuta',
      itemDescription: 'Electronics — laptop and charger',
      weightKg: 2.5,
      recipientPhone: '+2348012345678',
    };

    function mockCreatedOrder(overrides: any = {}) {
      return {
        ...mockOrder,
        id: ORDER_ID,
        status: 'SEARCHING',
        riderId: null,
        otpVerifiedAt: null,
        matchAttempts: 0,
        excludedRiderIds: [],
        pickupLat: dto.pickupLat,
        pickupLng: dto.pickupLng,
        senderId: USER_ID,
        ...overrides,
      };
    }

    it('creates a DeliveryOrder with SEARCHING status, sends OTP, and calls redis.geosearch via the first match attempt', async () => {
      mockRedis.geosearch.mockResolvedValue([]);
      const created = mockCreatedOrder();
      mockPrisma.deliveryOrder.create.mockResolvedValue(created);
      mockPrisma.deliveryOrder.findFirst.mockResolvedValue(created);

      const result = await service.requestDelivery(USER_ID, dto as any);

      expect(mockPrisma.deliveryOrder.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ senderId: USER_ID, status: 'SEARCHING' }),
        }),
      );
      expect(mockRedis.geosearch).toHaveBeenCalledWith('riders:online', dto.pickupLng, dto.pickupLat, 5);
      expect(mockRedis.set).toHaveBeenCalledWith(`delivery:otp:${ORDER_ID}`, expect.any(String), 1800);
      expect(result?.status).toBe('SEARCHING');
    });

    it('emits "delivery:request" to gateway.server.to("rider:{riderId}") and sets a 60s matchDeadlineAt when geosearch returns a rider', async () => {
      mockRedis.geosearch.mockResolvedValue([RIDER_ID]);
      const created = mockCreatedOrder();
      mockPrisma.deliveryOrder.create.mockResolvedValue(created);
      mockPrisma.deliveryOrder.findFirst.mockResolvedValue(created);

      await service.requestDelivery(USER_ID, dto as any);

      expect(mockGateway.server.to).toHaveBeenCalledWith(`rider:${RIDER_ID}`);
      const toReturn = mockGateway.server.to.mock.results[0]?.value;
      expect(toReturn?.emit).toHaveBeenCalledWith('delivery:request', expect.anything());
      expect(mockPrisma.deliveryOrder.updateMany).toHaveBeenCalledWith({
        where: { id: ORDER_ID, status: 'SEARCHING', matchAttempts: 0 },
        data: { matchAttempts: 1, matchDeadlineAt: expect.any(Date), excludedRiderIds: { push: RIDER_ID } },
      });
    });

    it('does not double-offer when a concurrent call already advanced the order (CAS guard loses the race)', async () => {
      mockRedis.geosearch.mockResolvedValue([RIDER_ID]);
      const created = mockCreatedOrder();
      mockPrisma.deliveryOrder.create.mockResolvedValue(created);
      mockPrisma.deliveryOrder.findFirst.mockResolvedValue(created);
      mockPrisma.deliveryOrder.updateMany.mockResolvedValueOnce({ count: 0 });

      await service.requestDelivery(USER_ID, dto as any);

      expect(mockGateway.server.to).not.toHaveBeenCalledWith(`rider:${RIDER_ID}`);
      expect(mockPrisma.deliveryEvent.create).not.toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ event: 'RIDER_OFFERED' }) }),
      );
    });

    it('respects a configured delivery.otp_ttl_seconds instead of a hardcoded value', async () => {
      mockConfigDefaults({ 'delivery.otp_ttl_seconds': 900 });
      mockRedis.geosearch.mockResolvedValue([]);
      const created = mockCreatedOrder();
      mockPrisma.deliveryOrder.create.mockResolvedValue(created);
      mockPrisma.deliveryOrder.findFirst.mockResolvedValue(created);

      await service.requestDelivery(USER_ID, dto as any);

      expect(mockRedis.set).toHaveBeenCalledWith(`delivery:otp:${ORDER_ID}`, expect.any(String), 900);
    });
  });

  // ── declineOrder ───────────────────────────────────────────────────────────

  describe('declineOrder', () => {
    it('logs RIDER_DECLINED and immediately attempts to re-match with the next rider', async () => {
      mockPrisma.deliveryRider.findFirst.mockResolvedValue(mockRider);
      const order = {
        ...mockOrder,
        id: ORDER_ID,
        status: 'SEARCHING',
        matchAttempts: 1,
        excludedRiderIds: [RIDER_ID],
        pickupLat: 7.1608,
        pickupLng: 3.3475,
      };
      mockPrisma.deliveryOrder.findFirst.mockResolvedValue(order);
      mockRedis.geosearch.mockResolvedValue(['rider-uuid-002']);

      const result = await service.declineOrder(ORDER_ID, USER_ID);

      expect(result).toEqual({ declined: true });
      expect(mockPrisma.deliveryEvent.create).toHaveBeenCalledWith({
        data: { orderId: ORDER_ID, event: 'RIDER_DECLINED', metadata: { riderId: RIDER_ID } },
      });
      expect(mockGateway.server.to).toHaveBeenCalledWith('rider:rider-uuid-002');
    });
  });

  // ── sweepUnmatchedOrders ───────────────────────────────────────────────────

  describe('sweepUnmatchedOrders', () => {
    it('skips the tick when the distributed lock is already held by another replica', async () => {
      mockRedis.setNx.mockResolvedValue(false);

      await service.sweepUnmatchedOrders();

      expect(mockPrisma.deliveryOrder.findMany).not.toHaveBeenCalled();
    });

    it('expires every due SEARCHING order that has exhausted its retry budget', async () => {
      mockRedis.setNx.mockResolvedValue(true);
      mockPrisma.deliveryOrder.findMany.mockResolvedValue([{ id: 'order-a' }]);
      mockPrisma.deliveryOrder.findFirst.mockResolvedValue({
        ...mockOrder,
        status: 'SEARCHING',
        matchAttempts: 3,
        excludedRiderIds: [],
      });

      await service.sweepUnmatchedOrders();

      expect(mockPrisma.deliveryOrder.findMany).toHaveBeenCalledWith({
        where: { status: 'SEARCHING', matchDeadlineAt: { lte: expect.any(Date) } },
        select: { id: true },
      });
      expect(mockPrisma.deliveryOrder.updateMany).toHaveBeenCalledWith({
        where: { id: 'order-a', status: 'SEARCHING', matchAttempts: 3 },
        data: { status: 'EXPIRED' },
      });
    });
  });

  // ── resendOtp ──────────────────────────────────────────────────────────────

  describe('resendOtp', () => {
    it('regenerates the OTP, resets its TTL and the attempt counter, and re-sends via Termii', async () => {
      mockPrisma.deliveryRider.findFirst.mockResolvedValue(mockRider);
      mockPrisma.deliveryOrder.findFirst.mockResolvedValue({
        ...mockOrder,
        status: 'COLLECTING',
        riderId: RIDER_ID,
      });

      const result = await service.resendOtp(ORDER_ID, USER_ID);

      expect(result).toEqual({ resent: true });
      expect(mockRedis.set).toHaveBeenCalledWith(`delivery:otp:${ORDER_ID}`, expect.any(String), 1800);
      expect(mockRedis.del).toHaveBeenCalledWith(`delivery:otp:attempts:${ORDER_ID}`);
      expect(mockPrisma.deliveryEvent.create).toHaveBeenCalledWith({
        data: { orderId: ORDER_ID, event: 'OTP_RESENT' },
      });
    });

    it('throws ForbiddenException when the caller is not the assigned rider', async () => {
      mockPrisma.deliveryRider.findFirst.mockResolvedValue({ ...mockRider, id: 'rider-uuid-999' });
      mockPrisma.deliveryOrder.findFirst.mockResolvedValue({
        ...mockOrder,
        status: 'COLLECTING',
        riderId: RIDER_ID,
      });

      await expect(service.resendOtp(ORDER_ID, USER_ID)).rejects.toThrow(
        'You are not the assigned rider for this order',
      );
    });

    it('throws BadRequestException for an order in a status that cannot receive OTP resend', async () => {
      mockPrisma.deliveryRider.findFirst.mockResolvedValue(mockRider);
      mockPrisma.deliveryOrder.findFirst.mockResolvedValue({
        ...mockOrder,
        status: 'DELIVERED',
        riderId: RIDER_ID,
      });

      await expect(service.resendOtp(ORDER_ID, USER_ID)).rejects.toThrow(BadRequestException);
    });
  });

  // ── startTransit ───────────────────────────────────────────────────────────

  describe('startTransit', () => {
    it('transitions COLLECTING → IN_TRANSIT, logs TRANSIT_STARTED, emits delivery:in_transit', async () => {
      mockPrisma.deliveryRider.findFirst.mockResolvedValue(mockRider);
      mockPrisma.deliveryOrder.findFirst
        .mockResolvedValueOnce({ ...mockOrder, status: 'COLLECTING', riderId: RIDER_ID })
        .mockResolvedValueOnce({ ...mockOrder, status: 'IN_TRANSIT', riderId: RIDER_ID });
      mockPrisma.deliveryOrder.updateMany.mockResolvedValue({ count: 1 });

      await service.startTransit(ORDER_ID, USER_ID);

      expect(mockPrisma.deliveryOrder.updateMany).toHaveBeenCalledWith({
        where: { id: ORDER_ID, status: 'COLLECTING' },
        data: { status: 'IN_TRANSIT' },
      });
      expect(mockPrisma.deliveryEvent.create).toHaveBeenCalledWith({
        data: { orderId: ORDER_ID, event: 'TRANSIT_STARTED' },
      });
      expect(mockGateway.server.to).toHaveBeenCalledWith(`delivery:${ORDER_ID}`);
    });

    it('throws BadRequestException when the order is not in COLLECTING', async () => {
      mockPrisma.deliveryRider.findFirst.mockResolvedValue(mockRider);
      mockPrisma.deliveryOrder.findFirst.mockResolvedValue({
        ...mockOrder,
        status: 'MATCHED',
        riderId: RIDER_ID,
      });
      mockPrisma.deliveryOrder.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.startTransit(ORDER_ID, USER_ID)).rejects.toThrow(BadRequestException);
    });
  });

  // ── verifyOtp ──────────────────────────────────────────────────────────────

  describe('verifyOtp', () => {
    it('matches redis.get("delivery:otp:{orderId}") and updates deliveryOrder.otpVerifiedAt', async () => {
      const storedOtp = '123456';
      // First call is the attempts key (return null = 0 attempts), second is the OTP
      mockRedis.get
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(storedOtp);
      mockPrisma.deliveryOrder.findUnique.mockResolvedValue({
        ...mockOrder,
        status: 'COLLECTING',
        otpVerifiedAt: null,
      });
      mockPrisma.deliveryOrder.update.mockResolvedValue({
        ...mockOrder,
        otpVerifiedAt: new Date(),
      });

      await service.verifyOtp(ORDER_ID, { otp: storedOtp } as any);

      expect(mockRedis.get).toHaveBeenCalledWith(`delivery:otp:${ORDER_ID}`);
      expect(mockPrisma.deliveryOrder.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: ORDER_ID },
          data: expect.objectContaining({
            otpVerifiedAt: expect.any(Date),
          }),
        }),
      );
    });

    it('throws BadRequestException when redis OTP does not match', async () => {
      mockRedis.get.mockResolvedValue('654321');
      mockPrisma.deliveryOrder.findUnique.mockResolvedValue({
        ...mockOrder,
        status: 'COLLECTING',
        otpVerifiedAt: null,
      });

      await expect(
        service.verifyOtp(ORDER_ID, { otp: '000000' } as any),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ── completeDelivery ───────────────────────────────────────────────────────

  describe('completeDelivery', () => {
    it('throws BadRequestException when otpVerifiedAt is null', async () => {
      mockPrisma.deliveryOrder.findUnique.mockResolvedValue({
        ...mockOrder,
        status: 'IN_TRANSIT',
        otpVerifiedAt: null,
      });
      mockPrisma.deliveryRider.findFirst.mockResolvedValue(mockRider);

      await expect(
        service.completeDelivery(ORDER_ID, USER_ID, {
          proofPhotoBase64: 'abc123',
        } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when proofPhotoBase64 is absent', async () => {
      mockPrisma.deliveryOrder.findUnique.mockResolvedValue({
        ...mockOrder,
        status: 'IN_TRANSIT',
        otpVerifiedAt: new Date(),
      });
      mockPrisma.deliveryRider.findFirst.mockResolvedValue(mockRider);

      await expect(
        service.completeDelivery(ORDER_ID, USER_ID, {} as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('delegates to settlementService.settle() with deterministic ISY-DLV reference and RIDER+MINISTRY recipients when delivery.settlement_engine_enabled is true', async () => {
      const base64Photo = Buffer.from('fake-jpeg-data').toString('base64');
      mockPrisma.deliveryOrder.findUnique.mockResolvedValue({
        ...mockOrder,
        status: 'IN_TRANSIT',
        otpVerifiedAt: new Date(),
        fee: 800,
      });
      mockPrisma.deliveryRider.findFirst.mockResolvedValue(mockRider);
      mockPrisma.wallet.findFirst.mockResolvedValue({ id: WALLET_ID, userId: USER_ID });
      mockPrisma.platformConfig.findUnique.mockImplementation((args: any) => {
        const key = args.where.key;
        if (key === 'delivery.settlement_engine_enabled') {
          return Promise.resolve(mockPlatformConfig(key, true));
        }
        if (key === 'delivery.govt_levy_pct') return Promise.resolve(mockPlatformConfig(key, 5));
        if (key === 'delivery.platform_fee_pct') return Promise.resolve(mockPlatformConfig(key, 15));
        return Promise.resolve(null);
      });

      await service.completeDelivery(ORDER_ID, USER_ID, {
        proofPhotoBase64: base64Photo,
      } as any);

      expect(mockS3.upload).toHaveBeenCalledWith(
        expect.stringMatching(/^delivery-proof\//),
        expect.any(Buffer),
        'image/jpeg',
      );
      expect(mockSettlement.settle).toHaveBeenCalledWith(
        expect.objectContaining({
          module: 'delivery',
          reference: `ISY-DLV-${ORDER_ID}`,
          gateway: 'INTERNAL',
          buyerWalletId: null,
          recipients: expect.arrayContaining([
            expect.objectContaining({ tag: 'RIDER', amountNgn: 640 }),
            expect.objectContaining({ tag: 'MINISTRY', amountNgn: 40 }),
          ]),
        }),
      );
      // Post-cutover: no legacy inline wallet mutation may run alongside SettlementService.
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
      expect(mockPrisma.shadowSettlementComparison.create).not.toHaveBeenCalled();
    });

    it('credits the rider wallet 640 via the legacy $transaction and writes a matched Stage-2 shadow comparison when delivery.settlement_engine_enabled is false/unset', async () => {
      const base64Photo = Buffer.from('fake-jpeg-data').toString('base64');
      mockPrisma.deliveryOrder.findUnique.mockResolvedValue({
        ...mockOrder,
        status: 'IN_TRANSIT',
        otpVerifiedAt: new Date(),
        fee: 800,
      });
      mockPrisma.deliveryRider.findFirst.mockResolvedValue(mockRider);
      mockPrisma.wallet.findFirst.mockResolvedValue({ id: WALLET_ID, userId: USER_ID });
      mockTx.wallet.findUnique.mockResolvedValue({ id: WALLET_ID, balance: 0 });
      mockPrisma.platformConfig.findUnique.mockImplementation((args: any) => {
        const key = args.where.key;
        if (key === 'delivery.settlement_engine_enabled') return Promise.resolve(null); // unset -> false
        if (key === 'delivery_platform_fee_pct') return Promise.resolve(mockPlatformConfig(key, 20));
        if (key === 'delivery.govt_levy_pct') return Promise.resolve(mockPlatformConfig(key, 5));
        if (key === 'delivery.platform_fee_pct') return Promise.resolve(mockPlatformConfig(key, 15));
        return Promise.resolve(null);
      });

      await service.completeDelivery(ORDER_ID, USER_ID, {
        proofPhotoBase64: base64Photo,
      } as any);

      expect(mockS3.upload).toHaveBeenCalledWith(
        expect.stringMatching(/^delivery-proof\//),
        expect.any(Buffer),
        'image/jpeg',
      );
      expect(mockTx.wallet.update).toHaveBeenCalledWith({
        where: { id: WALLET_ID },
        data: { balance: 640 },
      });
      expect(mockTx.transaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            gateway: 'INTERNAL',
            reference: expect.stringMatching(/^ISY-RDR-/),
            amount: 640,
            metadata: expect.objectContaining({ module: 'delivery' }),
          }),
        }),
      );
      expect(mockPrisma.shadowSettlementComparison.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ module: 'delivery', matched: true }),
        }),
      );
      expect(mockSettlement.settle).not.toHaveBeenCalled();
    });

    // CR-01/CR-02 regression coverage — WR-04
    it('onSettled throws when the atomic guard finds the order already delivered (double-complete race)', async () => {
      const base64Photo = Buffer.from('fake-jpeg-data').toString('base64');
      mockPrisma.deliveryOrder.findUnique.mockResolvedValue({
        ...mockOrder,
        status: 'IN_TRANSIT',
        otpVerifiedAt: new Date(),
        fee: 800,
      });
      mockPrisma.deliveryRider.findFirst.mockResolvedValue(mockRider);
      mockPrisma.wallet.findFirst.mockResolvedValue({ id: WALLET_ID, userId: USER_ID });
      mockPrisma.platformConfig.findUnique.mockImplementation((args: any) => {
        const key = args.where.key;
        if (key === 'delivery.settlement_engine_enabled') return Promise.resolve(mockPlatformConfig(key, true));
        if (key === 'delivery.govt_levy_pct') return Promise.resolve(mockPlatformConfig(key, 5));
        if (key === 'delivery.platform_fee_pct') return Promise.resolve(mockPlatformConfig(key, 15));
        return Promise.resolve(null);
      });
      const fakeTxUpdateMany = jest.fn().mockResolvedValue({ count: 0 });
      const fakeTxEventCreate = jest.fn();
      mockSettlement.settle.mockImplementation(async (input: any) => {
        const tx = {
          deliveryOrder: { updateMany: fakeTxUpdateMany },
          deliveryEvent: { create: fakeTxEventCreate },
        };
        await input.onSettled?.(tx);
        return { status: 'SETTLED', platformAmountNgn: 0, recipientCredits: [] };
      });

      await expect(
        service.completeDelivery(ORDER_ID, USER_ID, { proofPhotoBase64: base64Photo } as any),
      ).rejects.toThrow(BadRequestException);

      expect(fakeTxUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: ORDER_ID, status: { in: ['COLLECTING', 'IN_TRANSIT'] } },
        }),
      );
      // The guard must reject before the completion event is ever written.
      expect(fakeTxEventCreate).not.toHaveBeenCalled();
    });

    it('reverts order to a valid IN_TRANSIT status (not the removed PICKED_UP value) when settle() fails', async () => {
      const base64Photo = Buffer.from('fake-jpeg-data').toString('base64');
      mockPrisma.deliveryOrder.findUnique.mockResolvedValue({
        ...mockOrder,
        status: 'IN_TRANSIT',
        otpVerifiedAt: new Date(),
        fee: 800,
      });
      mockPrisma.deliveryRider.findFirst.mockResolvedValue(mockRider);
      mockPrisma.wallet.findFirst.mockResolvedValue({ id: WALLET_ID, userId: USER_ID });
      mockPrisma.platformConfig.findUnique.mockImplementation((args: any) => {
        const key = args.where.key;
        if (key === 'delivery.settlement_engine_enabled') return Promise.resolve(mockPlatformConfig(key, true));
        if (key === 'delivery.govt_levy_pct') return Promise.resolve(mockPlatformConfig(key, 5));
        if (key === 'delivery.platform_fee_pct') return Promise.resolve(mockPlatformConfig(key, 15));
        return Promise.resolve(null);
      });
      // Simulate: an unrelated failure (e.g. DB error) before the atomic guard ever
      // ran — the order is genuinely still IN_TRANSIT, so the guarded revert (notIn
      // terminal statuses) must find count=1 and safely set it back to IN_TRANSIT.
      mockPrisma.deliveryOrder.updateMany.mockResolvedValue({ count: 1 });
      mockSettlement.settle.mockImplementation(async (input: any) => {
        await input.onFailure?.(new Error('settlement failed'));
        throw new Error('settlement failed');
      });

      await expect(
        service.completeDelivery(ORDER_ID, USER_ID, { proofPhotoBase64: base64Photo } as any),
      ).rejects.toThrow('settlement failed');

      expect(mockPrisma.deliveryOrder.updateMany).toHaveBeenCalledWith({
        where: { id: ORDER_ID, status: { notIn: ['DELIVERED', 'CANCELLED', 'EXPIRED'] } },
        data: { status: 'IN_TRANSIT' },
      });
    });

    it('does not resurrect an order already in a terminal state when the cutover onFailure handler runs', async () => {
      const base64Photo = Buffer.from('fake-jpeg-data').toString('base64');
      mockPrisma.deliveryOrder.findUnique.mockResolvedValue({
        ...mockOrder,
        status: 'IN_TRANSIT',
        otpVerifiedAt: new Date(),
        fee: 800,
      });
      mockPrisma.deliveryRider.findFirst.mockResolvedValue(mockRider);
      mockPrisma.wallet.findFirst.mockResolvedValue({ id: WALLET_ID, userId: USER_ID });
      mockPrisma.platformConfig.findUnique.mockImplementation((args: any) => {
        const key = args.where.key;
        if (key === 'delivery.settlement_engine_enabled') return Promise.resolve(mockPlatformConfig(key, true));
        if (key === 'delivery.govt_levy_pct') return Promise.resolve(mockPlatformConfig(key, 5));
        if (key === 'delivery.platform_fee_pct') return Promise.resolve(mockPlatformConfig(key, 15));
        return Promise.resolve(null);
      });
      // Simulate: the order was cancelled (e.g. by the sender) concurrently with a
      // stray/duplicate completeDelivery call. onSettled's guard already threw
      // (count=0), so onFailure's own guarded revert must also find count=0 (order
      // is CANCELLED, excluded from the notIn revert filter) and must NOT force it
      // back to IN_TRANSIT — which would let a subsequent call pay the rider for a
      // cancelled delivery.
      mockPrisma.deliveryOrder.updateMany.mockResolvedValue({ count: 0 });
      mockSettlement.settle.mockImplementation(async (input: any) => {
        await input.onFailure?.(new Error('order already delivered or not in a completable status'));
        throw new Error('order already delivered or not in a completable status');
      });

      await expect(
        service.completeDelivery(ORDER_ID, USER_ID, { proofPhotoBase64: base64Photo } as any),
      ).rejects.toThrow('order already delivered or not in a completable status');

      expect(mockPrisma.deliveryOrder.updateMany).toHaveBeenCalledWith({
        where: { id: ORDER_ID, status: { notIn: ['DELIVERED', 'CANCELLED', 'EXPIRED'] } },
        data: { status: 'IN_TRANSIT' },
      });
    });

    // SETTLE-11b regression coverage — 18-02-PLAN.md Task 2
    it('computes riderEarnings=800 via resolveSplit for fee=1000 (byte-identical to pre-migration govtLevyPct=5/platformFeePct=15 MULTIPLY-FIRST formula)', async () => {
      const base64Photo = Buffer.from('fake-jpeg-data').toString('base64');
      mockPrisma.deliveryOrder.findUnique.mockResolvedValue({
        ...mockOrder,
        status: 'IN_TRANSIT',
        otpVerifiedAt: new Date(),
        fee: 1000,
      });
      mockPrisma.deliveryRider.findFirst.mockResolvedValue(mockRider);
      mockPrisma.wallet.findFirst.mockResolvedValue({ id: WALLET_ID, userId: USER_ID });
      mockPrisma.platformConfig.findUnique.mockImplementation((args: any) => {
        const key = args.where.key;
        if (key === 'delivery.settlement_engine_enabled') return Promise.resolve(mockPlatformConfig(key, true));
        return Promise.resolve(null);
      });
      mockSettlement.resolveSplit.mockResolvedValueOnce({ earnerPct: 0.8, ministryPct: 0.05, platformPct: 0.15 });

      await service.completeDelivery(ORDER_ID, USER_ID, { proofPhotoBase64: base64Photo } as any);

      expect(mockSettlement.resolveSplit).toHaveBeenCalledWith('delivery', 1000);
      expect(mockSettlement.settle).toHaveBeenCalledWith(
        expect.objectContaining({
          recipients: expect.arrayContaining([
            expect.objectContaining({ tag: 'RIDER', amountNgn: 800 }),
            expect.objectContaining({ tag: 'MINISTRY', amountNgn: 50 }),
          ]),
        }),
      );
    });

    it('no longer reads delivery.govt_levy_pct/delivery.platform_fee_pct from PlatformConfig in the cutover branch', async () => {
      const base64Photo = Buffer.from('fake-jpeg-data').toString('base64');
      mockPrisma.deliveryOrder.findUnique.mockResolvedValue({
        ...mockOrder,
        status: 'IN_TRANSIT',
        otpVerifiedAt: new Date(),
        fee: 800,
      });
      mockPrisma.deliveryRider.findFirst.mockResolvedValue(mockRider);
      mockPrisma.wallet.findFirst.mockResolvedValue({ id: WALLET_ID, userId: USER_ID });
      mockPrisma.platformConfig.findUnique.mockImplementation((args: any) => {
        const key = args.where.key;
        if (key === 'delivery.settlement_engine_enabled') return Promise.resolve(mockPlatformConfig(key, true));
        return Promise.resolve(null);
      });

      await service.completeDelivery(ORDER_ID, USER_ID, { proofPhotoBase64: base64Photo } as any);

      const calledKeys = mockPrisma.platformConfig.findUnique.mock.calls.map((c: any) => c[0].where.key);
      expect(calledKeys).not.toContain('delivery.govt_levy_pct');
      expect(calledKeys).not.toContain('delivery.platform_fee_pct');
      expect(mockSettlement.resolveSplit).toHaveBeenCalledWith('delivery', 800);
    });
  });

  // ── sendTermiiDeliveryOtp ──────────────────────────────────────────────────

  describe('sendTermiiDeliveryOtp', () => {
    it('routes the Termii fetch call through resilience.execute with the termiiDelivery vendor key', async () => {
      mockConfig.get.mockImplementation((key: string, def?: unknown) =>
        key === 'TERMII_API_KEY' ? 'test-termii-key' : (def ?? undefined),
      );
      jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true } as any);

      await (service as any).sendTermiiDeliveryOtp('+2348012345678', '654321');

      expect(mockResilience.execute).toHaveBeenCalledWith('termiiDelivery', expect.any(Function));
    });

    it("forwards the exact AbortSignal instance into fetch()'s init object (reference-identity, mirrors paystack.service.spec.ts Test 7)", async () => {
      mockConfig.get.mockImplementation((key: string, def?: unknown) =>
        key === 'TERMII_API_KEY' ? 'test-termii-key' : (def ?? undefined),
      );
      const controller = new AbortController();
      mockResilience.execute.mockImplementationOnce(
        (vendor: string, fn: (context: { signal: AbortSignal | undefined }) => any) =>
          fn({ signal: controller.signal }),
      );
      jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true } as any);

      await (service as any).sendTermiiDeliveryOtp('+2348012345678', '654321');

      expect((global.fetch as jest.Mock).mock.calls[0][1]?.signal).toBe(controller.signal);
    });

    it('resolves without throwing when resilience.execute rejects (circuit open) — log-and-swallow fallback preserved', async () => {
      mockConfig.get.mockImplementation((key: string, def?: unknown) =>
        key === 'TERMII_API_KEY' ? 'test-termii-key' : (def ?? undefined),
      );
      mockResilience.execute.mockRejectedValueOnce(new Error('circuit open'));

      await expect(
        (service as any).sendTermiiDeliveryOtp('+2348012345678', '654321'),
      ).resolves.toBeUndefined();
    });
  });

  // ── cleanStaleRiderHeartbeats (cron lock guard) ─────────────────────────────

  describe('cleanStaleRiderHeartbeats', () => {
    it('acquires the cron lock and runs existing pass-through behavior unchanged when lock is granted', async () => {
      mockRedis.geosearch.mockResolvedValue([]);

      await service.cleanStaleRiderHeartbeats();

      expect(mockRedis.setNx).toHaveBeenCalledWith('cron-lock:cleanStaleRiderHeartbeats', '1', 25);
      expect(mockRedis.geosearch).toHaveBeenCalledWith('riders:online', 0, 0, 20000);
    });

    it('skips the tick without calling geosearch when the lock is held by another replica', async () => {
      mockRedis.setNx.mockResolvedValueOnce(false);

      await service.cleanStaleRiderHeartbeats();

      expect(mockRedis.setNx).toHaveBeenCalledWith('cron-lock:cleanStaleRiderHeartbeats', '1', 25);
      expect(mockRedis.geosearch).not.toHaveBeenCalled();
    });
  });
});
