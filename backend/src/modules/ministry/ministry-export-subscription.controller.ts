import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { MinistryExportSubscriptionService } from './ministry-export-subscription.service';
import { CreateExportSubscriptionDto } from './dto/create-export-subscription.dto';
import { UpdateExportSubscriptionDto } from './dto/update-export-subscription.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';

// D-10: SUPER_ADMIN-only — stricter than the read-only MinistryController's
// broader read role set (dashboard viewer roles are never granted here).
// This is its OWN controller class — never added to MinistryController
// (MIN-01: that controller must never gain a mutation handler).
@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN)
@Controller('admin/ministry-export-subscriptions')
export class MinistryExportSubscriptionController {
  constructor(private readonly ministryExportSubscriptionService: MinistryExportSubscriptionService) {}

  @Get()
  @ApiOperation({ summary: 'List all Ministry export subscriptions' })
  list() {
    return this.ministryExportSubscriptionService.list();
  }

  @Post()
  @ApiOperation({ summary: 'Create a new Ministry export subscription (recipients + cadence)' })
  create(@Body() dto: CreateExportSubscriptionDto) {
    return this.ministryExportSubscriptionService.create(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a Ministry export subscription in place (recipients/cadence/isActive)' })
  update(@Param('id') id: string, @Body() dto: UpdateExportSubscriptionDto) {
    return this.ministryExportSubscriptionService.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a Ministry export subscription' })
  remove(@Param('id') id: string) {
    return this.ministryExportSubscriptionService.remove(id);
  }
}
