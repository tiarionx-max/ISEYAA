import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { DeliveryOtpClientService } from '../delivery-otp-client.service';
import { DELIVERY_OTP_PACKAGE } from '../delivery-otp-client.constants';
import { ResilienceService } from '../../../resilience/resilience.service';
import { PrismaService } from '../../../prisma/prisma.service';

/**
 * 21-07 Task 3 — DeliveryOtpClientService spec.
 *
 * Mirrors notifications-client.service.spec.ts's mock structure (`mockGrpcService`,
 * `mockClientGrpc`, `mockResilience`, `mockPrisma.platformConfig.findUnique`,
 * `makeService(canaryFlagValue?)`). Proves the full round-trip business-vs-transport
 * exception mapping against 21-06's server-side RpcException codes.
 */

const ORDER_ID = 'ORD-1';
const OTP = '123456';
const WRONG_OTP_MESSAGE = 'Incorrect OTP. Ask the recipient to check their SMS. 2 attempt(s) remaining.';
const NOT_FOUND_MESSAGE = 'Delivery order not found';

interface MockGrpcService {
  verifyDeliveryOtp: jest.Mock;
}

let mockGrpcService: MockGrpcService;
let mockClientGrpc: { getService: jest.Mock };
let mockResilience: { execute: jest.Mock };
let mockPrisma: { platformConfig: { findUnique: jest.Mock } };

// `canaryFlagValue`: undefined => findUnique resolves null (row absent, default enabled);
// otherwise findUnique resolves `{ value: canaryFlagValue }`.
async function makeService(canaryFlagValue?: unknown): Promise<DeliveryOtpClientService> {
  mockGrpcService = {
    verifyDeliveryOtp: jest.fn().mockReturnValue(of({ success: true })),
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
  };

  const moduleRef: TestingModule = await Test.createTestingModule({
    providers: [
      DeliveryOtpClientService,
      { provide: DELIVERY_OTP_PACKAGE, useValue: mockClientGrpc },
      { provide: ResilienceService, useValue: mockResilience },
      { provide: PrismaService, useValue: mockPrisma },
    ],
  }).compile();

  const svc = moduleRef.get(DeliveryOtpClientService);
  svc.onModuleInit();
  return svc;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('DeliveryOtpClientService', () => {
  // 1. Success path.
  it('1. verifyOtp: on gRPC success, resolves { verified: true }', async () => {
    const svc = await makeService();

    await expect(svc.verifyOtp(ORDER_ID, OTP)).resolves.toEqual({ verified: true });

    expect(mockGrpcService.verifyDeliveryOtp).toHaveBeenCalledWith({ orderId: ORDER_ID, otp: OTP });
  });

  // 2. INVALID_ARGUMENT (code 3) -> BadRequestException with the exact preserved message.
  it('2. verifyOtp: on gRPC error code 3 (INVALID_ARGUMENT), throws BadRequestException with the exact original message', async () => {
    const svc = await makeService();
    mockGrpcService.verifyDeliveryOtp.mockReturnValue(
      throwError(() => ({ code: 3, message: WRONG_OTP_MESSAGE })),
    );

    await expect(svc.verifyOtp(ORDER_ID, OTP)).rejects.toThrow(BadRequestException);
    await expect(svc.verifyOtp(ORDER_ID, OTP)).rejects.toThrow(WRONG_OTP_MESSAGE);
  });

  // 3. NOT_FOUND (code 5) -> NotFoundException with the exact preserved message.
  it('3. verifyOtp: on gRPC error code 5 (NOT_FOUND), throws NotFoundException with the exact original message', async () => {
    const svc = await makeService();
    mockGrpcService.verifyDeliveryOtp.mockReturnValue(
      throwError(() => ({ code: 5, message: NOT_FOUND_MESSAGE })),
    );

    await expect(svc.verifyOtp(ORDER_ID, OTP)).rejects.toThrow(NotFoundException);
    await expect(svc.verifyOtp(ORDER_ID, OTP)).rejects.toThrow(NOT_FOUND_MESSAGE);
  });

  // 4. Codeless transport error -> generic ServiceUnavailableException, NOT the raw message.
  it('4. verifyOtp: on a codeless transport error, throws ServiceUnavailableException with the standard message, not the raw error text', async () => {
    const svc = await makeService();
    mockGrpcService.verifyDeliveryOtp.mockReturnValue(throwError(() => new Error('UNAVAILABLE')));

    await expect(svc.verifyOtp(ORDER_ID, OTP)).rejects.toThrow(ServiceUnavailableException);
    await expect(svc.verifyOtp(ORDER_ID, OTP)).rejects.toThrow(
      /Delivery OTP service is temporarily unavailable/,
    );
    // Must NOT leak the raw transport error text as the exception message.
    await expect(svc.verifyOtp(ORDER_ID, OTP)).rejects.not.toThrow('UNAVAILABLE');
  });

  // 5. Transport-level numeric code (14 = UNAVAILABLE) distinct from INVALID_ARGUMENT/NOT_FOUND
  // -> still ServiceUnavailableException, proving the mapping doesn't treat every numeric
  // .code as a business-rule error.
  it('5. verifyOtp: on gRPC error code 14 (transport UNAVAILABLE), throws ServiceUnavailableException, not BadRequestException/NotFoundException', async () => {
    const svc = await makeService();
    mockGrpcService.verifyDeliveryOtp.mockReturnValue(
      throwError(() => ({ code: 14, message: 'connection reset' })),
    );

    await expect(svc.verifyOtp(ORDER_ID, OTP)).rejects.toThrow(ServiceUnavailableException);
    await expect(svc.verifyOtp(ORDER_ID, OTP)).rejects.toThrow(
      /Delivery OTP service is temporarily unavailable/,
    );
  });

  // 6. Canary kill-switch: flag explicitly false -> refuses the gRPC call entirely, never
  // touching resilience.execute or the gRPC client.
  it('6. verifyOtp: when canary_enabled flag is false, throws ServiceUnavailableException without calling resilience.execute or the gRPC client', async () => {
    const svc = await makeService(false);

    await expect(svc.verifyOtp(ORDER_ID, OTP)).rejects.toThrow(ServiceUnavailableException);
    await expect(svc.verifyOtp(ORDER_ID, OTP)).rejects.toThrow(
      /Delivery OTP service is temporarily unavailable/,
    );

    expect(mockResilience.execute).not.toHaveBeenCalled();
    expect(mockGrpcService.verifyDeliveryOtp).not.toHaveBeenCalled();
  });

  // 7. Network call is routed through resilience.execute with 'deliveryOtpGrpc' as the first argument.
  it('7. verifyOtp: routes the network call through resilience.execute with "deliveryOtpGrpc" as the first argument', async () => {
    const svc = await makeService();

    await svc.verifyOtp(ORDER_ID, OTP);

    expect(mockResilience.execute).toHaveBeenCalledWith('deliveryOtpGrpc', expect.any(Function));
  });

  // 8. Regression: row absent or value !== false -> existing gRPC-calling behavior unchanged.
  it('8. verifyOtp: when canary_enabled flag is absent or true, existing gRPC behavior is unchanged', async () => {
    const svcAbsent = await makeService(undefined);
    await expect(svcAbsent.verifyOtp(ORDER_ID, OTP)).resolves.toEqual({ verified: true });

    const svcTrue = await makeService(true);
    await expect(svcTrue.verifyOtp(ORDER_ID, OTP)).resolves.toEqual({ verified: true });
  });
});
