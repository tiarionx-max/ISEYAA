import { BadRequestException, Controller, NotFoundException } from '@nestjs/common';
import { GrpcMethod, RpcException } from '@nestjs/microservices';
import { status as GrpcStatus } from '@grpc/grpc-js';
import { DeliveryService } from '../../../src/modules/delivery/delivery.service';
import { delivery } from '@iseyaa/proto';

/**
 * Implements ONLY VerifyDeliveryOtp per GRPC-07's explicit scope —
 * RequestDelivery/AcceptDelivery/CompleteDelivery remain unimplemented server
 * methods, even though they exist in the same delivery.proto file.
 *
 * NestJS's default @GrpcMethod exception handling does NOT preserve a thrown
 * BadRequestException/NotFoundException's message across the gRPC boundary —
 * BaseRpcExceptionFilter replaces any non-RpcException with the generic
 * "Internal server error" string. Business-rule OTP failures (wrong OTP,
 * expired OTP, lockout) are explicitly re-wrapped in RpcException below so the
 * original message reaches the driver. Any other error type is rethrown
 * unmodified, deliberately falling through to the default filter's generic
 * response — that path is for genuine defects, not business-rule failures.
 */
@Controller()
export class DeliveryOtpGrpcController {
  constructor(private readonly deliveryService: DeliveryService) {}

  @GrpcMethod('DeliveryService', 'VerifyDeliveryOtp')
  async verifyDeliveryOtp(
    data: delivery.VerifyDeliveryOtpRequest,
  ): Promise<delivery.VerifyDeliveryOtpResponse> {
    try {
      const result = await this.deliveryService.verifyOtp(data.orderId, { otp: data.otp });
      return { success: result.verified };
    } catch (err) {
      if (err instanceof BadRequestException) {
        throw new RpcException({ code: GrpcStatus.INVALID_ARGUMENT, message: err.message });
      }
      if (err instanceof NotFoundException) {
        throw new RpcException({ code: GrpcStatus.NOT_FOUND, message: err.message });
      }
      throw err;
    }
  }
}
