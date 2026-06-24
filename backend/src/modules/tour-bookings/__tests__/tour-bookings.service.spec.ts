import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  TourBookingService,
  applyBulkDiscount,
  isBlockedDate,
  materializeItinerary,
} from '../tour-bookings.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { PaystackService } from '../../../common/services/paystack.service';
import { ReferenceService } from '../../../common/services/reference.service';
import { TourPackageService } from '../../tour-packages/tour-packages.service';

// ── Fixtures ────────────────────────────────────────────────────────────────

const ACTOR_USER_ID = 'user-uuid-001';
const SECOND_PASSENGER_ID = 'user-uuid-002';
const PACKAGE_ID = 'pkg-uuid-001';
const TOUR_GUIDE_ID = 'guide-uuid-001';
const BOOKING_ID = 'booking-uuid-001';
const ITINERARY_ID = 'itin-uuid-001';
const EVENT_ID = 'event-uuid-001';

/** A date safely in the future, regardless of when the test runs. */
const FUTURE_DATE = '2099-07-15'; // Wednesday in UTC (getUTCDay → 3)
const PAST_DATE = '2000-01-01';

const baseApprovedGuide = {
  id: TOUR_GUIDE_ID,
  status: 'APPROVED' as const,
  availability: { blockedDates: [], weeklyOffDays: [] },
};

const basePackage = {
  id: PACKAGE_ID,
  slug: 'olumo-rock',
  name: 'Olumo Rock Heritage',
  status: 'APPROVED' as const,
  tourGuideId: TOUR_GUIDE_ID,
  price: 10000,
  durationHours: 6,
  maxGroupSize: 40,
  attractionIds: ['attr-1'],
  propertyId: null as string | null,
  eventIds: [] as string[],
  itineraryTemplate: [
    { hour: 0, title: 'Pickup', description: 'Lafenwa' },
    { hour: 2, title: 'Summit', description: 'Olumo Rock' },
  ],
  settlementSplit: [
    { vendorType: 'GUIDE', vendorId: TOUR_GUIDE_ID, percentage: 70 },
  ],
};

const baseDto = () => ({
  tourPackageId: PACKAGE_ID,
  tourDate: FUTURE_DATE,
  passengerCount: 2,
  email: 'aisha@example.com',
});

// ── Mocks ───────────────────────────────────────────────────────────────────

const mockPrisma: any = {
  tourGuide: { findUnique: jest.fn() },
  event: { findMany: jest.fn() },
  platformConfig: { findUnique: jest.fn() },
  tourBooking: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  itinerary: { delete: jest.fn() },
  wallet: { update: jest.fn() }, // assert NEVER called
  transaction: { create: jest.fn() }, // assert NEVER called with type CREDIT
  $transaction: jest.fn(),
};

const mockPaystack: any = { initiatePayment: jest.fn() };
const mockReference: any = { generate: jest.fn() };
const mockTourPackages: any = { findByIdInternal: jest.fn() };

// ── Helper to set up the $transaction callback to mimic tx.itinerary / tx.tourBooking ──
function wireTxnSuccess(opts: { bookingOverrides?: Partial<any> } = {}) {
  mockPrisma.$transaction.mockImplementation(async (cb: any) => {
    if (typeof cb === 'function') {
      const tx = {
        itinerary: {
          create: jest.fn(async ({ data }: any) => ({ id: ITINERARY_ID, items: data.items })),
        },
        tourBooking: {
          create: jest.fn(async ({ data }: any) => ({
            id: BOOKING_ID,
            ...data,
            ...(opts.bookingOverrides ?? {}),
          })),
        },
      };
      return cb(tx);
    }
    // For array-form $transaction (rollback path)
    return Promise.all(cb);
  });
}

describe('TourBookingService', () => {
  let service: TourBookingService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TourBookingService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: PaystackService, useValue: mockPaystack },
        { provide: ReferenceService, useValue: mockReference },
        { provide: TourPackageService, useValue: mockTourPackages },
      ],
    }).compile();
    service = module.get<TourBookingService>(TourBookingService);

    // Default safe stubs
    mockReference.generate.mockReturnValue('ISY-TOUR-ABCDEF012345');
    mockPaystack.initiatePayment.mockResolvedValue({
      authorizationUrl: 'https://paystack.com/pay/test',
      accessCode: 'access-1',
      reference: 'ISY-TOUR-ABCDEF012345',
    });
    mockPrisma.platformConfig.findUnique.mockImplementation(({ where }: any) => {
      if (where.key === 'tour.bulk_discount_t1') return Promise.resolve({ value: 0.1 });
      if (where.key === 'tour.bulk_discount_t2') return Promise.resolve({ value: 0.2 });
      return Promise.resolve(null);
    });
    mockPrisma.tourGuide.findUnique.mockResolvedValue(baseApprovedGuide);
    mockPrisma.tourBooking.update.mockResolvedValue({});
    mockTourPackages.findByIdInternal.mockResolvedValue(basePackage);
    wireTxnSuccess();
  });

  // ── Pure helpers (no DI needed) ─────────────────────────────────────────

  describe('helpers', () => {
    it('applyBulkDiscount: tier 1 (passengerCount in [10,24])', () => {
      expect(applyBulkDiscount(10000, 12, 0.1, 0.2)).toBe(9000);
    });
    it('applyBulkDiscount: tier 2 (passengerCount in [25,50])', () => {
      expect(applyBulkDiscount(10000, 30, 0.1, 0.2)).toBe(8000);
    });
    it('applyBulkDiscount: passengerCount <=9 returns full price', () => {
      expect(applyBulkDiscount(10000, 5, 0.1, 0.2)).toBe(10000);
    });
    it('isBlockedDate: blockedDates hit', () => {
      expect(isBlockedDate({ blockedDates: ['2099-07-15'], weeklyOffDays: [] }, '2099-07-15')).toBe(true);
    });
    it('isBlockedDate: weeklyOffDays hit (Wed = 3)', () => {
      expect(isBlockedDate({ blockedDates: [], weeklyOffDays: [3] }, '2099-07-15')).toBe(true);
    });
    it('isBlockedDate: clear day returns false', () => {
      expect(isBlockedDate({ blockedDates: [], weeklyOffDays: [0, 6] }, '2099-07-15')).toBe(false);
    });
    it('materializeItinerary: maps hours to ISO datetimes offset from 08:00 UTC', () => {
      const items = materializeItinerary(
        [{ hour: 0, title: 'A', description: 'x' }, { hour: 2, title: 'B', description: 'y' }],
        '2099-07-15',
      );
      expect(items[0].datetime).toBe('2099-07-15T08:00:00.000Z');
      expect(items[1].datetime).toBe('2099-07-15T10:00:00.000Z');
    });
  });

  // ── createTourBooking ───────────────────────────────────────────────────

  describe('createTourBooking', () => {
    it('1. happy path: passenger=2, price=10000 → unitPrice=10000, totalAmount=20000, Paystack init with metadata.type=tour_booking', async () => {
      const result = await service.createTourBooking(ACTOR_USER_ID, baseDto());

      expect(mockReference.generate).toHaveBeenCalledWith('TOUR');
      expect(mockPaystack.initiatePayment).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'aisha@example.com',
          amountKobo: 20000 * 100,
          reference: 'ISY-TOUR-ABCDEF012345',
          metadata: expect.objectContaining({
            type: 'tour_booking',
            bookingId: BOOKING_ID,
            module: 'tour',
          }),
        }),
      );
      expect(result.booking.status).toBe('PENDING');
      expect(result.booking.unitPrice).toBe(10000);
      expect(result.booking.totalAmount).toBe(20000);
      // Sanity: no wallet write
      expect(mockPrisma.wallet.update).not.toHaveBeenCalled();
      expect(mockPrisma.transaction.create).not.toHaveBeenCalled();
    });

    it('2. 400 when passengerCount > 50 — exact "Contact corporate sales" message', async () => {
      await expect(
        service.createTourBooking(ACTOR_USER_ID, { ...baseDto(), passengerCount: 51 }),
      ).rejects.toThrow(/Contact corporate sales for groups over 50/);
      expect(mockPaystack.initiatePayment).not.toHaveBeenCalled();
    });

    it('3. 400 when passengerCount > pkg.maxGroupSize', async () => {
      mockTourPackages.findByIdInternal.mockResolvedValue({ ...basePackage, maxGroupSize: 5 });
      await expect(
        service.createTourBooking(ACTOR_USER_ID, { ...baseDto(), passengerCount: 8 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('4. bulk discount tier 1: passenger=12, t1=0.10, price=10000 → unitPrice=9000, totalAmount=108000', async () => {
      const result = await service.createTourBooking(ACTOR_USER_ID, {
        ...baseDto(),
        passengerCount: 12,
      });
      expect(result.booking.unitPrice).toBe(9000);
      expect(result.booking.totalAmount).toBe(108000);
      expect(mockPaystack.initiatePayment).toHaveBeenCalledWith(
        expect.objectContaining({ amountKobo: 108000 * 100 }),
      );
    });

    it('5. bulk discount tier 2: passenger=30, t2=0.20, price=10000 → unitPrice=8000, totalAmount=240000', async () => {
      const result = await service.createTourBooking(ACTOR_USER_ID, {
        ...baseDto(),
        passengerCount: 30,
      });
      expect(result.booking.unitPrice).toBe(8000);
      expect(result.booking.totalAmount).toBe(240000);
    });

    it('6. 400 when tourDate is in the past', async () => {
      await expect(
        service.createTourBooking(ACTOR_USER_ID, { ...baseDto(), tourDate: PAST_DATE }),
      ).rejects.toThrow(/Tour date is in the past/);
    });

    it('7. 400 when tourDate in guide.availability.blockedDates', async () => {
      mockPrisma.tourGuide.findUnique.mockResolvedValue({
        ...baseApprovedGuide,
        availability: { blockedDates: [FUTURE_DATE], weeklyOffDays: [] },
      });
      await expect(
        service.createTourBooking(ACTOR_USER_ID, baseDto()),
      ).rejects.toThrow(/Guide unavailable on selected date/);
    });

    it('8. 400 when tourDate dayOfWeek in guide.availability.weeklyOffDays (Wed=3)', async () => {
      mockPrisma.tourGuide.findUnique.mockResolvedValue({
        ...baseApprovedGuide,
        availability: { blockedDates: [], weeklyOffDays: [3] }, // FUTURE_DATE is a Wed
      });
      await expect(
        service.createTourBooking(ACTOR_USER_ID, baseDto()),
      ).rejects.toThrow(/Guide unavailable on selected date/);
    });

    it('9. 400 when a linked event does not run on tourDate (event title interpolated)', async () => {
      mockTourPackages.findByIdInternal.mockResolvedValue({
        ...basePackage,
        eventIds: [EVENT_ID],
      });
      mockPrisma.event.findMany.mockResolvedValue([
        {
          id: EVENT_ID,
          title: 'Adire Festival',
          startDate: new Date('2099-08-01T00:00:00Z'),
          endDate: new Date('2099-08-03T00:00:00Z'),
          status: 'APPROVED',
        },
      ]);
      await expect(
        service.createTourBooking(ACTOR_USER_ID, baseDto()),
      ).rejects.toThrow(/Adire Festival/);
    });

    it('10. split-bill branch: splitBillEnabled=true → NO Paystack init, response has splitBillJoinLink', async () => {
      const result: any = await service.createTourBooking(ACTOR_USER_ID, {
        ...baseDto(),
        splitBillEnabled: true,
        passengerCount: 4,
      });
      expect(mockPaystack.initiatePayment).not.toHaveBeenCalled();
      expect(result.splitBillJoinLink).toBe(`iseyaa://tour-booking/${BOOKING_ID}/join`);
      expect(result.booking.splitBillEnabled).toBe(true);
      expect(result.booking.groupLeaderUserId).toBe(ACTOR_USER_ID);
    });

    it('11. Paystack throw → booking + itinerary rollback via $transaction([delete, delete])', async () => {
      // Capture the rollback $transaction args
      const txnCalls: any[] = [];
      mockPrisma.$transaction.mockImplementation(async (arg: any) => {
        if (typeof arg === 'function') {
          const tx = {
            itinerary: { create: jest.fn(async ({ data }: any) => ({ id: ITINERARY_ID, items: data.items })) },
            tourBooking: {
              create: jest.fn(async ({ data }: any) => ({ id: BOOKING_ID, itineraryId: ITINERARY_ID, ...data })),
            },
          };
          return arg(tx);
        }
        txnCalls.push(arg);
        return Promise.all(arg);
      });
      mockPaystack.initiatePayment.mockRejectedValue(new Error('Paystack down'));
      mockPrisma.tourBooking.delete.mockResolvedValue({});
      mockPrisma.itinerary.delete.mockResolvedValue({});

      await expect(
        service.createTourBooking(ACTOR_USER_ID, baseDto()),
      ).rejects.toThrow(ServiceUnavailableException);

      // Rollback fired with delete operations
      expect(mockPrisma.tourBooking.delete).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: BOOKING_ID } }),
      );
      expect(mockPrisma.itinerary.delete).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: ITINERARY_ID } }),
      );
    });

    it('12. reference format: passes a string matching /^ISY-TOUR-[A-F0-9]{12}$/ to Paystack', async () => {
      mockReference.generate.mockReturnValue('ISY-TOUR-A1B2C3D4E5F6');
      await service.createTourBooking(ACTOR_USER_ID, baseDto());
      const arg = mockPaystack.initiatePayment.mock.calls[0][0];
      expect(arg.reference).toMatch(/^ISY-TOUR-[A-F0-9]{12}$/);
    });

    it('13. 404 when package status is not APPROVED', async () => {
      mockTourPackages.findByIdInternal.mockResolvedValue({ ...basePackage, status: 'DRAFT' });
      await expect(
        service.createTourBooking(ACTOR_USER_ID, baseDto()),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ── joinSplitBill ───────────────────────────────────────────────────────

  describe('joinSplitBill', () => {
    const parentBooking = {
      id: BOOKING_ID,
      reference: 'ISY-TOUR-PARENT00ABCD',
      splitBillEnabled: true,
      status: 'PENDING',
      passengerCount: 4,
      splitBillPaidUserIds: [ACTOR_USER_ID],
      unitPrice: 9000,
      metadata: { shares: { [ACTOR_USER_ID]: { reference: 'ISY-TOUR-FIRSTPAY1234', status: 'PAID' } } },
    };

    it('14. happy path: mint child ref, init Paystack with metadata.shareKey + parentReference, update parent.metadata.shares', async () => {
      mockPrisma.tourBooking.findFirst.mockResolvedValue(parentBooking);
      mockReference.generate.mockReturnValue('ISY-TOUR-CHILD0000001');
      mockPaystack.initiatePayment.mockResolvedValue({
        authorizationUrl: 'https://paystack.com/pay/child',
        accessCode: 'ac-2',
        reference: 'ISY-TOUR-CHILD0000001',
      });

      const result = await service.joinSplitBill(BOOKING_ID, SECOND_PASSENGER_ID, {
        email: 'tunde@example.com',
      });

      expect(mockPaystack.initiatePayment).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'tunde@example.com',
          amountKobo: 9000 * 100,
          reference: 'ISY-TOUR-CHILD0000001',
          metadata: expect.objectContaining({
            type: 'tour_booking',
            bookingId: BOOKING_ID,
            shareKey: SECOND_PASSENGER_ID,
            parentReference: 'ISY-TOUR-PARENT00ABCD',
          }),
        }),
      );
      expect(mockPrisma.tourBooking.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: BOOKING_ID },
          data: expect.objectContaining({
            metadata: expect.objectContaining({
              shares: expect.objectContaining({
                [SECOND_PASSENGER_ID]: expect.objectContaining({
                  reference: 'ISY-TOUR-CHILD0000001',
                  status: 'PENDING',
                }),
              }),
            }),
          }),
        }),
      );
      expect(result.shareReference).toBe('ISY-TOUR-CHILD0000001');
      // No wallet writes!
      expect(mockPrisma.wallet.update).not.toHaveBeenCalled();
    });

    it('15. 400 when actor already in splitBillPaidUserIds — "You already paid your share"', async () => {
      mockPrisma.tourBooking.findFirst.mockResolvedValue(parentBooking);
      await expect(
        service.joinSplitBill(BOOKING_ID, ACTOR_USER_ID, { email: 'x@y.com' }),
      ).rejects.toThrow(/already paid your share/);
    });

    it('16. 400 when parent booking already fully paid (splitBillPaidUserIds.length >= passengerCount)', async () => {
      mockPrisma.tourBooking.findFirst.mockResolvedValue({
        ...parentBooking,
        splitBillPaidUserIds: ['u1', 'u2', 'u3', 'u4'],
      });
      await expect(
        service.joinSplitBill(BOOKING_ID, 'u5', { email: 'x@y.com' }),
      ).rejects.toThrow(/Booking already fully paid/);
    });

    it('17. 400 when booking is not splitBillEnabled', async () => {
      mockPrisma.tourBooking.findFirst.mockResolvedValue({
        ...parentBooking,
        splitBillEnabled: false,
      });
      await expect(
        service.joinSplitBill(BOOKING_ID, SECOND_PASSENGER_ID, { email: 'x@y.com' }),
      ).rejects.toThrow(/not in split-bill mode/);
    });
  });

  // ── closeSplitBill ──────────────────────────────────────────────────────

  describe('closeSplitBill', () => {
    const leaderBooking = {
      id: BOOKING_ID,
      reference: 'ISY-TOUR-PARENT00ABCD',
      groupLeaderUserId: ACTOR_USER_ID,
      splitBillEnabled: true,
      status: 'PENDING',
      passengerCount: 4,
      splitBillPaidUserIds: ['u1', 'u2'],
      unitPrice: 9000,
      metadata: {},
      buyer: { email: 'leader@example.com' },
    };

    it('18. happy path: leader absorbs remainder, Paystack init for remaining * unitPrice', async () => {
      mockPrisma.tourBooking.findFirst.mockResolvedValue(leaderBooking);
      mockReference.generate.mockReturnValue('ISY-TOUR-CLOSE00000AB');
      mockPaystack.initiatePayment.mockResolvedValue({
        authorizationUrl: 'https://paystack.com/pay/close',
        accessCode: 'ac-3',
        reference: 'ISY-TOUR-CLOSE00000AB',
      });

      await service.closeSplitBill(BOOKING_ID, ACTOR_USER_ID);

      // remaining=2, absorbAmount=18000
      expect(mockPaystack.initiatePayment).toHaveBeenCalledWith(
        expect.objectContaining({
          amountKobo: 18000 * 100,
          metadata: expect.objectContaining({
            type: 'tour_booking',
            shareKey: ACTOR_USER_ID,
            remaining: 2,
          }),
        }),
      );
      expect(mockPrisma.wallet.update).not.toHaveBeenCalled();
    });

    it('19. 403 when actorUserId !== groupLeaderUserId', async () => {
      mockPrisma.tourBooking.findFirst.mockResolvedValue(leaderBooking);
      await expect(
        service.closeSplitBill(BOOKING_ID, 'not-the-leader'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ── findById / findMine / cancel ────────────────────────────────────────

  describe('reads + cancel', () => {
    it('20. findById: 403 when actorUserId !== buyerUserId', async () => {
      mockPrisma.tourBooking.findFirst.mockResolvedValue({
        id: BOOKING_ID,
        buyerUserId: ACTOR_USER_ID,
      });
      await expect(service.findById(BOOKING_ID, 'someone-else')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('21. findMine: filters by buyerUserId + deletedAt:null', async () => {
      mockPrisma.tourBooking.findMany.mockResolvedValue([]);
      await service.findMine(ACTOR_USER_ID);
      expect(mockPrisma.tourBooking.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { buyerUserId: ACTOR_USER_ID, deletedAt: null },
        }),
      );
    });

    it('22. cancel: 403 when actor not owner', async () => {
      mockPrisma.tourBooking.findFirst.mockResolvedValue({
        id: BOOKING_ID,
        buyerUserId: ACTOR_USER_ID,
        status: 'PENDING',
      });
      await expect(service.cancel(BOOKING_ID, 'bad-actor')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('23. cancel: happy path → status=CANCELLED', async () => {
      mockPrisma.tourBooking.findFirst.mockResolvedValue({
        id: BOOKING_ID,
        buyerUserId: ACTOR_USER_ID,
        status: 'PENDING',
      });
      mockPrisma.tourBooking.update.mockResolvedValue({ id: BOOKING_ID, status: 'CANCELLED' });
      await service.cancel(BOOKING_ID, ACTOR_USER_ID);
      expect(mockPrisma.tourBooking.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: BOOKING_ID },
          data: { status: 'CANCELLED' },
        }),
      );
      // Refund logic NOT done here
      expect(mockPrisma.wallet.update).not.toHaveBeenCalled();
    });
  });

  // ── Global no-wallet-write assertion ────────────────────────────────────

  describe('wallet-write boundary', () => {
    it('24. NEVER calls wallet.update across the full happy-path flow (create → join → close → cancel)', async () => {
      // create
      await service.createTourBooking(ACTOR_USER_ID, baseDto());

      // join
      mockPrisma.tourBooking.findFirst.mockResolvedValue({
        id: BOOKING_ID,
        reference: 'ISY-TOUR-XYZ000000001',
        splitBillEnabled: true,
        status: 'PENDING',
        passengerCount: 3,
        splitBillPaidUserIds: [],
        unitPrice: 10000,
        metadata: {},
      });
      await service.joinSplitBill(BOOKING_ID, SECOND_PASSENGER_ID, { email: 'a@b.com' });

      // close
      mockPrisma.tourBooking.findFirst.mockResolvedValue({
        id: BOOKING_ID,
        reference: 'ISY-TOUR-XYZ000000001',
        groupLeaderUserId: ACTOR_USER_ID,
        splitBillEnabled: true,
        status: 'PENDING',
        passengerCount: 3,
        splitBillPaidUserIds: ['u1'],
        unitPrice: 10000,
        metadata: {},
        buyer: { email: 'leader@example.com' },
      });
      await service.closeSplitBill(BOOKING_ID, ACTOR_USER_ID);

      // cancel
      mockPrisma.tourBooking.findFirst.mockResolvedValue({
        id: BOOKING_ID,
        buyerUserId: ACTOR_USER_ID,
        status: 'PENDING',
      });
      mockPrisma.tourBooking.update.mockResolvedValue({});
      await service.cancel(BOOKING_ID, ACTOR_USER_ID);

      // GOLDEN ASSERTION
      expect(mockPrisma.wallet.update).not.toHaveBeenCalled();
      expect(mockPrisma.transaction.create).not.toHaveBeenCalled();
    });
  });
});
