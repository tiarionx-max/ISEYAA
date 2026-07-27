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
  async approveItem(data: admin.ApproveItemRequest): Promise<admin.ApproveItemResponse> {
    // Route to the same AdminService methods the REST admin endpoints use
    // (AdminController: PATCH vendors/:id/status, users/:id/status,
    // studio/slots/:id) instead of the previous no-op stub that always
    // reported success without approving anything.
    try {
      switch (data.itemType) {
        case 'vendor':
          await this.adminService.updateVendorStatus(data.itemId, 'ACTIVE');
          return { success: true };
        case 'user':
          await this.adminService.updateUserStatus(data.itemId, 'ACTIVE');
          return { success: true };
        case 'studio':
        case 'studio-slot':
          await this.adminService.updateStudioSlot(data.itemId, { isActive: true });
          return { success: true };
        default:
          return { success: false };
      }
    } catch (err) {
      return { success: false };
    }
  }
}
