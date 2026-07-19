import {
  Controller, Get, Patch, Body, Param, Query, UseGuards,
  ParseIntPipe, DefaultValuePipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { AdminService } from './admin.service';
import { UpdateSplitTierDto } from './dto/update-split-tier.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN, UserRole.LGA_ADMIN)
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'Platform dashboard: users, DAU, revenue, events, pending approvals, wallet GTV' })
  getDashboard() {
    return this.adminService.getDashboard();
  }

  @Get('revenue')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Revenue breakdown: govt levy total, by LGA, by category, by month' })
  getRevenue() {
    return this.adminService.getRevenue();
  }

  @Get('users')
  @ApiOperation({ summary: 'Paginated user list with optional role filter' })
  listUsers(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query('role') role?: string,
  ) {
    return this.adminService.listUsers(page, limit, role);
  }

  @Patch('users/:id/status')
  @ApiOperation({ summary: 'Update user status (ACTIVE/SUSPENDED/BANNED)' })
  updateUserStatus(@Param('id') id: string, @Body('status') status: string) {
    return this.adminService.updateUserStatus(id, status);
  }

  @Get('vendors')
  @ApiOperation({ summary: 'Paginated vendor list with optional status filter' })
  listVendors(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query('status') status?: string,
  ) {
    return this.adminService.listVendors(page, limit, status);
  }

  @Patch('vendors/:id/status')
  @ApiOperation({ summary: 'Approve or suspend a vendor' })
  updateVendorStatus(@Param('id') id: string, @Body('status') status: string) {
    return this.adminService.updateVendorStatus(id, status);
  }

  @Get('properties')
  @ApiOperation({ summary: 'Paginated stays property list' })
  listProperties(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
  ) {
    return this.adminService.listProperties(page, limit);
  }

  @Get('studio/slots')
  @ApiOperation({ summary: 'List all studio slots' })
  listStudioSlots() {
    return this.adminService.listStudioSlots();
  }

  @Patch('studio/slots/:id')
  @ApiOperation({ summary: 'Update studio slot (isActive, isGovernmentPriority, pricePerHour)' })
  updateStudioSlot(
    @Param('id') id: string,
    @Body() data: { isActive?: boolean; isGovernmentPriority?: boolean; pricePerHour?: number },
  ) {
    return this.adminService.updateStudioSlot(id, data);
  }

  @Get('config')
  @ApiOperation({ summary: 'Get platform configuration' })
  getConfig() {
    return this.adminService.getConfig();
  }

  @Patch('config/:key')
  @ApiOperation({ summary: 'Upsert platform config value' })
  setConfig(@Param('key') key: string, @Body('value') value: any) {
    return this.adminService.setConfig(key, value);
  }

  @Get('settlement-splits')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'List settlement split tiers, optionally filtered by module' })
  listSplitTiers(@Query('module') module?: string) {
    return this.adminService.listSplitTiers(module);
  }

  @Patch('settlement-splits/:id')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Update a settlement split tier (creates new active row, deactivates prior — D-05 audit trail)' })
  updateSplitTier(@Param('id') id: string, @Body() dto: UpdateSplitTierDto) {
    return this.adminService.updateSplitTier(id, dto);
  }
}
