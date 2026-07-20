import { Module } from '@nestjs/common';
import { WaitlistService } from './waitlist.service';

// 21-03: WaitlistController now lives in WaitlistClientModule, routed through
// WaitlistClientService's gRPC facade. WaitlistService stays provided/exported here for
// apps/waitlist-service's in-process wiring (waitlist-grpc.controller.ts).
@Module({
  controllers: [],
  providers: [WaitlistService],
  exports: [WaitlistService],
})
export class WaitlistModule {}
