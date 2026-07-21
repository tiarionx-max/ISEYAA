import { BadRequestException, Controller } from '@nestjs/common';
import { GrpcMethod, RpcException } from '@nestjs/microservices';
import { status as GrpcStatus } from '@grpc/grpc-js';
import { WaitlistService } from '../../../src/modules/waitlist/waitlist.service';
import { WaitlistSource } from '../../../src/modules/waitlist/dto/join-waitlist.dto';
import { waitlist } from '@iseyaa/proto';

@Controller()
export class WaitlistGrpcController {
  constructor(private readonly waitlistService: WaitlistService) {}

  // NestJS's default @GrpcMethod exception handling does NOT preserve a thrown
  // BadRequestException's message across the gRPC boundary — BaseRpcExceptionFilter
  // replaces any non-RpcException with the generic "Internal server error" string.
  // The business-rule join failure (missing both email and phone, or an underlying
  // upsert failure) is explicitly re-wrapped in RpcException below so the original
  // message reaches the citizen. Any other error type is rethrown unmodified,
  // deliberately falling through to the default filter's generic response — that path
  // is for genuine defects, not business-rule failures.
  @GrpcMethod('WaitlistService', 'JoinWaitlist')
  async joinWaitlist(data: waitlist.JoinWaitlistRequest): Promise<waitlist.JoinWaitlistResponse> {
    try {
      // The domain method's `message`/`position` fields are intentionally NOT returned here —
      // the proto has no fields for them; the monolith-side facade (waitlist-client.service.ts)
      // reconstructs them via its own Prisma count query, matching Reviews' later enrichment
      // pattern.
      const result = await this.waitlistService.join({
        source: data.source as WaitlistSource,
        email: data.email || undefined,
        phone: data.phone || undefined,
        fullName: data.fullName || undefined,
      });
      return { id: result.id, success: true };
    } catch (err) {
      if (err instanceof BadRequestException) {
        throw new RpcException({ code: GrpcStatus.INVALID_ARGUMENT, message: err.message });
      }
      throw err;
    }
  }

  @GrpcMethod('WaitlistService', 'GetWaitlistStats')
  async getWaitlistStats(
    data: waitlist.GetWaitlistStatsRequest,
  ): Promise<waitlist.GetWaitlistStatsResponse> {
    const grouped = await this.waitlistService.stats();
    const match = grouped.find((g) => g.source === data.source);
    return { totalCount: match?.count ?? 0 };
  }
}
