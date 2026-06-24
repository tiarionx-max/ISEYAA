import { Module } from '@nestjs/common';
import { TourBookingService } from './tour-bookings.service';
import { TourSettlementService } from './tour-settlement.service';
import { TourBookingsController } from './tour-bookings.controller';
import { TourPackagesModule } from '../tour-packages/tour-packages.module';
import { TourGuidesModule } from '../tour-guides/tour-guides.module';

/**
 * 09-05 / 09-06 — Tour Bookings module.
 *
 * Imports TourPackagesModule for TourPackageService.findByIdInternal (lean
 * projection used in the booking validation path) and TourGuidesModule for
 * transitive guide lookups.
 *
 * 09-06 adds TourSettlementService — the ONLY code that mutates wallets for
 * tour bookings. It subscribes to `payment.tour_booking` via EventEmitter2
 * (in-process) AND Kafka (cross-pod durability) and runs the atomic multi-vendor
 * settlement inside one Prisma `$transaction`. RefundService, EventEmitter2 and
 * KafkaService are all globally available (CommonModule + EventEmitterModule
 * forRoot + KafkaModule are @Global), so no extra `imports` entries are needed.
 */
@Module({
  imports: [TourPackagesModule, TourGuidesModule],
  controllers: [TourBookingsController],
  providers: [TourBookingService, TourSettlementService],
  exports: [TourBookingService, TourSettlementService],
})
export class TourBookingsModule {}
