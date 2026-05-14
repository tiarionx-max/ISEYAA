import { Injectable, OnModuleDestroy, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private client: Redis | null = null;
  private readonly logger = new Logger(RedisService.name);
  private enabled = false;

  constructor(private config: ConfigService) {}

  onModuleInit() {
    const redisUrl = this.config.get<string>('REDIS_URL');
    if (!redisUrl) {
      this.logger.warn('REDIS_URL not configured — Redis disabled (local dev mode)');
      return;
    }

    let errorLogged = false;
    this.client = new Redis(redisUrl, {
      maxRetriesPerRequest: 0,
      enableOfflineQueue: false,
      retryStrategy: (times) => {
        if (times >= 3) {
          if (!this.enabled) return null; // already disabled
          this.enabled = false;
          this.logger.warn('Redis unreachable after 3 attempts — disabling Redis (local dev mode)');
          return null;
        }
        return Math.min(times * 500, 2000);
      },
    });
    this.enabled = true;

    this.client.on('error', (err) => {
      if (!errorLogged) {
        errorLogged = true;
        this.logger.error('Redis error', err.message ?? err);
      }
    });
    this.client.on('connect', () => {
      this.enabled = true;
      errorLogged = false;
    });
  }

  async onModuleDestroy() {
    if (this.client) await this.client.quit();
  }

  async get(key: string): Promise<string | null> {
    if (!this.client || !this.enabled) return null;
    try { return await this.client.get(key); } catch { return null; }
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (!this.client || !this.enabled) return;
    try {
      if (ttlSeconds) {
        await this.client.set(key, value, 'EX', ttlSeconds);
      } else {
        await this.client.set(key, value);
      }
    } catch { /* silent in dev */ }
  }

  async del(key: string): Promise<void> {
    if (!this.client || !this.enabled) return;
    try { await this.client.del(key); } catch { /* silent */ }
  }

  async exists(key: string): Promise<boolean> {
    if (!this.client || !this.enabled) return false;
    try {
      const result = await this.client.exists(key);
      return result === 1;
    } catch { return false; }
  }

  async ttl(key: string): Promise<number> {
    if (!this.client || !this.enabled) return -2;
    try { return await this.client.ttl(key); } catch { return -2; }
  }

  async incr(key: string): Promise<number> {
    if (!this.client || !this.enabled) return 0;
    try { return await this.client.incr(key); } catch { return 0; }
  }

  async expire(key: string, ttlSeconds: number): Promise<void> {
    if (!this.client || !this.enabled) return;
    try { await this.client.expire(key, ttlSeconds); } catch { /* silent */ }
  }

  async geoadd(key: string, lng: number, lat: number, member: string): Promise<void> {
    if (!this.client || !this.enabled) return;
    try { await this.client.geoadd(key, lng, lat, member); } catch { /* silent */ }
  }

  async geosearch(key: string, lng: number, lat: number, radiusKm: number): Promise<string[]> {
    if (!this.client || !this.enabled) return [];
    try {
      const results = await this.client.geosearch(
        key,
        'FROMLONLAT', lng, lat,
        'BYRADIUS', radiusKm, 'km',
        'ASC', 'COUNT', 999,
      ) as string[];
      return results;
    } catch { return []; }
  }

  async zrem(key: string, member: string): Promise<void> {
    if (!this.client || !this.enabled) return;
    try { await this.client.zrem(key, member); } catch { /* silent */ }
  }
}
