import { Test, TestingModule } from '@nestjs/testing';
import { ServiceUnavailableException } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { NotificationsClientService } from '../notifications-client.service';
import { NOTIFICATIONS_PACKAGE } from '../notifications-client.constants';
import { ResilienceService } from '../../../resilience/resilience.service';
import { PrismaService } from '../../../prisma/prisma.service';

/**
 * 17-03 Task 2 — NotificationsClientService spec.
 *
 * First `ClientGrpc` mock in this codebase (no existing analog to copy verbatim). Mocks
 * `ClientGrpc.getService` to return a mock gRPC service object whose `sendPush`/
 * `registerToken` jest.fn() mocks return `rxjs`'s `of(...)` (success) or `throwError(...)`
 * (failure). `ResilienceService.execute` is mocked to invoke the wrapped fn directly so we
 * can assert both the vendor key argument and the underlying request payload.
 */

const USER_ID = 'USR-1';
const TOKEN = 'fcm-token-abc123';

interface MockGrpcService {
  sendPush: jest.Mock;
  registerToken: jest.Mock;
}

let mockGrpcService: MockGrpcService;
let mockClientGrpc: { getService: jest.Mock };
let mockResilience: { execute: jest.Mock };
let mockPrisma: { platformConfig: { findUnique: jest.Mock } };

// `canaryFlagValue`: undefined => findUnique resolves null (row absent, default enabled);
// otherwise findUnique resolves `{ value: canaryFlagValue }` (mirrors SETTLE-09's
// delivery.service.ts mock shape for the same PlatformConfig read pattern).
async function makeService(canaryFlagValue?: unknown): Promise<NotificationsClientService> {
  mockGrpcService = {
    sendPush: jest.fn().mockReturnValue(of({ success: true })),
    registerToken: jest.fn().mockReturnValue(of({ success: true })),
  };
  mockClientGrpc = { getService: jest.fn().mockReturnValue(mockGrpcService) };
  // Default: run the wrapped fn immediately, passing a real AbortSignal — mirrors
  // ResilienceService.execute()'s real call shape without exercising cockatiel itself.
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
      NotificationsClientService,
      { provide: NOTIFICATIONS_PACKAGE, useValue: mockClientGrpc },
      { provide: ResilienceService, useValue: mockResilience },
      { provide: PrismaService, useValue: mockPrisma },
    ],
  }).compile();

  const svc = moduleRef.get(NotificationsClientService);
  svc.onModuleInit();
  return svc;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('NotificationsClientService', () => {
  // 1. D-03 — listForUser stays a local no-op stub, zero network/resilience calls.
  it('1. listForUser: resolves to [] with zero calls to resilience.execute or the gRPC client', async () => {
    const svc = await makeService();

    await expect(svc.listForUser(USER_ID)).resolves.toEqual([]);

    expect(mockResilience.execute).not.toHaveBeenCalled();
    expect(mockGrpcService.sendPush).not.toHaveBeenCalled();
    expect(mockGrpcService.registerToken).not.toHaveBeenCalled();
    expect(mockClientGrpc.getService).toHaveBeenCalledTimes(1); // only from onModuleInit
  });

  // 2. registerToken success path.
  it('2. registerToken: on gRPC success, resolves { registered: true }', async () => {
    const svc = await makeService();

    await expect(svc.registerToken(USER_ID, TOKEN)).resolves.toEqual({ registered: true });

    expect(mockGrpcService.registerToken).toHaveBeenCalledWith({ userId: USER_ID, fcmToken: TOKEN });
  });

  // 3. registerToken failure path — D-06: 503 on transport failure, never silent success.
  it('3. registerToken: on gRPC/resilience failure, throws ServiceUnavailableException mentioning "Notifications service is temporarily unavailable"', async () => {
    const svc = await makeService();
    mockGrpcService.registerToken.mockReturnValue(throwError(() => new Error('UNAVAILABLE')));

    await expect(svc.registerToken(USER_ID, TOKEN)).rejects.toThrow(ServiceUnavailableException);
    await expect(svc.registerToken(USER_ID, TOKEN)).rejects.toThrow(
      /Notifications service is temporarily unavailable/,
    );
  });

  // 4. sendPush success — data defaults to {} when the 4th arg is omitted (never undefined).
  it('4. sendPush: on gRPC success with no data arg, resolves { sent: true } and sends data: {}', async () => {
    const svc = await makeService();

    await expect(svc.sendPush(USER_ID, 'Title', 'Body')).resolves.toEqual({ sent: true });

    expect(mockGrpcService.sendPush).toHaveBeenCalledWith({
      userId: USER_ID,
      title: 'Title',
      body: 'Body',
      data: {},
    });
  });

  // 4b. sendPush passes provided data through unchanged.
  it('4b. sendPush: forwards a provided data payload unchanged', async () => {
    const svc = await makeService();
    const data = { type: 'booking', bookingId: 'BKG-1' };

    await svc.sendPush(USER_ID, 'Title', 'Body', data);

    expect(mockGrpcService.sendPush).toHaveBeenCalledWith({
      userId: USER_ID,
      title: 'Title',
      body: 'Body',
      data,
    });
  });

  // 4c. sendPush business-level failure (no-token/not_configured/etc.) — a real, non-throwing
  // gRPC response with success: false must surface as { sent: false }, NOT the hardcoded
  // { sent: true } the pre-fix code always returned regardless of the mocked response body.
  it('4c. sendPush: on gRPC success with success: false (business-level failure, e.g. no FCM token), resolves { sent: false } without throwing', async () => {
    const svc = await makeService();
    mockGrpcService.sendPush.mockReturnValue(of({ success: false }));

    await expect(svc.sendPush(USER_ID, 'Title', 'Body')).resolves.toEqual({ sent: false });
  });

  // 5. sendPush failure path.
  it('5. sendPush: on gRPC/resilience failure, throws ServiceUnavailableException', async () => {
    const svc = await makeService();
    mockGrpcService.sendPush.mockReturnValue(throwError(() => new Error('UNAVAILABLE')));

    await expect(svc.sendPush(USER_ID, 'Title', 'Body')).rejects.toThrow(ServiceUnavailableException);
    await expect(svc.sendPush(USER_ID, 'Title', 'Body')).rejects.toThrow(
      /Notifications service is temporarily unavailable/,
    );
  });

  // 6. Both network-calling methods route through resilience.execute('notificationsGrpc', ...).
  it('6. registerToken and sendPush both call resilience.execute with "notificationsGrpc" as the first argument', async () => {
    const svc = await makeService();

    await svc.registerToken(USER_ID, TOKEN);
    await svc.sendPush(USER_ID, 'Title', 'Body');

    expect(mockResilience.execute).toHaveBeenNthCalledWith(1, 'notificationsGrpc', expect.any(Function));
    expect(mockResilience.execute).toHaveBeenNthCalledWith(2, 'notificationsGrpc', expect.any(Function));
  });

  // 7. D-01/D-10 canary kill-switch: flag explicitly false -> registerToken refuses the
  // gRPC call entirely, never touching resilience.execute or the gRPC client.
  it('7. registerToken: when canary_enabled flag is false, throws ServiceUnavailableException without calling resilience.execute', async () => {
    const svc = await makeService(false);

    await expect(svc.registerToken(USER_ID, TOKEN)).rejects.toThrow(ServiceUnavailableException);
    await expect(svc.registerToken(USER_ID, TOKEN)).rejects.toThrow(
      /Notifications service is temporarily unavailable/,
    );

    expect(mockResilience.execute).not.toHaveBeenCalled();
    expect(mockGrpcService.registerToken).not.toHaveBeenCalled();
  });

  // 8. Same kill-switch guard on sendPush.
  it('8. sendPush: when canary_enabled flag is false, throws ServiceUnavailableException without calling resilience.execute', async () => {
    const svc = await makeService(false);

    await expect(svc.sendPush(USER_ID, 'Title', 'Body')).rejects.toThrow(ServiceUnavailableException);
    await expect(svc.sendPush(USER_ID, 'Title', 'Body')).rejects.toThrow(
      /Notifications service is temporarily unavailable/,
    );

    expect(mockResilience.execute).not.toHaveBeenCalled();
    expect(mockGrpcService.sendPush).not.toHaveBeenCalled();
  });

  // 9. Regression: row absent or value !== false -> existing gRPC-calling behavior on both
  // methods is completely unchanged.
  it('9. registerToken and sendPush: when canary_enabled flag is absent or true, existing gRPC behavior is unchanged', async () => {
    const svcAbsent = await makeService(undefined);
    await expect(svcAbsent.registerToken(USER_ID, TOKEN)).resolves.toEqual({ registered: true });
    await expect(svcAbsent.sendPush(USER_ID, 'Title', 'Body')).resolves.toEqual({ sent: true });
    expect(mockResilience.execute).toHaveBeenCalledTimes(2);

    const svcTrue = await makeService(true);
    await expect(svcTrue.registerToken(USER_ID, TOKEN)).resolves.toEqual({ registered: true });
    await expect(svcTrue.sendPush(USER_ID, 'Title', 'Body')).resolves.toEqual({ sent: true });
    expect(mockResilience.execute).toHaveBeenCalledTimes(2);
  });
});
