import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { AdminService } from '../../../src/modules/admin/admin.service';
import {
  GetDashboardRequest,
  GetDashboardResponse,
  ApproveItemRequest,
  ApproveItemResponse,
} from '@iseyaa/proto';

@Controller()
export class AdminGrpcController {
  constructor(private readonly adminService: AdminService) {}

  @GrpcMethod('AdminService', 'GetDashboard')
  async getDashboard(_data: GetDashboardRequest): Promise<GetDashboardResponse> {
    const dashboard = await this.adminService.getDashboard();
    return {
      totalUsers: dashboard.total_users ?? 0,
      totalRevenue: Number(dashboard.total_revenue ?? 0),
      activeEvents: dashboard.active_events ?? 0,
      pendingApprovals: dashboard.pending_approvals ?? 0,
    };
  }

  @GrpcMethod('AdminService', 'ApproveItem')
  async approveItem(_data: ApproveItemRequest): Promise<ApproveItemResponse> {
    return { success: true };
  }
}
