import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { TourAdminService } from './tour-admin.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';

/**
 * 09-10 — Tour analytics endpoints for admin users.
 *
 * Route table (all require LGA_ADMIN | STATE_ADMIN | SUPER_ADMIN):
 *   GET  /admin/tours/revenue      — vendor credit breakdown for a package
 *   GET  /admin/tours/utilization  — group-size heatmap data
 *
 * Note: queue endpoints for tour-packages (/admin/tour-packages/queue) and
 * tour-guides (/admin/tour-guides/queue) live in their respective controllers
 * (09-04 / 09-03). This controller only adds the 09-10 analytics endpoints.
 */
@ApiTags('admin-tours')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.LGA_ADMIN, UserRole.STATE_ADMIN, UserRole.SUPER_ADMIN)
@Controller('admin/tours')
export class TourAdminController {
  constructor(private readonly tourAdminService: TourAdminService) {}

  @Get('revenue')
  @ApiOperation({
    summary: 'Revenue breakdown for a tour package (admin)',
    description:
      'Returns total NGN credited to vendors + platform commission for CONFIRMED ' +
      'bookings of the given package within [from, to]. ' +
      'Dates are ISO strings, e.g. 2024-01-01.',
  })
  @ApiQuery({ name: 'packageId', required: true, type: String })
  @ApiQuery({ name: 'from', required: true, type: String, description: 'ISO date string' })
  @ApiQuery({ name: 'to', required: true, type: String, description: 'ISO date string' })
  getRevenueBreakdown(
    @Query('packageId') packageId: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return this.tourAdminService.getRevenueBreakdown({
      packageId,
      from: new Date(from),
      to: new Date(to),
    });
  }

  @Get('utilization')
  @ApiOperation({
    summary: 'Group-size utilization heatmap data (admin)',
    description:
      'Returns confirmed bookings bucketed by passenger count per calendar day. ' +
      'Dates are ISO strings, e.g. 2024-01-01.',
  })
  @ApiQuery({ name: 'from', required: true, type: String, description: 'ISO date string' })
  @ApiQuery({ name: 'to', required: true, type: String, description: 'ISO date string' })
  getUtilizationMatrix(
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return this.tourAdminService.getUtilizationMatrix({
      from: new Date(from),
      to: new Date(to),
    });
  }
}
