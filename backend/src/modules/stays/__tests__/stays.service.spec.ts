import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException, ForbiddenException, BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { StaysService } from '../stays.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { PaystackService } from '../../../common/services/paystack.service';
import { S3Service } from '../../../common/services/s3.service';
import { SendgridService } from '../../../common/services/sendgrid.service';
import { ImageService } from '../../../common/services/image.service';
import { KafkaService } from '../../../kafka/kafka.service';
import { SettlementService } from '../../../common/services/settlement.service';
import { VisitorLogService } from '../../../common/services/visitor-log.service';
import { RedisService } from '../../../redis/redis.service';

const mockKafka = { emit: jest.fn().mockResolvedValue(undefined), consume: jest.fn().mockResolvedValue(undefined) };

const mockSettlement = {
  settle: jest.fn().mockResolvedValue({ status: 'SETTLED', platformAmountNgn: 0, recipientCredits: [] }),
  resolveMinistryWallet: jest.fn().mockResolvedValue({ id: 'WAL-MINISTRY' }),
  resolveSplit: jest.fn().mockResolvedValue({ earnerPct: 0.95, ministryPct: 0.05, platformPct: null }),
};

const mockVisitorLog = { record: jest.fn().mockResolvedValue(undefined) };

const mockRedis = { setNx: jest.fn().mockResolvedValue(true) };

const HOST_ID = 'host-uuid-001';
const PROP_ID = 'prop-uuid-001';
const USER_ID = 'user-uuid-001';
const BOOKING_ID = 'booking-uuid-001';
const PAYSTACK_REF = 'ISY-STY-ABCDEF123456';

const mockProperty = {
  id: PROP_ID,
  hostId: HOST_ID,
  lgaId: 'lga-001',
  name: 'Abeokuta Villa',
  slug: 'abeokuta-villa-abc',
  type: 'VILLA',
  address: '1 Oke Padi Rd',
  pricePerNight: 15000,
  maxGuests: 4,
  amenities: ['WiFi', 'Pool'],
  isActive: true,
  imageUrls: [],
  deletedAt: null,
};

const futureCheckIn = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
const futureCheckOut = new Date(futureCheckIn.getTime() + 3 * 24 * 60 * 60 * 1000);

const mockBooking = {
  id: BOOKING_ID,
  propertyId: PROP_ID,
  userId: USER_ID,
  checkIn: futureCheckIn,
  checkOut: futureCheckOut,
  guests: 2,
  totalPrice: 45000,
  govtLevyPct: 0.05,
  status: 'CONFIRMED',
  paystackRef: PAYSTACK_REF,
  escrowReleasedAt: null,
  reviewedAt: null,
  deletedAt: null,
  property: { name: 'Abeokuta Villa', hostId: HOST_ID, lgaId: 'lga-001' },
  user: { email: 'guest@example.com', firstName: 'Ade', role: 'TOURIST' },
  metadata: {},
};

const mockPrisma = {
  property: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
  booking: {
    findMany: jest.fn(), findFirst: jest.fn(), findUnique: jest.fn(),
    create: jest.fn(), update: jest.fn(), count: jest.fn(),
  },
  wallet: { findUnique: jest.fn() },
  transaction: { create: jest.fn() },
  user: { findUnique: jest.fn() },
  platformConfig: { findUnique: jest.fn() },
  $transaction: jest.fn(),
  $queryRaw: jest.fn(),
};

const mockPaystack = { initiatePayment: jest.fn() };
const mockS3 = { upload: jest.fn() };
const mockSendgrid = { sendBookingConfirmation: jest.fn() };
const mockImage = { validateEventImage: jest.fn(), resizeEventCover: jest.fn() };

describe('StaysService', () => {
  let service: StaysService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StaysService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: PaystackService, useValue: mockPaystack },
        { provide: S3Service, useValue: mockS3 },
        { provide: SendgridService, useValue: mockSendgrid },
        { provide: ImageService, useValue: mockImage },
        { provide: KafkaService, useValue: mockKafka },
        { provide: SettlementService, useValue: mockSettlement },
        { provide: VisitorLogService, useValue: mockVisitorLog },
        { provide: RedisService, useValue: mockRedis },
      ],
    }).compile();

    service = module.get<StaysService>(StaysService);
  });

  // ── createProperty ────────────────────────────────────────────────────────

  describe('createProperty', () => {
    it('creates property with generated slug', async () => {
      mockPrisma.property.create.mockResolvedValue({ ...mockProperty });
      const dto = { lgaId: 'lga-001', name: 'Abeokuta Villa', type: 'VILLA', address: '1 Rd', pricePerNight: 15000, maxGuests: 4 };

      const result = await service.createProperty(HOST_ID, dto as any);

      expect(mockPrisma.property.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            hostId: HOST_ID,
            slug: expect.stringMatching(/^abeokuta-villa-/),
          }),
        }),
      );
      expect(result.id).toBe(PROP_ID);
    });
  });

  // ── findAllProperties ──────────────────────────────────────────────────────

  describe('findAllProperties', () => {
    it('applies filters and pagination', async () => {
      mockPrisma.property.findMany.mockResolvedValue([mockProperty]);
      const result = await service.findAllProperties({ lgaId: 'lga-001', page: 2, limit: 5 });
      expect(mockPrisma.property.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 5, take: 5 }),
      );
      expect(result).toHaveLength(1);
    });
  });

  // ── findPropertyById ───────────────────────────────────────────────────────

  describe('findPropertyById', () => {
    it('returns property when found', async () => {
      mockPrisma.property.findFirst.mockResolvedValue(mockProperty);
      const result = await service.findPropertyById(PROP_ID);
      expect(result.id).toBe(PROP_ID);
    });

    it('throws NotFoundException when not found', async () => {
      mockPrisma.property.findFirst.mockResolvedValue(null);
      await expect(service.findPropertyById('bad')).rejects.toThrow(NotFoundException);
    });
  });

  // ── updateProperty ─────────────────────────────────────────────────────────

  describe('updateProperty', () => {
    it('throws ForbiddenException when caller is not the host', async () => {
      mockPrisma.property.findFirst.mockResolvedValue(mockProperty);
      await expect(service.updateProperty(PROP_ID, 'wrong-host', {} as any)).rejects.toThrow(ForbiddenException);
    });

    it('updates when caller is host', async () => {
      mockPrisma.property.findFirst.mockResolvedValue(mockProperty);
      mockPrisma.property.update.mockResolvedValue({ ...mockProperty, maxGuests: 6 });
      const result = await service.updateProperty(PROP_ID, HOST_ID, { maxGuests: 6 } as any);
      expect(result.maxGuests).toBe(6);
    });
  });

  // ── uploadPropertyImage ────────────────────────────────────────────────────

  describe('uploadPropertyImage', () => {
    const mockFile = { buffer: Buffer.from('img'), mimetype: 'image/jpeg', size: 1024 } as any;

    it('stores .webp key and passes image/webp content type to s3', async () => {
      mockPrisma.property.findFirst.mockResolvedValue(mockProperty);
      mockImage.resizeEventCover.mockResolvedValue({ buffer: Buffer.from('webp'), contentType: 'image/webp' });
      mockS3.upload.mockResolvedValue('https://cdn.example.com/properties/prop-001/img.webp');

      const result = await service.uploadPropertyImage(PROP_ID, HOST_ID, mockFile);

      expect(mockImage.resizeEventCover).toHaveBeenCalledWith(mockFile.buffer);
      expect(mockS3.upload).toHaveBeenCalledWith(
        expect.stringMatching(/^properties\/.*\.webp$/),
        expect.any(Buffer),
        'image/webp',
      );
      expect(result.url).toContain('.webp');
    });

    it('throws NotFoundException when property not found', async () => {
      mockPrisma.property.findFirst.mockResolvedValue(null);
      await expect(service.uploadPropertyImage('bad', HOST_ID, mockFile)).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when caller is not the host', async () => {
      mockPrisma.property.findFirst.mockResolvedValue(mockProperty);
      await expect(service.uploadPropertyImage(PROP_ID, 'wrong-host', mockFile)).rejects.toThrow(ForbiddenException);
    });
  });

  // ── getAvailability ────────────────────────────────────────────────────────

  describe('getAvailability', () => {
    it('returns booked ranges for next 90 days', async () => {
      const ranges = [{ checkIn: futureCheckIn, checkOut: futureCheckOut }];
      mockPrisma.booking.findMany.mockResolvedValue(ranges);
      const result = await service.getAvailability(PROP_ID);
      expect(result).toEqual(ranges);
    });
  });

  // ── createBooking ──────────────────────────────────────────────────────────

  describe('createBooking', () => {
    const dto = {
      checkIn: futureCheckIn.toISOString(),
      checkOut: futureCheckOut.toISOString(),
      guests: 2,
      email: 'guest@example.com',
    };

    it('throws NotFoundException when property not found', async () => {
      mockPrisma.property.findFirst.mockResolvedValue(null);
      await expect(service.createBooking(USER_ID, PROP_ID, dto as any)).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when guests exceed maxGuests', async () => {
      mockPrisma.property.findFirst.mockResolvedValue({ ...mockProperty, maxGuests: 1 });
      await expect(service.createBooking(USER_ID, PROP_ID, { ...dto, guests: 5 } as any)).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when checkIn >= checkOut', async () => {
      mockPrisma.property.findFirst.mockResolvedValue(mockProperty);
      const sameDay = futureCheckIn.toISOString();
      await expect(
        service.createBooking(USER_ID, PROP_ID, { ...dto, checkOut: sameDay } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('creates PENDING booking and initiates Paystack payment when no conflicts', async () => {
      mockPrisma.property.findFirst.mockResolvedValue(mockProperty);
      mockPrisma.$transaction.mockImplementation(async (fn) => {
        // Simulate the interactive transaction
        const txMock = {
          $queryRaw: jest.fn().mockResolvedValue([]), // no conflicts
          booking: { create: jest.fn().mockResolvedValue({ ...mockBooking, status: 'PENDING' }) },
        };
        return fn(txMock);
      });
      mockPaystack.initiatePayment.mockResolvedValue({
        authorizationUrl: 'https://paystack.com/pay/xyz',
        accessCode: 'xyz',
        reference: PAYSTACK_REF,
      });

      const result = await service.createBooking(USER_ID, PROP_ID, dto as any);

      expect(result.booking.status).toBe('PENDING');
      expect(mockPaystack.initiatePayment).toHaveBeenCalledWith(
        expect.objectContaining({
          amountKobo: 45000 * 100,
          metadata: expect.objectContaining({ type: 'stay_booking' }),
        }),
      );
    });

    it('throws ConflictException when dates overlap', async () => {
      mockPrisma.property.findFirst.mockResolvedValue(mockProperty);
      mockPrisma.$transaction.mockImplementation(async (fn) => {
        const txMock = {
          $queryRaw: jest.fn().mockResolvedValue([{ id: BOOKING_ID }]), // conflict
          booking: { create: jest.fn() },
        };
        return fn(txMock);
      });

      await expect(service.createBooking(USER_ID, PROP_ID, dto as any)).rejects.toThrow(ConflictException);
    });

    it('snapshots govtLevyPct from resolveSplit(\'stays\', totalPrice) onto the created booking', async () => {
      mockPrisma.property.findFirst.mockResolvedValue(mockProperty);
      mockSettlement.resolveSplit.mockResolvedValueOnce({ earnerPct: 0.95, ministryPct: 0.05, platformPct: null });
      let createData: any;
      mockPrisma.$transaction.mockImplementation(async (fn) => {
        const txMock = {
          $queryRaw: jest.fn().mockResolvedValue([]),
          booking: {
            create: jest.fn().mockImplementation((args) => {
              createData = args.data;
              return { ...mockBooking, status: 'PENDING' };
            }),
          },
        };
        return fn(txMock);
      });
      mockPaystack.initiatePayment.mockResolvedValue({
        authorizationUrl: 'https://paystack.com/pay/xyz',
        accessCode: 'xyz',
        reference: PAYSTACK_REF,
      });

      await service.createBooking(USER_ID, PROP_ID, dto as any);

      // totalPrice = pricePerNight(15000) × nights(3) = 45000, computed BEFORE resolveSplit() is called
      expect(mockSettlement.resolveSplit).toHaveBeenCalledWith('stays', 45000);
      expect(mockPrisma.platformConfig.findUnique).not.toHaveBeenCalled();
      expect(createData.govtLevyPct).toBe(0.05);
    });

    it('config changed mid-escrow-hold does NOT retroactively affect an already-created booking (D-05)', async () => {
      mockPrisma.property.findFirst.mockResolvedValue(mockProperty);
      // Booking created when ministryPct = 0.05
      mockSettlement.resolveSplit.mockResolvedValueOnce({ earnerPct: 0.95, ministryPct: 0.05, platformPct: null });
      let createData: any;
      mockPrisma.$transaction.mockImplementation(async (fn) => {
        const txMock = {
          $queryRaw: jest.fn().mockResolvedValue([]),
          booking: {
            create: jest.fn().mockImplementation((args) => {
              createData = args.data;
              return { ...mockBooking, status: 'PENDING', govtLevyPct: args.data.govtLevyPct };
            }),
          },
        };
        return fn(txMock);
      });
      mockPaystack.initiatePayment.mockResolvedValue({
        authorizationUrl: 'https://paystack.com/pay/xyz',
        accessCode: 'xyz',
        reference: PAYSTACK_REF,
      });

      await service.createBooking(USER_ID, PROP_ID, dto as any);
      expect(createData.govtLevyPct).toBe(0.05);

      // A SettlementSplitTier update (simulated) now changes the module's active tier
      // to ministryPct = 0.08 — resolveSplit() would return the new value if called again.
      mockSettlement.resolveSplit.mockResolvedValueOnce({ earnerPct: 0.92, ministryPct: 0.08, platformPct: null });

      // releaseEscrow() runs for the already-created booking — it must use the booking's
      // STORED govtLevyPct (0.05), never re-resolve the split.
      const dueBooking = {
        ...mockBooking,
        totalPrice: 45000,
        govtLevyPct: createData.govtLevyPct, // stored value from creation time
        property: { hostId: HOST_ID },
      };
      mockPrisma.booking.findMany.mockResolvedValue([dueBooking]);
      mockPrisma.wallet.findUnique.mockResolvedValue({ id: 'wallet-host-001', userId: HOST_ID, balance: 10000 });

      await service.releaseEscrow();

      // resolveSplit() must NOT have been called again by releaseEscrow()
      expect(mockSettlement.resolveSplit).toHaveBeenCalledTimes(1);
      const settleCall = mockSettlement.settle.mock.calls[0][0];
      const ministryRecipient = settleCall.recipients.find((r: any) => r.tag === 'MINISTRY');
      // 45000 × 0.05 (stored) = 2250 — NOT 45000 × 0.08 (new config) = 3600
      expect(ministryRecipient.amountNgn).toBe(2250);
    });
  });

  // ── handleStayPayment ──────────────────────────────────────────────────────

  describe('handleStayPayment', () => {
    it('returns early when booking not found', async () => {
      mockPrisma.booking.findUnique.mockResolvedValue(null);
      await service.handleStayPayment({ reference: 'UNKNOWN' });
      expect(mockPrisma.booking.update).not.toHaveBeenCalled();
    });

    it('confirms booking and notifies guest and host', async () => {
      mockPrisma.booking.findUnique.mockResolvedValue({ ...mockBooking, status: 'PENDING' });
      mockPrisma.booking.update.mockResolvedValue({ ...mockBooking, status: 'CONFIRMED' });
      mockPrisma.user.findUnique.mockResolvedValue({ email: 'host@example.com', firstName: 'Host' });
      mockSendgrid.sendBookingConfirmation.mockResolvedValue(undefined);

      await service.handleStayPayment({ reference: PAYSTACK_REF });

      expect(mockPrisma.booking.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'CONFIRMED' } }),
      );
      expect(mockSendgrid.sendBookingConfirmation).toHaveBeenCalledTimes(2);
    });

    it('returns early when booking already confirmed', async () => {
      mockPrisma.booking.findUnique.mockResolvedValue({ ...mockBooking, status: 'CONFIRMED' });
      await service.handleStayPayment({ reference: PAYSTACK_REF });
      expect(mockPrisma.booking.update).not.toHaveBeenCalled();
    });

    it('D-01/MIN-02: writes a future-dated VisitorLog row exactly once on confirmation', async () => {
      mockPrisma.booking.findUnique.mockResolvedValue({ ...mockBooking, status: 'PENDING' });
      mockPrisma.booking.update.mockResolvedValue({ ...mockBooking, status: 'CONFIRMED' });
      mockPrisma.user.findUnique.mockResolvedValue({ email: 'host@example.com', firstName: 'Host' });
      mockSendgrid.sendBookingConfirmation.mockResolvedValue(undefined);

      await service.handleStayPayment({ reference: PAYSTACK_REF });

      expect(mockVisitorLog.record).toHaveBeenCalledTimes(1);
      expect(mockVisitorLog.record).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceType: 'STAY',
          sourceId: BOOKING_ID,
          lgaId: 'lga-001',
          visitedAt: mockBooking.checkIn,
        }),
      );
    });

    it('still sends guest/host confirmation emails when VisitorLogService.record() rejects', async () => {
      mockPrisma.booking.findUnique.mockResolvedValue({ ...mockBooking, status: 'PENDING' });
      mockPrisma.booking.update.mockResolvedValue({ ...mockBooking, status: 'CONFIRMED' });
      mockPrisma.user.findUnique.mockResolvedValue({ email: 'host@example.com', firstName: 'Host' });
      mockSendgrid.sendBookingConfirmation.mockResolvedValue(undefined);
      mockVisitorLog.record.mockRejectedValueOnce(new Error('db down'));

      await service.handleStayPayment({ reference: PAYSTACK_REF });

      expect(mockSendgrid.sendBookingConfirmation).toHaveBeenCalledTimes(2);
    });
  });

  // ── releaseEscrow ──────────────────────────────────────────────────────────

  describe('releaseEscrow', () => {
    const dueBooking = {
      ...mockBooking,
      totalPrice: 45000,
      govtLevyPct: 0.05,
      property: { hostId: HOST_ID },
    };
    const hostWallet = { id: 'wallet-host-001', userId: HOST_ID, balance: 10000 };

    it('SETTLE-05 regression: settles host at 42750 (NOT 100% of totalPrice) and Ministry at 2250 via a single SettlementService.settle call, gateway INTERNAL, no buyerWalletId', async () => {
      mockPrisma.booking.findMany.mockResolvedValue([dueBooking]);
      mockPrisma.wallet.findUnique.mockResolvedValue(hostWallet);

      await service.releaseEscrow();

      expect(mockSettlement.settle).toHaveBeenCalledTimes(1);
      const call = mockSettlement.settle.mock.calls[0][0];
      expect(call.gateway).toBe('INTERNAL');
      expect(call.buyerWalletId).toBeUndefined();

      const hostRecipient = call.recipients.find((r: any) => r.tag === 'HOST');
      const ministryRecipient = call.recipients.find((r: any) => r.tag === 'MINISTRY');
      expect(hostRecipient.amountNgn).toBe(42750);
      expect(hostRecipient.amountNgn).toBeLessThan(45000);
      expect(ministryRecipient.amountNgn).toBe(2250);
    });

    it('skips bookings with no resolvable host wallet without calling settle', async () => {
      mockPrisma.booking.findMany.mockResolvedValue([dueBooking]);
      mockPrisma.wallet.findUnique.mockResolvedValue(null);

      await service.releaseEscrow();

      expect(mockSettlement.settle).not.toHaveBeenCalled();
    });

    it('invokes onSettled callback which flips escrowReleasedAt on the booking', async () => {
      mockPrisma.booking.findMany.mockResolvedValue([dueBooking]);
      mockPrisma.wallet.findUnique.mockResolvedValue(hostWallet);
      const txBookingUpdate = jest.fn().mockResolvedValue(undefined);
      mockSettlement.settle.mockImplementationOnce(async (input: any) => {
        await input.onSettled?.({ booking: { update: txBookingUpdate } });
        return { status: 'SETTLED', platformAmountNgn: 0, recipientCredits: [] };
      });

      await service.releaseEscrow();

      expect(txBookingUpdate).toHaveBeenCalledWith({
        where: { id: dueBooking.id },
        data: { escrowReleasedAt: expect.any(Date) },
      });
    });

    it('WR-05: escrow reference carries 16 hex chars of entropy, not a truncated 8-char slice', async () => {
      const uuidBooking = {
        ...dueBooking,
        id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      };
      mockPrisma.booking.findMany.mockResolvedValue([uuidBooking]);
      mockPrisma.wallet.findUnique.mockResolvedValue(hostWallet);

      await service.releaseEscrow();

      const call = mockSettlement.settle.mock.calls[0][0];
      expect(call.reference).toBe('ISY-ESC-A1B2C3D4E5F67890');
      expect(call.reference.replace('ISY-ESC-', '')).toHaveLength(16);
    });

    it('acquires cron-lock:releaseEscrow (TTL 3300) and proceeds with existing behavior when the lock is granted', async () => {
      mockPrisma.booking.findMany.mockResolvedValue([dueBooking]);
      mockPrisma.wallet.findUnique.mockResolvedValue(hostWallet);

      await service.releaseEscrow();

      expect(mockRedis.setNx).toHaveBeenCalledWith('cron-lock:releaseEscrow', '1', 3300);
      expect(mockPrisma.booking.findMany).toHaveBeenCalled();
    });

    it('skips the tick without querying bookings when the lock is held by another replica', async () => {
      mockRedis.setNx.mockResolvedValueOnce(false);

      await service.releaseEscrow();

      expect(mockRedis.setNx).toHaveBeenCalledWith('cron-lock:releaseEscrow', '1', 3300);
      expect(mockPrisma.booking.findMany).not.toHaveBeenCalled();
    });
  });

  // ── createReview ───────────────────────────────────────────────────────────

  describe('createReview', () => {
    const pastCheckOut = new Date(Date.now() - 48 * 60 * 60 * 1000); // 48h ago

    it('throws NotFoundException when booking not found', async () => {
      mockPrisma.booking.findFirst.mockResolvedValue(null);
      await expect(service.createReview(BOOKING_ID, USER_ID, { rating: 5 })).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when caller is not booking owner', async () => {
      mockPrisma.booking.findFirst.mockResolvedValue({ ...mockBooking, checkOut: pastCheckOut });
      await expect(service.createReview(BOOKING_ID, 'wrong-user', { rating: 5 })).rejects.toThrow(ForbiddenException);
    });

    it('throws ConflictException when already reviewed', async () => {
      mockPrisma.booking.findFirst.mockResolvedValue({
        ...mockBooking,
        checkOut: pastCheckOut,
        reviewedAt: new Date(),
      });
      await expect(service.createReview(BOOKING_ID, USER_ID, { rating: 5 })).rejects.toThrow(ConflictException);
    });

    it('throws BadRequestException when less than 24h since checkout', async () => {
      const recentCheckout = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2h ago
      mockPrisma.booking.findFirst.mockResolvedValue({
        ...mockBooking,
        status: 'CONFIRMED',
        checkOut: recentCheckout,
      });
      await expect(service.createReview(BOOKING_ID, USER_ID, { rating: 4 })).rejects.toThrow(BadRequestException);
    });

    it('creates review after 24h from checkout', async () => {
      mockPrisma.booking.findFirst.mockResolvedValue({
        ...mockBooking,
        checkOut: pastCheckOut,
        status: 'CONFIRMED',
      });
      mockPrisma.booking.update.mockResolvedValue({ ...mockBooking, reviewRating: 5, reviewedAt: new Date() });

      const result = await service.createReview(BOOKING_ID, USER_ID, { rating: 5, comment: 'Great!' });

      expect(mockPrisma.booking.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ reviewRating: 5, reviewComment: 'Great!' }),
        }),
      );
      expect(result.reviewRating).toBe(5);
    });
  });
});
