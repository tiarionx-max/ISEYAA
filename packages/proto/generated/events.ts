// Generated TypeScript interfaces for events.proto

export interface GetEventRequest {
  eventId: string;
}

export interface GetEventResponse {
  id: string;
  title: string;
  status: string;
  availableCapacity: number;
}

export interface TicketAvailabilityRequest {
  eventId: string;
  ticketTypeId: string;
  quantity: number;
}

export interface TicketAvailabilityResponse {
  available: boolean;
  remaining: number;
}

export interface ReserveTicketRequest {
  eventId: string;
  ticketTypeId: string;
  userId: string;
  quantity: number;
  reference: string;
}

export interface ReserveTicketResponse {
  success: boolean;
  ticketId: string;
}

export interface EventsServiceClient {
  getEvent(data: GetEventRequest): Promise<GetEventResponse>;
  checkTicketAvailability(data: TicketAvailabilityRequest): Promise<TicketAvailabilityResponse>;
  reserveTicket(data: ReserveTicketRequest): Promise<ReserveTicketResponse>;
}
