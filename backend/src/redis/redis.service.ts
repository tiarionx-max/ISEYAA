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
        // H-03: do NOT set enabled=false here — retryStrategy returning null causes ioredis
        // to stop reconnecting entirely, so the 'connect' event never fires and enabled would
        // never be re-set to true. Instead, disable on 'error' and re-enable on 'connect'.
        if (times >= 3) {
          this.logger.warn('Redis unreachable after 3 attempts — entering degraded mode');
          return null; // stop retrying
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
      // H-03: disable on error so all operations return safe stub values
      this.enabled = false;
    });
    this.client.on('connect', () => {
      // H-03: re-enable on successful (re)connect
      this.enabled = true;
      errorLogged = false;
      this.logger.log('Redis connected');
    });
  }

  async onModuleDestroy() {
    if (this.client) await this.client.quit();
  }

  /**
   * Liveness for the health endpoint.
   *  - 'disabled': REDIS_URL was never configured (local dev) — not an error.
   *  - 'up':       configured and a PING round-trips.
   *  - 'down':     configured but unreachable / erroring.
   */
  async healthStatus(): Promise<'up' | 'down' | 'disabled'> {
    if (!this.client) return 'disabled';
    try {
      const pong = await this.client.ping();
      return pong === 'PONG' ? 'up' : 'down';
    } catch {
      return 'down';
    }
  }

  async get(key: string): Promise<string | null> {
    if (!this.client || !this.enabled) return null;
    try { return await this.client.get(key); } catch { return null; }
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (!this.client || !this.enabled) return;
    try {
      // L-10: ttlSeconds=0 is falsy — use explicit null/positive check to prevent
      // setting a permanent key when caller passes 0 (e.g. already-expired JWT TTL)
      if (ttlSeconds != null && ttlSeconds > 0) {
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

  /**
   * Atomic SET NX EX — sets the key only if it does not exist, with a TTL.
   * Returns true if the lock was acquired, false if it already existed.
   * If Redis is unavailable, returns true (optimistic — allow the operation).
   */
  async setNx(key: string, value: string, ttlSeconds: number): Promise<boolean> {
    if (!this.client || !this.enabled) return true; // optimistic fallback
    try {
      const result = await this.client.set(key, value, 'EX', ttlSeconds, 'NX');
      return result === 'OK';
    } catch { return true; } // optimistic fallback on error
  }
}
