// Generated TypeScript interfaces for stays.proto

export interface GetPropertyRequest {
  propertyId: string;
}

export interface GetPropertyResponse {
  id: string;
  name: string;
  pricePerNight: number;
  lgaId: string;
}

export interface AvailabilityRequest {
  propertyId: string;
  checkIn: string;
  checkOut: string;
}

export interface AvailabilityResponse {
  available: boolean;
}

export interface CreateBookingRequest {
  propertyId: string;
  userId: string;
  checkIn: string;
  checkOut: string;
  reference: string;
}

export interface CreateBookingResponse {
  success: boolean;
  bookingId: string;
}

export interface StaysServiceClient {
  getProperty(data: GetPropertyRequest): Promise<GetPropertyResponse>;
  checkAvailability(data: AvailabilityRequest): Promise<AvailabilityResponse>;
  createBooking(data: CreateBookingRequest): Promise<CreateBookingResponse>;
}
