import { Inject, Injectable, Logger, OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import { news } from '@iseyaa/proto';
import { PrismaService } from '../../prisma/prisma.service';
import { ResilienceService } from '../../resilience/resilience.service';
import { NEWS_PACKAGE } from './news-client.constants';

// 21-02: canary kill-switch PlatformConfig key, matching notifications-client.service.ts's
// opt-OUT polarity — absence or any value other than `false` means enabled.
const CANARY_FLAG_KEY = 'grpc.news_service.canary_enabled';

// D-06: matches FlutterwaveService's / NotificationsClientService's exact wording convention.
const UNAVAILABLE_MESSAGE = 'News service is temporarily unavailable, please try again shortly';

/**
 * 21-02: Thin gRPC facade over news-service, exposing the single findLatest(limit, category)
 * method NewsController has always called. Proto ListNewsResponse.items matches
 * NewsService.findLatest's current REST array shape field-for-field — zero enrichment needed.
 */
@Injectable()
export class NewsClientService implements OnModuleInit {
  private readonly logger = new Logger(NewsClientService.name);
  private grpcService!: news.NewsServiceClient;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(NEWS_PACKAGE) private readonly client: ClientGrpc,
    private readonly resilience: ResilienceService,
  ) {}

  onModuleInit(): void {
    this.grpcService = this.client.getService<news.NewsServiceClient>('NewsService');
  }

  private async isCanaryEnabled(): Promise<boolean> {
    const cfg = await this.prisma.platformConfig.findUnique({ where: { key: CANARY_FLAG_KEY } });
    return cfg?.value !== false;
  }

  async findLatest(limit: number, category?: string) {
    if (!(await this.isCanaryEnabled())) {
      this.logger.warn('findLatest: news-service canary flag disabled — refusing gRPC call');
      throw new ServiceUnavailableException(UNAVAILABLE_MESSAGE);
    }
    try {
      const res = await this.resilience.execute<news.ListNewsResponse>('newsGrpc', () =>
        // See notifications-client.service.ts's `as any` rationale — dual-rxjs-copy artifact.
        firstValueFrom(this.grpcService.listNews({ limit, category: category ?? '' }) as any),
      );
      return res.items;
    } catch (err: any) {
      // T-21-02-02: log only err?.message — never the full gRPC error object, matching
      // resilience.service.ts's summarizeVendorError() discipline.
      this.logger.error(`News gRPC listNews failed: ${err?.message ?? err}`);
      throw new ServiceUnavailableException(UNAVAILABLE_MESSAGE);
    }
  }
}
