import { Module } from '@nestjs/common';
import { TourBookingService } from './tour-bookings.service';
import { TourBookingsController } from './tour-bookings.controller';
import { TourPackagesModule } from '../tour-packages/tour-packages.module';
import { TourGuidesModule } from '../tour-guides/tour-guides.module';

/**
 * 09-05 — Tour Bookings module.
 *
 * Imports TourPackagesModule for TourPackageService.findByIdInternal (lean
 * projection used in the booking validation path) and TourGuidesModule for
 * transitive guide lookups (we read prisma.tourGuide directly here, but the
 * explicit import documents the cross-wave dependency and keeps DI graph clean
 * for 09-06's WebhooksModule wire-up).
 *
 * Exports TourBookingService so 09-06's webhook handler can settle bookings
 * (status PENDING → CONFIRMED, splitBillPaidUserIds append, wallet credits).
 *
 * THIS MODULE PERFORMS NO WALLET WRITES. All ledger mutations live in 09-06.
 */
@Module({
  imports: [TourPackagesModule, TourGuidesModule],
  controllers: [TourBookingsController],
  providers: [TourBookingService],
  exports: [TourBookingService],
})
export class TourBookingsModule {}
