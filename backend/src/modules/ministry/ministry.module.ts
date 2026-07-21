import { Module } from '@nestjs/common';
import { MinistryController } from './ministry.controller';
import { MinistryService } from './ministry.service';
import { MinistryExportSubscriptionController } from './ministry-export-subscription.controller';
import { MinistryExportSubscriptionService } from './ministry-export-subscription.service';

@Module({
  controllers: [MinistryController, MinistryExportSubscriptionController],
  providers: [MinistryService, MinistryExportSubscriptionService],
})
export class MinistryModule {}
