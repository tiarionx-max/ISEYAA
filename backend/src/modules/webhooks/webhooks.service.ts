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

  async handlePaystack(signature: string, body: any, rawBody?: Buffer) {
    // C-11: rawBody is required — JSON.stringify of parsed body does not reproduce
    // original byte order and HMAC will never match. Throw 400 if absent.
    if (!rawBody) {
      throw new BadRequestException('Missing raw body — rawBody middleware not configured');
    }
    const secret = this.config.get<string>('PAYSTACK_WEBHOOK_SECRET', '');
    const expected = crypto.createHmac('sha512', secret).update(rawBody).digest('hex');

    if (signature !== expected) {
      throw new UnauthorizedException('Invalid Paystack signature');
    }

    if (body.event === 'charge.success') {
      const { reference, metadata, amount, authorization } = body.data;
      const type: string = metadata?.type ?? '';
      const eventPayload = { reference, metadata, amount, authorization };

      switch (type) {
        case 'ticket_purchase':
          this.eventEmitter.emit('payment.ticket_purchase', eventPayload);
          await this.kafka.emit('payment.ticket_purchase', eventPayload).catch((err) =>
            this.logger.error('Kafka emit failed for ticket_purchase', err),
          );
          break;

        case 'stay_booking':
          this.eventEmitter.emit('payment.stay_booking', eventPayload);
          await this.kafka.emit('payment.stay_booking', eventPayload).catch((err) =>
            this.logger.error('Kafka emit failed for stay_booking', err),
          );
          break;

        case 'membership_signup':
          this.eventEmitter.emit('payment.membership_signup', eventPayload);
          await this.kafka.emit('payment.membership_signup', eventPayload).catch((err) =>
            this.logger.error('Kafka emit failed for membership_signup', err),
          );
          break;

        case 'order_payment':
          this.eventEmitter.emit('payment.order_payment', eventPayload);
          await this.kafka.emit('payment.order_payment', eventPayload).catch((err) =>
            this.logger.error('Kafka emit failed for order_payment', err),
          );
          break;

        case 'studio_booking':
          this.eventEmitter.emit('payment.studio_booking', eventPayload);
          await this.kafka.emit('payment.studio_booking', eventPayload).catch((err) =>
            this.logger.error('Kafka emit failed for studio_booking', err),
          );
          break;

        case 'tour_booking':
          this.eventEmitter.emit('payment.tour_booking', eventPayload);
          await this.kafka.emit('payment.tour_booking', eventPayload).catch((err) =>
            this.logger.error('Kafka emit failed for tour_booking', err),
          );
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
      this.logger.log(`Flutterwave charge completed: ${body.data.tx_ref}`);
    }

    return { received: true };
  }
}
