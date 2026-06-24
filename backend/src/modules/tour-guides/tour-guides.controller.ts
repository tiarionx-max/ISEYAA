import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  DefaultValuePipe,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { TourGuideService, TourGuideStatus } from './tour-guides.service';
import { CreateTourGuideDto } from './dto/create-tour-guide.dto';
import { UpdateAvailabilityDto } from './dto/update-availability.dto';
import { SubmitKycDto } from './dto/submit-kyc.dto';
import { ApproveTourGuideDto } from './dto/approve-tour-guide.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../../common/enums/user-role.enum';

@ApiTags('Tour Guides')
@Controller('tour-guides')
export class TourGuidesController {
  constructor(private readonly tourGuideService: TourGuideService) {}

  // ── Public ─────────────────────────────────────────────────────────────────

  @Get()
  @ApiOperation({ summary: 'List tour guides (defaults to status=APPROVED).' })
  @ApiQuery({ name: 'lgaId', required: false })
  @ApiQuery({ name: 'status', required: false, enum: ['PENDING', 'APPROVED', 'REJECTED'] })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  findAll(
    @Query('lgaId') lgaId?: string,
    @Query('status') status?: TourGuideStatus,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('limit', new DefaultValuePipe(24), ParseIntPipe) limit?: number,
  ) {
    return this.tourGuideService.findAll({ lgaId, status, page, limit });
  }

  // ── Authenticated TOUR_GUIDE (own profile) ────────────────────────────────
  //
  // /me routes MUST be declared BEFORE the /:id route below — otherwise NestJS
  // routing would interpret "me" as a route param and route GET /tour-guides/me
  // to findById('me').

  @Get('me')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('TOUR_GUIDE' as UserRole)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get own tour guide profile (incl. kycTier).' })
  getMe(@CurrentUser() user: { userId: string }) {
    return this.tourGuideService.getMe(user.userId);
  }

  @Post('me/kyc')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('TOUR_GUIDE' as UserRole)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Submit NIN for Tier-2 KYC (encrypted AES-256-GCM, bcrypt-hashed, verified via Dojah).',
  })
  submitKyc(@CurrentUser() user: { userId: string }, @Body() dto: SubmitKycDto) {
    return this.tourGuideService.submitKyc(user.userId, dto);
  }

  @Patch('me/availability')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('TOUR_GUIDE' as UserRole)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update availability calendar (blockedDates + weeklyOffDays).' })
  updateAvailability(
    @CurrentUser() user: { userId: string },
    @Body() dto: UpdateAvailabilityDto,
  ) {
    return this.tourGuideService.updateAvailability(user.userId, dto);
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('TOUR_GUIDE' as UserRole)
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Upsert own profile. `certifications` are publicUrls obtained via POST /uploads/presigned (keyPrefix=tour-certifications); no multipart accepted here.',
  })
  upsertOwn(@CurrentUser() user: { userId: string }, @Body() dto: CreateTourGuideDto) {
    return this.tourGuideService.upsertOwnProfile(user.userId, dto);
  }

  // ── Public detail (MUST stay below all /me routes) ────────────────────────

  @Get(':id')
  @ApiOperation({ summary: 'Public detail view — KYC fields stripped.' })
  findById(@Param('id') id: string) {
    return this.tourGuideService.findById(id);
  }
}

@ApiTags('Admin — Tour Guides')
@Controller('admin/tour-guides')
export class TourGuidesAdminController {
  constructor(private readonly tourGuideService: TourGuideService) {}

  @Get('queue')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.LGA_ADMIN, UserRole.STATE_ADMIN, UserRole.SUPER_ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'PENDING tour guides awaiting LGA_ADMIN review.' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  queue(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('limit', new DefaultValuePipe(24), ParseIntPipe) limit?: number,
  ) {
    return this.tourGuideService.findPendingQueue({ page, limit });
  }

  @Post(':id/approve')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.LGA_ADMIN, UserRole.STATE_ADMIN, UserRole.SUPER_ADMIN)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Approve or reject a tour guide (PENDING → APPROVED|REJECTED).' })
  decide(
    @Param('id') id: string,
    @Body() dto: ApproveTourGuideDto,
    @CurrentUser() user: { userId: string },
  ) {
    return this.tourGuideService.adminDecide(id, dto, user.userId);
  }
}
