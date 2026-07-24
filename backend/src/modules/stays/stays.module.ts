import { Module } from '@nestjs/common';
import { StaysController, BookingsController, MembershipsController } from './stays.controller';
import { StaysService } from './stays.service';

@Module({
  controllers: [StaysController, BookingsController, MembershipsController],
  providers: [StaysService],
  exports: [StaysService],
})
export class StaysModule {}
