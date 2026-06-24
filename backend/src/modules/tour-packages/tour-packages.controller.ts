import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  DefaultValuePipe,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { TourPackageCategory } from '@prisma/client';
import { TourPackageService } from './tour-packages.service';
import { CreateTourPackageDto } from './dto/create-tour-package.dto';
import { UpdateTourPackageDto } from './dto/update-tour-package.dto';
import { AdminDecideTourPackageDto } from './dto/admin-decide-package.dto';
import { CreateFromAiSuggestionDto } from './dto/create-from-ai-suggestion.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../../common/enums/user-role.enum';

/**
 * Public + authenticated (TOUR_GUIDE-scoped) + AI-bridge routes.
 *
 * Route table:
 *   GET    /tour-packages                         — PUBLIC list (status=APPROVED filter)
 *   GET    /tour-packages/me                      — TOUR_GUIDE own packages (any status)
 *   GET    /tour-packages/:slug                   — PUBLIC detail by slug (APPROVED only)
 *   POST   /tour-packages                         — TOUR_GUIDE creates DRAFT
 *   POST   /tour-packages/from-ai-suggestion      — ANY auth user creates AI-seeded DRAFT
 *   PATCH  /tour-packages/:id                     — TOUR_GUIDE updates own DRAFT|PENDING|REJECTED
 *   POST   /tour-packages/:id/submit              — TOUR_GUIDE moves DRAFT|REJECTED → PENDING
 *   DELETE /tour-packages/:id                     — TOUR_GUIDE soft-deletes own non-APPROVED
 */
@ApiTags('tour-packages')
@Controller('tour-packages')
export class TourPackagesController {
  constructor(private readonly service: TourPackageService) {}

  // ── Public reads ────────────────────────────────────────────────────────

  @Get()
  @ApiOperation({
    summary: 'List APPROVED tour packages (PUBLIC)',
    description: 'Filters: category, lgaId, tourGuideId, q (name search), page, limit.',
  })
  findAll(
    @Query('category') category?: TourPackageCategory,
    @Query('lgaId') lgaId?: string,
    @Query('tourGuideId') tourGuideId?: string,
    @Query('q') q?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('limit', new DefaultValuePipe(24), ParseIntPipe) limit?: number,
  ) {
    return this.service.findAll({ category, lgaId, tourGuideId, q, page, limit });
  }

  // ── TOUR_GUIDE own list — must come BEFORE :slug route ──────────────────

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List packages owned by the actor (guide-authored + AI-seeded drafts)' })
  findOwn(@CurrentUser() user: { userId: string }) {
    return this.service.findOwn(user.userId);
  }

  @Get(':slug')
  @ApiOperation({ summary: 'Get APPROVED tour package detail by slug (PUBLIC)' })
  findBySlug(@Param('slug') slug: string) {
    return this.service.findBySlug(slug);
  }

  // ── Authenticated writes ────────────────────────────────────────────────

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.TOUR_GUIDE)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Create a DRAFT tour package (TOUR_GUIDE only; guide must be APPROVED)',
  })
  create(@CurrentUser() user: { userId: string }, @Body() dto: CreateTourPackageDto) {
    return this.service.create(user.userId, dto);
  }

  @Post('from-ai-suggestion')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Create a DRAFT TourPackage seeded from an AI suggestion (Save as bookable)',
    description:
      'Any authenticated user (incl. TOURIST). Creates status=DRAFT, tourGuideId=null, ' +
      'invisible to public /tour-packages until an APPROVED guide claims it.',
  })
  createFromAiSuggestion(
    @CurrentUser() user: { userId: string },
    @Body() dto: CreateFromAiSuggestionDto,
  ) {
    return this.service.createFromAiSuggestion(user.userId, dto);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.TOUR_GUIDE)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Update DRAFT|PENDING|REJECTED package (own only); APPROVED edits return 409',
  })
  update(
    @Param('id') id: string,
    @CurrentUser() user: { userId: string },
    @Body() dto: UpdateTourPackageDto,
  ) {
    return this.service.update(id, user.userId, dto);
  }

  @Post(':id/submit')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.TOUR_GUIDE)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Submit DRAFT|REJECTED package for admin review (→ PENDING)' })
  submitForReview(@Param('id') id: string, @CurrentUser() user: { userId: string }) {
    return this.service.submitForReview(id, user.userId);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.TOUR_GUIDE)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Soft-delete own non-APPROVED package' })
  remove(@Param('id') id: string, @CurrentUser() user: { userId: string }) {
    return this.service.softDelete(id, user.userId);
  }
}

/**
 * Admin routes (LGA_ADMIN+).
 *
 * Route table:
 *   GET    /admin/tour-packages/queue         — pending queue
 *   POST   /admin/tour-packages/:id/decide    — approve or reject
 */
@ApiTags('admin-tour-packages')
@Controller('admin/tour-packages')
export class TourPackagesAdminController {
  constructor(private readonly service: TourPackageService) {}

  @Get('queue')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.LGA_ADMIN, UserRole.STATE_ADMIN, UserRole.SUPER_ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List PENDING packages awaiting admin review' })
  queue(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('limit', new DefaultValuePipe(24), ParseIntPipe) limit?: number,
  ) {
    return this.service.findPendingQueue({ page, limit });
  }

  @Post(':id/decide')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.LGA_ADMIN, UserRole.STATE_ADMIN, UserRole.SUPER_ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Approve or reject a PENDING package' })
  decide(
    @Param('id') id: string,
    @CurrentUser() user: { userId: string },
    @Body() dto: AdminDecideTourPackageDto,
  ) {
    return this.service.adminDecide(id, dto, user.userId);
  }
}
