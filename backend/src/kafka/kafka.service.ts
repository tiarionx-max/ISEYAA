import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Kafka, Producer, Consumer } from 'kafkajs';

@Injectable()
export class KafkaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KafkaService.name);
  private readonly kafka: Kafka | null = null;
  private producer: Producer | null = null;
  private readonly enabled: boolean;
  // Track every consumer created via consume() so onModuleDestroy can disconnect
  // them all — otherwise SIGTERM (Railway redeploy) leaves them in the consumer
  // group, forcing a rebalance-timeout on every deploy and leaking sockets.
  private readonly consumers: Consumer[] = [];

  /** Whether Kafka is configured/active. Callers use this to dispatch to exactly
   *  one bus (Kafka when enabled, in-process EventEmitter otherwise) and avoid
   *  double-processing the same event through both delivery paths. */
  get isEnabled(): boolean {
    return this.enabled;
  }

  constructor(private readonly config: ConfigService) {
    const brokerUrl = this.config.get<string>('KAFKA_BROKER_URL', '');
    // Skip Kafka entirely when broker URL is absent or a placeholder (local dev)
    this.enabled = brokerUrl.length > 0 && brokerUrl !== 'string';
    if (this.enabled) {
      this.kafka = new Kafka({
        clientId: 'iseyaa-backend',
        brokers: [brokerUrl],
        sasl: {
          mechanism: 'scram-sha-256',
          username: this.config.get<string>('KAFKA_USERNAME', ''),
          password: this.config.get<string>('KAFKA_PASSWORD', ''),
        },
        ssl: true,
      });
      this.producer = this.kafka.producer();
    }
  }

  async onModuleInit(): Promise<void> {
    if (!this.enabled) {
      this.logger.warn('KAFKA_BROKER_URL not configured — Kafka disabled (local dev mode)');
      return;
    }
    await this.producer!.connect();
  }

  async onModuleDestroy(): Promise<void> {
    if (!this.enabled) return;
    // Disconnect consumers first so they leave the group cleanly, then the producer.
    await Promise.allSettled(this.consumers.map((c) => c.disconnect()));
    await this.producer!.disconnect();
  }

  async emit(topic: string, payload: unknown): Promise<void> {
    if (!this.enabled) return;
    try {
      await this.producer!.send({
        topic,
        messages: [{ value: JSON.stringify(payload) }],
      });
    } catch (err) {
      this.logger.error(`Kafka emit failed on topic "${topic}"`, err);
      throw err;
    }
  }

  async consume(
    topic: string,
    groupId: string,
    handler: (message: unknown) => Promise<void>,
  ): Promise<void> {
    if (!this.enabled) return;
    const consumer: Consumer = this.kafka!.consumer({ groupId });
    this.consumers.push(consumer);
    await consumer.connect();
    await consumer.subscribe({ topic });
    await consumer.run({
      eachMessage: async ({ message }) => {
        // A malformed (unparseable) message is a poison pill: it can never succeed,
        // so we log and SKIP it (letting the offset commit) to avoid an infinite
        // redelivery loop. A HANDLER error, by contrast, is (potentially) transient
        // — we must let it propagate so kafkajs does NOT commit the offset and the
        // message is retried, instead of silently dropping a settlement/payout.
        let parsed: unknown;
        try {
          parsed = message.value ? JSON.parse(message.value.toString()) : null;
        } catch (err) {
          this.logger.error(`Kafka poison message skipped on topic "${topic}" (unparseable)`, err);
          return;
        }
        try {
          await handler(parsed);
        } catch (err) {
          this.logger.error(`Kafka handler error on topic "${topic}" — will be retried`, err);
          throw err;
        }
      },
    });
  }
}
