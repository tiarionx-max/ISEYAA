import { Inject, Injectable, Logger, OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import { waitlist } from '@iseyaa/proto';
import { PrismaService } from '../../prisma/prisma.service';
import { ResilienceService } from '../../resilience/resilience.service';
import { WAITLIST_PACKAGE } from './waitlist-client.constants';
import { WAITLIST_SOURCES } from '../waitlist/dto/join-waitlist.dto';
import { JoinWaitlistDto } from '../waitlist/dto/join-waitlist.dto';

// 21-03: canary kill-switch PlatformConfig key, matching notifications-client.service.ts's /
// news-client.service.ts's opt-OUT polarity — absence or any value other than `false` means
// enabled.
const CANARY_FLAG_KEY = 'grpc.waitlist_service.canary_enabled';

// D-06: matches PaystackService's / NotificationsClientService's / NewsClientService's exact
// wording convention.
const UNAVAILABLE_MESSAGE = 'Waitlist service is temporarily unavailable, please try again shortly';

/**
 * 21-03: Thin gRPC facade over waitlist-service. Unlike News, the proto contracts here don't
 * carry the full REST response shape:
 *   - JoinWaitlistResponse only has {id, success} — the current REST response is
 *     {message, position, id}. join() reconstructs message/position via a direct Prisma
 *     count query after the gRPC call succeeds (the established "no data-ownership boundary"
 *     shape-reconciliation pattern).
 *   - GetWaitlistStats takes a single `source` and returns a single `totalCount`, but the
 *     REST endpoint returns ALL sources grouped. stats() fans out one gRPC call per
 *     WAITLIST_SOURCES entry and reassembles the grouped array.
 */
@Injectable()
export class WaitlistClientService implements OnModuleInit {
  private readonly logger = new Logger(WaitlistClientService.name);
  private grpcService!: waitlist.WaitlistServiceClient;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(WAITLIST_PACKAGE) private readonly client: ClientGrpc,
    private readonly resilience: ResilienceService,
  ) {}

  onModuleInit(): void {
    this.grpcService = this.client.getService<waitlist.WaitlistServiceClient>('WaitlistService');
  }

  private async isCanaryEnabled(): Promise<boolean> {
    const cfg = await this.prisma.platformConfig.findUnique({ where: { key: CANARY_FLAG_KEY } });
    return cfg?.value !== false;
  }

  async join(dto: JoinWaitlistDto) {
    if (!(await this.isCanaryEnabled())) {
      this.logger.warn('join: waitlist-service canary flag disabled — refusing gRPC call');
      throw new ServiceUnavailableException(UNAVAILABLE_MESSAGE);
    }
    try {
      const result = await this.resilience.execute<waitlist.JoinWaitlistResponse>('waitlistGrpc', () =>
        // See notifications-client.service.ts's `as any` rationale — dual-rxjs-copy artifact.
        firstValueFrom(
          this.grpcService.joinWaitlist({
            email: dto.email ?? '',
            phone: dto.phone ?? '',
            fullName: dto.fullName ?? '',
            source: dto.source,
          }) as any,
        ),
      );
      // Shape-reconciliation step, NOT optional — the proto has no message/position fields.
      const position = await this.prisma.waitlistEntry.count({ where: { source: dto.source } });
      return {
        message: "You're on the list — we'll be in touch.",
        position,
        id: result.id,
      };
    } catch (err: any) {
      // T-21-03-02: log only err?.message — never the full gRPC error object or PII
      // (email/phone) from the join payload.
      this.logger.error(`Waitlist gRPC joinWaitlist failed: ${err?.message ?? err}`);
      throw new ServiceUnavailableException(UNAVAILABLE_MESSAGE);
    }
  }

  // NOTE (D-08): WAITLIST_SOURCES is a fixed 2-element const array today, so this per-source
  // fan-out covers every real source. If WAITLIST_SOURCES ever becomes dynamic/DB-driven, this
  // fan-out silently stops covering new sources — documented tradeoff per RESEARCH.md Pitfall
  // 1, confirmed low-risk today. The volume/latency side of this tradeoff (not the "new
  // source" side) is explicitly sized by this plan's Task 3 gate before this code is allowed
  // to go live.
  async stats() {
    if (!(await this.isCanaryEnabled())) {
      this.logger.warn('stats: waitlist-service canary flag disabled — refusing gRPC call');
      throw new ServiceUnavailableException(UNAVAILABLE_MESSAGE);
    }
    try {
      const results = await Promise.all(
        WAITLIST_SOURCES.map((source) =>
          this.resilience.execute<waitlist.GetWaitlistStatsResponse>('waitlistGrpc', () =>
            firstValueFrom(this.grpcService.getWaitlistStats({ source }) as any),
          ),
        ),
      );
      return WAITLIST_SOURCES.map((source, i) => ({ source, count: results[i].totalCount }));
    } catch (err: any) {
      this.logger.error(`Waitlist gRPC getWaitlistStats failed: ${err?.message ?? err}`);
      throw new ServiceUnavailableException(UNAVAILABLE_MESSAGE);
    }
  }
}
