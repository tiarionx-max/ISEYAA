import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { metrics } from '@opentelemetry/api';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class DbMetricsService implements OnModuleInit {
  private readonly logger = new Logger(DbMetricsService.name);
  private currentOpenConnections = 0;

  constructor(private prisma: PrismaService) {}

  onModuleInit(): void {
    const meter = metrics.getMeter('iseyaa-db');
    const gauge = meter.createObservableGauge('postgres_open_connections', {
      description:
        'Combined open Postgres connection count across all processes (monolith + notifications-service), sourced from pg_stat_activity',
    });
    gauge.addCallback(result => {
      result.observe(this.currentOpenConnections);
    });
  }

  getCurrentOpenConnections(): number {
    return this.currentOpenConnections;
  }

  @Cron(CronExpression.EVERY_30_SECONDS)
  async pollOpenConnections(): Promise<void> {
    try {
      const rows = await this.prisma.$queryRaw<{ count: bigint }[]>`
        SELECT count(*) AS count FROM pg_stat_activity WHERE datname = current_database()
      `;
      this.currentOpenConnections = Number(rows[0]?.count ?? 0);
    } catch (err) {
      // V7: never log the raw error object or process.env.DATABASE_URL — a Prisma
      // connection failure's raw error can embed the connection string with its password
      this.logger.error(`pollOpenConnections failed: ${(err as Error)?.message}`);
    }
  }
}
