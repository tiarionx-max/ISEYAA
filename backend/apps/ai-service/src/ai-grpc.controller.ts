import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { AiService } from '../../../src/modules/ai/ai.service';
import {
  ItineraryRequest,
  ItineraryResponse,
  LgaIntelligenceRequest,
  LgaIntelligenceResponse,
} from '@iseyaa/proto';

@Controller()
export class AiGrpcController {
  constructor(private readonly aiService: AiService) {}

  @GrpcMethod('AiService', 'GetItinerary')
  async getItinerary(_data: ItineraryRequest): Promise<ItineraryResponse> {
    // Streaming itinerary requires HTTP SSE — use GET /api/v1/ai/itinerary for real-time generation
    return { content: 'Use HTTP SSE endpoint /api/v1/ai/itinerary for streaming itinerary generation' };
  }

  @GrpcMethod('AiService', 'GetLgaIntelligence')
  async getLgaIntelligence(data: LgaIntelligenceRequest): Promise<LgaIntelligenceResponse> {
    const result = await this.aiService.getLgaIntelligence(data.lgaId, '');
    return { content: typeof result === 'string' ? result : JSON.stringify(result) };
  }
}
