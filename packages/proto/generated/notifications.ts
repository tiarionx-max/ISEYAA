// Generated TypeScript interfaces for notifications.proto

export interface SendPushRequest {
  userId: string;
  title: string;
  body: string;
}

export interface SendPushResponse {
  success: boolean;
}

export interface RegisterTokenRequest {
  userId: string;
  fcmToken: string;
}

export interface RegisterTokenResponse {
  success: boolean;
}

export interface NotificationsServiceClient {
  sendPush(data: SendPushRequest): Promise<SendPushResponse>;
  registerToken(data: RegisterTokenRequest): Promise<RegisterTokenResponse>;
}
