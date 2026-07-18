import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { StaysService } from '../stays.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { PaystackService } from '../../../common/services/paystack.service';
import { S3Service } from '../../../common/services/s3.service';
import { SendgridService } from '../../../common/services/sendgrid.service';
import { ImageService } from '../../../common/services/image.service';
import { KafkaService } from '../../../kafka/kafka.service';
import { SettlementService } from '../../../common/services/settlement.service';
import { VisitorLogService } from '../../../common/services/visitor-log.service';

// ── Fixtures ───────────────────────────────────────────────────────────────

const USER_A = 'user-a-uuid-001';
const USER_B = 'user-b-uuid-002';
const BOOKING_ID = 'booking-uuid-001';
const PROP_ID = 'prop-uuid-001';

// Booking owned by USER_B — checkOut is 2 days in the past (past checkout required for review)
const mockBookingOwnedByB = {
  id: BOOKING_ID,
  userId: USER_B,
  status: 'CONFIRMED',
  reviewedAt: null,
  checkOut: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
  totalPrice: 10000,
  propertyId: PROP_ID,
};

// Property hosted by USER_B
const mockPropertyOwnedByB = {
  id: PROP_ID,
  hostId: USER_B,
  deletedAt: null,
};

// ── Mocks ─────────────────────────────────────────────────────────────────

const mockPrisma = {
  property: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
  booking: {
    findMany: jest.fn(), findFirst: jest.fn(), findUnique: jest.fn(),
    create: jest.fn(), update: jest.fn(), count: jest.fn(),
  },
  wallet: { findUnique: jest.fn() },
  transaction: { create: jest.fn() },
  user: { findUnique: jest.fn() },
  $transaction: jest.fn(),
  $queryRaw: jest.fn(),
};

const mockKafka = { emit: jest.fn().mockResolvedValue(undefined), consume: jest.fn().mockResolvedValue(undefined) };
const mockPaystack = { initiatePayment: jest.fn() };
const mockS3 = { upload: jest.fn() };
const mockSendgrid = { sendBookingConfirmation: jest.fn() };
const mockImage = { validateEventImage: jest.fn(), resizeEventCover: jest.fn() };
const mockSettlement = {
  settle: jest.fn().mockResolvedValue({ status: 'SETTLED', platformAmountNgn: 0, recipientCredits: [] }),
  resolveMinistryWallet: jest.fn().mockResolvedValue({ id: 'WAL-MINISTRY' }),
};
const mockVisitorLog = { record: jest.fn().mockResolvedValue(undefined) };

// ── Suite ─────────────────────────────────────────────────────────────────

describe('Stays isolation — createReview', () => {
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
      ],
    }).compile();

    service = module.get<StaysService>(StaysService);
  });

  // ── Test 1: USER_A cannot review a booking owned by USER_B ──────────────

  it('createReview rejects with ForbiddenException when booking is owned by USER_B and caller is USER_A', async () => {
    mockPrisma.booking.findFirst.mockResolvedValue(mockBookingOwnedByB);

    await expect(
      service.createReview(BOOKING_ID, USER_A, { rating: 5, comment: 'Test' } as any),
    ).rejects.toThrow(ForbiddenException);
  });

  // ── Test 2: USER_A cannot update a property hosted by USER_B ────────────

  it('updateProperty rejects with ForbiddenException when property is hosted by USER_B and caller is USER_A', async () => {
    mockPrisma.property.findFirst.mockResolvedValue(mockPropertyOwnedByB);

    await expect(
      service.updateProperty(PROP_ID, USER_A, {} as any),
    ).rejects.toThrow(ForbiddenException);
  });
});
