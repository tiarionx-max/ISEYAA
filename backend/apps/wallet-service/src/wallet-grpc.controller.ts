import { Controller, Logger } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { WalletService } from '../../../src/modules/wallet/wallet.service';
import {
  CreditRequest,
  CreditResponse,
  DebitRequest,
  DebitResponse,
  BalanceRequest,
  BalanceResponse,
  GetTransactionsRequest,
  GetTransactionsResponse,
} from '@iseyaa/proto';

@Controller()
export class WalletGrpcController {
  private readonly logger = new Logger(WalletGrpcController.name);

  constructor(
    private readonly walletService: WalletService,
    private readonly prisma: PrismaService,
  ) {}

  @GrpcMethod('WalletService', 'Credit')
  async credit(data: CreditRequest): Promise<CreditResponse> {
    await this.walletService.creditWallet(data.walletId, data.amount, data.reference, data.description);
    const wallet = await this.prisma.wallet.findUnique({ where: { id: data.walletId } });
    return { success: true, newBalance: Number(wallet?.balance ?? 0) };
  }

  @GrpcMethod('WalletService', 'Debit')
  async debit(data: DebitRequest): Promise<DebitResponse> {
    const wallet = await this.prisma.wallet.findUnique({ where: { id: data.walletId } });
    if (!wallet || Number(wallet.balance) < data.amount) {
      return { success: false, newBalance: Number(wallet?.balance ?? 0) };
    }

    const balanceBefore = Number(wallet.balance);
    const balanceAfter = balanceBefore - data.amount;

    await this.prisma.$transaction([
      this.prisma.wallet.update({ where: { id: data.walletId }, data: { balance: balanceAfter } }),
      this.prisma.transaction.create({
        data: {
          walletId: data.walletId,
          type: 'DEBIT',
          status: 'SUCCESS',
          amount: data.amount,
          currency: 'NGN',
          reference: data.reference,
          gateway: 'PAYSTACK',
          description: data.description,
          balanceBefore,
          balanceAfter,
          metadata: { module: 'grpc' },
        },
      }),
    ]);

    return { success: true, newBalance: balanceAfter };
  }

  @GrpcMethod('WalletService', 'GetBalance')
  async getBalance(data: BalanceRequest): Promise<BalanceResponse> {
    const wallet = await this.prisma.wallet.findUnique({ where: { id: data.walletId } });
    if (!wallet) return { balance: 0, escrowBalance: 0, kycTier: '0' };

    const user = await this.prisma.user.findUnique({
      where: { id: wallet.userId },
      select: { phone: true, nin: true, bvn: true },
    });

    const tier = user?.nin || user?.bvn ? '2' : user?.phone ? '1' : '0';

    return {
      balance: Number(wallet.balance),
      escrowBalance: 0,
      kycTier: tier,
    };
  }

  @GrpcMethod('WalletService', 'GetTransactions')
  async getTransactions(data: GetTransactionsRequest): Promise<GetTransactionsResponse> {
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
