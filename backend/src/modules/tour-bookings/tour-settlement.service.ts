import {
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import { RefundService } from '../../common/services/refund.service';
import {
  SettlementService,
  SettlementRecipient,
} from '../../common/services/settlement.service';
import { KafkaService } from '../../kafka/kafka.service';
import { VisitorLogService } from '../../common/services/visitor-log.service';
import { DEFAULT_VISITOR_PURPOSE } from '../../common/constants/visitor-purpose.constants';

/**
 * 09-06 / 12-03 — Tour Settlement Service.
 *
 * Resolves Tour's domain-specific N-way vendor split (GUIDE/HOST/ORGANISER/
 * ATTRACTION) from the booking snapshot, then delegates the atomic wallet
 * fan-out — `$transaction`, `SELECT FOR UPDATE`, idempotency, drift assertion,
 * refund-on-failure — to the shared `SettlementService` (12-01). This module
 * keeps 100% of the vendor-resolution logic; only the transactional primitives
 * moved.
 *
 * ── Architectural commitments (LOCKED — do not deviate) ───────────────────
 * 1. ONE `SettlementService.settle()` call per Paystack `charge.success` with
 *    `metadata.type='tour_booking'` — internally ONE `$transaction`.
 * 2. `SELECT FOR UPDATE` on EVERY wallet row touched (vendor wallets + system
 *    wallet) — enforced inside `SettlementService`.
 * 3. Failure rollback → `RefundService.refund` → booking transitions to REFUNDED
 *    (via `SettlementService`'s `onFailure` hook for in-transaction failures, or
 *    `refundInvalidSplit` for the pre-flight split-percentage guard below).
 * 4. Idempotency keyed on `<paystackRef>-*` Transaction rows; replays are no-ops
 *    (enforced inside `SettlementService`).
 * 5. Reference scheme: `<paystackRef>-V-<idx>` per vendor, `<paystackRef>-PLAT` for commission.
 * 6. ATTRACTION vendorType with unset `tour.government_wallet_user_id` PlatformConfig:
 *    that share rolls into platform commission with a `logger.warn` (does NOT block
 *    settlement — blocking would brick all tour bookings on misconfiguration).
 * 7. Split-bill: child charges settle identically per share; CONFIRMED transition
 *    is OUTSIDE the wallet $transaction (array mutation is independent of wallet locks).
 * 8. System wallet bootstrap now lives in `SettlementService.onModuleInit()` —
 *    Tour no longer owns it.
 *
 * ── Wallet invariant (TOUR-10) ─────────────────────────────────────────────
 *   sum(vendor credits with resolved wallets) + platform commission == buyer paid amount
 * The platform row absorbs all rounding drift and any unresolved ATTRACTION shares.
 * A defensive assert throws on drift > ₦0.02 to surface programming errors
 * (enforced inside `SettlementService`).
 */

export interface TourBookingPaymentPayload {
  reference: string;
  amount: number; // kobo (as Paystack delivers)
  metadata?: {
    type?: string;
    bookingId?: string;
    shareKey?: string;
    parentReference?: string;
    module?: string;
    remaining?: number;
  };
}

interface SplitEntry {
  vendorType: 'GUIDE' | 'HOST' | 'ORGANISER' | 'ATTRACTION';
  vendorId: string;
  percentage: number;
}

interface ResolvedSplit {
  idx: number;
  entry: SplitEntry;
  walletId: string | null;
  amountNgn: number;
}

@Injectable()
export class TourSettlementService implements OnModuleInit {
  private readonly logger = new Logger(TourSettlementService.name);

  constructor(
    private prisma: PrismaService,
    private refundService: RefundService,
    private eventEmitter: EventEmitter2,
    private kafka: KafkaService,
    private settlementService: SettlementService,
    private visitorLogService: VisitorLogService,
  ) {}

  async onModuleInit(): Promise<void> {
    // Cross-pod durability: when KAFKA_BROKER_URL is set, the consumer subscribes.
    // When not set (local dev), KafkaService.consume is a no-op and we rely purely
    // on EventEmitter2 (in-process). The @OnEvent handler below handles that path.
    await this.kafka
      .consume('payment.tour_booking', 'tour-settlement-service-prod', (msg) =>
        this.handleTourBookingPayment(msg as TourBookingPaymentPayload),
      )
      .catch((err) =>
        this.logger.error('Kafka consumer wiring failed for payment.tour_booking', err),
      );
  }

  @OnEvent('payment.tour_booking')
  handleTourBookingPaymentEvent(payload: TourBookingPaymentPayload): Promise<void> {
    return this.handleTourBookingPayment(payload).catch((err: Error) => {
      this.logger.error(
        `tour_booking settlement failed for ${payload.reference}: ${err.message}`,
      );
    });
  }

  // ── Main settlement entry point ────────────────────────────────────────────

  async handleTourBookingPayment(payload: TourBookingPaymentPayload): Promise<void> {
    // 1. Resolve booking
    const bookingId = payload.metadata?.bookingId;
    if (!bookingId) {
      this.logger.warn(
        `tour_booking payload missing metadata.bookingId — ref: ${payload.reference}`,
      );
      return;
    }
    const booking = await this.prisma.tourBooking.findUnique({
      where: { id: bookingId },
    });
    if (!booking) {
      this.logger.warn(
        `tour_booking replay or unknown booking — ref: ${payload.reference}, bookingId: ${bookingId}`,
      );
      return;
    }

    // 2. Convert charge to NGN
    const chargeAmountNgn = payload.amount / 100;

    // 3. Resolve settlement entries from booking snapshot
    const snapshot: any = booking.snapshot ?? {};
    const split: SplitEntry[] = (snapshot.settlementSplit as SplitEntry[]) ?? [];

    // Defensive guard: sum of declared percentages must not exceed 100 (DB CHECK
    // exists in 09-01 but service-layer guard gives a clearer error message).
    const sumPct = split.reduce((s, e) => s + Number(e.percentage), 0);
    if (sumPct > 100.0001) {
      const err = new Error(
        `Settlement split percentages sum to ${sumPct} > 100 (booking ${booking.id})`,
      );
      await this.refundInvalidSplit(payload, booking, err);
      throw err;
    }

    const govWalletConfig = await this.prisma.platformConfig.findUnique({
      where: { key: 'tour.government_wallet_user_id' },
    });
    const govWalletUserId =
      (govWalletConfig?.value as string | null | undefined) ?? null;

    const resolved: ResolvedSplit[] = [];
    for (let idx = 0; idx < split.length; idx++) {
      const entry = split[idx];
      let walletUserId: string | null = null;

      switch (entry.vendorType) {
        case 'GUIDE': {
          const g = await this.prisma.tourGuide.findUnique({
            where: { id: entry.vendorId },
            select: { userId: true },
          });
          walletUserId = g?.userId ?? null;
          break;
        }
        case 'HOST': {
          const p = await this.prisma.property.findUnique({
            where: { id: entry.vendorId },
            select: { hostId: true },
          });
          walletUserId = p?.hostId ?? null;
          break;
        }
        case 'ORGANISER': {
          const ev = await this.prisma.event.findUnique({
            where: { id: entry.vendorId },
            select: { organizerId: true },
          });
          walletUserId = ev?.organizerId ?? null;
          break;
        }
        case 'ATTRACTION': {
          walletUserId = govWalletUserId;
          if (!walletUserId) {
            this.logger.warn(
              `Attraction ${entry.vendorId} rolled into platform commission — ` +
                `tour.government_wallet_user_id PlatformConfig is unset`,
            );
          }
          break;
        }
      }

      const wallet = walletUserId
        ? await this.prisma.wallet.findUnique({
            where: { userId: walletUserId },
          })
        : null;

      const amountNgn =
        Math.round((Number(entry.percentage) / 100) * chargeAmountNgn * 100) / 100;

      resolved.push({
        idx,
        entry,
        walletId: wallet?.id ?? null,
        amountNgn,
      });
    }

    // 5. Delegate the atomic wallet fan-out to SettlementService — idempotency,
    //    SELECT FOR UPDATE, drift assertion, refund-on-failure all live there now.
    const recipients: SettlementRecipient[] = resolved.map((r) => ({
      tag: r.entry.vendorType,
      refSuffix: `V-${r.idx}`,
      walletId: r.walletId,
      amountNgn: r.amountNgn,
      metadata: {
        vendorId: r.entry.vendorId,
        packageName: snapshot.name ?? null,
        percentage: r.entry.percentage,
      },
    }));

    const buyerWallet = await this.prisma.wallet.findUnique({
      where: { userId: booking.buyerUserId },
      select: { id: true },
    });

    const attractionsRolledIn = resolved
      .filter((r) => r.entry.vendorType === 'ATTRACTION' && !r.walletId)
      .map((r) => r.entry.vendorId);

    const isSplitBillChild = !!payload.metadata?.shareKey;

    await this.settlementService.settle({
      module: 'tour_booking',
      reference: payload.reference,
      gateway: 'FLUTTERWAVE',
      amountKobo: payload.amount,
      recipients,
      buyerWalletId: buyerWallet?.id,
      description: 'Tour booking commission',
      platformMetadata: { bookingId: booking.id, attractionsRolledIn },
      onSettled: async (tx) => {
        if (!isSplitBillChild) {
          await tx.tourBooking.update({
            where: { id: booking.id },
            data: { status: 'CONFIRMED', paymentReference: payload.reference },
          });
        }
      },
      onFailure: async (err) => {
        const existingMeta: any = (booking as any).metadata ?? {};
        await this.prisma.tourBooking.update({
          where: { id: booking.id },
          data: {
            status: 'REFUNDED',
            metadata: {
              ...existingMeta,
              settlementError: err.message,
              settlementFailedAt: new Date().toISOString(),
            },
          },
        });
      },
    });

    // 6. Split-bill bookkeeping — OUTSIDE the wallet $transaction.
    //    Array mutation is independent of wallet locks and the CONFIRMED gate
    //    depends on the post-update array length.
    if (isSplitBillChild) {
      const shareKey = payload.metadata!.shareKey!;
      // Read latest shares to preserve previous per-share metadata
      const fresh = await this.prisma.tourBooking.findUnique({
        where: { id: booking.id },
        select: { metadata: true },
      });
      const meta: any = fresh?.metadata ?? {};
      const shares: any = meta.shares ?? {};
      const updatedMeta = {
        ...meta,
        shares: {
          ...shares,
          [shareKey]: {
            ...(shares[shareKey] ?? {}),
            status: 'PAID',
            paidAt: new Date().toISOString(),
            settledReference: payload.reference,
          },
        },
      };

      const updated = await this.prisma.tourBooking.update({
        where: { id: booking.id },
        data: {
          splitBillPaidUserIds: { push: shareKey },
          metadata: updatedMeta,
        },
        select: { splitBillPaidUserIds: true, passengerCount: true },
      });

      if (updated.splitBillPaidUserIds.length >= updated.passengerCount) {
        await this.prisma.tourBooking.update({
          where: { id: booking.id },
          data: {
            status: 'CONFIRMED',
            paymentReference:
              payload.metadata?.parentReference ?? payload.reference,
          },
        });
        await this.recordVisitorEntry(booking);
        this.eventEmitter.emit('tour_booking.confirmed', {
          bookingId: booking.id,
          reference: payload.metadata?.parentReference ?? payload.reference,
        });
      }
    } else {
      await this.recordVisitorEntry(booking);
      this.eventEmitter.emit('tour_booking.confirmed', {
        bookingId: booking.id,
        reference: payload.reference,
      });
    }
  }

  // ── D-01 visitor-entry capture — exactly once per confirmed booking ───────

  /**
   * Writes exactly one VisitorLog row for a booking that has just reached
   * CONFIRMED — called from both the solo/group `else` branch and the
   * split-bill final-share branch above, never from `onSettled` and never on
   * intermediate split-bill share payments. `TourPackage.lgaId` is nullable
   * (schema.prisma:950) and is passed through as-is. Never throws — a
   * rejected lookup or `VisitorLogService.record()` call is caught and
   * logged so the `tour_booking.confirmed` event still emits.
   */
  private async recordVisitorEntry(booking: {
    id: string;
    tourPackageId: string;
    buyerUserId: string;
    tourDate: Date;
    metadata: any;
  }): Promise<void> {
    try {
      const [tourPackage, buyer] = await Promise.all([
        this.prisma.tourPackage.findUnique({
          where: { id: booking.tourPackageId },
          select: { lgaId: true },
        }),
        this.prisma.user.findUnique({
          where: { id: booking.buyerUserId },
          select: { role: true },
        }),
      ]);

      await this.visitorLogService.record({
        lgaId: tourPackage?.lgaId ?? null,
        purpose: (booking.metadata as any)?.purpose ?? DEFAULT_VISITOR_PURPOSE.TOUR,
        sourceType: 'TOUR',
        sourceId: booking.id,
        visitedAt: booking.tourDate,
        userRole: buyer?.role as any,
      });
    } catch (err) {
      this.logger.error(
        `Failed to record VisitorLog for tour booking ${booking.id}: ${(err as Error).message}`,
      );
    }
  }

  // ── Pre-flight failure path: split-percentage guard rejects before we ever
  //    call SettlementService.settle() (so it never got a chance to refund) ──

  private async refundInvalidSplit(
    payload: TourBookingPaymentPayload,
    booking: { id: string; buyerUserId: string; metadata: any },
    err: Error,
  ): Promise<void> {
    try {
      const buyerWallet = await this.prisma.wallet.findUnique({
        where: { userId: booking.buyerUserId },
        select: { id: true },
      });
      if (buyerWallet) {
        await this.refundService.refund({
          gatewayReference: payload.reference,
          amountKobo: payload.amount,
          walletId: buyerWallet.id,
          reason: `tour_booking_settlement_failed: ${err.message}`,
          metadata: {
            bookingId: booking.id,
            failedAt: 'pre_settlement_validation',
            module: 'tour',
          },
        });
      }
    } catch (refundErr) {
      // Don't mask the original error — refund failures are logged but the
      // booking still transitions to REFUNDED so an operator can reconcile.
      this.logger.error(
        `Refund call failed for ${payload.reference}: ${(refundErr as Error).message}`,
      );
    }

    try {
      const existingMeta: any = (booking as any).metadata ?? {};
      await this.prisma.tourBooking.update({
        where: { id: booking.id },
        data: {
          status: 'REFUNDED',
          metadata: {
            ...existingMeta,
            settlementError: err.message,
            settlementFailedAt: new Date().toISOString(),
          },
        },
      });
    } catch (updateErr) {
      this.logger.error(
        `Failed to mark booking ${booking.id} REFUNDED: ${(updateErr as Error).message}`,
      );
    }
  }
}
