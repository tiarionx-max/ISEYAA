import { Test, TestingModule } from '@nestjs/testing';
import { RedisService } from '../redis.service';
import { ConfigService } from '@nestjs/config';

// Mock ioredis at the module level
const mockRedisInstance = {
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

jest.mock('ioredis', () => jest.fn().mockImplementation(() => mockRedisInstance));

import Redis from 'ioredis';

const MockedRedis = Redis as jest.MockedClass<typeof Redis>;

describe('RedisService', () => {
  let service: RedisService;

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('when REDIS_URL is set', () => {
    beforeEach(async () => {
      const mockConfig = {
        get: jest.fn((key: string) => {
          if (key === 'REDIS_URL') return 'rediss://default:password@my-redis.upstash.io:6379';
          return undefined;
        }),
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          RedisService,
          { provide: ConfigService, useValue: mockConfig },
        ],
      }).compile();

      service = module.get<RedisService>(RedisService);
      service.onModuleInit();
    });

    // Test 1: When REDIS_URL is set, RedisService constructor calls new Redis(redisUrl)
    it('calls new Redis(url) with the TLS URL string when REDIS_URL is provided', () => {
      expect(MockedRedis).toHaveBeenCalledWith(
        'rediss://default:password@my-redis.upstash.io:6379',
      );
    });
  });

  describe('when REDIS_URL is absent but REDIS_HOST is set', () => {
    beforeEach(async () => {
      const mockConfig = {
        get: jest.fn((key: string, defaultValue?: unknown) => {
          if (key === 'REDIS_URL') return undefined;
          if (key === 'REDIS_HOST') return 'localhost';
          if (key === 'REDIS_PORT') return 6379;
          if (key === 'REDIS_PASSWORD') return undefined;
          return defaultValue;
        }),
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          RedisService,
          { provide: ConfigService, useValue: mockConfig },
        ],
      }).compile();

      service = module.get<RedisService>(RedisService);
      service.onModuleInit();
    });

    // Test 2: Falls back to host/port form with tls: {}
    it('calls new Redis({ host, port, tls: {} }) when REDIS_URL is absent', () => {
      expect(MockedRedis).toHaveBeenCalledWith(
        expect.objectContaining({
          host: 'localhost',
          port: 6379,
          tls: {},
          lazyConnect: true,
        }),
      );
    });
  });

  describe('CRUD operations', () => {
    beforeEach(async () => {
      const mockConfig = {
        get: jest.fn((key: string) => {
          if (key === 'REDIS_URL') return 'rediss://default:pass@host:6379';
          return undefined;
        }),
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          RedisService,
          { provide: ConfigService, useValue: mockConfig },
        ],
      }).compile();

      service = module.get<RedisService>(RedisService);
      service.onModuleInit();
    });

    // Test 3: get(key) calls client.get(key) and returns the string value
    it('get(key) calls client.get(key) and returns the value', async () => {
      mockRedisInstance.get.mockResolvedValue('test-value');
      const result = await service.get('test-key');
      expect(mockRedisInstance.get).toHaveBeenCalledWith('test-key');
      expect(result).toBe('test-value');
    });

    // Test 4: set(key, value, ttl) calls client.set(key, value, 'EX', ttl)
    it('set(key, value, ttl) calls client.set with EX option', async () => {
      mockRedisInstance.set.mockResolvedValue('OK');
      await service.set('my-key', 'my-value', 300);
      expect(mockRedisInstance.set).toHaveBeenCalledWith('my-key', 'my-value', 'EX', 300);
    });

    // Test 5: del(key) calls client.del(key)
    it('del(key) calls client.del(key)', async () => {
      mockRedisInstance.del.mockResolvedValue(1);
      await service.del('delete-key');
      expect(mockRedisInstance.del).toHaveBeenCalledWith('delete-key');
    });

    // Test 6: exists(key) calls client.exists(key) and returns boolean
    it('exists(key) calls client.exists(key) and returns true when key exists', async () => {
      mockRedisInstance.exists.mockResolvedValue(1);
      const result = await service.exists('existing-key');
      expect(mockRedisInstance.exists).toHaveBeenCalledWith('existing-key');
      expect(result).toBe(true);
    });

    it('exists(key) returns false when key does not exist', async () => {
      mockRedisInstance.exists.mockResolvedValue(0);
      const result = await service.exists('missing-key');
      expect(result).toBe(false);
    });
  });
});
