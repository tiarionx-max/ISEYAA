import { Test, TestingModule } from '@nestjs/testing';
import { NotificationsService } from '../notifications.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { ResilienceService } from '../../../resilience/resilience.service';
import axios from 'axios';

jest.mock('axios');

jest.mock('google-auth-library', () => ({
  GoogleAuth: jest.fn().mockImplementation(() => ({
    fromJSON: jest.fn().mockReturnValue({
      getAccessToken: jest.fn().mockResolvedValue({ token: 'access-tok' }),
    }),
  })),
  JWT: jest.fn(),
}));

const mockedAxios = axios as jest.Mocked<typeof axios>;

const mockPrisma = {
  user: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
};

const SERVICE_ACCOUNT_JSON = JSON.stringify({
  project_id: 'test-project',
  client_email: 'fcm@test-project.iam.gserviceaccount.com',
  private_key: '-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----\n',
});

const mockConfig = {
  get: jest.fn((key: string, def?: unknown) => {
    if (key === 'FIREBASE_SERVICE_ACCOUNT_JSON') return SERVICE_ACCOUNT_JSON;
    return def;
  }),
};

const mockResilience = {
  execute: jest.fn((_vendor: string, fn: (context: { signal: AbortSignal | undefined }) => any) =>
    fn({ signal: undefined }),
  ),
};

describe('NotificationsService.sendPush', () => {
  let service: NotificationsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockConfig.get.mockImplementation((key: string, def?: unknown) => {
      if (key === 'FIREBASE_SERVICE_ACCOUNT_JSON') return SERVICE_ACCOUNT_JSON;
      return def;
    });
    mockResilience.execute.mockImplementation(
      (_vendor: string, fn: (context: { signal: AbortSignal | undefined }) => any) => fn({ signal: undefined }),
    );
    mockedAxios.post.mockResolvedValue({ data: {} });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConfigService, useValue: mockConfig },
        { provide: ResilienceService, useValue: mockResilience },
      ],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);
  });

  it('returns {sent:false, reason:"no_token"} when the user has no fcmToken', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-1', metadata: {} });

    const result = await service.sendPush('user-1', 'Title', 'Body');

    expect(result).toEqual({ sent: false, reason: 'no_token' });
  });

  it('returns {sent:false, reason:"not_configured"} when FIREBASE_SERVICE_ACCOUNT_JSON is absent', async () => {
    mockConfig.get.mockImplementation((key: string, def?: unknown) => {
      if (key === 'FIREBASE_SERVICE_ACCOUNT_JSON') return '';
      return def;
    });
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConfigService, useValue: mockConfig },
        { provide: ResilienceService, useValue: mockResilience },
      ],
    }).compile();
    const unconfiguredService = module.get<NotificationsService>(NotificationsService);

    mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-1', metadata: { fcmToken: 'token-1' } });

    const result = await unconfiguredService.sendPush('user-1', 'Title', 'Body');

    expect(result).toEqual({ sent: false, reason: 'not_configured' });
  });

  it('returns {sent:true} on success and routes the call through resilience.execute("fcm", ...)', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-1', metadata: { fcmToken: 'token-1' } });

    const result = await service.sendPush('user-1', 'Title', 'Body');

    expect(result).toEqual({ sent: true });
    expect(mockResilience.execute).toHaveBeenCalledWith('fcm', expect.any(Function));
  });

  it('returns {sent:false, reason:"send_failed"} and NEVER throws when resilience.execute rejects (simulated circuit-open)', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-1', metadata: { fcmToken: 'token-1' } });
    mockResilience.execute.mockRejectedValue(new Error('circuit open'));

    await expect(service.sendPush('user-1', 'Title', 'Body')).resolves.toEqual({
      sent: false,
      reason: 'send_failed',
    });
  });

});

describe('NotificationsService.registerToken', () => {
  let service: NotificationsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockConfig.get.mockImplementation((key: string, def?: unknown) => {
      if (key === 'FIREBASE_SERVICE_ACCOUNT_JSON') return SERVICE_ACCOUNT_JSON;
      return def;
    });
    mockResilience.execute.mockImplementation(
      (_vendor: string, fn: (context: { signal: AbortSignal | undefined }) => any) => fn({ signal: undefined }),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConfigService, useValue: mockConfig },
        { provide: ResilienceService, useValue: mockResilience },
      ],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);
  });

  it('Test 1: merges the new fcmToken into existing metadata, preserving pre-existing keys', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      metadata: { preferences: { theme: 'dark' } },
    });

    await service.registerToken('user-1', 'new-fcm-token');

    expect(mockPrisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { metadata: { preferences: { theme: 'dark' }, fcmToken: 'new-fcm-token' } },
      }),
    );
  });

  it('Test 2: writes just { fcmToken } when there is no prior metadata (null), without crashing', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-1', metadata: null });

    await service.registerToken('user-1', 'new-fcm-token');

    expect(mockPrisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { metadata: { fcmToken: 'new-fcm-token' } },
      }),
    );
  });
});
