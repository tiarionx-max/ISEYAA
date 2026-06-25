import { Module } from '@nestjs/common';
import { TourBookingService } from './tour-bookings.service';
import { TourSettlementService } from './tour-settlement.service';
import { TourNotificationsService } from './tour-notifications.service';
import { TourAdminService } from './tour-admin.service';
import { TourBookingsController } from './tour-bookings.controller';
import { TourAdminController } from './tour-admin.controller';
import { TourPackagesModule } from '../tour-packages/tour-packages.module';
import { TourGuidesModule } from '../tour-guides/tour-guides.module';
import { NotificationsModule } from '../notifications/notifications.module';

/**
 * 09-05 / 09-06 / 09-07 — Tour Bookings module.
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
 *
 * 09-07 adds TourNotificationsService — TOUR-05 itinerary delivery on
 * `tour_booking.confirmed` (immediate email + PDF) plus three @Cron jobs
 * (T-24h, T-2h, T+1h). NotificationsModule is NOT @Global so it is imported
 * here for the FCM push wrapper. ItineraryPdfService + SendgridService come
 * from the @Global CommonModule and need no explicit import.
 */
@Module({
  imports: [TourPackagesModule, TourGuidesModule, NotificationsModule],
  controllers: [TourBookingsController, TourAdminController],
  providers: [
    TourBookingService,
    TourSettlementService,
    TourNotificationsService,
    TourAdminService,
  ],
  exports: [TourBookingService, TourSettlementService],
})
export class TourBookingsModule {}
