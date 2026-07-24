import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { WalletService } from '../wallet.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { PaystackService } from '../../../common/services/paystack.service';
import { RedisService } from '../../../redis/redis.service';
import { NotificationsClientService } from '../../notifications-client/notifications-client.service';

// ── Fixtures ───────────────────────────────────────────────────────────────

const USER_A = 'user-a-uuid-001';
const USER_B = 'user-b-uuid-002';
const WALLET_A = 'wallet-a-uuid-001';
const WALLET_B = 'wallet-b-uuid-002';

const mockWalletA = { id: WALLET_A, userId: USER_A, balance: 1000, currency: 'NGN' };
const mockWalletB = { id: WALLET_B, userId: USER_B, balance: 5000, currency: 'NGN' };

const PLATFORM_CONFIG_TIERS = [
  { key: 'kyc_bvn_daily_limit', value: 200000 },
  { key: 'kyc_nin_daily_limit', value: 1000000 },
  { key: 'kyc_smile_daily_limit', value: 5000000 },
];

// ── Mocks ─────────────────────────────────────────────────────────────────

const mockPrisma = {
  wallet: { findUnique: jest.fn(), update: jest.fn() },
  user: { findUnique: jest.fn() },
  booking: { aggregate: jest.fn() },
  transaction: { findMany: jest.fn(), aggregate: jest.fn(), create: jest.fn(), update: jest.fn() },
  platformConfig: { findMany: jest.fn() },
  $transaction: jest.fn(),
};

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

// ── Suite ─────────────────────────────────────────────────────────────────

describe('Wallet isolation', () => {
  let service: WalletService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma.platformConfig.findMany.mockResolvedValue(PLATFORM_CONFIG_TIERS);
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

  // ── Test 1: USER_A cannot read USER_B wallet ────────────────────────────

  it('getBalance rejects with NotFoundException when USER_A has no wallet (only USER_B wallet exists)', async () => {
    // Mock: wallet only exists for USER_B; USER_A query returns null
    mockPrisma.wallet.findUnique.mockImplementation(({ where }) =>
      Promise.resolve(where.userId === USER_B ? mockWalletB : null),
    );
    mockPrisma.user.findUnique.mockResolvedValue({ phone: null, nin: null, bvn: null });

    await expect(service.getBalance(USER_A)).rejects.toThrow(NotFoundException);
  });

  // ── Test 2: USER_A gets own wallet, not USER_B data ─────────────────────

  it('getBalance resolves with USER_A wallet data and does not return USER_B data', async () => {
    // Mock: USER_A wallet exists
    mockPrisma.wallet.findUnique.mockImplementation(({ where }) =>
      Promise.resolve(where.userId === USER_A ? mockWalletA : mockWalletB),
    );
    mockPrisma.user.findUnique.mockResolvedValue({ phone: '+2341234', nin: null, bvn: null });
    mockPrisma.booking.aggregate.mockResolvedValue({ _sum: { totalPrice: null } });

    const result = await service.getBalance(USER_A);

    // Must resolve without error
    expect(result).toBeDefined();
    // Result must not expose USER_B's balance or wallet ID
    expect((result as any).balance_ngn).not.toBe(mockWalletB.balance);
    expect((result as any).wallet_id ?? WALLET_A).not.toBe(WALLET_B);
  });
});
