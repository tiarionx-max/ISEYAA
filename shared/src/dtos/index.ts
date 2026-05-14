// Shared DTO shapes used across web, mobile and backend

export interface RegisterRequest {
  email?: string;
  phone?: string;
  firstName: string;
  lastName: string;
  password: string;
}

export interface LoginRequest {
  identifier: string; // email or phone
  password: string;
}

export interface AuthResponse {
  user: {
    id: string;
    email?: string | null;
    phone?: string | null;
    firstName: string;
    lastName: string;
    role: string;
  };
  accessToken: string;
  refreshToken: string;
}

export interface CreateEventRequest {
  lgaId: string;
  title: string;
  description?: string;
  venue: string;
  address?: string;
  startDate: string;
  endDate: string;
  imageUrls?: string[];
  ticketTypes?: Array<{
    name: string;
    price: number;
    quantity: number;
    description?: string;
  }>;
}

export interface CreateBookingRequest {
  propertyId: string;
  checkIn: string;
  checkOut: string;
  guests: number;
}

export interface PlaceOrderRequest {
  items: Array<{ productId: string; quantity: number }>;
}

export interface FundWalletRequest {
  amount: number;
  email: string;
}
