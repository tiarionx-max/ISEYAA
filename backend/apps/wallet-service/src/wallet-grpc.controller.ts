import { Controller, Logger } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { WalletService } from '../../../src/modules/wallet/wallet.service';
import { wallet } from '@iseyaa/proto';

@Controller()
export class WalletGrpcController {
  private readonly logger = new Logger(WalletGrpcController.name);

  constructor(
    private readonly walletService: WalletService,
    private readonly prisma: PrismaService,
  ) {}

  @GrpcMethod('WalletService', 'Credit')
  async credit(data: wallet.CreditRequest): Promise<wallet.CreditResponse> {
    await this.walletService.creditWallet(data.walletId, data.amount, data.reference, data.description);
    const wallet = await this.prisma.wallet.findUnique({ where: { id: data.walletId } });
    return { success: true, newBalance: Number(wallet?.balance ?? 0) };
  }

  @GrpcMethod('WalletService', 'Debit')
  async debit(data: wallet.DebitRequest): Promise<wallet.DebitResponse> {
    try {
      const result = await this.walletService.debitWallet(
        data.walletId,
        data.amount,
        data.reference,
        data.description,
        'grpc',
      );
      return { success: true, newBalance: result.balanceAfter };
    } catch (err) {
      const current = await this.prisma.wallet.findUnique({ where: { id: data.walletId } });
      return { success: false, newBalance: Number(current?.balance ?? 0) };
    }
  }

  @GrpcMethod('WalletService', 'GetBalance')
  async getBalance(data: wallet.BalanceRequest): Promise<wallet.BalanceResponse> {
    const wallet = await this.prisma.wallet.findUnique({ where: { id: data.walletId } });
    if (!wallet) return { balance: 0, escrowBalance: 0, kycTier: '0' };

    const result = await this.walletService.getBalance(wallet.userId);

    return {
      balance: result.balance_ngn,
      escrowBalance: result.escrow_balance_ngn,
      kycTier: String(result.kyc_tier),
    };
  }

  @GrpcMethod('WalletService', 'GetTransactions')
  async getTransactions(data: wallet.GetTransactionsRequest): Promise<wallet.GetTransactionsResponse> {
    const wallet = await this.prisma.wallet.findUnique({ where: { id: data.walletId } });
    if (!wallet) return { transactions: [], nextCursor: '' };

    const result = await this.walletService.getTransactions(wallet.userId, {
      cursor: data.cursor || undefined,
      limit: data.limit || 20,
    });

    return {
      transactions: result.data.map((t) => ({
        id: t.id,
        type: t.type,
        amount: Number(t.amount),
        reference: t.reference ?? '',
        description: t.description ?? '',
        createdAt: t.createdAt.toISOString(),
      })),
      nextCursor: result.meta.cursor ?? '',
    };
  }
}
