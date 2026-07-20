import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
  DefaultValuePipe,
  ParseIntPipe,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ReviewsService } from './reviews.service';
import { ReviewsClientService } from '../reviews-client/reviews-client.service';
import { CreateReviewDto, REVIEW_TARGET_TYPES, ReviewTargetTypeLiteral } from './dto/create-review.dto';
import { ResolveFlagDto } from './dto/resolve-flag.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../../common/enums/user-role.enum';

/**
 * Tourist-facing review endpoints.
 *
 * Route table:
 *   POST  /reviews                                    — JwtAuthGuard
 *   GET   /reviews?targetType=&targetId=&page=&limit= — PUBLIC
 *
 * 21-05: routed through ReviewsClientService (reviews-service gRPC facade) instead of
 * ReviewsService directly — registered inside ReviewsClientModule now.
 */
@ApiTags('Reviews')
@Controller('reviews')
export class ReviewsController {
  constructor(private readonly reviewsClient: ReviewsClientService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Post a rating after a completed tour',
    description:
      'Rating ≤ 2 auto-creates an AdminReviewFlag (status=OPEN) in the same DB transaction. ' +
      'Photo URLs must come from POST /uploads/presigned with keyPrefix=review-photos. ' +
      'One review per (booking × targetType × targetId) triplet.',
  })
  @ApiResponse({ status: 201, description: 'Review created' })
  @ApiResponse({ status: 400, description: 'Tour not ended yet / targetId mismatch' })
  @ApiResponse({ status: 403, description: 'Caller did not own this booking' })
  @ApiResponse({ status: 404, description: 'Booking not found' })
  @ApiResponse({ status: 409, description: 'Duplicate review for this booking × target' })
  create(
    @CurrentUser() user: { userId: string },
    @Body() dto: CreateReviewDto,
  ) {
    return this.reviewsClient.createReview(user.userId, dto);
  }

  @Get()
  @ApiOperation({
    summary: 'List non-flagged reviews for a target (PUBLIC)',
    description:
      'Returns only reviews where flagged=false and deletedAt=null, ordered newest-first.',
  })
  @ApiQuery({ name: 'targetType', enum: REVIEW_TARGET_TYPES, required: true })
  @ApiQuery({ name: 'targetId', type: String, required: true })
  @ApiQuery({ name: 'page', type: Number, required: false })
  @ApiQuery({ name: 'limit', type: Number, required: false })
  @ApiResponse({ status: 200, description: 'Paginated review list' })
  findAll(
    @Query('targetType') targetType: ReviewTargetTypeLiteral,
    @Query('targetId') targetId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(24), ParseIntPipe) limit: number,
  ) {
    return this.reviewsClient.findByTarget(targetType, targetId, { page, limit });
  }
}

/**
 * Admin review-queue endpoints.
 *
 * Route table:
 *   GET   /admin/reviews/queue          — LGA_ADMIN+
 *   GET   /admin/reviews/flags/:id      — LGA_ADMIN+
 *   POST  /admin/reviews/flags/:id/resolve — LGA_ADMIN+
 */
@ApiTags('Admin – Reviews')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.LGA_ADMIN, UserRole.STATE_ADMIN, UserRole.SUPER_ADMIN)
@Controller('admin/reviews')
export class ReviewsAdminController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Get('queue')
  @ApiOperation({
    summary: 'Admin flag queue',
    description: 'Returns AdminReviewFlag rows with embedded review + reviewer. Default status=OPEN.',
  })
  @ApiQuery({ name: 'status', required: false, description: 'OPEN | RESOLVED | DISMISSED | IN_REVIEW' })
  @ApiQuery({ name: 'page', type: Number, required: false })
  @ApiQuery({ name: 'limit', type: Number, required: false })
  @ApiResponse({ status: 200, description: 'Paginated flag queue' })
  getFlagQueue(
    @Query('status') status?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('limit', new DefaultValuePipe(24), ParseIntPipe) limit?: number,
  ) {
    return this.reviewsService.findFlagQueue({ status, page, limit });
  }

  @Get('flags/:id')
  @ApiOperation({ summary: 'Get a single AdminReviewFlag with embedded review + reviewer' })
  @ApiResponse({ status: 200, description: 'Flag detail' })
  @ApiResponse({ status: 404, description: 'Flag not found' })
  getFlag(@Param('id') id: string) {
    return this.reviewsService.findFlagById(id);
  }

  @Post('flags/:id/resolve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Resolve or dismiss an AdminReviewFlag',
    description: '409 if the flag is not OPEN.',
  })
  @ApiResponse({ status: 200, description: 'Flag updated' })
  @ApiResponse({ status: 404, description: 'Flag not found' })
  @ApiResponse({ status: 409, description: 'Flag is not OPEN' })
  resolveFlag(
    @Param('id') id: string,
    @CurrentUser() user: { userId: string },
    @Body() dto: ResolveFlagDto,
  ) {
    return this.reviewsService.resolveFlag(id, user.userId, dto);
  }
}
