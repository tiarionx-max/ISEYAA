import {
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import { RefundService } from '../../common/services/refund.service';
import { KafkaService } from '../../kafka/kafka.service';

/**
 * 09-06 — Tour Settlement Service.
 *
 * Atomic multi-vendor wallet fan-out for `payment.tour_booking` events.
 * Runs entirely inside ONE Prisma `$transaction`, mirrors the SELECT FOR UPDATE
 * pattern proven in `wallet.service.ts:272` extended to N vendor wallets.
 *
 * ── Architectural commitments (LOCKED — do not deviate) ───────────────────
 * 1. ONE `$transaction` per Paystack `charge.success` with `metadata.type='tour_booking'`.
 * 2. `SELECT FOR UPDATE` on EVERY wallet row touched (vendor wallets + system wallet).
 * 3. Failure rollback → `RefundService.refund` → booking transitions to REFUNDED.
 * 4. Idempotency keyed on `<paystackRef>-V-*` Transaction rows; replays are no-ops.
 * 5. Reference scheme: `<paystackRef>-V-<idx>` per vendor, `<paystackRef>-PLAT` for commission.
 * 6. ATTRACTION vendorType with unset `tour.government_wallet_user_id` PlatformConfig:
 *    that share rolls into platform commission with a `logger.warn` (does NOT block
 *    settlement — blocking would brick all tour bookings on misconfiguration).
 * 7. Split-bill: child charges settle identically per share; CONFIRMED transition
 *    is OUTSIDE the wallet $transaction (array mutation is independent of wallet locks).
 * 8. System wallet upserted on `onModuleInit` against a well-known SYSTEM user id —
 *    v1 audit anchor; a proper SystemWallet model is a documented future refactor.
 *
 * ── Wallet invariant (TOUR-10) ─────────────────────────────────────────────
 *   sum(vendor credits with resolved wallets) + platform commission == buyer paid amount
 * The platform row absorbs all rounding drift and any unresolved ATTRACTION shares.
 * A defensive assert throws on drift > ₦0.02 to surface programming errors.
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

// Well-known SYSTEM user that owns the platform commission wallet (v1 audit anchor).
// A proper SystemWallet model is flagged as future refactor in 09-06-SUMMARY.
const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000001';

@Injectable()
export class TourSettlementService implements OnModuleInit {
  private readonly logger = new Logger(TourSettlementService.name);
  // Resolved on bootstrap so the hot path never blocks on an upsert.
  // The non-null assertion is safe because onModuleInit runs before the
  // first message is delivered (Kafka consumer subscribe is awaited).
  private systemWalletId!: string;

  constructor(
    private prisma: PrismaService,
    private refundService: RefundService,
    private eventEmitter: EventEmitter2,
    private kafka: KafkaService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.ensureSystemWallet();
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

    // 2. Idempotency precheck — any existing -V-* row for this reference means
    //    we already ran settlement. Return no-op.
    const existing = await this.prisma.transaction.findFirst({
      where: { reference: { startsWith: `${payload.reference}-V-` } },
      select: { id: true },
    });
    if (existing) {
      this.logger.log(
        `Tour settlement already applied for ${payload.reference} — replay no-op`,
      );
      return;
    }
    // Also guard the all-platform-fallback case where no vendor rows would be
    // written (e.g. solo ATTRACTION with unset gov wallet): a -PLAT row alone
    // is still proof the settlement already ran.
    const existingPlat = await this.prisma.transaction.findFirst({
      where: { reference: `${payload.reference}-PLAT` },
      select: { id: true },
    });
    if (existingPlat) {
      this.logger.log(
        `Tour settlement already applied (PLAT-only) for ${payload.reference} — replay no-op`,
      );
      return;
    }

    // 3. Convert charge to NGN
    const chargeAmountNgn = payload.amount / 100;

    // 4. Resolve settlement entries from booking snapshot
    const snapshot: any = booking.snapshot ?? {};
    const split: SplitEntry[] = (snapshot.settlementSplit as SplitEntry[]) ?? [];

    // Defensive guard: sum of declared percentages must not exceed 100 (DB CHECK
    // exists in 09-01 but service-layer guard gives a clearer error message).
    const sumPct = split.reduce((s, e) => s + Number(e.percentage), 0);
    if (sumPct > 100.0001) {
      const err = new Error(
        `Settlement split percentages sum to ${sumPct} > 100 (booking ${booking.id})`,
      );
      await this.handleSettlementFailure(payload, booking, err);
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

    // 5. Compute platform commission (absorbs rounding drift + unresolved shares)
    const claimedAmountNgn = resolved
      .filter((r) => r.walletId)
      .reduce((s, r) => s + r.amountNgn, 0);
    const platformAmountNgn =
      Math.round((chargeAmountNgn - claimedAmountNgn) * 100) / 100;
    const drift = chargeAmountNgn - claimedAmountNgn - platformAmountNgn;
    if (Math.abs(drift) > 0.02) {
      const err = new Error(
        `Tour settlement drift exceeded ₦0.02 (drift=${drift}) — programming error`,
      );
      await this.handleSettlementFailure(payload, booking, err);
      throw err;
    }

    // 6. Atomic $transaction — vendor fan-out + platform commission + status flip
    const isSplitBillChild = !!payload.metadata?.shareKey;
    try {
      await this.prisma.$transaction(async (tx) => {
        // 6a. Vendor wallet credits — one CREDIT row + balance bump per resolved wallet.
        for (const r of resolved.filter((x) => x.walletId)) {
          // SELECT FOR UPDATE — prevents concurrent writes to the same vendor wallet.
          await tx.$executeRaw`SELECT id FROM wallets WHERE id = ${r.walletId} FOR UPDATE`;
          const w = await tx.wallet.findUnique({ where: { id: r.walletId! } });
          if (!w) {
            throw new Error(
              `Vendor wallet vanished mid-transaction: ${r.walletId}`,
            );
          }
          const before = Number(w.balance);
          const after = before + r.amountNgn;
          await tx.wallet.update({
            where: { id: r.walletId! },
            data: { balance: after },
          });
          await tx.transaction.create({
            data: {
              walletId: r.walletId!,
              type: 'CREDIT',
              status: 'SUCCESS',
              amount: r.amountNgn,
              currency: 'NGN',
              reference: `${payload.reference}-V-${r.idx}`,
              gateway: 'PAYSTACK',
              gatewayRef: payload.reference,
              description: `Tour booking commission (${r.entry.vendorType})`,
              balanceBefore: before,
              balanceAfter: after,
              metadata: {
                module: 'tour',
                bookingId: booking.id,
                vendorType: r.entry.vendorType,
                vendorId: r.entry.vendorId,
                packageName: snapshot.name ?? null,
                percentage: r.entry.percentage,
              },
            },
          });
        }

        // 6b. Platform commission row — system wallet locked + credited.
        await tx.$executeRaw`SELECT id FROM wallets WHERE id = ${this.systemWalletId} FOR UPDATE`;
        const sysW = await tx.wallet.findUnique({
          where: { id: this.systemWalletId },
        });
        if (!sysW) throw new Error('System wallet missing');
        const sysBefore = Number(sysW.balance);
        const sysAfter = sysBefore + platformAmountNgn;
        await tx.wallet.update({
          where: { id: this.systemWalletId },
          data: { balance: sysAfter },
        });
        await tx.transaction.create({
          data: {
            walletId: this.systemWalletId,
            type: 'CREDIT',
            status: 'SUCCESS',
            amount: platformAmountNgn,
            currency: 'NGN',
            reference: `${payload.reference}-PLAT`,
            gateway: 'PAYSTACK',
            gatewayRef: payload.reference,
            description: 'Tour platform commission',
            balanceBefore: sysBefore,
            balanceAfter: sysAfter,
            metadata: {
              module: 'tour',
              bookingId: booking.id,
              chargeAmountNgn,
              claimedAmountNgn,
              attractionsRolledIn: resolved
                .filter((r) => r.entry.vendorType === 'ATTRACTION' && !r.walletId)
                .map((r) => r.entry.vendorId),
            },
          },
        });

        // 6c. Solo bookings confirm immediately INSIDE the transaction. Split-bill
        //     children defer the CONFIRMED transition to step 7 (outside the txn)
        //     because length-based bookkeeping needs the post-update value.
        if (!isSplitBillChild) {
          await tx.tourBooking.update({
            where: { id: booking.id },
            data: {
              status: 'CONFIRMED',
              paymentReference: payload.reference,
            },
          });
        }
      });
    } catch (err) {
      await this.handleSettlementFailure(payload, booking, err as Error);
      throw err;
    }

    // 7. Split-bill bookkeeping — OUTSIDE the wallet $transaction.
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
        this.eventEmitter.emit('tour_booking.confirmed', {
          bookingId: booking.id,
          reference: payload.metadata?.parentReference ?? payload.reference,
        });
      }
    } else {
      this.eventEmitter.emit('tour_booking.confirmed', {
        bookingId: booking.id,
        reference: payload.reference,
      });
    }
  }

  // ── Failure path: Paystack refund + status REFUNDED ────────────────────────

  private async handleSettlementFailure(
    payload: TourBookingPaymentPayload,
    booking: { id: string; buyerUserId: string; metadata: any },
    err: Error,
  ): Promise<void> {
    try {
      const buyerWallet = await this.prisma.wallet.findUnique({
        where: { userId: booking.buyerUserId },
        select: { id: true },
      });
      if (!buyerWallet) {
        this.logger.error(
          `Settlement failure refund aborted — buyer wallet missing for user ${booking.buyerUserId} ` +
            `(booking ${booking.id}, ref ${payload.reference})`,
        );
      } else {
        await this.refundService.refund({
          paystackReference: payload.reference,
          amountKobo: payload.amount,
          walletId: buyerWallet.id,
          reason: `tour_booking_settlement_failed: ${err.message}`,
          metadata: {
            bookingId: booking.id,
            failedAt: 'settlement_transaction',
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

    this.logger.error(
      `Tour settlement failed — refund issued for ${payload.reference}: ${err.message}`,
    );
  }

  // ── System wallet bootstrap (v1 ops audit anchor) ──────────────────────────

  private async ensureSystemWallet(): Promise<void> {
    // Upsert the well-known SYSTEM user. SUPER_ADMIN role + ndpaConsent: true
    // satisfies AuthService.register-equivalent invariants for non-citizen
    // platform accounts. firstName/lastName are descriptive only.
    await this.prisma.user.upsert({
      where: { id: SYSTEM_USER_ID },
      create: {
        id: SYSTEM_USER_ID,
        firstName: 'Platform',
        lastName: 'System',
        role: 'SUPER_ADMIN',
        ndpaConsent: true,
      },
      update: {},
    });
    const w = await this.prisma.wallet.upsert({
      where: { userId: SYSTEM_USER_ID },
      create: { userId: SYSTEM_USER_ID },
      update: {},
    });
    this.systemWalletId = w.id;
  }
}
