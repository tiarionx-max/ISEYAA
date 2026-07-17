import { Controller, Get, NotFoundException, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../modules/auth/guards/jwt-auth.guard';
import { PrismaService } from '../../prisma/prisma.service';
import { CurrentUser } from '../decorators/current-user.decorator';
import { UserRole } from '../enums/user-role.enum';
import { SettlementService } from '../services/settlement.service';

/**
 * 12-08 — SETTLE-07 itemized settlement statement retrieval.
 *
 * IDOR-critical: a non-admin caller's `walletId` is ALWAYS derived from their
 * authenticated session (`@CurrentUser().userId`), never trusted from a
 * client-supplied query parameter. Only SUPER_ADMIN/LGA_ADMIN may pass an
 * explicit `walletId` to inspect another recipient's statement — see the
 * `isAdmin && walletId` gate below (T-12-18 mitigation).
 */
@ApiTags('settlements')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('settlements')
export class SettlementController {
  constructor(
    private prisma: PrismaService,
    private settlementService: SettlementService,
  ) {}

  @Get('statement')
  @ApiOperation({
    summary: 'Itemized settlement statement — self-scoped, admin-overridable by walletId',
  })
  @ApiQuery({
    name: 'walletId',
    required: false,
    description: "SUPER_ADMIN/LGA_ADMIN only — any other role's value is ignored",
  })
  @ApiQuery({ name: 'dateFrom', required: false })
  @ApiQuery({ name: 'dateTo', required: false })
  async getStatement(
    @CurrentUser() user: { userId: string; role: string },
    @Query('walletId') walletId?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    const isAdmin = user.role === UserRole.SUPER_ADMIN || user.role === UserRole.LGA_ADMIN;
    let targetWalletId: string;
    if (isAdmin && walletId) {
      targetWalletId = walletId;
    } else {
      const wallet = await this.prisma.wallet.findUnique({
        where: { userId: user.userId },
        select: { id: true },
      });
      if (!wallet) throw new NotFoundException('Wallet not found for current user');
      targetWalletId = wallet.id;
    }
    return this.settlementService.getStatement(targetWalletId, { dateFrom, dateTo });
  }
}
