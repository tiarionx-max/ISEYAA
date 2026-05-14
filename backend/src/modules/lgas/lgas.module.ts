import { Module } from '@nestjs/common';
import { LgasController } from './lgas.controller';
import { LgasService } from './lgas.service';

@Module({
  controllers: [LgasController],
  providers: [LgasService],
  exports: [LgasService],
})
export class LgasModule {}
