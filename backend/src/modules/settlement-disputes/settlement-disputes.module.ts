import { Module } from '@nestjs/common';
import { SettlementDisputesService } from './settlement-disputes.service';
import { SettlementDisputesController } from './settlement-disputes.controller';

/**
 * 19-04 — SettlementDisputesModule.
 *
 * No `imports` array needed: `PrismaModule` and `CommonModule` (which exports
 * `SettlementService`) are both `@Global()` — mirrors `ReviewsModule`'s shape.
 */
@Module({
  controllers: [SettlementDisputesController],
  providers: [SettlementDisputesService],
  exports: [SettlementDisputesService],
})
export class SettlementDisputesModule {}
