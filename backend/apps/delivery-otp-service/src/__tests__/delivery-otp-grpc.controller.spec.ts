import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { status } from '@grpc/grpc-js';
import { DeliveryOtpGrpcController } from '../delivery-otp-grpc.controller';
import { DeliveryService } from '../../../../src/modules/delivery/delivery.service';

describe('DeliveryOtpGrpcController', () => {
  let controller: DeliveryOtpGrpcController;
  let deliveryService: { verifyOtp: jest.Mock };

  beforeEach(async () => {
    deliveryService = { verifyOtp: jest.fn() };

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [DeliveryOtpGrpcController],
      providers: [{ provide: DeliveryService, useValue: deliveryService }],
    }).compile();

    controller = moduleRef.get(DeliveryOtpGrpcController);
  });

  it('returns {success: true} when DeliveryService.verifyOtp succeeds', async () => {
    deliveryService.verifyOtp.mockResolvedValue({ verified: true });

    const result = await controller.verifyDeliveryOtp({ orderId: 'order-1', otp: '123456' });

    expect(result).toEqual({ success: true });
    expect(deliveryService.verifyOtp).toHaveBeenCalledWith('order-1', { otp: '123456' });
  });

  it('wraps a BadRequestException (wrong/expired/locked OTP) in an RpcException with INVALID_ARGUMENT and the original message preserved', async () => {
    const message = 'Incorrect OTP. Ask the recipient to check their SMS. 2 attempt(s) remaining.';
    deliveryService.verifyOtp.mockRejectedValue(new BadRequestException(message));

    try {
      await controller.verifyDeliveryOtp({ orderId: 'order-1', otp: '000000' });
      fail('expected verifyDeliveryOtp to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(RpcException);
      expect((err as RpcException).getError()).toEqual({ code: status.INVALID_ARGUMENT, message });
    }
  });

  it('wraps a NotFoundException (order not found) in an RpcException with NOT_FOUND and the original message preserved', async () => {
    const message = 'Delivery order not found';
    deliveryService.verifyOtp.mockRejectedValue(new NotFoundException(message));

    try {
      await controller.verifyDeliveryOtp({ orderId: 'missing-order', otp: '123456' });
      fail('expected verifyDeliveryOtp to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(RpcException);
      expect((err as RpcException).getError()).toEqual({ code: status.NOT_FOUND, message });
    }
  });

  it('rethrows any other error type unchanged, letting the default BaseRpcExceptionFilter handle it', async () => {
    const originalError = new Error('db connection lost');
    deliveryService.verifyOtp.mockRejectedValue(originalError);

    try {
      await controller.verifyDeliveryOtp({ orderId: 'order-1', otp: '123456' });
      fail('expected verifyDeliveryOtp to throw');
    } catch (err) {
      expect(err).toBe(originalError);
      expect(err).not.toBeInstanceOf(RpcException);
    }
  });
});
