import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { status } from '@grpc/grpc-js';
import { ReviewsGrpcController } from '../reviews-grpc.controller';
import { ReviewsService } from '../../../../src/modules/reviews/reviews.service';
import { PrismaService } from '../../../../src/prisma/prisma.service';

/**
 * 21-08 Task 1 (CR-01) — ReviewsGrpcController spec. Mirrors
 * delivery-otp-grpc.controller.spec.ts's structure exactly: proves each business exception
 * type ReviewsService.createReview() can throw round-trips through RpcException with the
 * correct GrpcStatus code and the original message preserved, and that any other error type
 * is rethrown unwrapped. listReviews() coverage added separately below.
 */
describe('ReviewsGrpcController', () => {
  let controller: ReviewsGrpcController;
  let reviewsService: { createReview: jest.Mock };
  let prisma: { review: { findMany: jest.Mock } };

  beforeEach(async () => {
    reviewsService = { createReview: jest.fn() };
    prisma = { review: { findMany: jest.fn() } };

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [ReviewsGrpcController],
      providers: [
        { provide: ReviewsService, useValue: reviewsService },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    controller = moduleRef.get(ReviewsGrpcController);
  });

  const REQUEST = {
    tourBookingId: 'BKG-1',
    targetType: 'GUIDE',
    targetId: 'GUIDE-1',
    userId: 'USR-1',
    rating: 5,
    comment: 'Great tour!',
  };

  it('returns {id, flagged} unchanged when ReviewsService.createReview succeeds', async () => {
    reviewsService.createReview.mockResolvedValue({ id: 'REV-1', flagged: false });

    const result = await controller.createReview(REQUEST as any);

    expect(result).toEqual({ id: 'REV-1', flagged: false });
  });

  it('wraps a NotFoundException (booking not found) in an RpcException with NOT_FOUND and the original message preserved', async () => {
    const message = 'Booking not found';
    reviewsService.createReview.mockRejectedValue(new NotFoundException(message));

    try {
      await controller.createReview(REQUEST as any);
      fail('expected createReview to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(RpcException);
      expect((err as RpcException).getError()).toEqual({ code: status.NOT_FOUND, message });
    }
  });

  it('wraps a ForbiddenException (not-your-booking) in an RpcException with PERMISSION_DENIED and the original message preserved', async () => {
    const message = 'You did not own this tour booking';
    reviewsService.createReview.mockRejectedValue(new ForbiddenException(message));

    try {
      await controller.createReview(REQUEST as any);
      fail('expected createReview to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(RpcException);
      expect((err as RpcException).getError()).toEqual({ code: status.PERMISSION_DENIED, message });
    }
  });

  it('wraps a BadRequestException (tour-not-ended) in an RpcException with INVALID_ARGUMENT and the original message preserved', async () => {
    const message =
      'Tour has not ended yet — reviews open after CHECKED_OUT or once the tour window closes';
    reviewsService.createReview.mockRejectedValue(new BadRequestException(message));

    try {
      await controller.createReview(REQUEST as any);
      fail('expected createReview to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(RpcException);
      expect((err as RpcException).getError()).toEqual({ code: status.INVALID_ARGUMENT, message });
    }
  });

  it('wraps a ConflictException (duplicate review) in an RpcException with ALREADY_EXISTS and the original message preserved', async () => {
    const message = 'You already reviewed this target for this booking';
    reviewsService.createReview.mockRejectedValue(new ConflictException(message));

    try {
      await controller.createReview(REQUEST as any);
      fail('expected createReview to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(RpcException);
      expect((err as RpcException).getError()).toEqual({ code: status.ALREADY_EXISTS, message });
    }
  });

  it('rethrows any other error type unchanged, letting the default BaseRpcExceptionFilter handle it', async () => {
    const originalError = new Error('db connection lost');
    reviewsService.createReview.mockRejectedValue(originalError);

    try {
      await controller.createReview(REQUEST as any);
      fail('expected createReview to throw');
    } catch (err) {
      expect(err).toBe(originalError);
      expect(err).not.toBeInstanceOf(RpcException);
    }
  });

  describe('listReviews', () => {
    const LIST_REQUEST = { targetType: 'GUIDE', targetId: 'GUIDE-1' };

    it('returns mapped rows for a valid targetType', async () => {
      prisma.review.findMany.mockResolvedValue([
        { id: 'REV-1', userId: 'USR-1', rating: 5, comment: 'Great!', flagged: false, createdAt: new Date('2026-01-01') },
      ]);

      const result = await controller.listReviews(LIST_REQUEST as any);

      expect(result.reviews).toEqual([
        { id: 'REV-1', userId: 'USR-1', rating: 5, comment: 'Great!', flagged: false, createdAt: '2026-01-01T00:00:00.000Z' },
      ]);
    });

    it('rejects an invalid targetType with INVALID_ARGUMENT before ever querying Prisma', async () => {
      try {
        await controller.listReviews({ targetType: 'NOT_A_REAL_TYPE', targetId: 'X' } as any);
        fail('expected listReviews to throw');
      } catch (err) {
        expect(err).toBeInstanceOf(RpcException);
        expect((err as RpcException).getError()).toEqual(
          expect.objectContaining({ code: status.INVALID_ARGUMENT }),
        );
      }
      expect(prisma.review.findMany).not.toHaveBeenCalled();
    });

    it('wraps an unexpected Prisma error in RpcException(INTERNAL) instead of letting it escape uncaught — regression test for the circuit-breaker-poisoning bug', async () => {
      prisma.review.findMany.mockRejectedValue(new Error('Invalid value provided for enum'));

      try {
        await controller.listReviews(LIST_REQUEST as any);
        fail('expected listReviews to throw');
      } catch (err) {
        expect(err).toBeInstanceOf(RpcException);
        expect((err as RpcException).getError()).toEqual(
          expect.objectContaining({ code: status.INTERNAL, message: 'Invalid value provided for enum' }),
        );
      }
    });
  });
});
