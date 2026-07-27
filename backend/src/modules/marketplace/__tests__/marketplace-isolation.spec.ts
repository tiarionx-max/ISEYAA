import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { MarketplaceService } from '../marketplace.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { PaystackService } from '../../../common/services/paystack.service';
import { SendgridService } from '../../../common/services/sendgrid.service';
import { KafkaService } from '../../../kafka/kafka.service';
import { SettlementService } from '../../../common/services/settlement.service';
import { ImageService } from '../../../common/services/image.service';
import { S3Service } from '../../../common/services/s3.service';

// ── Fixtures ───────────────────────────────────────────────────────────────

const USER_A = 'user-a-uuid-001';
const USER_B = 'user-b-uuid-002';
const VENDOR_A_ID = 'vendor-a-uuid-001';
const VENDOR_B_ID = 'vendor-b-uuid-002';
const PRODUCT_ID = 'product-uuid-001';
const ORDER_ID = 'order-uuid-001';

// Product belongs to VENDOR_B, not VENDOR_A
const mockProductOwnedByVendorB = {
  id: PRODUCT_ID,
  vendorId: VENDOR_B_ID,
  name: 'Other Product',
  stock: 10,
  price: 500,
  deletedAt: null,
};

// VENDOR_A is USER_A's vendor profile
const mockVendorForUserA = {
  id: VENDOR_A_ID,
  userId: USER_A,
  status: 'ACTIVE',
};

// Order owned by VENDOR_B — USER_A's vendor (VENDOR_A) is not the order vendor
const mockOrderOwnedByVendorB = {
  id: ORDER_ID,
  userId: USER_B,
  vendorId: VENDOR_B_ID,
  status: 'PROCESSING',
  deletedAt: null,
};

// ── Mocks ─────────────────────────────────────────────────────────────────

const mockPrisma = {
  vendor: { findUnique: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
  product: {
    findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn(),
    update: jest.fn(),
  },
  order: { findFirst: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
  platformConfig: { findUnique: jest.fn() },
  user: { findUnique: jest.fn() },
  $transaction: jest.fn(),
};

const mockKafka = { emit: jest.fn().mockResolvedValue(undefined), consume: jest.fn().mockResolvedValue(undefined) };
const mockPaystack = { initiatePayment: jest.fn() };
const mockSendgrid = { sendEmail: jest.fn() };
const mockSettlement = {
  settle: jest.fn().mockResolvedValue({ status: 'SETTLED', platformAmountNgn: 0, recipientCredits: [] }),
  resolveMinistryWallet: jest.fn().mockResolvedValue({ id: 'WAL-MINISTRY' }),
};
const mockImageService = { validateImage: jest.fn(), resizeProduct: jest.fn() };
const mockS3 = { upload: jest.fn() };

// ── Suite ─────────────────────────────────────────────────────────────────

describe('Marketplace isolation — product ownership', () => {
  let service: MarketplaceService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MarketplaceService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: PaystackService, useValue: mockPaystack },
        { provide: SendgridService, useValue: mockSendgrid },
        { provide: KafkaService, useValue: mockKafka },
        { provide: SettlementService, useValue: mockSettlement },
        { provide: ImageService, useValue: mockImageService },
        { provide: S3Service, useValue: mockS3 },
      ],
    }).compile();

    service = module.get<MarketplaceService>(MarketplaceService);
  });

  // ── Test 1: USER_A cannot update a product owned by VENDOR_B ────────────

  it('updateProduct rejects with ForbiddenException when product belongs to VENDOR_B and caller is USER_A', async () => {
    // Product exists but belongs to VENDOR_B
    mockPrisma.product.findFirst.mockResolvedValue(mockProductOwnedByVendorB);
    // USER_A's vendor is VENDOR_A (id mismatch with product.vendorId = VENDOR_B_ID)
    mockPrisma.vendor.findUnique.mockImplementation(({ where }) =>
      Promise.resolve(where.userId === USER_A ? mockVendorForUserA : null),
    );

    await expect(
      service.updateProduct(PRODUCT_ID, USER_A, { name: 'Hack' } as any),
    ).rejects.toThrow(ForbiddenException);
  });

  // ── Test 2: USER_A cannot update order status for an order owned by VENDOR_B ──

  it('updateOrderStatus rejects with ForbiddenException when order belongs to VENDOR_B and caller is USER_A', async () => {
    // Order exists but belongs to VENDOR_B
    mockPrisma.order.findFirst.mockResolvedValue(mockOrderOwnedByVendorB);
    // USER_A's vendor is VENDOR_A — vendorId does not match order.vendorId (VENDOR_B_ID)
    mockPrisma.vendor.findUnique.mockImplementation(({ where }) =>
      Promise.resolve(where.userId === USER_A ? mockVendorForUserA : null),
    );

    await expect(
      service.updateOrderStatus(ORDER_ID, 'SHIPPED', USER_A),
    ).rejects.toThrow(ForbiddenException);
  });
});
