import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { status } from '@grpc/grpc-js';
import { WaitlistGrpcController } from '../waitlist-grpc.controller';
import { WaitlistService } from '../../../../src/modules/waitlist/waitlist.service';

/**
 * 21-08 Task 2 (CR-02) — WaitlistGrpcController spec. Mirrors
 * delivery-otp-grpc.controller.spec.ts's structure exactly: proves the business exception
 * WaitlistService.join() can throw round-trips through RpcException with the correct
 * GrpcStatus code and the original message preserved, and that any other error type is
 * rethrown unwrapped.
 */
describe('WaitlistGrpcController', () => {
  let controller: WaitlistGrpcController;
  let waitlistService: { join: jest.Mock; stats: jest.Mock };

  beforeEach(async () => {
    waitlistService = { join: jest.fn(), stats: jest.fn() };

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [WaitlistGrpcController],
      providers: [{ provide: WaitlistService, useValue: waitlistService }],
    }).compile();

    controller = moduleRef.get(WaitlistGrpcController);
  });

  const REQUEST = {
    source: 'marketplace_web',
    email: 'ada@example.com',
    phone: '',
    fullName: 'Ada Lovelace',
  };

  it('returns {id, success: true} and calls WaitlistService.join with the mapped shape when it succeeds', async () => {
    waitlistService.join.mockResolvedValue({ id: 'WL-1' });

    const result = await controller.joinWaitlist(REQUEST as any);

    expect(result).toEqual({ id: 'WL-1', success: true });
    expect(waitlistService.join).toHaveBeenCalledWith({
      source: 'marketplace_web',
      email: 'ada@example.com',
      phone: undefined,
      fullName: 'Ada Lovelace',
    });
  });

  it('wraps a BadRequestException (missing email and phone) in an RpcException with INVALID_ARGUMENT and the original message preserved', async () => {
    const message = 'Provide an email or phone number';
    waitlistService.join.mockRejectedValue(new BadRequestException(message));

    try {
      await controller.joinWaitlist(REQUEST as any);
      fail('expected joinWaitlist to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(RpcException);
      expect((err as RpcException).getError()).toEqual({ code: status.INVALID_ARGUMENT, message });
    }
  });

  it('rethrows any other error type unchanged, letting the default BaseRpcExceptionFilter handle it', async () => {
    const originalError = new Error('db connection lost');
    waitlistService.join.mockRejectedValue(originalError);

    try {
      await controller.joinWaitlist(REQUEST as any);
      fail('expected joinWaitlist to throw');
    } catch (err) {
      expect(err).toBe(originalError);
      expect(err).not.toBeInstanceOf(RpcException);
    }
  });
});
