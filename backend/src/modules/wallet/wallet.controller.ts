import {
  Controller, Get, Post, Body, Query, UseGuards,
  ParseIntPipe, DefaultValuePipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { WalletService } from './wallet.service';
import { TransferDto } from './dto/transfer.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('wallet')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('wallet')
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @Get('balance')
  @ApiOperation({ summary: 'Wallet balance with KYC tier and daily limit' })
  getBalance(@CurrentUser() user: any) {
    return this.walletService.getBalance(user.userId);
  }

  @Get('transactions')
  @ApiOperation({ summary: 'Cursor-paginated transaction history' })
  @ApiQuery({ name: 'cursor', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'type', required: false, enum: ['CREDIT', 'DEBIT', 'REFUND', 'TRANSFER'] })
  @ApiQuery({ name: 'module', required: false, enum: ['wallet', 'events', 'stays', 'marketplace', 'studio'] })
  @ApiQuery({ name: 'date_from', required: false })
  @ApiQuery({ name: 'date_to', required: false })
  getTransactions(
    @CurrentUser() user: any,
    @Query('cursor') cursor?: string,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit?: number,
    @Query('type') type?: string,
    @Query('module') module?: string,
    @Query('date_from') date_from?: string,
    @Query('date_to') date_to?: string,
  ) {
    return this.walletService.getTransactions(user.userId, { cursor, limit, type, module, date_from, date_to });
  }

  @Post('topup')
  @ApiOperation({ summary: 'Initiate wallet topup via Paystack (CBN daily limits enforced)' })
  topup(@CurrentUser() user: any, @Body() body: { amount: number; email: string }) {
    return this.walletService.initiateTopup(user.userId, body);
  }

  @Post('transfer')
  @ApiOperation({ summary: 'Transfer wallet balance to another user by phone number' })
  transfer(@CurrentUser() user: any, @Body() dto: TransferDto) {
    return this.walletService.transfer(user.userId, dto);
  }
}
