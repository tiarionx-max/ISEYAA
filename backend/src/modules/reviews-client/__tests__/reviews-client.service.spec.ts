import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { status as GrpcStatus } from '@grpc/grpc-js';
import { of, throwError } from 'rxjs';
import { ReviewsClientService } from '../reviews-client.service';
import { REVIEWS_PACKAGE } from '../reviews-client.constants';
import { ResilienceService } from '../../../resilience/resilience.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateReviewDto } from '../../reviews/dto/create-review.dto';

/**
 * 21-05 Task 3 — ReviewsClientService spec. Mirrors notifications-client.service.spec.ts's /
 * waitlist-client.service.spec.ts's ClientGrpc mock shape: mocks `ClientGrpc.getService` to
 * return a mock gRPC service whose `createReview`/`listReviews` jest.fn()s return `rxjs`'s
 * `of(...)` (success) or `throwError(...)` (failure). `ResilienceService.execute` is mocked to
 * invoke the wrapped fn directly. `mockPrisma` additionally covers `review.findUnique`,
 * `review.update`, and `review.findMany` — the shape-reconciliation reads/writes unique to this
 * facade.
 */

const USER_ID = 'USR-1';
const REVIEW_ID = 'REV-1';

const CREATE_DTO: CreateReviewDto = {
  tourBookingId: 'BKG-1',
  targetType: 'GUIDE',
  targetId: 'GUIDE-1',
  rating: 5,
  comment: 'Great tour!',
};

const CREATE_DTO_WITH_PHOTOS: CreateReviewDto = {
  ...CREATE_DTO,
  photos: ['https://cdn.example.com/photo1.jpg', 'https://cdn.example.com/photo2.jpg'],
};

const CREATE_GRPC_RESULT = { id: REVIEW_ID, flagged: false };
const FULL_REVIEW_ROW = {
  id: REVIEW_ID,
  targetType: 'GUIDE',
  targetId: 'GUIDE-1',
  userId: USER_ID,
  tourBookingId: 'BKG-1',
  rating: 5,
  comment: 'Great tour!',
  photos: [] as string[],
  flagged: false,
};

interface MockGrpcService {
  createReview: jest.Mock;
  listReviews: jest.Mock;
}

let mockGrpcService: MockGrpcService;
let mockClientGrpc: { getService: jest.Mock };
let mockResilience: { execute: jest.Mock };
let mockPrisma: {
  platformConfig: { findUnique: jest.Mock };
  review: {
    findUnique: jest.Mock;
    update: jest.Mock;
    findMany: jest.Mock;
  };
};

// `canaryFlagValue`: undefined => findUnique resolves null (row absent, default enabled);
// otherwise findUnique resolves `{ value: canaryFlagValue }` (mirrors notifications-client's /
// waitlist-client's mock shape for the same PlatformConfig read pattern).
async function makeService(canaryFlagValue?: unknown): Promise<ReviewsClientService> {
  mockGrpcService = {
    createReview: jest.fn().mockReturnValue(of(CREATE_GRPC_RESULT)),
    listReviews: jest.fn().mockReturnValue(of({ reviews: [] })),
  };
  mockClientGrpc = { getService: jest.fn().mockReturnValue(mockGrpcService) };
  mockResilience = {
    execute: jest.fn((_vendor: string, fn: (ctx: { signal: AbortSignal }) => Promise<any>) =>
      fn({ signal: new AbortController().signal }),
    ),
  };
  mockPrisma = {
    platformConfig: {
      findUnique: jest
        .fn()
        .mockResolvedValue(canaryFlagValue === undefined ? null : { value: canaryFlagValue }),
    },
    review: {
      findUnique: jest.fn().mockResolvedValue(FULL_REVIEW_ROW),
      update: jest.fn().mockResolvedValue({ ...FULL_REVIEW_ROW, photos: CREATE_DTO_WITH_PHOTOS.photos }),
      findMany: jest.fn().mockResolvedValue([]),
    },
  };

  const moduleRef: TestingModule = await Test.createTestingModule({
    providers: [
      ReviewsClientService,
      { provide: REVIEWS_PACKAGE, useValue: mockClientGrpc },
      { provide: ResilienceService, useValue: mockResilience },
      { provide: PrismaService, useValue: mockPrisma },
    ],
  }).compile();

  const svc = moduleRef.get(ReviewsClientService);
  svc.onModuleInit();
  return svc;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('ReviewsClientService', () => {
  describe('createReview()', () => {
    it('1. without photos: does NOT call prisma.review.update, and returns whatever prisma.review.findUnique resolves', async () => {
      const svc = await makeService();

      await expect(svc.createReview(USER_ID, CREATE_DTO)).resolves.toEqual(FULL_REVIEW_ROW);

      expect(mockPrisma.review.update).not.toHaveBeenCalled();
      expect(mockPrisma.review.findUnique).toHaveBeenCalledWith({ where: { id: REVIEW_ID } });
    });

    it('2. WITH photos: calls prisma.review.update({where:{id},data:{photos}}) BEFORE prisma.review.findUnique', async () => {
      const svc = await makeService();

      await svc.createReview(USER_ID, CREATE_DTO_WITH_PHOTOS);

      expect(mockPrisma.review.update).toHaveBeenCalledWith({
        where: { id: REVIEW_ID },
        data: { photos: CREATE_DTO_WITH_PHOTOS.photos },
      });
      expect(mockPrisma.review.findUnique).toHaveBeenCalledWith({ where: { id: REVIEW_ID } });
      expect(mockPrisma.review.update.mock.invocationCallOrder[0]).toBeLessThan(
        mockPrisma.review.findUnique.mock.invocationCallOrder[0],
      );
    });

    it('3. on gRPC/resilience failure, throws ServiceUnavailableException mentioning "Reviews service is temporarily unavailable"', async () => {
      const svc = await makeService();
      mockGrpcService.createReview.mockReturnValue(throwError(() => new Error('UNAVAILABLE')));

      await expect(svc.createReview(USER_ID, CREATE_DTO)).rejects.toThrow(ServiceUnavailableException);
      await expect(svc.createReview(USER_ID, CREATE_DTO)).rejects.toThrow(
        /Reviews service is temporarily unavailable/,
      );
      expect(mockPrisma.review.findUnique).not.toHaveBeenCalled();
      expect(mockPrisma.review.update).not.toHaveBeenCalled();
    });

    it('4. when canary_enabled flag is false, throws ServiceUnavailableException WITHOUT calling resilience.execute, the gRPC client, or any Prisma method', async () => {
      const svc = await makeService(false);

      await expect(svc.createReview(USER_ID, CREATE_DTO)).rejects.toThrow(ServiceUnavailableException);
      await expect(svc.createReview(USER_ID, CREATE_DTO)).rejects.toThrow(
        /Reviews service is temporarily unavailable/,
      );

      expect(mockResilience.execute).not.toHaveBeenCalled();
      expect(mockGrpcService.createReview).not.toHaveBeenCalled();
      expect(mockPrisma.review.findUnique).not.toHaveBeenCalled();
      expect(mockPrisma.review.update).not.toHaveBeenCalled();
    });

    it('5. on gRPC error code NOT_FOUND, throws NotFoundException with the exact preserved message and does not touch Prisma', async () => {
      const svc = await makeService();
      const message = 'Booking not found';
      mockGrpcService.createReview.mockReturnValue(throwError(() => ({ code: GrpcStatus.NOT_FOUND, message })));

      await expect(svc.createReview(USER_ID, CREATE_DTO)).rejects.toThrow(NotFoundException);
      await expect(svc.createReview(USER_ID, CREATE_DTO)).rejects.toThrow(message);
      expect(mockPrisma.review.findUnique).not.toHaveBeenCalled();
      expect(mockPrisma.review.update).not.toHaveBeenCalled();
    });

    it('6. on gRPC error code PERMISSION_DENIED, throws ForbiddenException with the exact preserved message and does not touch Prisma', async () => {
      const svc = await makeService();
      const message = 'You did not own this tour booking';
      mockGrpcService.createReview.mockReturnValue(
        throwError(() => ({ code: GrpcStatus.PERMISSION_DENIED, message })),
      );

      await expect(svc.createReview(USER_ID, CREATE_DTO)).rejects.toThrow(ForbiddenException);
      await expect(svc.createReview(USER_ID, CREATE_DTO)).rejects.toThrow(message);
      expect(mockPrisma.review.findUnique).not.toHaveBeenCalled();
      expect(mockPrisma.review.update).not.toHaveBeenCalled();
    });

    it('7. on gRPC error code INVALID_ARGUMENT, throws BadRequestException with the exact preserved message and does not touch Prisma', async () => {
      const svc = await makeService();
      const message = 'Tour has not ended yet';
      mockGrpcService.createReview.mockReturnValue(
        throwError(() => ({ code: GrpcStatus.INVALID_ARGUMENT, message })),
      );

      await expect(svc.createReview(USER_ID, CREATE_DTO)).rejects.toThrow(BadRequestException);
      await expect(svc.createReview(USER_ID, CREATE_DTO)).rejects.toThrow(message);
      expect(mockPrisma.review.findUnique).not.toHaveBeenCalled();
      expect(mockPrisma.review.update).not.toHaveBeenCalled();
    });

    it('8. on gRPC error code ALREADY_EXISTS, throws ConflictException with the exact preserved message and does not touch Prisma', async () => {
      const svc = await makeService();
      const message = 'You already reviewed this target for this booking';
      mockGrpcService.createReview.mockReturnValue(
        throwError(() => ({ code: GrpcStatus.ALREADY_EXISTS, message })),
      );

      await expect(svc.createReview(USER_ID, CREATE_DTO)).rejects.toThrow(ConflictException);
      await expect(svc.createReview(USER_ID, CREATE_DTO)).rejects.toThrow(message);
      expect(mockPrisma.review.findUnique).not.toHaveBeenCalled();
      expect(mockPrisma.review.update).not.toHaveBeenCalled();
    });

    it('9. on an unrecognized/codeless error, still falls through to ServiceUnavailableException (regression guard)', async () => {
      const svc = await makeService();
      mockGrpcService.createReview.mockReturnValue(throwError(() => new Error('UNAVAILABLE')));

      await expect(svc.createReview(USER_ID, CREATE_DTO)).rejects.toThrow(ServiceUnavailableException);
      await expect(svc.createReview(USER_ID, CREATE_DTO)).rejects.toThrow(
        /Reviews service is temporarily unavailable/,
      );
    });
  });

  describe('findByTarget()', () => {
    const GRPC_REVIEWS = [
      { id: 'REV-1', userId: 'U1', rating: 5, comment: '', flagged: false, createdAt: '2026-01-01T00:00:00Z' },
      { id: 'REV-2', userId: 'U2', rating: 4, comment: '', flagged: false, createdAt: '2026-01-02T00:00:00Z' },
    ];
    const ENRICHED_ROWS = GRPC_REVIEWS.map((r) => ({
      ...r,
      user: { id: r.userId, firstName: 'First', lastName: 'Last', avatarUrl: null },
    }));

    it('5. on success, calls prisma.review.findMany with where.id.in + include.user.select, and returns {data, pagination} with total = full enriched-array length', async () => {
      const svc = await makeService();
      mockGrpcService.listReviews.mockReturnValue(of({ reviews: GRPC_REVIEWS }));
      mockPrisma.review.findMany.mockResolvedValue(ENRICHED_ROWS);

      const result = await svc.findByTarget('GUIDE', 'GUIDE-1', { page: 1, limit: 24 });

      expect(mockPrisma.review.findMany).toHaveBeenCalledWith({
        where: { id: { in: ['REV-1', 'REV-2'] } },
        include: { user: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } } },
        orderBy: { createdAt: 'desc' },
      });
      expect(result).toEqual({
        data: ENRICHED_ROWS,
        pagination: { page: 1, limit: 24, total: 2, pages: 1 },
      });
    });

    it('6. paginates in memory: 30-row enriched result, page:2 limit:10 -> data.length === 10 with the correct slice', async () => {
      const svc = await makeService();
      const thirtyRows = Array.from({ length: 30 }, (_, i) => ({
        id: `REV-${i}`,
        user: { id: `U${i}`, firstName: 'First', lastName: 'Last', avatarUrl: null },
      }));
      mockGrpcService.listReviews.mockReturnValue(
        of({ reviews: thirtyRows.map((r) => ({ id: r.id, userId: r.user.id, rating: 5, comment: '', flagged: false, createdAt: '' })) }),
      );
      mockPrisma.review.findMany.mockResolvedValue(thirtyRows);

      const result = await svc.findByTarget('GUIDE', 'GUIDE-1', { page: 2, limit: 10 });

      expect(result.data).toHaveLength(10);
      expect(result.data).toEqual(thirtyRows.slice(10, 20));
      expect(result.pagination).toEqual({ page: 2, limit: 10, total: 30, pages: 3 });
    });

    it('7. when canary_enabled flag is false, throws ServiceUnavailableException WITHOUT calling resilience.execute, the gRPC client, or Prisma', async () => {
      const svc = await makeService(false);

      await expect(svc.findByTarget('GUIDE', 'GUIDE-1')).rejects.toThrow(ServiceUnavailableException);
      await expect(svc.findByTarget('GUIDE', 'GUIDE-1')).rejects.toThrow(
        /Reviews service is temporarily unavailable/,
      );

      expect(mockResilience.execute).not.toHaveBeenCalled();
      expect(mockGrpcService.listReviews).not.toHaveBeenCalled();
      expect(mockPrisma.review.findMany).not.toHaveBeenCalled();
    });
  });

  it('8. both createReview and findByTarget call resilience.execute with "reviewsGrpc" as the first argument', async () => {
    const svc = await makeService();

    await svc.createReview(USER_ID, CREATE_DTO);
    await svc.findByTarget('GUIDE', 'GUIDE-1');

    expect(mockResilience.execute).toHaveBeenNthCalledWith(1, 'reviewsGrpc', expect.any(Function));
    expect(mockResilience.execute).toHaveBeenNthCalledWith(2, 'reviewsGrpc', expect.any(Function));
  });

  it('9. D-07 admin-bypass: ReviewsClientService has no resolveFlag, getFlagQueue, or getFlagById methods', async () => {
    const svc = await makeService();

    expect((svc as any).resolveFlag).toBeUndefined();
    expect((svc as any).getFlagQueue).toBeUndefined();
    expect((svc as any).getFlagById).toBeUndefined();
  });
});
