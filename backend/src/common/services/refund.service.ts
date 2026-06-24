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

    // 2. Call Paystack refund endpoint. Errors propagate — no ledger row written on failure.
    const paystackResult = await this.paystack.refundCharge(
      input.paystackReference,
      amountKobo,
      input.reason,
    );

    const txnStatus: 'SUCCESS' | 'PENDING' = paystackResult.status === 'processed' ? 'SUCCESS' : 'PENDING';

    // 3. Write REFUND Transaction row inside an interactive transaction with SELECT FOR UPDATE
    //    on the buyer wallet — keeps us consistent with the wallet locking convention even
    //    though we are not mutating the balance here (defense-in-depth for future code that
    //    might toggle this row to also credit the wallet).
    const txn = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT id FROM wallets WHERE id = ${input.walletId} FOR UPDATE`;
      const wallet = await tx.wallet.findUnique({ where: { id: input.walletId } });
      if (!wallet) throw new NotFoundException('Wallet not found for refund');

      const balance = Number(wallet.balance);
      return tx.transaction.create({
        data: {
          walletId: input.walletId,
          type: 'REFUND',
          status: txnStatus,
          amount: amountNgn,
          currency: 'NGN',
          reference: refundRef,
          gateway: 'PAYSTACK',
          gatewayRef: paystackResult.id,
          description: input.reason ?? 'Refund issued',
          balanceBefore: balance,
          balanceAfter: balance, // unchanged — money returns to card, not wallet
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
      paystackRefundId: paystackResult.id,
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
