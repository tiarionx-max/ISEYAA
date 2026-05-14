// Generated TypeScript interfaces for ai.proto

export interface ItineraryRequest {
  lgaSlug: string;
  durationDays: number;
  interests: string;
  budgetNgn: number;
}

export interface ItineraryResponse {
  content: string;
}

export interface LgaIntelligenceRequest {
  lgaId: string;
}

export interface LgaIntelligenceResponse {
  content: string;
}

export interface AiServiceClient {
  getItinerary(data: ItineraryRequest): Promise<ItineraryResponse>;
  getLgaIntelligence(data: LgaIntelligenceRequest): Promise<LgaIntelligenceResponse>;
}
