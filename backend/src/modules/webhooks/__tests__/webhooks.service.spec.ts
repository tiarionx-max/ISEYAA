import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { WebhooksService } from '../webhooks.service';
import { WalletService } from '../../wallet/wallet.service';
import { KafkaService } from '../../../kafka/kafka.service';

// ── Fixtures ────────────────────────────────────────────────────────────────

const FLUTTERWAVE_WEBHOOK_SECRET_HASH = 'test-flutterwave-secret-hash';

// ── Mocks ───────────────────────────────────────────────────────────────────

const mockWallet: any = { creditWallet: jest.fn() };
const mockConfig: any = {
  get: jest.fn((key: string, _def?: any) => {
    if (key === 'FLUTTERWAVE_WEBHOOK_SECRET_HASH') return FLUTTERWAVE_WEBHOOK_SECRET_HASH;
    return '';
  }),
};
const mockEvents: any = { emit: jest.fn() };
// isEnabled=false by default → single-path dispatch uses the in-process EventEmitter.
// Individual tests flip isEnabled=true to exercise the Kafka path.
const mockKafka: any = { emit: jest.fn().mockResolvedValue(undefined), isEnabled: false };

describe('WebhooksService', () => {
  let service: WebhooksService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockKafka.isEnabled = false; // reset dispatch bus to in-process default each test
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        WebhooksService,
        { provide: WalletService, useValue: mockWallet },
        { provide: ConfigService, useValue: mockConfig },
        { provide: EventEmitter2, useValue: mockEvents },
        { provide: KafkaService, useValue: mockKafka },
      ],
    }).compile();
    service = moduleRef.get(WebhooksService);
  });

  // ── handleFlutterwave ───────────────────────────────────────────────────────

  describe('handleFlutterwave', () => {
    it('throws 401 when the verif-hash header is missing', async () => {
      const body = {
        event: 'charge.completed',
        data: { status: 'successful', tx_ref: 'ISY-ORD-1', amount: 1000, meta: { type: 'order_payment' } },
      };
      await expect(
        service.handleFlutterwave(undefined as any, body),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('throws 401 when the verif-hash header does not match the configured secret hash', async () => {
      const body = {
        event: 'charge.completed',
        data: { status: 'successful', tx_ref: 'ISY-ORD-1', amount: 1000, meta: { type: 'order_payment' } },
      };
      await expect(
        service.handleFlutterwave('wrong-hash', body),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('throws 401 when the verif-hash header is a different length than the configured secret hash', async () => {
      const body = {
        event: 'charge.completed',
        data: { status: 'successful', tx_ref: 'ISY-ORD-1', amount: 1000, meta: { type: 'order_payment' } },
      };
      await expect(
        service.handleFlutterwave('short', body),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('dispatches payment.order_payment via the event bus when the hash matches', async () => {
      const body = {
        event: 'charge.completed',
        data: {
          status: 'successful',
          tx_ref: 'ISY-ORD-FLW1',
          amount: 5000,
          meta: { type: 'order_payment', orderId: 'ORD-1' },
        },
      };

      const result = await service.handleFlutterwave(FLUTTERWAVE_WEBHOOK_SECRET_HASH, body);

      expect(result).toEqual({ received: true });
      expect(mockEvents.emit).toHaveBeenCalledWith(
        'payment.order_payment',
        expect.objectContaining({
          reference: 'ISY-ORD-FLW1',
          amount: 500_000, // naira -> kobo normalisation
          metadata: expect.objectContaining({ type: 'order_payment', orderId: 'ORD-1' }),
        }),
      );
      expect(mockKafka.emit).not.toHaveBeenCalled();
    });

    it('credits the wallet on a valid-hash wallet_topup event (naira amount, not kobo)', async () => {
      const body = {
        event: 'charge.completed',
        data: {
          status: 'successful',
          tx_ref: 'ISY-FUND-FLW1',
          amount: 1000,
          meta: { type: 'wallet_topup', walletId: 'W-FLW-1' },
        },
      };

      await service.handleFlutterwave(FLUTTERWAVE_WEBHOOK_SECRET_HASH, body);

      expect(mockWallet.creditWallet).toHaveBeenCalledWith(
        'W-FLW-1',
        1000,
        'ISY-FUND-FLW1',
        'Wallet top-up via Flutterwave',
        'wallet',
        'FLUTTERWAVE',
      );
    });

    it('warns and no-ops on unknown metadata.type', async () => {
      const body = {
        event: 'charge.completed',
        data: {
          status: 'successful',
          tx_ref: 'ISY-UNKNOWN-1',
          amount: 1000,
          meta: { type: 'something_new' },
        },
      };

      await service.handleFlutterwave(FLUTTERWAVE_WEBHOOK_SECRET_HASH, body);

      expect(mockEvents.emit).not.toHaveBeenCalled();
      expect(mockKafka.emit).not.toHaveBeenCalled();
      expect(mockWallet.creditWallet).not.toHaveBeenCalled();
    });

    it('dispatches to Kafka ONLY (not EventEmitter) when Kafka is enabled', async () => {
      mockKafka.isEnabled = true;
      const body = {
        event: 'charge.completed',
        data: {
          status: 'successful',
          tx_ref: 'ISY-ORD-KAFKA1',
          amount: 5000,
          meta: { type: 'order_payment', orderId: 'ORD-K' },
        },
      };

      await service.handleFlutterwave(FLUTTERWAVE_WEBHOOK_SECRET_HASH, body);

      expect(mockKafka.emit).toHaveBeenCalledTimes(1);
      expect(mockKafka.emit).toHaveBeenCalledWith(
        'payment.order_payment',
        expect.objectContaining({ reference: 'ISY-ORD-KAFKA1' }),
      );
      // EventEmitter must NOT also fire — otherwise the handler runs twice.
      expect(mockEvents.emit).not.toHaveBeenCalled();
    });

    it('swallows a Kafka emit failure (when Kafka is the active bus) without throwing the webhook', async () => {
      mockKafka.isEnabled = true;
      mockKafka.emit.mockRejectedValueOnce(new Error('kafka down'));
      const body = {
        event: 'charge.completed',
        data: {
          status: 'successful',
          tx_ref: 'ISY-ORD-KAFKA2',
          amount: 5000,
          meta: { type: 'order_payment', orderId: 'ORD-K2' },
        },
      };

      // A transient Kafka publish failure must not 500 the webhook (Flutterwave would
      // retry and re-deliver anyway; creditWallet/settlement are idempotent on the reference).
      await expect(
        service.handleFlutterwave(FLUTTERWAVE_WEBHOOK_SECRET_HASH, body),
      ).resolves.toEqual({ received: true });
    });

    it('does not dispatch or credit the wallet when charge.completed status is not "successful"', async () => {
      const body = {
        event: 'charge.completed',
        data: {
          status: 'failed',
          tx_ref: 'ISY-ORD-FAIL1',
          amount: 5000,
          meta: { type: 'order_payment' },
        },
      };

      const result = await service.handleFlutterwave(FLUTTERWAVE_WEBHOOK_SECRET_HASH, body);

      expect(result).toEqual({ received: true });
      expect(mockEvents.emit).not.toHaveBeenCalled();
      expect(mockKafka.emit).not.toHaveBeenCalled();
    });
  });
});
