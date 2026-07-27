import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException, ForbiddenException, BadRequestException, ConflictException,
} from '@nestjs/common';
import { MarketplaceService } from '../marketplace.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { PaystackService } from '../../../common/services/paystack.service';
import { SendgridService } from '../../../common/services/sendgrid.service';
import { KafkaService } from '../../../kafka/kafka.service';
import { SettlementService } from '../../../common/services/settlement.service';

const mockKafka = { emit: jest.fn().mockResolvedValue(undefined), consume: jest.fn().mockResolvedValue(undefined) };

const mockSettlement = {
  settle: jest.fn().mockResolvedValue({ status: 'SETTLED', platformAmountNgn: 0, recipientCredits: [] }),
  resolveMinistryWallet: jest.fn().mockResolvedValue({ id: 'WAL-MINISTRY' }),
  resolveSplit: jest.fn().mockResolvedValue({ earnerPct: 0.90, ministryPct: 0, platformPct: 0.10 }),
};

const USER_ID = 'user-uuid-001';
const VENDOR_ID = 'vendor-uuid-001';
const PRODUCT_ID = 'product-uuid-001';
const ORDER_ID = 'order-uuid-001';
const PAYSTACK_REF = 'ISY-ORD-ABCDEF123456';

const mockVendor = {
  id: VENDOR_ID,
  userId: USER_ID,
  lgaId: 'lga-001',
  businessName: 'Abeokuta Crafts',
  slug: 'abeokuta-crafts-abc',
  status: 'ACTIVE',
  govtLevyPct: 0.02,
  deletedAt: null,
};

const mockProduct = {
  id: PRODUCT_ID,
  vendorId: VENDOR_ID,
  name: 'Ankara Basket',
  slug: 'ankara-basket-abc',
  price: 3500,
  stock: 20,
  isActive: true,
  deletedAt: null,
  vendor: mockVendor,
};

const mockOrder = {
  id: ORDER_ID,
  userId: USER_ID,
  vendorId: VENDOR_ID,
  totalAmount: 7000,
  platformFee: 700,
  govtLevy: 140,
  vendorPayout: 6160,
  paystackRef: PAYSTACK_REF,
  status: 'PENDING',
  deletedAt: null,
  metadata: {},
  user: { email: 'buyer@example.com', firstName: 'Ade' },
  vendor: mockVendor,
  orderItems: [{ productId: PRODUCT_ID, product: { name: 'Ankara Basket' }, quantity: 2 }],
};

const mockPrisma = {
  vendor: { findUnique: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
  product: {
    findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn(),
    update: jest.fn(),
  },
  order: { findFirst: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
  platformConfig: { findUnique: jest.fn() },
  user: { findUnique: jest.fn() },
  wallet: { findUnique: jest.fn() },
  $transaction: jest.fn(),
};

const mockPaystack = { initiatePayment: jest.fn() };
const mockSendgrid = { sendEmail: jest.fn() };

describe('MarketplaceService', () => {
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
      ],
    }).compile();

    service = module.get<MarketplaceService>(MarketplaceService);
  });

  // ── createVendor ─────────────────────────────────────────────────────────

  describe('createVendor', () => {
    it('throws ConflictException when vendor already exists', async () => {
      mockPrisma.vendor.findUnique.mockResolvedValue(mockVendor);
      await expect(service.createVendor(USER_ID, { lgaId: 'lga-001', businessName: 'Test' })).rejects.toThrow(ConflictException);
    });

    it('creates vendor with PENDING status', async () => {
      mockPrisma.vendor.findUnique.mockResolvedValue(null);
      mockPrisma.vendor.create.mockResolvedValue({ ...mockVendor, status: 'PENDING' });

      const result = await service.createVendor(USER_ID, { lgaId: 'lga-001', businessName: 'Abeokuta Crafts' });

      expect(mockPrisma.vendor.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'PENDING', userId: USER_ID }),
        }),
      );
      expect(result.status).toBe('PENDING');
    });
  });

  // ── approveVendor ─────────────────────────────────────────────────────────

  describe('approveVendor', () => {
    it('throws NotFoundException when vendor not found', async () => {
      mockPrisma.vendor.findFirst.mockResolvedValue(null);
      await expect(service.approveVendor('bad-id')).rejects.toThrow(NotFoundException);
    });

    it('throws ConflictException when already active', async () => {
      mockPrisma.vendor.findFirst.mockResolvedValue(mockVendor);
      await expect(service.approveVendor(VENDOR_ID)).rejects.toThrow(ConflictException);
    });

    it('sets vendor status to ACTIVE', async () => {
      mockPrisma.vendor.findFirst.mockResolvedValue({ ...mockVendor, status: 'PENDING' });
      mockPrisma.vendor.update.mockResolvedValue({ ...mockVendor, status: 'ACTIVE' });

      const result = await service.approveVendor(VENDOR_ID);
      expect(result.status).toBe('ACTIVE');
    });
  });

  // ── createProduct ──────────────────────────────────────────────────────────

  describe('createProduct', () => {
    it('throws NotFoundException when vendor profile not found', async () => {
      mockPrisma.vendor.findUnique.mockResolvedValue(null);
      await expect(service.createProduct(USER_ID, { name: 'X', price: 100, stock: 5 } as any)).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when vendor is PENDING', async () => {
      mockPrisma.vendor.findUnique.mockResolvedValue({ ...mockVendor, status: 'PENDING' });
      await expect(service.createProduct(USER_ID, { name: 'X', price: 100, stock: 5 } as any)).rejects.toThrow(ForbiddenException);
    });

    it('creates product when vendor is ACTIVE', async () => {
      mockPrisma.vendor.findUnique.mockResolvedValue(mockVendor);
      mockPrisma.product.create.mockResolvedValue(mockProduct);

      const result = await service.createProduct(USER_ID, { name: 'Ankara Basket', price: 3500, stock: 20 } as any);
      expect(result.id).toBe(PRODUCT_ID);
    });
  });

  // ── removeProduct ──────────────────────────────────────────────────────────

  describe('removeProduct', () => {
    it('throws ForbiddenException when product belongs to different vendor', async () => {
      mockPrisma.product.findFirst.mockResolvedValue({ ...mockProduct, vendorId: 'other-vendor' });
      mockPrisma.vendor.findUnique.mockResolvedValue(mockVendor);
      await expect(service.removeProduct(PRODUCT_ID, USER_ID)).rejects.toThrow(ForbiddenException);
    });

    it('soft deletes product', async () => {
      mockPrisma.product.findFirst.mockResolvedValue(mockProduct);
      mockPrisma.vendor.findUnique.mockResolvedValue(mockVendor);
      mockPrisma.product.update.mockResolvedValue({});

      const result = await service.removeProduct(PRODUCT_ID, USER_ID);
      expect(result).toEqual({ deleted: true });
    });
  });

  // ── createOrder ────────────────────────────────────────────────────────────

  describe('createOrder', () => {
    const dto = {
      items: [{ productId: PRODUCT_ID, quantity: 2 }],
      email: 'buyer@example.com',
    };

    it('throws BadRequestException when items array is empty', async () => {
      await expect(service.createOrder(USER_ID, { items: [], email: 'x@y.com' })).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException when product not found', async () => {
      mockPrisma.product.findFirst.mockResolvedValue(null);
      await expect(service.createOrder(USER_ID, dto as any)).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when insufficient stock', async () => {
      mockPrisma.product.findFirst.mockResolvedValue({ ...mockProduct, stock: 1 });
      await expect(service.createOrder(USER_ID, { items: [{ productId: PRODUCT_ID, quantity: 5 }], email: 'x@y.com' })).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when duplicate productId line items combined exceed stock', async () => {
      // stock=10, two line items of 6 each individually pass a per-line check
      // but must be rejected once aggregated (6 + 6 = 12 > 10).
      mockPrisma.product.findFirst.mockResolvedValue({ ...mockProduct, stock: 10 });
      await expect(
        service.createOrder(USER_ID, {
          items: [
            { productId: PRODUCT_ID, quantity: 6 },
            { productId: PRODUCT_ID, quantity: 6 },
          ],
          email: 'x@y.com',
        } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('calculates fee split via resolveSplit(\'marketplace\', total) and creates order (D-02: vendor.govtLevyPct read directly, unrouted)', async () => {
      mockPrisma.product.findFirst.mockResolvedValue(mockProduct);
      mockSettlement.resolveSplit.mockResolvedValueOnce({ earnerPct: 0.90, ministryPct: 0, platformPct: 0.10 });
      mockPrisma.order.create.mockResolvedValue(mockOrder);
      mockPaystack.initiatePayment.mockResolvedValue({
        authorizationUrl: 'https://paystack.com/pay/abc',
        accessCode: 'abc',
        reference: PAYSTACK_REF,
      });

      const result = await service.createOrder(USER_ID, dto as any);

      // resolveSplit() is called with the computed order total, AFTER totalAmount
      // is derived from orderItems — mirrors the pre-migration read timing.
      expect(mockSettlement.resolveSplit).toHaveBeenCalledWith('marketplace', 7000);
      // marketplace.platform_fee_pct no longer resolved via platformConfig — resolveSplit() owns it now.
      expect(mockPrisma.platformConfig.findUnique).not.toHaveBeenCalled();
      expect(mockPrisma.order.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            totalAmount: 7000,      // 3500 × 2
            platformFee: 700,       // 7000 × 0.10
            govtLevy: 140,          // 7000 × 0.02 (vendor.govtLevyPct, read directly — D-02)
            vendorPayout: 6160,     // 7000 - 700 - 140
            paystackRef: expect.stringMatching(/^ISY-ORD-/),
          }),
        }),
      );
      expect(mockPaystack.initiatePayment).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'buyer@example.com',
          amountKobo: 700000,
          metadata: expect.objectContaining({ type: 'order_payment' }),
        }),
      );
      expect(result.payment.authorizationUrl).toBe('https://paystack.com/pay/abc');
    });

    it('defaults platform fee to 0 when resolveSplit resolves a null platformPct', async () => {
      mockPrisma.product.findFirst.mockResolvedValue({ ...mockProduct, stock: 10 });
      mockSettlement.resolveSplit.mockResolvedValueOnce({ earnerPct: 1, ministryPct: 0, platformPct: null });
      mockPrisma.order.create.mockResolvedValue(mockOrder);
      mockPaystack.initiatePayment.mockResolvedValue({ authorizationUrl: 'https://x', accessCode: 'a', reference: 'r' });

      await service.createOrder(USER_ID, dto as any);

      expect(mockPrisma.order.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ platformFee: 0 }),
        }),
      );
    });
  });

  // ── handleOrderPayment ────────────────────────────────────────────────────

  describe('handleOrderPayment', () => {
    it('returns early when order not found', async () => {
      mockPrisma.order.findUnique.mockResolvedValue(null);
      await service.handleOrderPayment({ reference: 'UNKNOWN' });
      expect(mockSettlement.settle).not.toHaveBeenCalled();
    });

    it('does not call settlementService.settle for a non-PENDING order (idempotency)', async () => {
      mockPrisma.order.findUnique.mockResolvedValueOnce({ ...mockOrder, status: 'PROCESSING' });
      await service.handleOrderPayment({ reference: PAYSTACK_REF });
      expect(mockSettlement.settle).not.toHaveBeenCalled();
    });

    it('settles vendor + Ministry via SettlementService and marks order PROCESSING on payment success', async () => {
      mockPrisma.order.findUnique
        .mockResolvedValueOnce({ ...mockOrder, status: 'PENDING' }) // handleOrderPayment query
        .mockResolvedValueOnce({ ...mockOrder, status: 'PROCESSING' }); // notifyOrderUpdate query
      mockPrisma.wallet.findUnique
        .mockResolvedValueOnce({ id: 'WAL-VENDOR' }) // vendorWallet
        .mockResolvedValueOnce({ id: 'WAL-BUYER' }); // buyerWallet
      mockPrisma.vendor.findUnique.mockResolvedValue(mockVendor);
      mockPrisma.user.findUnique.mockResolvedValue({ email: 'vendor@example.com', firstName: 'Vendor' });
      mockSendgrid.sendEmail.mockResolvedValue(undefined);

      await service.handleOrderPayment({ reference: PAYSTACK_REF });

      expect(mockSettlement.settle).toHaveBeenCalledTimes(1);
      const settleArgs = mockSettlement.settle.mock.calls[0][0];
      expect(settleArgs.amountKobo).toBe(Number(mockOrder.totalAmount) * 100);
      expect(settleArgs.recipients).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ tag: 'VENDOR', amountNgn: Number(mockOrder.vendorPayout) }),
          expect.objectContaining({ tag: 'MINISTRY', amountNgn: Number(mockOrder.govtLevy) }),
        ]),
      );
    });

    it('wires status flip and stock decrement into the onSettled callback', async () => {
      mockPrisma.order.findUnique
        .mockResolvedValueOnce({ ...mockOrder, status: 'PENDING' })
        .mockResolvedValueOnce({ ...mockOrder, status: 'PROCESSING' });
      mockPrisma.wallet.findUnique
        .mockResolvedValueOnce({ id: 'WAL-VENDOR' })
        .mockResolvedValueOnce({ id: 'WAL-BUYER' });
      mockPrisma.vendor.findUnique.mockResolvedValue(mockVendor);
      mockPrisma.user.findUnique.mockResolvedValue({ email: 'vendor@example.com', firstName: 'Vendor' });
      mockSendgrid.sendEmail.mockResolvedValue(undefined);

      await service.handleOrderPayment({ reference: PAYSTACK_REF });

      const mockTx = {
        order: { update: jest.fn().mockResolvedValue({}) },
        product: { update: jest.fn().mockResolvedValue({}) },
      };
      await mockSettlement.settle.mock.calls[0][0].onSettled(mockTx);

      expect(mockTx.order.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: ORDER_ID }, data: { status: 'PROCESSING' } }),
      );
      expect(mockTx.product.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: PRODUCT_ID } }),
      );
    });

    it('WR-04: does not re-notify the order update when settle() reports a REPLAYED duplicate delivery', async () => {
      mockPrisma.order.findUnique.mockResolvedValueOnce({ ...mockOrder, status: 'PENDING' });
      mockPrisma.wallet.findUnique
        .mockResolvedValueOnce({ id: 'WAL-VENDOR' })
        .mockResolvedValueOnce({ id: 'WAL-BUYER' });
      mockPrisma.vendor.findUnique.mockResolvedValue(mockVendor);
      mockSettlement.settle.mockResolvedValueOnce({
        status: 'REPLAYED',
        platformAmountNgn: 0,
        recipientCredits: [],
      });

      await service.handleOrderPayment({ reference: PAYSTACK_REF });

      expect(mockSettlement.settle).toHaveBeenCalledTimes(1);
      // notifyOrderUpdate's own order.findUnique lookup would be a 2nd call — it must
      // not happen on a replayed settlement.
      expect(mockPrisma.order.findUnique).toHaveBeenCalledTimes(1);
    });
  });

  // ── updateOrderStatus ──────────────────────────────────────────────────────

  describe('updateOrderStatus', () => {
    it('throws NotFoundException when order not found', async () => {
      mockPrisma.order.findFirst.mockResolvedValue(null);
      await expect(service.updateOrderStatus(ORDER_ID, 'SHIPPED', USER_ID)).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when actor is not the order vendor', async () => {
      mockPrisma.order.findFirst.mockResolvedValue({ ...mockOrder, status: 'PROCESSING' });
      mockPrisma.vendor.findUnique.mockResolvedValue({ ...mockVendor, id: 'other-vendor' });
      await expect(service.updateOrderStatus(ORDER_ID, 'SHIPPED', USER_ID)).rejects.toThrow(ForbiddenException);
    });

    it('throws BadRequestException for invalid status transition', async () => {
      mockPrisma.order.findFirst.mockResolvedValue({ ...mockOrder, status: 'PENDING' });
      mockPrisma.vendor.findUnique.mockResolvedValue(mockVendor);
      await expect(service.updateOrderStatus(ORDER_ID, 'SHIPPED', USER_ID)).rejects.toThrow(BadRequestException);
    });

    it('updates order status and sends notifications', async () => {
      mockPrisma.order.findFirst.mockResolvedValue({ ...mockOrder, status: 'PROCESSING' });
      mockPrisma.vendor.findUnique.mockResolvedValue(mockVendor);
      mockPrisma.order.update.mockResolvedValue({});
      mockPrisma.order.findUnique.mockResolvedValue({ ...mockOrder, status: 'SHIPPED' });
      mockPrisma.user.findUnique.mockResolvedValue({ email: 'v@example.com', firstName: 'V' });
      mockSendgrid.sendEmail.mockResolvedValue(undefined);

      const result = await service.updateOrderStatus(ORDER_ID, 'SHIPPED', USER_ID);
      expect(result.status).toBe('SHIPPED');
    });
  });
});
