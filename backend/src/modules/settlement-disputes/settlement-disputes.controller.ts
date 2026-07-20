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
import { SettlementDisputesService } from './settlement-disputes.service';
import { RaiseDisputeDto } from './dto/raise-dispute.dto';
import { ResolveDisputeDto } from './dto/resolve-dispute.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../../common/enums/user-role.enum';

/**
 * 19-04 — SettlementDisputesController.
 *
 * Exposes `SettlementDisputesService` (19-03) over HTTP. Single controller —
 * unlike `ReviewsController`/`ReviewsAdminController`'s public/admin split,
 * D-02/D-06 mean every route here is `SUPER_ADMIN`-only (no citizen-facing
 * surface, no `STATE_ADMIN`/`LGA_ADMIN` inclusion, no new web admin page).
 *
 * Route table:
 *   POST  /admin/settlement-disputes             — SUPER_ADMIN
 *   GET   /admin/settlement-disputes/queue        — SUPER_ADMIN
 *   GET   /admin/settlement-disputes/:id          — SUPER_ADMIN
 *   POST  /admin/settlement-disputes/:id/review   — SUPER_ADMIN
 *   POST  /admin/settlement-disputes/:id/resolve  — SUPER_ADMIN
 *   POST  /admin/settlement-disputes/:id/dismiss  — SUPER_ADMIN
 */
@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN)
@Controller('admin/settlement-disputes')
export class SettlementDisputesController {
  constructor(private readonly service: SettlementDisputesService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Raise a dispute against a completed settlement (SETTLE-10a)',
    description:
      '404 if no settled Transaction exists for settlementReference. 409 if an active ' +
      '(OPEN/IN_REVIEW/BLOCKED) dispute already exists for the same settlementReference.',
  })
  @ApiResponse({ status: 201, description: 'Dispute created' })
  @ApiResponse({ status: 404, description: 'No settlement found for this reference' })
  @ApiResponse({ status: 409, description: 'An active dispute already exists for this settlement' })
  raise(
    @CurrentUser() user: { userId: string },
    @Body() dto: RaiseDisputeDto,
  ) {
    return this.service.raise(user.userId, dto);
  }

  @Get('queue')
  @ApiOperation({
    summary: 'Admin dispute queue (SETTLE-10b)',
    description: 'Returns SettlementDispute rows with embedded raisedBy. Default status=OPEN.',
  })
  @ApiQuery({ name: 'status', required: false, description: 'OPEN | IN_REVIEW | RESOLVED | DISMISSED | BLOCKED' })
  @ApiQuery({ name: 'page', type: Number, required: false })
  @ApiQuery({ name: 'limit', type: Number, required: false })
  @ApiResponse({ status: 200, description: 'Paginated dispute queue' })
  getQueue(
    @Query('status') status?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('limit', new DefaultValuePipe(24), ParseIntPipe) limit?: number,
  ) {
    return this.service.findQueue({ status, page, limit });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single SettlementDispute with embedded raisedBy' })
  @ApiResponse({ status: 200, description: 'Dispute detail' })
  @ApiResponse({ status: 404, description: 'Dispute not found' })
  getById(@Param('id') id: string) {
    return this.service.findById(id);
  }

  @Post(':id/review')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Move a dispute from OPEN to IN_REVIEW (SETTLE-10b)',
    description: '409 if the dispute is not OPEN — a BLOCKED dispute re-resolves directly via /resolve (D-05).',
  })
  @ApiResponse({ status: 200, description: 'Dispute moved to IN_REVIEW' })
  @ApiResponse({ status: 404, description: 'Dispute not found' })
  @ApiResponse({ status: 409, description: 'Dispute is not OPEN' })
  review(
    @Param('id') id: string,
    @CurrentUser() user: { userId: string },
  ) {
    return this.service.moveToReview(id, user.userId);
  }

  @Post(':id/resolve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'System-computed resolution — posts the derived adjustment (SETTLE-10c/10d)',
    description:
      'Callable from OPEN/IN_REVIEW/BLOCKED (D-05). System computes the adjustment via ' +
      'resolveSplit()/computeAdjustmentLines() — no caller-supplied amount (D-01). ' +
      'Ends BLOCKED (not an error) on insufficient wallet balance; retryable.',
  })
  @ApiResponse({ status: 200, description: 'Dispute resolved (or BLOCKED pending retry)' })
  @ApiResponse({ status: 404, description: 'Dispute not found' })
  @ApiResponse({ status: 409, description: 'Dispute is already RESOLVED/DISMISSED' })
  resolve(
    @Param('id') id: string,
    @CurrentUser() user: { userId: string },
    @Body() dto: ResolveDisputeDto,
  ) {
    return this.service.resolve(id, user.userId, dto);
  }

  @Post(':id/dismiss')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Dismiss a dispute — no adjustment warranted (SETTLE-10e)',
    description: '409 if the dispute is already RESOLVED/DISMISSED.',
  })
  @ApiResponse({ status: 200, description: 'Dispute dismissed' })
  @ApiResponse({ status: 404, description: 'Dispute not found' })
  @ApiResponse({ status: 409, description: 'Dispute is already RESOLVED/DISMISSED' })
  dismiss(
    @Param('id') id: string,
    @CurrentUser() user: { userId: string },
    @Body() dto: ResolveDisputeDto,
  ) {
    return this.service.dismiss(id, user.userId, dto);
  }
}
