import { Module } from '@nestjs/common';
import { TourGuideService } from './tour-guides.service';
import {
  TourGuidesController,
  TourGuidesAdminController,
} from './tour-guides.controller';

@Module({
  controllers: [TourGuidesController, TourGuidesAdminController],
  providers: [TourGuideService],
  // exported so 09-04 (TourPackageService) can inject findByIdInternal for the
  // "guide.status === APPROVED" publish-time gate.
  exports: [TourGuideService],
})
export class TourGuidesModule {}
