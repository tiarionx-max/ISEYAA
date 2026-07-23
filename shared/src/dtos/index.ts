// Shared DTO shapes used across web, mobile and backend

// Mirrors RegisterDto (backend/src/modules/auth/dto/register.dto.ts) — email
// and phone are both required there (not optional), and `ndpaConsent` is a
// required field enforced by AuthService.register() per the Nigerian Data
// Protection Act (NDPA) — omitting it here previously let a consumer build a
// request payload that the backend would always reject.
export interface RegisterRequest {
  email: string;
  phone: string;
  firstName: string;
  lastName: string;
  password: string;
  ndpaConsent: boolean;
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
