import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { FlutterwaveService } from './flutterwave.service';
import { ReferenceService } from './reference.service';

export interface RefundInput {
  /** The original Flutterwave charge reference (e.g. `ISY-TOUR-...`). */
  gatewayReference: string;
  /** Amount to refund in kobo. For full refund pass the original charge amount. */
  amountKobo: number;
  /** Buyer's wallet ID — used for the reversal Transaction ledger row. */
  walletId: string;
  /** Human-readable reason; logged only — Flutterwave's refund body has no note field. */
  reason: string;
  /** Optional extra audit info (e.g. `{ bookingId, splitLegThatFailed }`). */
  metadata?: Record<string, any>;
  /**
   * Gateway the original settlement was charged through. The caller-supplied `gateway`
   * is threaded through unchanged (no default assumed here — `SettlementService` always
   * passes `input.gateway` explicitly). When `'WALLET'`, the buyer's in-app wallet —
   * already debited before settlement — is credited back directly instead of calling the
   * Flutterwave refund API, which was never a real charge for that payment (WR-03).
   */
  gateway?: 'PAYSTACK' | 'FLUTTERWAVE' | 'WALLET' | 'INTERNAL';
}

export interface RefundResult {
  /** Our internal refund reference (`<gatewayReference>-RFND`). */
  refundReference: string;
  /** ID returned by Flutterwave (stored in Transaction.gatewayRef). */
  gatewayRefundId: string;
  /** NGN (kobo / 100). */
  amountRefunded: number;
  status: 'SUCCESS' | 'PENDING' | 'FAILED';
  /** Primary key of the REFUND Transaction row that was written. */
  transactionId: string;
}

/**
 * Wraps Flutterwave refund + writes an idempotent `REFUND` row in the buyer wallet ledger.
 *
 * **Idempotency:** keyed on `${input.gatewayReference}-RFND`. Replaying the same call
 * returns the existing record without hitting Flutterwave a second time. This makes the
 * service safe for retry inside the 09-06 settlement engine rollback path.
 *
 * **Balance neutrality:** the REFUND row is written with `balanceAfter === balanceBefore`.
 * Flutterwave returns money to the original card, NOT to the in-app wallet, so the user's
 * wallet balance never changes. The row exists purely as a ledger marker for audit and
 * idempotency. (If a future flow needs a wallet credit instead, that's a separate
 * `creditWallet` call — out of scope for this service.)
 */
@Injectable()
export class RefundService {
  private readonly logger = new Logger(RefundService.name);

  constructor(
    private prisma: PrismaService,
    private flutterwave: FlutterwaveService,
    // ReferenceService is injected for future helpers; the current refund-reference
    // format is fully deterministic (`<original>-RFND`) and does not need a UUID tail.
    private referenceService: ReferenceService,
  ) {}

  async refund(input: RefundInput): Promise<RefundResult> {
    const refundRef = `${input.gatewayReference}-RFND`;

    // 1. Idempotency check — replay-safe.
    const existing = await this.prisma.transaction.findUnique({ where: { reference: refundRef } });
    if (existing) {
      this.logger.log(`Refund replay detected for ${input.gatewayReference} — returning existing record`);
      return {
        refundReference: existing.reference,
        gatewayRefundId: existing.gatewayRef ?? '',
        amountRefunded: Number(existing.amount),
        status: this.toResultStatus(existing.status),
        transactionId: existing.id,
      };
    }

    const amountKobo = input.amountKobo;
    const amountNgn = amountKobo / 100;
    const isWalletGateway = input.gateway === 'WALLET';

    // 2. Call Flutterwave refund endpoint — skipped entirely for a WALLET-gated original
    //    settlement, since that payment was never a real Flutterwave charge (WR-03).
    //    Errors propagate — no ledger row written on failure.
    const gatewayResult = isWalletGateway
      ? null
      : await this.flutterwave.refundCharge(input.gatewayReference, amountKobo, input.reason);

    // Flutterwave refund status values are 'completed'/'pending'/'failed' (not
    // Paystack's 'processed') — see FlutterwaveService.refundCharge's return contract.
    const txnStatus: 'SUCCESS' | 'PENDING' = isWalletGateway
      ? 'SUCCESS'
      : gatewayResult!.status === 'completed'
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
          gateway: isWalletGateway ? 'WALLET' : 'FLUTTERWAVE',
          gatewayRef: isWalletGateway ? null : gatewayResult!.id,
          description: input.reason ?? 'Refund issued',
          balanceBefore,
          balanceAfter,
          metadata: {
            ...(input.metadata ?? {}),
            module: 'refund',
            originalReference: input.gatewayReference,
          },
        },
      });
    });

    return {
      refundReference: refundRef,
      gatewayRefundId: isWalletGateway ? '' : gatewayResult!.id,
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
