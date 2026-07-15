import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { AdminService } from '../../../src/modules/admin/admin.service';
import { admin } from '@iseyaa/proto';

@Controller()
export class AdminGrpcController {
  constructor(private readonly adminService: AdminService) {}

  @GrpcMethod('AdminService', 'GetDashboard')
  async getDashboard(_data: admin.GetDashboardRequest): Promise<admin.GetDashboardResponse> {
    const dashboard = await this.adminService.getDashboard();
    return {
      totalUsers: dashboard.total_users ?? 0,
      totalRevenue: Number(dashboard.total_revenue ?? 0),
      activeEvents: dashboard.active_events ?? 0,
      pendingApprovals: dashboard.pending_approvals ?? 0,
    };
  }

  @GrpcMethod('AdminService', 'ApproveItem')
  async approveItem(_data: admin.ApproveItemRequest): Promise<admin.ApproveItemResponse> {
    return { success: true };
  }
}
