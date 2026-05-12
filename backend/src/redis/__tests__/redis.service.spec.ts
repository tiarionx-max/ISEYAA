import { Test, TestingModule } from '@nestjs/testing';
import { RedisService } from '../redis.service';
import { ConfigService } from '@nestjs/config';

// ioredis mock — factory must be defined inline due to jest.mock hoisting
// The mock uses { default: constructor, __esModule: true } to satisfy both:
//   CommonJS (ts-jest with allowSyntheticDefaultImports): ioredis_1.default
//   Direct require(): require('ioredis') => the module object
jest.mock('ioredis', () => {
  const mockInstance = {
    on: jest.fn(),
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    exists: jest.fn(),
    quit: jest.fn(),
    ttl: jest.fn(),
    incr: jest.fn(),
    expire: jest.fn(),
  };
  const MockRedis = jest.fn(() => mockInstance);
  return { default: MockRedis, __esModule: true, __mock: mockInstance };
});

// eslint-disable-next-line @typescript-eslint/no-var-requires
const ioredisModule = require('ioredis') as { default: jest.Mock; __mock: Record<string, jest.Mock> };
const RedisMock = ioredisModule.default;
const mockHelper = ioredisModule as unknown as { __mock: Record<string, jest.Mock> };

function makeConfigService(values: Record<string, unknown>): ConfigService {
  return {
    get: jest.fn((key: string, defaultValue?: unknown) => {
      if (key in values) return values[key];
      return defaultValue;
    }),
  } as unknown as ConfigService;
}

describe('RedisService', () => {
  beforeEach(() => {
    RedisMock.mockClear();
    Object.values(mockHelper.__mock).forEach((fn) => fn.mockReset());
  });

  // Test 1: When REDIS_URL is set, calls new Redis(redisUrl) — URL string form
  it('calls new Redis(url) with the TLS URL string when REDIS_URL is provided', async () => {
    const service = new RedisService(
      makeConfigService({ REDIS_URL: 'rediss://default:password@my-redis.upstash.io:6379' }),
    );
    service.onModuleInit();
    expect(RedisMock).toHaveBeenCalledWith('rediss://default:password@my-redis.upstash.io:6379');
  });

  // Test 2: When REDIS_URL is absent, falls back to host/port with tls: {}
  it('calls new Redis({ host, port, tls: {} }) when REDIS_URL is absent', async () => {
    const service = new RedisService(
      makeConfigService({ REDIS_URL: undefined, REDIS_HOST: 'redis.example.com', REDIS_PORT: 6379 }),
    );
    service.onModuleInit();
    expect(RedisMock).toHaveBeenCalledWith(
      expect.objectContaining({ host: 'redis.example.com', tls: {}, lazyConnect: true }),
    );
  });

  // Test 3: get(key) calls client.get(key) and returns the string value
  it('get(key) calls client.get(key) and returns the value', async () => {
    const service = new RedisService(makeConfigService({ REDIS_URL: 'rediss://host:6379' }));
    service.onModuleInit();
    mockHelper.__mock.get.mockResolvedValue('test-value');
    const result = await service.get('test-key');
    expect(mockHelper.__mock.get).toHaveBeenCalledWith('test-key');
    expect(result).toBe('test-value');
  });

  // Test 4: set(key, value, ttl) calls client.set(key, value, 'EX', ttl)
  it('set(key, value, ttl) calls client.set with EX option', async () => {
    const service = new RedisService(makeConfigService({ REDIS_URL: 'rediss://host:6379' }));
    service.onModuleInit();
    mockHelper.__mock.set.mockResolvedValue('OK');
    await service.set('my-key', 'my-value', 300);
    expect(mockHelper.__mock.set).toHaveBeenCalledWith('my-key', 'my-value', 'EX', 300);
  });

  // Test 5: del(key) calls client.del(key)
  it('del(key) calls client.del(key)', async () => {
    const service = new RedisService(makeConfigService({ REDIS_URL: 'rediss://host:6379' }));
    service.onModuleInit();
    mockHelper.__mock.del.mockResolvedValue(1);
    await service.del('delete-key');
    expect(mockHelper.__mock.del).toHaveBeenCalledWith('delete-key');
  });

  // Test 6: exists(key) calls client.exists(key) and returns boolean
  it('exists(key) returns true when key exists', async () => {
    const service = new RedisService(makeConfigService({ REDIS_URL: 'rediss://host:6379' }));
    service.onModuleInit();
    mockHelper.__mock.exists.mockResolvedValue(1);
    const result = await service.exists('existing-key');
    expect(mockHelper.__mock.exists).toHaveBeenCalledWith('existing-key');
    expect(result).toBe(true);
  });

  it('exists(key) returns false when key does not exist', async () => {
    const service = new RedisService(makeConfigService({ REDIS_URL: 'rediss://host:6379' }));
    service.onModuleInit();
    mockHelper.__mock.exists.mockResolvedValue(0);
    const result = await service.exists('missing-key');
    expect(result).toBe(false);
  });

  // Verify NestJS TestingModule integration also works
  it('integrates with NestJS TestingModule', async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RedisService,
        {
          provide: ConfigService,
          useValue: makeConfigService({ REDIS_URL: 'rediss://host:6379' }),
        },
      ],
    }).compile();
    expect(module.get<RedisService>(RedisService)).toBeInstanceOf(RedisService);
  });
});
