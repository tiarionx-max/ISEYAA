import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import * as crypto from 'crypto';
import { WebhooksService } from '../webhooks.service';
import { WalletService } from '../../wallet/wallet.service';
import { KafkaService } from '../../../kafka/kafka.service';

// ── Fixtures ────────────────────────────────────────────────────────────────

const WEBHOOK_SECRET = 'test-paystack-secret';

function makeSignedPayload(body: any) {
  const rawBody = Buffer.from(JSON.stringify(body));
  const signature = crypto
    .createHmac('sha512', WEBHOOK_SECRET)
    .update(rawBody)
    .digest('hex');
  return { rawBody, signature, body };
}

// ── Mocks ───────────────────────────────────────────────────────────────────

const mockWallet: any = { creditWallet: jest.fn() };
const mockConfig: any = {
  get: jest.fn((key: string, _def?: any) =>
    key === 'PAYSTACK_WEBHOOK_SECRET' ? WEBHOOK_SECRET : '',
  ),
};
const mockEvents: any = { emit: jest.fn() };
const mockKafka: any = { emit: jest.fn().mockResolvedValue(undefined) };

describe('WebhooksService', () => {
  let service: WebhooksService;

  beforeEach(async () => {
    jest.clearAllMocks();
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

  // ── Signature / safety guards ──────────────────────────────────────────────

  it('throws 400 when rawBody is missing', async () => {
    await expect(
      service.handlePaystack('any-sig', { event: 'charge.success', data: {} }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('throws 401 on bad signature', async () => {
    const { rawBody, body } = makeSignedPayload({
      event: 'charge.success',
      data: { reference: 'ref', amount: 100, metadata: { type: 'tour_booking' } },
    });
    await expect(
      service.handlePaystack('wrong-sig', body, rawBody),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  // ── Dispatch: tour_booking ─────────────────────────────────────────────────

  it("dispatches payment.tour_booking on charge.success with metadata.type='tour_booking'", async () => {
    const body = {
      event: 'charge.success',
      data: {
        reference: 'ISY-TOUR-ABC12345',
        amount: 1_000_000, // kobo
        metadata: {
          type: 'tour_booking',
          bookingId: 'BKG-1',
          module: 'tour',
        },
      },
    };
    const { rawBody, signature } = makeSignedPayload(body);

    const result = await service.handlePaystack(signature, body, rawBody);

    expect(result).toEqual({ received: true });
    expect(mockEvents.emit).toHaveBeenCalledTimes(1);
    expect(mockEvents.emit).toHaveBeenCalledWith(
      'payment.tour_booking',
      expect.objectContaining({
        reference: 'ISY-TOUR-ABC12345',
        amount: 1_000_000,
        metadata: expect.objectContaining({ type: 'tour_booking', bookingId: 'BKG-1' }),
      }),
    );
    expect(mockKafka.emit).toHaveBeenCalledTimes(1);
    expect(mockKafka.emit).toHaveBeenCalledWith(
      'payment.tour_booking',
      expect.objectContaining({ reference: 'ISY-TOUR-ABC12345' }),
    );
    // No wallet writes — settlement lives in TourSettlementService.
    expect(mockWallet.creditWallet).not.toHaveBeenCalled();
  });

  it('forwards split-bill child metadata (shareKey, parentReference) on tour_booking', async () => {
    const body = {
      event: 'charge.success',
      data: {
        reference: 'ISY-TOUR-CHILD001',
        amount: 250_000,
        metadata: {
          type: 'tour_booking',
          bookingId: 'BKG-2',
          shareKey: 'USR-A',
          parentReference: 'ISY-TOUR-PARENT00',
          module: 'tour',
        },
      },
    };
    const { rawBody, signature } = makeSignedPayload(body);

    await service.handlePaystack(signature, body, rawBody);

    expect(mockEvents.emit).toHaveBeenCalledWith(
      'payment.tour_booking',
      expect.objectContaining({
        metadata: expect.objectContaining({
          shareKey: 'USR-A',
          parentReference: 'ISY-TOUR-PARENT00',
        }),
      }),
    );
  });

  it('swallows Kafka emit failure for tour_booking without throwing', async () => {
    mockKafka.emit.mockRejectedValueOnce(new Error('kafka down'));
    const body = {
      event: 'charge.success',
      data: {
        reference: 'ISY-TOUR-ABC',
        amount: 500_000,
        metadata: { type: 'tour_booking', bookingId: 'BKG-3' },
      },
    };
    const { rawBody, signature } = makeSignedPayload(body);

    await expect(
      service.handlePaystack(signature, body, rawBody),
    ).resolves.toEqual({ received: true });
    // EventEmitter still fired even though Kafka failed
    expect(mockEvents.emit).toHaveBeenCalledWith(
      'payment.tour_booking',
      expect.any(Object),
    );
  });

  // ── Existing cases still work (regression guard) ───────────────────────────

  it('still dispatches ticket_purchase unchanged', async () => {
    const body = {
      event: 'charge.success',
      data: {
        reference: 'ISY-TKT-XYZ',
        amount: 500_000,
        metadata: { type: 'ticket_purchase' },
      },
    };
    const { rawBody, signature } = makeSignedPayload(body);
    await service.handlePaystack(signature, body, rawBody);
    expect(mockEvents.emit).toHaveBeenCalledWith(
      'payment.ticket_purchase',
      expect.any(Object),
    );
  });

  it('still credits wallet on wallet_topup', async () => {
    const body = {
      event: 'charge.success',
      data: {
        reference: 'ISY-FUND-1',
        amount: 100_000,
        metadata: { type: 'wallet_topup', walletId: 'W-1' },
      },
    };
    const { rawBody, signature } = makeSignedPayload(body);
    await service.handlePaystack(signature, body, rawBody);
    expect(mockWallet.creditWallet).toHaveBeenCalledWith(
      'W-1',
      1000,
      'ISY-FUND-1',
      'Wallet top-up via Paystack',
    );
  });

  it('warns and no-ops on unknown metadata.type', async () => {
    const body = {
      event: 'charge.success',
      data: {
        reference: 'ISY-UNKNOWN-1',
        amount: 100_000,
        metadata: { type: 'something_new' },
      },
    };
    const { rawBody, signature } = makeSignedPayload(body);
    await service.handlePaystack(signature, body, rawBody);
    expect(mockEvents.emit).not.toHaveBeenCalled();
    expect(mockKafka.emit).not.toHaveBeenCalled();
    expect(mockWallet.creditWallet).not.toHaveBeenCalled();
  });
});
