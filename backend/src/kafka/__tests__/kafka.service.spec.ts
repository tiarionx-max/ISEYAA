const mockSend = jest.fn().mockResolvedValue(undefined);
const mockConnect = jest.fn().mockResolvedValue(undefined);
const mockDisconnect = jest.fn().mockResolvedValue(undefined);
const mockSubscribe = jest.fn().mockResolvedValue(undefined);
const mockRun = jest.fn().mockImplementation(async ({ eachMessage }) => {
  // Simulate one message
  if (eachMessage) {
    await eachMessage({ message: { value: Buffer.from(JSON.stringify({ type: 'test', data: 1 })) } });
  }
});
const mockConsumerConnect = jest.fn().mockResolvedValue(undefined);

const mockProducer = { connect: mockConnect, disconnect: mockDisconnect, send: mockSend };
const mockConsumer = { connect: mockConsumerConnect, subscribe: mockSubscribe, run: mockRun };
const mockKafkaInstance = {
  producer: jest.fn().mockReturnValue(mockProducer),
  consumer: jest.fn().mockReturnValue(mockConsumer),
};

jest.mock('kafkajs', () => ({
  Kafka: jest.fn().mockImplementation(() => mockKafkaInstance),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { KafkaService } from '../kafka.service';
import { Kafka } from 'kafkajs';

const mockConfig = {
  get: jest.fn((key: string, def = '') => {
    const map: Record<string, string> = {
      KAFKA_BROKER_URL: 'test-broker.upstash.io:9092',
      KAFKA_USERNAME: 'test-user',
      KAFKA_PASSWORD: 'test-pass',
    };
    return map[key] ?? def;
  }),
};

describe('KafkaService', () => {
  let service: KafkaService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockRun.mockImplementation(async () => undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KafkaService,
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();

    service = module.get<KafkaService>(KafkaService);
  });

  it('Test 1: constructor creates Kafka with scram-sha-256 and ssl: true', () => {
    expect(Kafka).toHaveBeenCalledWith(
      expect.objectContaining({
        sasl: expect.objectContaining({ mechanism: 'scram-sha-256' }),
        ssl: true,
      }),
    );
  });

  it('Test 2: onModuleInit() connects producer', async () => {
    await service.onModuleInit();
    expect(mockConnect).toHaveBeenCalledTimes(1);
  });

  it('Test 3: emit() sends message with correct topic and JSON payload', async () => {
    await service.onModuleInit();
    await service.emit('payment.charge_success', { type: 'wallet_topup', amount: 5000 });
    expect(mockSend).toHaveBeenCalledWith({
      topic: 'payment.charge_success',
      messages: [{ value: JSON.stringify({ type: 'wallet_topup', amount: 5000 }) }],
    });
  });

  it('Test 4: emit() rethrows when producer.send() fails', async () => {
    await service.onModuleInit();
    mockSend.mockRejectedValueOnce(new Error('Kafka unavailable'));
    await expect(service.emit('some.topic', {})).rejects.toThrow('Kafka unavailable');
  });

  it('Test 5: consume() connects consumer, subscribes, and runs handler', async () => {
    const handler = jest.fn().mockResolvedValue(undefined);
    await service.consume('payment.charge_success', 'wallet-service-prod', handler);
    expect(mockConsumerConnect).toHaveBeenCalledTimes(1);
    expect(mockSubscribe).toHaveBeenCalledWith({ topic: 'payment.charge_success' });
    expect(mockRun).toHaveBeenCalledTimes(1);
  });

  it('Test 6: consume() lets handler errors PROPAGATE so kafkajs does not commit the offset (retry, no message loss)', async () => {
    const handler = jest.fn().mockRejectedValue(new Error('handler error'));
    let capturedEachMessage: any;
    mockRun.mockImplementation(async ({ eachMessage }) => {
      capturedEachMessage = eachMessage; // capture without invoking so consume() resolves
    });
    await expect(service.consume('some.topic', 'group-1', handler)).resolves.not.toThrow();
    // Delivering a message whose handler throws must reject out of eachMessage —
    // that is what tells kafkajs to skip the offset commit and redeliver.
    await expect(
      capturedEachMessage({ message: { value: Buffer.from(JSON.stringify({ type: 'test' })) } }),
    ).rejects.toThrow('handler error');
  });

  it('Test 7: consume() SKIPS an unparseable poison message without calling the handler or throwing', async () => {
    const handler = jest.fn().mockResolvedValue(undefined);
    let capturedEachMessage: any;
    mockRun.mockImplementation(async ({ eachMessage }) => {
      capturedEachMessage = eachMessage;
    });
    await service.consume('some.topic', 'group-2', handler);
    await expect(
      capturedEachMessage({ message: { value: Buffer.from('not-json{') } }),
    ).resolves.toBeUndefined();
    expect(handler).not.toHaveBeenCalled();
  });
});
