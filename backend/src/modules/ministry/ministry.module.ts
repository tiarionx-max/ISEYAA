import { Module } from '@nestjs/common';
import { MinistryController } from './ministry.controller';
import { MinistryService } from './ministry.service';
import { MinistryExportSubscriptionController } from './ministry-export-subscription.controller';
import { MinistryExportSubscriptionService } from './ministry-export-subscription.service';
import { MinistryExportSchedulerService } from './ministry-export-scheduler.service';

@Module({
  controllers: [MinistryController, MinistryExportSubscriptionController],
  providers: [MinistryService, MinistryExportSubscriptionService, MinistryExportSchedulerService],
})
export class MinistryModule {}
