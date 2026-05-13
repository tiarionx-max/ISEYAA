import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Kafka, Producer, Consumer } from 'kafkajs';

@Injectable()
export class KafkaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KafkaService.name);
  private readonly kafka: Kafka | null = null;
  private producer: Producer | null = null;
  private readonly enabled: boolean;

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
    if (this.enabled) await this.producer!.disconnect();
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
    await consumer.connect();
    await consumer.subscribe({ topic });
    await consumer.run({
      eachMessage: async ({ message }) => {
        try {
          const parsed = message.value ? JSON.parse(message.value.toString()) : null;
          await handler(parsed);
        } catch (err) {
          this.logger.error(`Kafka consumer error on topic "${topic}"`, err);
        }
      },
    });
  }
}
