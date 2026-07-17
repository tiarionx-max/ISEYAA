import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PaystackService } from './paystack.service';
import { ReferenceService } from './reference.service';

export interface RefundInput {
  /** The original Paystack charge reference (e.g. `ISY-TOUR-...`). */
  paystackReference: string;
  /** Amount to refund in kobo. For full refund pass the original charge amount. */
  amountKobo: number;
  /** Buyer's wallet ID — used for the reversal Transaction ledger row. */
  walletId: string;
  /** Human-readable reason; logged + sent to Paystack as `customer_note`. */
  reason: string;
  /** Optional extra audit info (e.g. `{ bookingId, splitLegThatFailed }`). */
  metadata?: Record<string, any>;
  /**
   * Gateway the original settlement was charged through. Defaults to `'PAYSTACK'` for
   * backward compatibility with existing callers. When `'WALLET'`, the buyer's
   * in-app wallet — already debited before settlement — is credited back directly
   * instead of calling the Paystack refund API, which was never a real charge for
   * that payment (WR-03).
   */
  gateway?: 'PAYSTACK' | 'FLUTTERWAVE' | 'WALLET' | 'INTERNAL';
}

export interface RefundResult {
  /** Our internal refund reference (`<paystackReference>-RFND`). */
  refundReference: string;
  /** ID returned by Paystack (stored in Transaction.gatewayRef). */
  paystackRefundId: string;
  /** NGN (kobo / 100). */
  amountRefunded: number;
  status: 'SUCCESS' | 'PENDING' | 'FAILED';
  /** Primary key of the REFUND Transaction row that was written. */
  transactionId: string;
}

/**
 * Wraps Paystack refund + writes an idempotent `REFUND` row in the buyer wallet ledger.
 *
 * **Idempotency:** keyed on `${input.paystackReference}-RFND`. Replaying the same call
 * returns the existing record without hitting Paystack a second time. This makes the
 * service safe for retry inside the 09-06 settlement engine rollback path.
 *
 * **Balance neutrality:** the REFUND row is written with `balanceAfter === balanceBefore`.
 * Paystack returns money to the original card, NOT to the in-app wallet, so the user's
 * wallet balance never changes. The row exists purely as a ledger marker for audit and
 * idempotency. (If a future flow needs a wallet credit instead, that's a separate
 * `creditWallet` call — out of scope for this service.)
 */
@Injectable()
export class RefundService {
  private readonly logger = new Logger(RefundService.name);

  constructor(
    private prisma: PrismaService,
    private paystack: PaystackService,
    // ReferenceService is injected for future helpers; the current refund-reference
    // format is fully deterministic (`<original>-RFND`) and does not need a UUID tail.
    private referenceService: ReferenceService,
  ) {}

  async refund(input: RefundInput): Promise<RefundResult> {
    const refundRef = `${input.paystackReference}-RFND`;

    // 1. Idempotency check — replay-safe.
    const existing = await this.prisma.transaction.findUnique({ where: { reference: refundRef } });
    if (existing) {
      this.logger.log(`Refund replay detected for ${input.paystackReference} — returning existing record`);
      return {
        refundReference: existing.reference,
        paystackRefundId: existing.gatewayRef ?? '',
        amountRefunded: Number(existing.amount),
        status: this.toResultStatus(existing.status),
        transactionId: existing.id,
      };
    }

    const amountKobo = input.amountKobo;
    const amountNgn = amountKobo / 100;
    const isWalletGateway = input.gateway === 'WALLET';

    // 2. Call Paystack refund endpoint — skipped entirely for a WALLET-gated original
    //    settlement, since that payment was never a real Paystack charge (WR-03).
    //    Errors propagate — no ledger row written on failure.
    const paystackResult = isWalletGateway
      ? null
      : await this.paystack.refundCharge(input.paystackReference, amountKobo, input.reason);

    const txnStatus: 'SUCCESS' | 'PENDING' = isWalletGateway
      ? 'SUCCESS'
      : paystackResult!.status === 'processed'
        ? 'SUCCESS'
        : 'PENDING';

    // 3. Write REFUND Transaction row inside an interactive transaction with SELECT FOR UPDATE
    //    on the buyer wallet. For the WALLET gateway, this is where the actual credit-back
    //    happens (the buyer's wallet balance is restored); for PAYSTACK/FLUTTERWAVE/INTERNAL
    //    the row remains balance-neutral since money returns to the original card, not
    //    the in-app wallet.
    const txn = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT id FROM wallets WHERE id = ${input.walletId} FOR UPDATE`;
      const wallet = await tx.wallet.findUnique({ where: { id: input.walletId } });
      if (!wallet) throw new NotFoundException('Wallet not found for refund');

      const balanceBefore = Number(wallet.balance);
      const balanceAfter = isWalletGateway ? balanceBefore + amountNgn : balanceBefore;

      if (isWalletGateway) {
        await tx.wallet.update({ where: { id: input.walletId }, data: { balance: balanceAfter } });
      }

      return tx.transaction.create({
        data: {
          walletId: input.walletId,
          type: 'REFUND',
          status: txnStatus,
          amount: amountNgn,
          currency: 'NGN',
          reference: refundRef,
          gateway: isWalletGateway ? 'WALLET' : 'PAYSTACK',
          gatewayRef: isWalletGateway ? null : paystackResult!.id,
          description: input.reason ?? 'Refund issued',
          balanceBefore,
          balanceAfter,
          metadata: {
            ...(input.metadata ?? {}),
            module: 'refund',
            originalReference: input.paystackReference,
          },
        },
      });
    });

    return {
      refundReference: refundRef,
      paystackRefundId: isWalletGateway ? '' : paystackResult!.id,
      amountRefunded: amountNgn,
      status: txnStatus,
      transactionId: txn.id,
    };
  }

  private toResultStatus(s: string): 'SUCCESS' | 'PENDING' | 'FAILED' {
    if (s === 'SUCCESS') return 'SUCCESS';
    if (s === 'PENDING') return 'PENDING';
    return 'FAILED';
  }
}
