import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { WaitlistService } from '../../../src/modules/waitlist/waitlist.service';
import { WaitlistSource } from '../../../src/modules/waitlist/dto/join-waitlist.dto';
import { waitlist } from '@iseyaa/proto';

@Controller()
export class WaitlistGrpcController {
  constructor(private readonly waitlistService: WaitlistService) {}

  @GrpcMethod('WaitlistService', 'JoinWaitlist')
  async joinWaitlist(data: waitlist.JoinWaitlistRequest): Promise<waitlist.JoinWaitlistResponse> {
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
