import { Module } from '@nestjs/common';
import { TourPackageService } from './tour-packages.service';
import {
  TourPackagesController,
  TourPackagesAdminController,
} from './tour-packages.controller';

/**
 * NOTE: This module does NOT import TourGuidesModule (09-03, parallel wave).
 * The "guide must be APPROVED" guard is implemented via direct prisma.tourGuide
 * queries inside TourPackageService. Identical semantics, no cross-wave coupling.
 * If 09-03 lands first and an orchestrator merge wants to refactor to inject
 * TourGuideService.findByIdInternal, it's a low-risk swap.
 */
@Module({
  controllers: [TourPackagesController, TourPackagesAdminController],
  providers: [TourPackageService],
  exports: [TourPackageService], // 09-05 (TourBookings) consumes findByIdInternal
})
export class TourPackagesModule {}
