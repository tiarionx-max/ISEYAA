import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PaystackService } from '../../common/services/paystack.service';

const KYC_TIER_1_LIMIT = 50_000;   // phone verified
const KYC_TIER_2_LIMIT = 500_000;  // NIN / BVN verified

function getKycTier(user: { phone?: string | null; nin?: string | null; bvn?: string | null }) {
  if (user.nin || user.bvn) return { tier: 2, dailyLimit: KYC_TIER_2_LIMIT };
  if (user.phone) return { tier: 1, dailyLimit: KYC_TIER_1_LIMIT };
  return { tier: 0, dailyLimit: 0 };
}

@Injectable()
export class WalletService {
  constructor(
    private prisma: PrismaService,
    private paystack: PaystackService,
  ) {}

  async getBalance(userId: string) {
    const [wallet, user] = await Promise.all([
      this.prisma.wallet.findUnique({ where: { userId } }),
      this.prisma.user.findUnique({ where: { id: userId }, select: { phone: true, nin: true, bvn: true } }),
    ]);
    if (!wallet) throw new NotFoundException('Wallet not found');
    if (!user) throw new NotFoundException('User not found');

    const { tier, dailyLimit } = getKycTier(user);

    // Escrow: sum of confirmed stays bookings not yet released (host view)
    const escrowResult = await this.prisma.booking.aggregate({
      where: {
        property: { hostId: userId },
        status: 'CONFIRMED',
        escrowReleasedAt: null,
        deletedAt: null,
      },
      _sum: { totalPrice: true },
    });

    return {
      balance_ngn: Number(wallet.balance),
      escrow_balance_ngn: Number(escrowResult._sum.totalPrice ?? 0),
      kyc_tier: tier,
      daily_limit_ngn: dailyLimit,
    };
  }

  async getTransactions(
    userId: string,
    opts: {
      cursor?: string;
      limit?: number;
      type?: string;
      module?: string;
      date_from?: string;
      date_to?: string;
    },
  ) {
    const wallet = await this.prisma.wallet.findUnique({ where: { userId } });
    if (!wallet) throw new NotFoundException('Wallet not found');

    const limit = Math.min(opts.limit ?? 20, 100);

    const where: Prisma.TransactionWhereInput = {
      walletId: wallet.id,
      deletedAt: null,
      ...(opts.type && { type: opts.type as any }),
      ...(opts.module && { metadata: { path: ['module'], equals: opts.module } }),
      ...((opts.date_from || opts.date_to) && {
        createdAt: {
          ...(opts.date_from && { gte: new Date(opts.date_from) }),
          ...(opts.date_to && { lte: new Date(opts.date_to) }),
        },
      }),
    };

    const items = await this.prisma.transaction.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(opts.cursor && { cursor: { id: opts.cursor }, skip: 1 }),
    });

    const hasNext = items.length > limit;
    const data = hasNext ? items.slice(0, limit) : items;
    const nextCursor = hasNext ? data[data.length - 1].id : null;

    return { data, meta: { cursor: nextCursor, hasNext, limit } };
  }

  async initiateTopup(userId: string, dto: { amount: number; email: string }) {
    const [wallet, user] = await Promise.all([
      this.prisma.wallet.findUnique({ where: { userId } }),
      this.prisma.user.findUnique({ where: { id: userId }, select: { phone: true, nin: true, bvn: true } }),
    ]);
    if (!wallet) throw new NotFoundException('Wallet not found');
    if (!user) throw new NotFoundException('User not found');

    const { tier, dailyLimit } = getKycTier(user);
    if (tier === 0) {
      throw new BadRequestException('KYC required: verify your phone number to enable wallet funding');
    }

    // Enforce CBN daily limit
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const todayCredits = await this.prisma.transaction.aggregate({
      where: {
        walletId: wallet.id,
        type: 'CREDIT',
        status: 'SUCCESS',
        createdAt: { gte: todayStart },
        deletedAt: null,
      },
      _sum: { amount: true },
    });

    const usedToday = Number(todayCredits._sum.amount ?? 0);
    if (usedToday + dto.amount > dailyLimit) {
      throw new BadRequestException(
        `Daily limit exceeded. Tier ${tier} daily limit: ₦${dailyLimit.toLocaleString()}. Used today: ₦${usedToday.toLocaleString()}`,
      );
    }

    const reference = `ISY-FUND-${uuidv4().replace(/-/g, '').slice(0, 12).toUpperCase()}`;

    const payment = await this.paystack.initiatePayment({
      email: dto.email,
      amountKobo: dto.amount * 100,
      reference,
      metadata: { type: 'wallet_topup', walletId: wallet.id, userId, module: 'wallet' },
    });

    return { reference, authorizationUrl: payment.authorizationUrl };
  }

  async creditWallet(walletId: string, amount: number, reference: string, description: string, module = 'wallet', gateway: 'PAYSTACK' | 'FLUTTERWAVE' | 'INTERNAL' = 'PAYSTACK') {
    const wallet = await this.prisma.wallet.findUnique({ where: { id: walletId } });
    if (!wallet) throw new NotFoundException('Wallet not found');

    const balanceBefore = Number(wallet.balance);
    const balanceAfter = balanceBefore + amount;

    await this.prisma.$transaction([
      this.prisma.wallet.update({ where: { id: walletId }, data: { balance: balanceAfter } }),
      this.prisma.transaction.create({
        data: {
          walletId,
          type: 'CREDIT',
          status: 'SUCCESS',
          amount,
          currency: 'NGN',
          reference,
          gateway,
          description,
          balanceBefore,
          balanceAfter,
          metadata: { module },
        },
      }),
    ]);
  }
}
