// Generated TypeScript interfaces for auth.proto
// NestJS gRPC uses @grpc/proto-loader at runtime; these types provide compile-time safety

export interface ValidateTokenRequest {
  token: string;
}

export interface ValidateTokenResponse {
  valid: boolean;
  userId: string;
  role: string;
}

export interface GetUserRequest {
  userId: string;
}

export interface GetUserResponse {
  id: string;
  email: string;
  phone: string;
  role: string;
  status: string;
}

export interface RefreshTokenRequest {
  refreshToken: string;
}

export interface RefreshTokenResponse {
  accessToken: string;
  refreshToken: string;
}

export interface AuthServiceClient {
  validateToken(data: ValidateTokenRequest): Promise<ValidateTokenResponse>;
  getUser(data: GetUserRequest): Promise<GetUserResponse>;
  refreshToken(data: RefreshTokenRequest): Promise<RefreshTokenResponse>;
}
