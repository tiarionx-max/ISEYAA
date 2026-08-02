import { Injectable, Logger, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import * as crypto from 'crypto';
import { timingSafeEqual } from 'crypto';
import { WalletService } from '../wallet/wallet.service';
import { KafkaService } from '../../kafka/kafka.service';

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    private walletService: WalletService,
    private config: ConfigService,
    private eventEmitter: EventEmitter2,
    private kafka: KafkaService,
  ) {}

  /**
   * Dispatch a payment event to EXACTLY ONE bus: Kafka when it is configured,
   * otherwise the in-process EventEmitter. Previously every event was published to
   * BOTH buses while feature services subscribed to both (`kafka.consume` + `@OnEvent`),
   * so with Kafka enabled each payment ran its fulfillment handler twice — double
   * QR-gen / email / settlement, guarded only by a downstream unique-constraint
   * backstop. Single-path dispatch removes the double-processing at the source.
   */
  private async dispatch(topic: string, payload: unknown): Promise<void> {
    if (this.kafka.isEnabled) {
      await this.kafka.emit(topic, payload).catch((err) =>
        this.logger.error(`Kafka emit failed for ${topic}`, err),
      );
    } else {
      this.eventEmitter.emit(topic, payload);
    }
  }

  async handlePaystack(signature: string, body: any, rawBody?: Buffer) {
    // C-11: rawBody is required — JSON.stringify of parsed body does not reproduce
    // original byte order and HMAC will never match. Throw 400 if absent.
    if (!rawBody) {
      throw new BadRequestException('Missing raw body — rawBody middleware not configured');
    }
    const secret = this.config.get<string>('PAYSTACK_WEBHOOK_SECRET', '');
    const expected = crypto.createHmac('sha512', secret).update(rawBody).digest('hex');

    // Use timingSafeEqual to prevent timing oracle attacks on the signature comparison
    // (same rationale as the Flutterwave handler below).
    const signatureBuf = Buffer.from(signature ?? '', 'utf8');
    const expectedBuf = Buffer.from(expected, 'utf8');
    if (
      signatureBuf.length !== expectedBuf.length ||
      !timingSafeEqual(signatureBuf, expectedBuf)
    ) {
      throw new UnauthorizedException('Invalid Paystack signature');
    }

    if (body.event === 'charge.success') {
      const { reference, metadata, amount, authorization } = body.data;
      const type: string = metadata?.type ?? '';
      const eventPayload = { reference, metadata, amount, authorization };

      switch (type) {
        case 'ticket_purchase':
          await this.dispatch('payment.ticket_purchase', eventPayload);
          break;

        case 'stay_booking':
          await this.dispatch('payment.stay_booking', eventPayload);
          break;

        case 'membership_signup':
          await this.dispatch('payment.membership_signup', eventPayload);
          break;

        case 'order_payment':
          await this.dispatch('payment.order_payment', eventPayload);
          break;

        case 'studio_booking':
          await this.dispatch('payment.studio_booking', eventPayload);
          break;

        case 'tour_booking':
          await this.dispatch('payment.tour_booking', eventPayload);
          break;

        // M-08: explicit case prevents silent fallback to default for future type mismatches
        case 'wallet_topup':
          if (metadata?.walletId) {
            await this.walletService.creditWallet(
              metadata.walletId,
              amount / 100,
              reference,
              'Wallet top-up via Paystack',
            );
            this.logger.log(`Wallet ${metadata.walletId} credited ₦${amount / 100} — ref: ${reference}`);
          } else {
            this.logger.warn(`wallet_topup missing walletId — ref: ${reference}`);
          }
          break;

        default:
          this.logger.warn(`Unhandled charge.success — ref: ${reference}, type: ${type}`);
      }
    }

    return { received: true };
  }

  async handleFlutterwave(hash: string, body: any) {
    const secret = this.config.get<string>('FLUTTERWAVE_SECRET_KEY', '');
    // C-04: Flutterwave's verif-hash scheme sends the literal secret key as the header.
    // Use timingSafeEqual to prevent timing oracle attacks. Note: this scheme is inherently
    // less secure than HMAC (the full key is transmitted on every webhook call).
    if (!hash) {
      throw new UnauthorizedException('Missing Flutterwave signature');
    }
    try {
      const hashBuf = Buffer.from(hash);
      const secretBuf = Buffer.from(secret);
      if (hashBuf.length !== secretBuf.length || !timingSafeEqual(hashBuf, secretBuf)) {
        throw new UnauthorizedException('Invalid Flutterwave signature');
      }
    } catch (err: any) {
      if (err?.status === 401) throw err;
      throw new UnauthorizedException('Invalid Flutterwave signature');
    }

    if (body.event === 'charge.completed' && body.data?.status === 'successful') {
      // F-09: Flutterwave is the CBN-required fallback gateway. Previously a successful
      // charge here only logged and NEVER credited the wallet or ran settlement, so any
      // payment that fell back to Flutterwave was silently dropped. Mirror the Paystack
      // path. NOTE: Flutterwave `amount` is in the major unit (naira) already — do NOT
      // divide by 100 the way Paystack's kobo amount is divided.
      const data = body.data;
      const reference: string = data.tx_ref;
      const metadata = data.meta ?? {};
      const type: string = metadata?.type ?? '';
      const amountNgn = Number(data.amount);
      const eventPayload = {
        reference,
        metadata,
        // downstream handlers expect a kobo `amount` (they divide by 100) — normalise
        amount: Math.round(amountNgn * 100),
        authorization: data.card ?? null,
      };

      switch (type) {
        case 'ticket_purchase':
        case 'stay_booking':
        case 'membership_signup':
        case 'order_payment':
        case 'studio_booking':
        case 'tour_booking':
          await this.dispatch(`payment.${type}`, eventPayload);
          break;

        case 'wallet_topup':
          if (metadata?.walletId) {
            await this.walletService.creditWallet(
              metadata.walletId,
              amountNgn,
              reference,
              'Wallet top-up via Flutterwave',
              'wallet',
              'FLUTTERWAVE',
            );
            this.logger.log(`Wallet ${metadata.walletId} credited ₦${amountNgn} (Flutterwave) — ref: ${reference}`);
          } else {
            this.logger.warn(`Flutterwave wallet_topup missing walletId — ref: ${reference}`);
          }
          break;

        default:
          this.logger.warn(`Unhandled Flutterwave charge — ref: ${reference}, type: ${type}`);
      }
    }

    return { received: true };
  }
}
