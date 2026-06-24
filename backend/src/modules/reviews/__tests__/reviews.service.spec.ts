import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ReviewsService, RECOMPUTE_DEBOUNCE_MS } from '../reviews.service';
import { PrismaService } from '../../../prisma/prisma.service';

// ── Fixtures ────────────────────────────────────────────────────────────────

const ACTOR_USER_ID = 'user-uuid-001';
const OTHER_USER_ID = 'user-uuid-002';
const BOOKING_ID = 'booking-uuid-001';
const GUIDE_ID = 'guide-uuid-001';
const PACKAGE_ID = 'pkg-uuid-001';
const ATTRACTION_ID = 'attr-uuid-001';
const PROPERTY_ID = 'prop-uuid-001';
const REVIEW_ID = 'review-uuid-001';
const FLAG_ID = 'flag-uuid-001';

/** A tour that already ended (tourDate far in the past). */
const PAST_TOUR_DATE = new Date('2020-01-01T08:00:00.000Z');

/** A tour that is in the future (so it hasn't ended). */
const FUTURE_TOUR_DATE = new Date('2099-07-15T08:00:00.000Z');

const baseSnapshot = () => ({
  tourGuideId: GUIDE_ID,
  attractionIds: [ATTRACTION_ID],
  propertyId: PROPERTY_ID,
  durationHours: 6,
});

/**
 * Builds a booking fixture with sensible defaults. The tour date is in the
 * past and status is CHECKED_OUT so it is eligible for reviews by default.
 */
const baseBooking = (overrides: Partial<any> = {}): any => ({
  id: BOOKING_ID,
  status: 'CHECKED_OUT',
  buyerUserId: ACTOR_USER_ID,
  groupLeaderUserId: null,
  tourDate: PAST_TOUR_DATE,
  tourPackageId: PACKAGE_ID,
  snapshot: baseSnapshot(),
  deletedAt: null,
  ...overrides,
});

/** Minimal CreateReviewDto for a GUIDE target. */
const guideDtoBase = () => ({
  tourBookingId: BOOKING_ID,
  targetType: 'GUIDE' as const,
  targetId: GUIDE_ID,
  rating: 5,
});

// ── Mocks ───────────────────────────────────────────────────────────────────

const mockPrisma: any = {
  tourBooking: { findUnique: jest.fn() },
  review: {
    findFirst: jest.fn(),
    create: jest.fn(),
    aggregate: jest.fn(),
  },
  adminReviewFlag: {
    create: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    count: jest.fn(),
    update: jest.fn(),
  },
  tourGuide: { update: jest.fn() },
  tourPackage: { update: jest.fn() },
  property: { findUnique: jest.fn(), update: jest.fn() },
  $transaction: jest.fn(),
};

const mockEventEmitter: any = { emit: jest.fn() };

// ── Helper: wire $transaction so the callback receives tx ───────────────────

/**
 * Sets up mockPrisma.$transaction to call the supplied async callback with a
 * tx-proxy that owns create/update mocks for `review` and `adminReviewFlag`.
 * The returned review row has id=REVIEW_ID plus whatever data was supplied.
 */
function wireTxnSuccess(rating: number = 5) {
  const flagged = rating <= 2;

  const txReview = {
    create: jest.fn(async ({ data }: any) => ({
      id: REVIEW_ID,
      ...data,
      flagged,
    })),
  };
  const txAdminReviewFlag = {
    create: jest.fn(async ({ data }: any) => ({
      id: FLAG_ID,
      ...data,
    })),
  };

  mockPrisma.$transaction.mockImplementation(async (cb: any) => {
    if (typeof cb === 'function') {
      return cb({ review: txReview, adminReviewFlag: txAdminReviewFlag });
    }
    return Promise.all(cb);
  });

  return { txReview, txAdminReviewFlag };
}

// ── Test suite ───────────────────────────────────────────────────────────────

describe('ReviewsService', () => {
  let service: ReviewsService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReviewsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: EventEmitter2, useValue: mockEventEmitter },
      ],
    }).compile();

    service = module.get<ReviewsService>(ReviewsService);

    // Default safe stubs —
    mockPrisma.tourBooking.findUnique.mockResolvedValue(baseBooking());
    mockPrisma.review.findFirst.mockResolvedValue(null); // no duplicate by default
  });

  // ── 1. createReview — happy path (rating=5, no flag) ──────────────────────

  describe('createReview', () => {
    it('1. happy path: tour ended (CHECKED_OUT), rating=5 → review created, flagged=false, NO AdminReviewFlag, EventEmitter emits', async () => {
      const { txReview, txAdminReviewFlag } = wireTxnSuccess(5);
      const dto = guideDtoBase();

      const result = await service.createReview(ACTOR_USER_ID, dto);

      // Review was created with flagged=false
      expect(txReview.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ flagged: false, rating: 5 }),
        }),
      );

      // No AdminReviewFlag created for rating=5
      expect(txAdminReviewFlag.create).not.toHaveBeenCalled();

      // EventEmitter fired after tx commit
      expect(mockEventEmitter.emit).toHaveBeenCalledWith('review.created', {
        targetType: 'GUIDE',
        targetId: GUIDE_ID,
      });

      expect(result).toMatchObject({ id: REVIEW_ID, flagged: false });
    });

    // ── 2. createReview with photos ──────────────────────────────────────────

    it('2. review with 3 photo URLs → photos persisted verbatim', async () => {
      const { txReview } = wireTxnSuccess(4);
      const photos = [
        'https://cdn.r2.dev/review-photos/a.jpg',
        'https://cdn.r2.dev/review-photos/b.jpg',
        'https://cdn.r2.dev/review-photos/c.jpg',
      ];
      const dto = { ...guideDtoBase(), rating: 4, photos };

      await service.createReview(ACTOR_USER_ID, dto);

      expect(txReview.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ photos }),
        }),
      );
    });

    // ── 3 & 4. createReview auto-flag: rating ≤ 2 ───────────────────────────

    it('3. rating=2 → flagged=true, AdminReviewFlag created in same $transaction', async () => {
      const { txReview, txAdminReviewFlag } = wireTxnSuccess(2);
      const dto = { ...guideDtoBase(), rating: 2 };

      const result = await service.createReview(ACTOR_USER_ID, dto);

      // Review flagged
      expect(txReview.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ flagged: true }),
        }),
      );

      // AdminReviewFlag created in same tx
      expect(txAdminReviewFlag.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ reviewId: REVIEW_ID, status: 'OPEN' }),
        }),
      );

      // EventEmitter still fires
      expect(mockEventEmitter.emit).toHaveBeenCalledWith('review.created', expect.any(Object));

      expect(result).toMatchObject({ flagged: true });
    });

    it('4. rating=1 → flagged=true, AdminReviewFlag created', async () => {
      const { txAdminReviewFlag } = wireTxnSuccess(1);
      const dto = { ...guideDtoBase(), rating: 1 };

      await service.createReview(ACTOR_USER_ID, dto);

      expect(txAdminReviewFlag.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'OPEN' }),
        }),
      );
    });

    // ── 5. rating=3 → NOT flagged ────────────────────────────────────────────

    it('5. rating=3 → NOT flagged, no AdminReviewFlag', async () => {
      const { txReview, txAdminReviewFlag } = wireTxnSuccess(3);
      const dto = { ...guideDtoBase(), rating: 3 };

      await service.createReview(ACTOR_USER_ID, dto);

      expect(txReview.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ flagged: false }),
        }),
      );
      expect(txAdminReviewFlag.create).not.toHaveBeenCalled();
    });

    // ── 6. createReview 403: wrong actor ─────────────────────────────────────

    it('6. 403 ForbiddenException when actorUserId !== buyerUserId', async () => {
      mockPrisma.tourBooking.findUnique.mockResolvedValue(
        baseBooking({ buyerUserId: 'someone-else', groupLeaderUserId: null }),
      );

      await expect(
        service.createReview(ACTOR_USER_ID, guideDtoBase()),
      ).rejects.toThrow(ForbiddenException);
    });

    // ── 7. createReview 400: tour not ended yet ───────────────────────────────

    it('7. 400 BadRequestException when booking is CONFIRMED but tour is still in the future', async () => {
      mockPrisma.tourBooking.findUnique.mockResolvedValue(
        baseBooking({
          status: 'CONFIRMED',
          tourDate: FUTURE_TOUR_DATE,
          snapshot: { ...baseSnapshot(), durationHours: 6 },
        }),
      );

      await expect(
        service.createReview(ACTOR_USER_ID, guideDtoBase()),
      ).rejects.toThrow(BadRequestException);
    });

    // ── 8. createReview 400: targetType=GUIDE mismatch ───────────────────────

    it('8. 400 BadRequestException when targetType=GUIDE but targetId !== snapshot.tourGuideId', async () => {
      mockPrisma.tourBooking.findUnique.mockResolvedValue(
        baseBooking({
          snapshot: { ...baseSnapshot(), tourGuideId: 'different-guide-id' },
        }),
      );

      const dto = { ...guideDtoBase(), targetId: GUIDE_ID }; // GUIDE_ID ≠ 'different-guide-id'

      await expect(
        service.createReview(ACTOR_USER_ID, dto),
      ).rejects.toThrow(BadRequestException);
    });

    // ── 9. createReview 400: targetType=VENUE mismatch ───────────────────────

    it('9. 400 BadRequestException when targetType=VENUE but targetId not in attractionIds ∪ propertyId', async () => {
      // snapshot has ATTRACTION_ID and PROPERTY_ID; we use an unknown id
      const dto = {
        ...guideDtoBase(),
        targetType: 'VENUE' as const,
        targetId: 'unknown-venue-id',
      };

      await expect(
        service.createReview(ACTOR_USER_ID, dto),
      ).rejects.toThrow(BadRequestException);
    });

    // ── 10. createReview ConflictException: duplicate ─────────────────────────

    it('10. ConflictException when a non-deleted review already exists for the same (booking × targetType × targetId)', async () => {
      mockPrisma.review.findFirst.mockResolvedValue({ id: 'existing-review' });

      await expect(
        service.createReview(ACTOR_USER_ID, guideDtoBase()),
      ).rejects.toThrow(ConflictException);
    });
  });

  // ── 11 & 12. recomputeTargetRating ──────────────────────────────────────────

  describe('recomputeTargetRating', () => {
    it('11. GUIDE: avg([5,4,3])=4.0 → tourGuide.update called with rating=4, reviewCount=3', async () => {
      mockPrisma.review.aggregate.mockResolvedValue({
        _avg: { rating: 4 },
        _count: { _all: 3 },
      });
      mockPrisma.tourGuide.update.mockResolvedValue({});

      const result = await service.recomputeTargetRating('GUIDE', GUIDE_ID);

      expect(mockPrisma.tourGuide.update).toHaveBeenCalledWith({
        where: { id: GUIDE_ID },
        data: { rating: 4, reviewCount: 3 },
      });
      expect(result).toEqual({ rating: 4, reviewCount: 3 });
    });

    it('12. PACKAGE: avg([4,5])=4.5 → tourPackage.update called with rating=4.5, reviewCount=2', async () => {
      mockPrisma.review.aggregate.mockResolvedValue({
        _avg: { rating: 4.5 },
        _count: { _all: 2 },
      });
      mockPrisma.tourPackage.update.mockResolvedValue({});

      const result = await service.recomputeTargetRating('PACKAGE', PACKAGE_ID);

      expect(mockPrisma.tourPackage.update).toHaveBeenCalledWith({
        where: { id: PACKAGE_ID },
        data: { rating: 4.5, reviewCount: 2 },
      });
      expect(result).toEqual({ rating: 4.5, reviewCount: 2 });
    });
  });

  // ── 13 & 14. resolveFlag ─────────────────────────────────────────────────────

  describe('resolveFlag', () => {
    it('13. happy path: OPEN flag → RESOLVED with resolution note', async () => {
      mockPrisma.adminReviewFlag.findUnique.mockResolvedValue({
        id: FLAG_ID,
        status: 'OPEN',
      });
      const updated = {
        id: FLAG_ID,
        status: 'RESOLVED',
        assignedTo: ACTOR_USER_ID,
        resolution: 'Content removed',
        resolvedAt: new Date(),
      };
      mockPrisma.adminReviewFlag.update.mockResolvedValue(updated);

      const result = await service.resolveFlag(FLAG_ID, ACTOR_USER_ID, {
        decision: 'RESOLVED',
        resolution: 'Content removed',
      });

      expect(mockPrisma.adminReviewFlag.update).toHaveBeenCalledWith({
        where: { id: FLAG_ID },
        data: expect.objectContaining({
          status: 'RESOLVED',
          assignedTo: ACTOR_USER_ID,
          resolution: 'Content removed',
        }),
      });
      expect(result).toMatchObject({ status: 'RESOLVED' });
    });

    it('14. 409 ConflictException when flag is already RESOLVED', async () => {
      mockPrisma.adminReviewFlag.findUnique.mockResolvedValue({
        id: FLAG_ID,
        status: 'RESOLVED',
      });

      await expect(
        service.resolveFlag(FLAG_ID, ACTOR_USER_ID, { decision: 'DISMISSED' }),
      ).rejects.toThrow(ConflictException);
    });
  });
});
