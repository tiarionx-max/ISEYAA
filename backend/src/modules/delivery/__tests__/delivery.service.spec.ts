// Plan 04-04 will create '../delivery.service' and '../delivery.gateway'.
// Until then, this spec is RED — it will fail with "Cannot find module".

import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { DeliveryService } from '../delivery.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { RedisService } from '../../../redis/redis.service';
import { WalletService } from '../../wallet/wallet.service';
import { SchedulerRegistry } from '@nestjs/schedule';
import { DeliveryGateway } from '../delivery.gateway';
import { ConfigService } from '@nestjs/config';
import { S3Service } from '../../../common/services/s3.service';
import { ResilienceService } from '../../../resilience/resilience.service';

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

const mockPlatformConfig = (key: string, value: number) => ({
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
  $transaction: jest.fn(),
};

const mockRedis = {
  geoadd: jest.fn().mockResolvedValue(undefined),
  geosearch: jest.fn().mockResolvedValue([]),
  zrem: jest.fn().mockResolvedValue(undefined),
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DeliveryService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RedisService, useValue: mockRedis },
        { provide: WalletService, useValue: mockWallet },
        { provide: SchedulerRegistry, useValue: mockScheduler },
        { provide: DeliveryGateway, useValue: mockGateway },
        { provide: ConfigService, useValue: mockConfig },
        { provide: S3Service, useValue: mockS3 },
        { provide: ResilienceService, useValue: mockResilience },
      ],
    }).compile();

    service = module.get<DeliveryService>(DeliveryService);
  });

  // ── requestDelivery ────────────────────────────────────────────────────────

  describe('requestDelivery', () => {
    it('calls redis.geosearch("riders:online", ...) and creates a DeliveryOrder with SEARCHING status and sends OTP', async () => {
      mockRedis.geosearch.mockResolvedValue([]);
      mockPrisma.deliveryOrder.create.mockResolvedValue({
        ...mockOrder,
        status: 'SEARCHING',
        riderId: null,
        otpVerifiedAt: null,
      });
      mockPrisma.platformConfig.findUnique
        .mockResolvedValueOnce(mockPlatformConfig('delivery_base_fee', 300))
        .mockResolvedValueOnce(mockPlatformConfig('delivery_per_kg_rate', 50))
        .mockResolvedValueOnce(mockPlatformConfig('delivery_match_radius_km', 5));

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

      const result = await service.requestDelivery(USER_ID, dto as any);

      expect(mockRedis.geosearch).toHaveBeenCalledWith(
        'riders:online',
        expect.any(Number), // pickupLng
        expect.any(Number), // pickupLat
        expect.any(Number), // radiusKm
      );
      expect(mockPrisma.deliveryOrder.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            senderId: USER_ID,
            status: 'SEARCHING',
          }),
        }),
      );
      expect(result.status).toBe('SEARCHING');
    });

    it('emits "delivery:request" to gateway.server.to("rider:{riderId}") and schedules 60s timeout when geosearch returns a rider', async () => {
      mockRedis.geosearch.mockResolvedValue([RIDER_ID]);
      mockPrisma.deliveryOrder.create.mockResolvedValue({
        ...mockOrder,
        id: ORDER_ID,
        status: 'SEARCHING',
        riderId: null,
        otpVerifiedAt: null,
      });
      mockPrisma.platformConfig.findUnique
        .mockResolvedValueOnce(mockPlatformConfig('delivery_base_fee', 300))
        .mockResolvedValueOnce(mockPlatformConfig('delivery_per_kg_rate', 50))
        .mockResolvedValueOnce(mockPlatformConfig('delivery_match_radius_km', 5));

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

      await service.requestDelivery(USER_ID, dto as any);

      expect(mockGateway.server.to).toHaveBeenCalledWith(`rider:${RIDER_ID}`);
      const toReturn = mockGateway.server.to.mock.results[0]?.value;
      expect(toReturn?.emit).toHaveBeenCalledWith('delivery:request', expect.anything());
      expect(mockScheduler.addTimeout).toHaveBeenCalledWith(
        expect.stringContaining(ORDER_ID),
        expect.anything(),
      );
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

    it('calls s3Service.upload("delivery-proof/...", buffer, "image/jpeg") and credits wallet with ISY-RDR- reference and INTERNAL gateway inside transaction', async () => {
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
      mockPrisma.platformConfig.findUnique.mockResolvedValue(
        mockPlatformConfig('delivery_platform_fee_pct', 20),
      );

      await service.completeDelivery(ORDER_ID, USER_ID, {
        proofPhotoBase64: base64Photo,
      } as any);

      expect(mockS3.upload).toHaveBeenCalledWith(
        expect.stringMatching(/^delivery-proof\//),
        expect.any(Buffer),
        'image/jpeg',
      );
      expect(mockTx.transaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            gateway: 'INTERNAL',
            reference: expect.stringMatching(/^ISY-RDR-/),
            metadata: expect.objectContaining({ module: 'delivery' }),
          }),
        }),
      );
    });

    it('computes riderEarnings = fee × (1 - delivery_platform_fee_pct / 100) from platformConfig', async () => {
      const fee = 1000;
      const feePct = 20;
      const expectedEarnings = fee * (1 - feePct / 100); // 800

      const base64Photo = Buffer.from('fake-jpeg-data').toString('base64');
      mockPrisma.deliveryOrder.findUnique.mockResolvedValue({
        ...mockOrder,
        status: 'IN_TRANSIT',
        otpVerifiedAt: new Date(),
        fee,
      });
      mockPrisma.deliveryRider.findFirst.mockResolvedValue(mockRider);
      mockPrisma.wallet.findFirst.mockResolvedValue({ id: WALLET_ID, userId: USER_ID });
      mockTx.wallet.findUnique.mockResolvedValue({ id: WALLET_ID, balance: 0 });
      mockPrisma.platformConfig.findUnique.mockResolvedValue(
        mockPlatformConfig('delivery_platform_fee_pct', feePct),
      );

      await service.completeDelivery(ORDER_ID, USER_ID, {
        proofPhotoBase64: base64Photo,
      } as any);

      expect(mockPrisma.platformConfig.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { key: 'delivery_platform_fee_pct' } }),
      );
      expect(mockTx.transaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            amount: expectedEarnings,
            gateway: 'INTERNAL',
          }),
        }),
      );
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
});
