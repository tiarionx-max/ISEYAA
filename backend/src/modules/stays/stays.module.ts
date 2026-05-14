import { Module } from '@nestjs/common';
import { StaysController, BookingsController } from './stays.controller';
import { StaysService } from './stays.service';

@Module({
  controllers: [StaysController, BookingsController],
  providers: [StaysService],
  exports: [StaysService],
})
export class StaysModule {}
