// Generated TypeScript interfaces for admin.proto

export interface GetDashboardRequest {}

export interface GetDashboardResponse {
  totalUsers: number;
  totalRevenue: number;
  activeEvents: number;
  pendingApprovals: number;
}

export interface ApproveItemRequest {
  itemType: string;
  itemId: string;
  adminId: string;
}

export interface ApproveItemResponse {
  success: boolean;
}

export interface AdminServiceClient {
  getDashboard(data: GetDashboardRequest): Promise<GetDashboardResponse>;
  approveItem(data: ApproveItemRequest): Promise<ApproveItemResponse>;
}
