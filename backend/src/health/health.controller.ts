import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  HealthCheck,
  HealthCheckService,
  HealthCheckError,
  HealthIndicatorResult,
} from '@nestjs/terminus';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private prisma: PrismaService,
    private redis: RedisService,
  ) {}

  @Get()
  @HealthCheck()
  @ApiOperation({ summary: 'Application health check (database + cache)' })
  check() {
    return this.health.check([
      // Database is the critical dependency — a failing SELECT 1 makes the whole
      // check report "down" so k8s/Railway readiness stops routing traffic to a pod
      // whose Postgres is unreachable (previously `check([])` returned 200 regardless).
      () => this.pingDatabase(),
      // Redis is reported but treated as non-fatal (degraded), because dev intentionally
      // runs with Redis disabled and OTP/blacklist ops fall back to safe stubs.
      () => this.pingRedis(),
    ]);
  }

  private async pingDatabase(): Promise<HealthIndicatorResult> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { database: { status: 'up' } };
    } catch (err) {
      throw new HealthCheckError('Database check failed', {
        database: { status: 'down', message: (err as Error).message },
      });
    }
  }

  private async pingRedis(): Promise<HealthIndicatorResult> {
    const status = await this.redis.healthStatus();
    // 'disabled' (never configured, e.g. local dev) and 'up' are both healthy;
    // only 'down' (configured but unreachable) is surfaced — and even then we do
    // not throw, so a cache outage degrades rather than failing the whole probe.
    return { cache: { status: status === 'down' ? 'down' : 'up', mode: status } };
  }
}
