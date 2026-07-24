import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { WalletService } from '../wallet.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { PaystackService } from '../../../common/services/paystack.service';
import { RedisService } from '../../../redis/redis.service';
import { NotificationsClientService } from '../../notifications-client/notifications-client.service';

const USER_ID = 'user-001';
const WALLET_ID = 'wallet-001';

const mockWallet = { id: WALLET_ID, userId: USER_ID, balance: 100000, currency: 'NGN', isActive: true };
const mockUserTier2 = { phone: '+2348012345678', nin: '12345678901', bvn: null };
const mockUserTier1 = { phone: '+2348012345678', nin: null, bvn: null };
const mockUserTier0 = { phone: null, nin: null, bvn: null };

const PLATFORM_CONFIG_TIERS = [
  { key: 'kyc_bvn_daily_limit', value: 200000 },
  { key: 'kyc_nin_daily_limit', value: 1000000 },
  { key: 'kyc_smile_daily_limit', value: 5000000 },
];

// Extended user mocks with new KYC timestamp columns
const mockUserBvnVerified = {
  phone: '+2348012345678',
  nin: null,
  bvn: 'encrypted_bvn',
  kycBvnVerifiedAt: new Date(),
  kycNinVerifiedAt: null,
  kycLivenessVerifiedAt: null,
};
const mockUserNinVerified = {
  phone: '+2348012345678',
  nin: 'encrypted_nin',
  bvn: 'encrypted_bvn',
  kycBvnVerifiedAt: new Date(),
  kycNinVerifiedAt: new Date(),
  kycLivenessVerifiedAt: null,
};
const mockUserSmileVerified = {
  phone: '+2348012345678',
  nin: 'encrypted_nin',
  bvn: 'encrypted_bvn',
  kycBvnVerifiedAt: new Date(),
  kycNinVerifiedAt: new Date(),
  kycLivenessVerifiedAt: new Date(),
};

const mockPrisma = {
  wallet: { findUnique: jest.fn(), update: jest.fn() },
  user: { findUnique: jest.fn(), findFirst: jest.fn() },
  booking: { aggregate: jest.fn() },
  transaction: { findMany: jest.fn(), aggregate: jest.fn(), create: jest.fn(), update: jest.fn() },
  platformConfig: { findMany: jest.fn() },
  $transaction: jest.fn(),
};

// mockTx delegates to the outer mockPrisma so per-test mocks are respected
const mockTx = {
  wallet: {
    findUnique: jest.fn().mockImplementation((...args) => mockPrisma.wallet.findUnique(...args)),
    update: jest.fn().mockResolvedValue({}),
  },
  transaction: { create: jest.fn().mockImplementation((...args) => mockPrisma.transaction.create(...args)) },
  $executeRaw: jest.fn().mockResolvedValue(1),
};

const mockPaystack = { initiatePayment: jest.fn() };
const mockRedis = { setNx: jest.fn().mockResolvedValue(true), del: jest.fn().mockResolvedValue(1) };
const mockNotifications = { sendPush: jest.fn().mockResolvedValue({ sent: true }) };

describe('WalletService', () => {
  let service: WalletService;

  beforeEach(async () => {
    jest.clearAllMocks();
    // Default: PlatformConfig returns seeded KYC tier limits
    mockPrisma.platformConfig.findMany.mockResolvedValue(PLATFORM_CONFIG_TIERS);
    // Default: interactive $transaction calls callback with mockTx
    mockPrisma.$transaction.mockImplementation(async (fn) => {
      if (typeof fn === 'function') return fn(mockTx);
      return fn;
    });
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WalletService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: PaystackService, useValue: mockPaystack },
        { provide: RedisService, useValue: mockRedis },
        { provide: NotificationsClientService, useValue: mockNotifications },
      ],
    }).compile();
    service = module.get<WalletService>(WalletService);
  });

  // ── getBalance ─────────────────────────────────────────────────────────────

  describe('getBalance', () => {
    it('returns balance with Tier 2 for NIN-verified user', async () => {
      mockPrisma.wallet.findUnique.mockResolvedValue(mockWallet);
      mockPrisma.user.findUnique.mockResolvedValue(mockUserTier2);
      mockPrisma.booking.aggregate.mockResolvedValue({ _sum: { totalPrice: 50000 } });

      const result = await service.getBalance(USER_ID);

      expect(result.balance_ngn).toBe(100000);
      expect(result.escrow_balance_ngn).toBe(50000);
      expect(result.kyc_tier).toBe(2);
      expect(result.daily_limit_ngn).toBe(500000);
    });

    it('returns Tier 1 for phone-only user', async () => {
      mockPrisma.wallet.findUnique.mockResolvedValue(mockWallet);
      mockPrisma.user.findUnique.mockResolvedValue(mockUserTier1);
      mockPrisma.booking.aggregate.mockResolvedValue({ _sum: { totalPrice: null } });

      const result = await service.getBalance(USER_ID);
      expect(result.kyc_tier).toBe(1);
      expect(result.daily_limit_ngn).toBe(50000);
      expect(result.escrow_balance_ngn).toBe(0);
    });

    it('returns Tier 0 for unverified user', async () => {
      mockPrisma.wallet.findUnique.mockResolvedValue(mockWallet);
      mockPrisma.user.findUnique.mockResolvedValue(mockUserTier0);
      mockPrisma.booking.aggregate.mockResolvedValue({ _sum: { totalPrice: null } });

      const result = await service.getBalance(USER_ID);
      expect(result.kyc_tier).toBe(0);
      expect(result.daily_limit_ngn).toBe(0);
    });

    it('throws NotFoundException when wallet not found', async () => {
      mockPrisma.wallet.findUnique.mockResolvedValue(null);
      mockPrisma.user.findUnique.mockResolvedValue(mockUserTier1);
      await expect(service.getBalance(USER_ID)).rejects.toThrow(NotFoundException);
    });
  });

  // ── getTransactions ────────────────────────────────────────────────────────

  describe('getTransactions', () => {
    it('returns cursor-paginated transactions with hasNext when more exist', async () => {
      const items = Array.from({ length: 21 }, (_, i) => ({ id: `tx-${i}`, createdAt: new Date() }));
      mockPrisma.wallet.findUnique.mockResolvedValue(mockWallet);
      mockPrisma.transaction.findMany.mockResolvedValue(items);

      const result = await service.getTransactions(USER_ID, { limit: 20 });
      expect(result.data).toHaveLength(20);
      expect(result.meta.hasNext).toBe(true);
      expect(result.meta.cursor).toBe('tx-19');
    });

    it('returns hasNext false when no more pages', async () => {
      const items = Array.from({ length: 5 }, (_, i) => ({ id: `tx-${i}`, createdAt: new Date() }));
      mockPrisma.wallet.findUnique.mockResolvedValue(mockWallet);
      mockPrisma.transaction.findMany.mockResolvedValue(items);

      const result = await service.getTransactions(USER_ID, { limit: 20 });
      expect(result.meta.hasNext).toBe(false);
      expect(result.meta.cursor).toBeNull();
    });

    it('passes type filter to findMany', async () => {
      mockPrisma.wallet.findUnique.mockResolvedValue(mockWallet);
      mockPrisma.transaction.findMany.mockResolvedValue([]);

      await service.getTransactions(USER_ID, { type: 'CREDIT' });
      expect(mockPrisma.transaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ type: 'CREDIT' }) }),
      );
    });

    it('throws NotFoundException when wallet not found', async () => {
      mockPrisma.wallet.findUnique.mockResolvedValue(null);
      await expect(service.getTransactions(USER_ID, {})).rejects.toThrow(NotFoundException);
    });
  });

  // ── initiateTopup ──────────────────────────────────────────────────────────

  describe('initiateTopup', () => {
    it('throws BadRequestException for Tier 0 user (no phone)', async () => {
      mockPrisma.wallet.findUnique.mockResolvedValue(mockWallet);
      mockPrisma.user.findUnique.mockResolvedValue(mockUserTier0);

      await expect(service.initiateTopup(USER_ID, { amount: 1000, email: 'a@b.com' })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException when daily limit exceeded (Tier 1)', async () => {
      mockPrisma.wallet.findUnique.mockResolvedValue(mockWallet);
      mockPrisma.user.findUnique.mockResolvedValue(mockUserTier1);
      mockPrisma.transaction.aggregate.mockResolvedValue({ _sum: { amount: 48000 } });

      await expect(service.initiateTopup(USER_ID, { amount: 5000, email: 'a@b.com' })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('initiates Paystack payment for Tier 1 within daily limit', async () => {
      mockPrisma.wallet.findUnique.mockResolvedValue(mockWallet);
      mockPrisma.user.findUnique.mockResolvedValue(mockUserTier1);
      mockPrisma.transaction.aggregate.mockResolvedValue({ _sum: { amount: 0 } });
      mockPaystack.initiatePayment.mockResolvedValue({
        authorizationUrl: 'https://paystack.com/pay/xyz',
        accessCode: 'xyz',
        reference: 'ISY-FUND-ABCDEF123456',
      });

      const result = await service.initiateTopup(USER_ID, { amount: 10000, email: 'a@b.com' });
      expect(mockPaystack.initiatePayment).toHaveBeenCalledWith(
        expect.objectContaining({
          amountKobo: 10000 * 100,
          metadata: expect.objectContaining({ type: 'wallet_topup' }),
        }),
      );
      expect(result.authorizationUrl).toBeDefined();
    });

    it('allows Tier 2 up to ₦500K daily', async () => {
      mockPrisma.wallet.findUnique.mockResolvedValue(mockWallet);
      mockPrisma.user.findUnique.mockResolvedValue(mockUserTier2);
      mockPrisma.transaction.aggregate.mockResolvedValue({ _sum: { amount: 0 } });
      mockPaystack.initiatePayment.mockResolvedValue({
        authorizationUrl: 'https://paystack.com/pay/xyz',
        accessCode: 'xyz',
        reference: 'ISY-FUND-XYZ',
      });

      await expect(
        service.initiateTopup(USER_ID, { amount: 499000, email: 'a@b.com' }),
      ).resolves.toBeDefined();
    });
  });

  // ── creditWallet ───────────────────────────────────────────────────────────

  describe('creditWallet', () => {
    it('credits wallet and creates transaction record', async () => {
      mockPrisma.wallet.findUnique.mockResolvedValue(mockWallet);

      await service.creditWallet(WALLET_ID, 5000, 'ISY-FUND-REF', 'Wallet topup');

      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('throws NotFoundException when wallet not found', async () => {
      mockPrisma.wallet.findUnique.mockResolvedValue(null);
      await expect(service.creditWallet('bad-id', 1000, 'REF', 'desc')).rejects.toThrow(NotFoundException);
    });

    it('uses PAYSTACK gateway by default when no gateway passed', async () => {
      mockPrisma.wallet.findUnique.mockResolvedValue(mockWallet);

      await service.creditWallet(WALLET_ID, 5000, 'ISY-FUND-REF', 'Wallet topup', 'wallet');

      expect(mockTx.transaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ gateway: 'PAYSTACK' }),
        }),
      );
    });

    it('overrides gateway when INTERNAL is passed', async () => {
      mockPrisma.wallet.findUnique.mockResolvedValue(mockWallet);

      await service.creditWallet(WALLET_ID, 1000, 'ISY-DRV-REF', 'Trip earnings', 'transport', 'INTERNAL');

      expect(mockTx.transaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ gateway: 'INTERNAL' }),
        }),
      );
    });
  });

  // ── getBalance with PlatformConfig tiers ───────────────────────────────────

  describe('getBalance with PlatformConfig tiers', () => {
    it('returns daily_limit_ngn = 200000 (kyc_bvn_daily_limit) when kycBvnVerifiedAt is set', async () => {
      mockPrisma.wallet.findUnique.mockResolvedValue(mockWallet);
      mockPrisma.user.findUnique.mockResolvedValue(mockUserBvnVerified);
      mockPrisma.booking.aggregate.mockResolvedValue({ _sum: { totalPrice: null } });

      const result = await service.getBalance(USER_ID);
      expect(result.daily_limit_ngn).toBe(200000);
      expect(result.kyc_tier).toBe(1);
    });

    it('returns daily_limit_ngn = 1000000 (kyc_nin_daily_limit) when kycNinVerifiedAt is set', async () => {
      mockPrisma.wallet.findUnique.mockResolvedValue(mockWallet);
      mockPrisma.user.findUnique.mockResolvedValue(mockUserNinVerified);
      mockPrisma.booking.aggregate.mockResolvedValue({ _sum: { totalPrice: null } });

      const result = await service.getBalance(USER_ID);
      expect(result.daily_limit_ngn).toBe(1000000);
      expect(result.kyc_tier).toBe(2);
    });

    it('returns daily_limit_ngn = 5000000 (kyc_smile_daily_limit) when kycLivenessVerifiedAt is set', async () => {
      mockPrisma.wallet.findUnique.mockResolvedValue(mockWallet);
      mockPrisma.user.findUnique.mockResolvedValue(mockUserSmileVerified);
      mockPrisma.booking.aggregate.mockResolvedValue({ _sum: { totalPrice: null } });

      const result = await service.getBalance(USER_ID);
      expect(result.daily_limit_ngn).toBe(5000000);
      expect(result.kyc_tier).toBe(3);
    });

    it('returns daily_limit_ngn = 50000 for phone-only user (legacy fallback — until Phase 6)', async () => {
      mockPrisma.wallet.findUnique.mockResolvedValue(mockWallet);
      mockPrisma.user.findUnique.mockResolvedValue(mockUserTier1);
      mockPrisma.booking.aggregate.mockResolvedValue({ _sum: { totalPrice: null } });

      const result = await service.getBalance(USER_ID);
      expect(result.daily_limit_ngn).toBe(50000);
      expect(result.kyc_tier).toBe(1);
    });
  });

  // ── resolveRecipient ─────────────────────────────────────────────────────────

  describe('resolveRecipient', () => {
    it('returns userId + firstName for a phone that matches a real user', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({ id: 'user-002', firstName: 'Ada' });

      const result = await service.resolveRecipient(USER_ID, '+2348012345678');

      expect(mockPrisma.user.findFirst).toHaveBeenCalledWith({
        where: { phone: '+2348012345678', deletedAt: null },
        select: { id: true, firstName: true },
      });
      expect(result).toEqual({ userId: 'user-002', firstName: 'Ada', phone: '+2348012345678' });
    });

    it('throws NotFoundException when no user has that phone number', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);

      await expect(service.resolveRecipient(USER_ID, '+2348099999999')).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when resolving to your own phone number', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({ id: USER_ID, firstName: 'Self' });

      await expect(service.resolveRecipient(USER_ID, '+2348012345678')).rejects.toThrow(BadRequestException);
    });
  });
});
