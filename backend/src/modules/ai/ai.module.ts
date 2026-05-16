import { Module } from '@nestjs/common';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';

// VectorService injected from CommonModule (@Global)
@Module({
  controllers: [AiController],
  providers: [AiService],
})
export class AiModule {}
