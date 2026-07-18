import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { MinistryService } from './ministry.service';
import { MinistryQueryDto } from './dto/ministry-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';

// MIN-01: This controller MUST NEVER gain a @Patch/@Post/@Delete handler,
// in this or any future phase — it exists solely to give the Ministry
// dashboard's GET-only read surface its own controller class, isolated
// from every mutation endpoint (see AdminController's Pitfall 1).
@ApiTags('ministry')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.MINISTRY_VIEWER, UserRole.STATE_ADMIN, UserRole.SUPER_ADMIN)
@Controller('ministry')
export class MinistryController {
  constructor(private readonly ministryService: MinistryService) {}

  @Get('visitor-entries')
  @ApiOperation({ summary: 'Visitor entries grouped by LGA + month, secondary split by visitor role' })
  getVisitorEntries(@Query() query: MinistryQueryDto) {
    return this.ministryService.getVisitorEntriesByLgaAndMonth(query.from, query.to, query.lgaId);
  }

  @Get('purpose-breakdown')
  @ApiOperation({ summary: 'Purpose-of-visit breakdown grouped by month' })
  getPurposeBreakdown(@Query() query: MinistryQueryDto) {
    return this.ministryService.getPurposeBreakdown(query.from, query.to, query.lgaId);
  }

  @Get('revenue')
  @ApiOperation({ summary: 'Revenue to government grouped by module and month, with an LGA sub-breakdown for Stays/Marketplace/Tour' })
  getRevenue(@Query() query: MinistryQueryDto) {
    return this.ministryService.getRevenueToGovernment(query.from, query.to);
  }
}
