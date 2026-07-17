import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException, BadRequestException, ConflictException,
} from '@nestjs/common';
import { StudioService } from '../studio.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { PaystackService } from '../../../common/services/paystack.service';
import { S3Service } from '../../../common/services/s3.service';
import { SendgridService } from '../../../common/services/sendgrid.service';
import { SettlementService } from '../../../common/services/settlement.service';
import { KafkaService } from '../../../kafka/kafka.service';

const mockKafka = { emit: jest.fn().mockResolvedValue(undefined), consume: jest.fn().mockResolvedValue(undefined) };

const mockSettlement = {
  settle: jest.fn().mockResolvedValue({ status: 'SETTLED', platformAmountNgn: 0, recipientCredits: [] }),
  resolveMinistryWallet: jest.fn().mockResolvedValue({ id: 'WAL-MINISTRY' }),
};

const USER_ID = 'user-uuid-001';
const SLOT_ID = 'slot-uuid-001';
const BOOKING_ID = 'booking-uuid-001';
const CONTENT_ID = 'content-uuid-001';
const PAYSTACK_REF = 'ISY-SBO-ABCDEF123456';

const futureStart = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
const futureEnd = new Date(futureStart.getTime() + 2 * 60 * 60 * 1000);

const mockSlot = {
  id: SLOT_ID,
  name: 'Recording Studio A',
  type: 'RECORDING',
  pricePerHour: 10000,
  durationMinutes: 60,
  capacity: 1,
  isActive: true,
  isGovernmentPriority: false,
  deletedAt: null,
};

const mockGovSlot = { ...mockSlot, id: 'gov-slot-001', isGovernmentPriority: true };

const mockBooking = {
  id: BOOKING_ID,
  studioSlotId: SLOT_ID,
  userId: USER_ID,
  startTime: futureStart,
  endTime: futureEnd,
  totalPrice: 20000,
  paystackRef: PAYSTACK_REF,
  status: 'PENDING',
  deletedAt: null,
  studioSlot: { name: 'Recording Studio A', type: 'RECORDING' },
  user: { email: 'creative@example.com', firstName: 'Ade' },
};

const mockContent = {
  id: CONTENT_ID,
  uploadedById: USER_ID,
  filename: 'track.mp3',
  originalName: 'My Track.mp3',
  mimeType: 'audio/mpeg',
  size: 1024 * 1024,
  url: 'https://cdn.iseyaa.gov.ng/studio/track.mp3',
  s3Key: 'studio/content/user/track.mp3',
  type: 'AUDIO',
  isPublished: false,
  deletedAt: null,
};

const mockPrisma = {
  studioSlot: { findMany: jest.fn(), findFirst: jest.fn() },
  studioBooking: {
    findUnique: jest.fn(), create: jest.fn(), update: jest.fn(),
  },
  mediaContent: {
    findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn(),
    update: jest.fn(), count: jest.fn(),
  },
  platformConfig: { findUnique: jest.fn() },
  wallet: { findUnique: jest.fn() },
  $transaction: jest.fn(),
  $queryRaw: jest.fn(),
};

const mockPaystack = { initiatePayment: jest.fn() };
const mockS3 = { upload: jest.fn() };
const mockSendgrid = { sendStudioBookingConfirmation: jest.fn() };

describe('StudioService', () => {
  let service: StudioService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StudioService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: PaystackService, useValue: mockPaystack },
        { provide: S3Service, useValue: mockS3 },
        { provide: SendgridService, useValue: mockSendgrid },
        { provide: KafkaService, useValue: mockKafka },
        { provide: SettlementService, useValue: mockSettlement },
      ],
    }).compile();

    service = module.get<StudioService>(StudioService);
  });

  // ── findSlots ──────────────────────────────────────────────────────────────

  describe('findSlots', () => {
    it('excludes gov-priority slots for non-admin users', async () => {
      mockPrisma.studioSlot.findMany.mockResolvedValue([mockSlot]);
      await service.findSlots('CITIZEN');
      expect(mockPrisma.studioSlot.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ isGovernmentPriority: false }),
        }),
      );
    });

    it('includes gov-priority slots for LGA_ADMIN', async () => {
      mockPrisma.studioSlot.findMany.mockResolvedValue([mockSlot, mockGovSlot]);
      await service.findSlots('LGA_ADMIN');
      // isGovernmentPriority filter should NOT be present
      expect(mockPrisma.studioSlot.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.not.objectContaining({ isGovernmentPriority: false }),
        }),
      );
    });

    it('includes gov-priority slots for SUPER_ADMIN', async () => {
      mockPrisma.studioSlot.findMany.mockResolvedValue([mockSlot, mockGovSlot]);
      await service.findSlots('SUPER_ADMIN');
      expect(mockPrisma.studioSlot.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.not.objectContaining({ isGovernmentPriority: false }),
        }),
      );
    });
  });

  // ── createBooking ──────────────────────────────────────────────────────────

  describe('createBooking', () => {
    const dto = {
      slotId: SLOT_ID,
      startTime: futureStart.toISOString(),
      durationHours: 2,
      email: 'creative@example.com',
    };

    it('throws NotFoundException when slot not found', async () => {
      mockPrisma.studioSlot.findFirst.mockResolvedValue(null);
      await expect(service.createBooking(USER_ID, dto as any)).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when start time is in the past', async () => {
      mockPrisma.studioSlot.findFirst.mockResolvedValue(mockSlot);
      const pastDto = { ...dto, startTime: new Date(Date.now() - 3600000).toISOString() };
      await expect(service.createBooking(USER_ID, pastDto as any)).rejects.toThrow(BadRequestException);
    });

    it('creates PENDING booking and initiates payment when slot is available', async () => {
      mockPrisma.studioSlot.findFirst.mockResolvedValue(mockSlot);
      mockPrisma.$transaction.mockImplementation(async (fn) => {
        const txMock = {
          $queryRaw: jest.fn().mockResolvedValue([]),
          studioBooking: { create: jest.fn().mockResolvedValue({ ...mockBooking, status: 'PENDING' }) },
        };
        return fn(txMock);
      });
      mockPaystack.initiatePayment.mockResolvedValue({
        authorizationUrl: 'https://paystack.com/pay/abc',
        accessCode: 'abc',
        reference: PAYSTACK_REF,
      });

      const result = await service.createBooking(USER_ID, dto as any);

      expect(result.booking.status).toBe('PENDING');
      expect(mockPaystack.initiatePayment).toHaveBeenCalledWith(
        expect.objectContaining({
          amountKobo: 20000 * 100,
          metadata: expect.objectContaining({ type: 'studio_booking' }),
        }),
      );
    });

    it('throws ConflictException when slot has time conflict', async () => {
      mockPrisma.studioSlot.findFirst.mockResolvedValue(mockSlot);
      mockPrisma.$transaction.mockImplementation(async (fn) => {
        const txMock = {
          $queryRaw: jest.fn().mockResolvedValue([{ id: BOOKING_ID }]),
          studioBooking: { create: jest.fn() },
        };
        return fn(txMock);
      });

      await expect(service.createBooking(USER_ID, dto as any)).rejects.toThrow(ConflictException);
    });
  });

  // ── handleStudioPayment ────────────────────────────────────────────────────

  describe('handleStudioPayment', () => {
    it('returns early when booking not found', async () => {
      mockPrisma.studioBooking.findUnique.mockResolvedValue(null);
      await service.handleStudioPayment({ reference: 'UNKNOWN' });
      expect(mockSettlement.settle).not.toHaveBeenCalled();
      expect(mockPrisma.studioBooking.update).not.toHaveBeenCalled();
    });

    it('settles Ministry-only (2-way, D-10) with configured govt_levy_pct and sends confirmation email', async () => {
      mockPrisma.studioBooking.findUnique.mockResolvedValue({ ...mockBooking, status: 'PENDING' });
      mockPrisma.platformConfig.findUnique.mockImplementation(({ where: { key } }: any) => {
        if (key === 'studio.govt_levy_pct') return Promise.resolve({ value: 0.05 });
        if (key === 'studio.platform_fee_pct') return Promise.resolve({ value: 0.10 });
        return Promise.resolve(null);
      });
      mockPrisma.wallet.findUnique.mockResolvedValue({ id: 'WAL-BUYER' });
      mockSendgrid.sendStudioBookingConfirmation.mockResolvedValue(undefined);

      await service.handleStudioPayment({ reference: PAYSTACK_REF });

      expect(mockSettlement.settle).toHaveBeenCalledTimes(1);
      const settleArgs = mockSettlement.settle.mock.calls[0][0];
      expect(settleArgs.recipients).toHaveLength(1);
      expect(settleArgs.recipients[0].tag).toBe('MINISTRY');
      expect(settleArgs.recipients[0].amountNgn).toBe(mockBooking.totalPrice * 0.05);
      // Proves the 2-way-only shape (D-10) — no vendor/owner recipient present.
      expect(settleArgs.recipients.some((r: any) => ['VENDOR', 'HOST', 'OWNER'].includes(r.tag))).toBe(false);

      expect(mockSendgrid.sendStudioBookingConfirmation).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'creative@example.com',
          slotName: 'Recording Studio A',
        }),
      );
    });

    it('falls back to 0.05 govt_levy_pct when PlatformConfig key is unset', async () => {
      mockPrisma.studioBooking.findUnique.mockResolvedValue({ ...mockBooking, status: 'PENDING' });
      mockPrisma.platformConfig.findUnique.mockResolvedValue(null);
      mockPrisma.wallet.findUnique.mockResolvedValue({ id: 'WAL-BUYER' });
      mockSendgrid.sendStudioBookingConfirmation.mockResolvedValue(undefined);

      await service.handleStudioPayment({ reference: PAYSTACK_REF });

      const settleArgs = mockSettlement.settle.mock.calls[0][0];
      expect(settleArgs.recipients).toHaveLength(1);
      expect(settleArgs.recipients[0].amountNgn).toBe(mockBooking.totalPrice * 0.05);
    });

    it('returns early when booking is already confirmed', async () => {
      mockPrisma.studioBooking.findUnique.mockResolvedValue({ ...mockBooking, status: 'CONFIRMED' });
      await service.handleStudioPayment({ reference: PAYSTACK_REF });
      expect(mockSettlement.settle).not.toHaveBeenCalled();
      expect(mockPrisma.studioBooking.update).not.toHaveBeenCalled();
    });

    it('transitions booking to CONFIRMED inside the onSettled callback', async () => {
      mockPrisma.studioBooking.findUnique.mockResolvedValue({ ...mockBooking, status: 'PENDING' });
      mockPrisma.platformConfig.findUnique.mockResolvedValue(null);
      mockPrisma.wallet.findUnique.mockResolvedValue({ id: 'WAL-BUYER' });
      mockSendgrid.sendStudioBookingConfirmation.mockResolvedValue(undefined);

      await service.handleStudioPayment({ reference: PAYSTACK_REF });

      const settleArgs = mockSettlement.settle.mock.calls[0][0];
      const txStudioBookingUpdate = jest.fn().mockResolvedValue({});
      const tx = { studioBooking: { update: txStudioBookingUpdate } };

      await settleArgs.onSettled(tx);

      expect(txStudioBookingUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: BOOKING_ID },
          data: { status: 'CONFIRMED' },
        }),
      );
    });
  });

  // ── uploadContent ──────────────────────────────────────────────────────────

  describe('uploadContent', () => {
    const mockFile = {
      originalname: 'My Track.mp3',
      mimetype: 'audio/mpeg',
      size: 1024 * 1024,
      buffer: Buffer.from('audio data'),
    } as Express.Multer.File;

    it('throws BadRequestException when no file provided', async () => {
      await expect(service.uploadContent(USER_ID, null as any, {})).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException for invalid file type', async () => {
      const badFile = { ...mockFile, mimetype: 'image/jpeg' } as Express.Multer.File;
      await expect(service.uploadContent(USER_ID, badFile, {})).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when file exceeds size limit', async () => {
      const bigFile = { ...mockFile, size: 600 * 1024 * 1024 } as Express.Multer.File;
      await expect(service.uploadContent(USER_ID, bigFile, {})).rejects.toThrow(BadRequestException);
    });

    it('uploads audio to S3 and creates MediaContent record', async () => {
      mockS3.upload.mockResolvedValue('https://cdn.iseyaa.gov.ng/studio/track.mp3');
      mockPrisma.mediaContent.create.mockResolvedValue(mockContent);

      const result = await service.uploadContent(USER_ID, mockFile, { title: 'My Track' });

      expect(mockS3.upload).toHaveBeenCalledWith(
        expect.stringMatching(/^studio\/content\//),
        expect.any(Buffer),
        'audio/mpeg',
      );
      expect(mockPrisma.mediaContent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            uploadedById: USER_ID,
            type: 'AUDIO',
            isPublished: false,
            title: 'My Track',
          }),
        }),
      );
      expect(result.id).toBe(CONTENT_ID);
    });

    it('uploads video to S3 and sets type VIDEO', async () => {
      const videoFile = { ...mockFile, originalname: 'clip.mp4', mimetype: 'video/mp4' } as Express.Multer.File;
      mockS3.upload.mockResolvedValue('https://cdn.iseyaa.gov.ng/studio/clip.mp4');
      mockPrisma.mediaContent.create.mockResolvedValue({ ...mockContent, type: 'VIDEO' });

      await service.uploadContent(USER_ID, videoFile, {});

      expect(mockPrisma.mediaContent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ type: 'VIDEO' }),
        }),
      );
    });
  });

  // ── getFeed ────────────────────────────────────────────────────────────────

  describe('getFeed', () => {
    it('returns paginated published content newest first', async () => {
      mockPrisma.mediaContent.findMany.mockResolvedValue([mockContent]);
      mockPrisma.mediaContent.count.mockResolvedValue(1);

      const result = await service.getFeed(1, 10);

      expect(mockPrisma.mediaContent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { deletedAt: null, isPublished: true },
          orderBy: { createdAt: 'desc' },
          skip: 0,
          take: 10,
        }),
      );
      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
    });
  });
});
