import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import * as crypto from 'crypto';
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
    const secret = this.config.get<string>('PAYSTACK_WEBHOOK_SECRET', '');
    const payload = rawBody ?? Buffer.from(JSON.stringify(body));
    const expected = crypto.createHmac('sha512', secret).update(payload).digest('hex');

    if (signature !== expected) {
      throw new UnauthorizedException('Invalid Paystack signature');
    }

    if (body.event === 'charge.success') {
      const { reference, metadata, amount } = body.data;
      const type: string = metadata?.type ?? '';
      const eventPayload = { reference, metadata, amount };

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

        default:
          if (metadata?.walletId) {
            await this.walletService.creditWallet(
              metadata.walletId,
              amount / 100,
              reference,
              'Wallet top-up via Paystack',
            );
            this.logger.log(`Wallet ${metadata.walletId} credited ₦${amount / 100} — ref: ${reference}`);
          } else {
            this.logger.warn(`Unhandled charge.success — ref: ${reference}, type: ${type}`);
          }
      }
    }

    return { received: true };
  }

  async handleFlutterwave(hash: string, body: any) {
    const secret = this.config.get<string>('FLUTTERWAVE_SECRET_KEY', '');
    if (hash !== secret) {
      throw new UnauthorizedException('Invalid Flutterwave hash');
    }

    if (body.event === 'charge.completed' && body.data?.status === 'successful') {
      this.logger.log(`Flutterwave charge completed: ${body.data.tx_ref}`);
    }

    return { received: true };
  }
}
