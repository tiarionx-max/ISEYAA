import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import axios from 'axios';
import { FlutterwaveService } from '../flutterwave.service';
import { ResilienceService } from '../../../resilience/resilience.service';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

// Default pass-through resilience mock — circuit-breaker mechanics are tested in
// resilience.service.spec.ts; this file tests FlutterwaveService's own error-mapping
// and vendor-key routing.
const mockResilience = {
  execute: jest.fn((vendor: string, fn: (context: { signal: AbortSignal | undefined }) => any) =>
    fn({ signal: undefined }),
  ),
};

const mockConfig = {
  get: jest.fn((key: string, def?: unknown) =>
    ({ FLUTTERWAVE_SECRET_KEY: 'flw_test_xxx' } as Record<string, unknown>)[key] ?? def,
  ),
};

describe('FlutterwaveService', () => {
  let service: FlutterwaveService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockResilience.execute.mockImplementation(
      (vendor: string, fn: (context: { signal: AbortSignal | undefined }) => any) => fn({ signal: undefined }),
    );
    mockConfig.get.mockImplementation(
      (key: string, def?: unknown) => ({ FLUTTERWAVE_SECRET_KEY: 'flw_test_xxx' } as Record<string, unknown>)[key] ?? def,
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FlutterwaveService,
        { provide: ConfigService, useValue: mockConfig },
        { provide: ResilienceService, useValue: mockResilience },
      ],
    }).compile();

    service = module.get<FlutterwaveService>(FlutterwaveService);
  });

  describe('initiatePayment()', () => {
    it('returns the mapped result on axios.post success', async () => {
      mockedAxios.post.mockResolvedValue({
        data: { data: { link: 'https://checkout.flutterwave.com/pay/xyz', id: 998877 } },
      });

      const result = await service.initiatePayment({ email: 'a@b.com', amountKobo: 1000, reference: 'ref123' });

      expect(result).toEqual({
        authorizationUrl: 'https://checkout.flutterwave.com/pay/xyz',
        accessCode: '998877',
        reference: 'ref123',
      });
    });

    it('divides amountKobo by 100 (Flutterwave amounts are naira, not kobo)', async () => {
      mockedAxios.post.mockResolvedValue({
        data: { data: { link: 'https://checkout.flutterwave.com/pay/xyz', id: 1 } },
      });

      await service.initiatePayment({ email: 'a@b.com', amountKobo: 150000, reference: 'ref123' });

      expect(mockedAxios.post.mock.calls[0][1]).toMatchObject({ amount: 1500 });
    });

    it('defaults accessCode to "" when the response has no numeric id', async () => {
      mockedAxios.post.mockResolvedValue({
        data: { data: { link: 'https://checkout.flutterwave.com/pay/xyz' } },
      });

      const result = await service.initiatePayment({ email: 'a@b.com', amountKobo: 1000, reference: 'ref123' });

      expect(result.accessCode).toBe('');
    });

    it('throws ServiceUnavailableException when resilience.execute rejects', async () => {
      mockResilience.execute.mockRejectedValue(new Error('circuit open'));

      await expect(
        service.initiatePayment({ email: 'a@b.com', amountKobo: 1000, reference: 'ref123' }),
      ).rejects.toThrow(ServiceUnavailableException);
    });

    it('calls resilience.execute with "flutterwave" as the first argument', async () => {
      mockedAxios.post.mockResolvedValue({
        data: { data: { link: 'https://checkout.flutterwave.com/pay/xyz', id: 1 } },
      });

      await service.initiatePayment({ email: 'a@b.com', amountKobo: 1000, reference: 'ref123' });

      expect(mockResilience.execute).toHaveBeenCalledWith('flutterwave', expect.any(Function));
    });

    it('forwards the EXACT AbortSignal instance cockatiel provides into axios.post config (reference-identity, not just presence)', async () => {
      mockedAxios.post.mockResolvedValue({
        data: { data: { link: 'https://checkout.flutterwave.com/pay/xyz', id: 1 } },
      });

      const controller = new AbortController();
      mockResilience.execute.mockImplementationOnce(
        (vendor: string, fn: (context: { signal: AbortSignal | undefined }) => any) =>
          fn({ signal: controller.signal }),
      );

      await service.initiatePayment({ email: 'a@b.com', amountKobo: 1000, reference: 'ref123' });

      expect(mockedAxios.post.mock.calls[0][2]?.signal).toBe(controller.signal);
    });
  });

  describe('verifyTransaction()', () => {
    it('returns the mapped result on axios.get success', async () => {
      mockedAxios.get.mockResolvedValue({
        data: {
          data: {
            id: 12345,
            status: 'successful',
            tx_ref: 'ref123',
            amount: 1500,
            currency: 'NGN',
            card: { token: 'flw-token-xyz' },
          },
        },
      });

      const result = await service.verifyTransaction('ref123');

      expect(result).toEqual({
        id: '12345',
        status: 'successful',
        reference: 'ref123',
        amountNgn: 1500,
        currency: 'NGN',
        cardToken: 'flw-token-xyz',
      });
    });

    it('returns cardToken: null when no card data is present', async () => {
      mockedAxios.get.mockResolvedValue({
        data: { data: { id: 1, status: 'successful', tx_ref: 'ref123', amount: 1500, currency: 'NGN' } },
      });

      const result = await service.verifyTransaction('ref123');

      expect(result.cardToken).toBeNull();
    });

    it('calls resilience.execute with "flutterwave" as the first argument', async () => {
      mockedAxios.get.mockResolvedValue({
        data: { data: { id: 1, status: 'successful', tx_ref: 'ref123', amount: 1500, currency: 'NGN' } },
      });

      await service.verifyTransaction('ref123');

      expect(mockResilience.execute).toHaveBeenCalledWith('flutterwave', expect.any(Function));
    });

    it('throws ServiceUnavailableException when resilience.execute rejects', async () => {
      mockResilience.execute.mockRejectedValue(new Error('circuit open'));

      await expect(service.verifyTransaction('ref123')).rejects.toThrow(ServiceUnavailableException);
    });
  });

  describe('chargeToken()', () => {
    it('returns the mapped result on axios.post success', async () => {
      mockedAxios.post.mockResolvedValue({
        data: { data: { status: 'successful', tx_ref: 'ref456' } },
      });

      const result = await service.chargeToken({
        token: 'flw-token-xyz',
        email: 'a@b.com',
        amountKobo: 500000,
        reference: 'ref456',
      });

      expect(result).toEqual({ status: 'successful', reference: 'ref456' });
    });

    it('divides amountKobo by 100 (Flutterwave amounts are naira, not kobo)', async () => {
      mockedAxios.post.mockResolvedValue({
        data: { data: { status: 'successful', tx_ref: 'ref456' } },
      });

      await service.chargeToken({ token: 't', email: 'a@b.com', amountKobo: 500000, reference: 'ref456' });

      expect(mockedAxios.post.mock.calls[0][1]).toMatchObject({ amount: 5000 });
    });

    it('calls resilience.execute with "flutterwave" as the first argument', async () => {
      mockedAxios.post.mockResolvedValue({
        data: { data: { status: 'successful', tx_ref: 'ref456' } },
      });

      await service.chargeToken({ token: 't', email: 'a@b.com', amountKobo: 500000, reference: 'ref456' });

      expect(mockResilience.execute).toHaveBeenCalledWith('flutterwave', expect.any(Function));
    });

    it('throws ServiceUnavailableException when resilience.execute rejects', async () => {
      mockResilience.execute.mockRejectedValue(new Error('circuit open'));

      await expect(
        service.chargeToken({ token: 't', email: 'a@b.com', amountKobo: 500000, reference: 'ref456' }),
      ).rejects.toThrow(ServiceUnavailableException);
    });
  });

  describe('resolveBvn()', () => {
    it('throws BadRequestException when the resolved axios response has data: { status: false }', async () => {
      mockedAxios.get.mockResolvedValue({ data: { status: false, data: null } });

      await expect(service.resolveBvn('12345678901')).rejects.toThrow(BadRequestException);
    });

    it('throws ServiceUnavailableException when resilience.execute rejects', async () => {
      mockResilience.execute.mockRejectedValue(new Error('circuit open'));

      await expect(service.resolveBvn('12345678901')).rejects.toThrow(ServiceUnavailableException);
    });

    it('calls resilience.execute with "flutterwave" as the first argument', async () => {
      mockedAxios.get.mockResolvedValue({
        data: { status: true, data: { first_name: 'John', last_name: 'Doe', date_of_birth: '1990-01-01' } },
      });

      await service.resolveBvn('12345678901');

      expect(mockResilience.execute).toHaveBeenCalledWith('flutterwave', expect.any(Function));
    });

    it('production + no FLUTTERWAVE_SECRET_KEY -> throws ServiceUnavailableException', async () => {
      mockConfig.get.mockImplementation(
        (key: string, def?: unknown) =>
          ({ NODE_ENV: 'production' } as Record<string, unknown>)[key] ?? def,
      );

      await expect(service.resolveBvn('12345678901')).rejects.toThrow(ServiceUnavailableException);
      expect(mockedAxios.get).not.toHaveBeenCalled();
    });

    it('non-production (no FLUTTERWAVE_SECRET_KEY, no NODE_ENV) -> returns stub verified:true', async () => {
      mockConfig.get.mockImplementation((key: string, def?: unknown) => ({} as Record<string, unknown>)[key] ?? def);

      const result = await service.resolveBvn('12345678901');

      expect(result).toEqual({ verified: true, firstName: 'Stub', lastName: 'User' });
    });
  });

  describe('refundCharge()', () => {
    it('resolves the numeric transaction id via verify-by-reference, then posts the refund', async () => {
      mockedAxios.get.mockResolvedValue({ data: { data: { id: 998877 } } });
      mockedAxios.post.mockResolvedValue({
        data: { data: { id: 998877, amount_refunded: 1000, status: 'completed' } },
      });

      const result = await service.refundCharge('ref123');

      expect(mockedAxios.get.mock.calls[0][0]).toContain('/transactions/verify_by_reference');
      expect(mockedAxios.post.mock.calls[0][0]).toContain('/transactions/998877/refund');
      expect(result).toEqual({ id: '998877', amount: 1000, status: 'completed' });
    });

    it('throws ServiceUnavailableException on any failure', async () => {
      mockResilience.execute.mockRejectedValue(new Error('circuit open'));

      await expect(service.refundCharge('ref123')).rejects.toThrow(ServiceUnavailableException);
    });

    it('calls resilience.execute with "flutterwaveRefund" (NOT "flutterwave") for both the verify and refund HTTP calls', async () => {
      mockedAxios.get.mockResolvedValue({ data: { data: { id: 998877 } } });
      mockedAxios.post.mockResolvedValue({
        data: { data: { id: 998877, amount_refunded: 1000, status: 'completed' } },
      });

      await service.refundCharge('ref123');

      expect(mockResilience.execute).toHaveBeenCalledWith('flutterwaveRefund', expect.any(Function));
      expect(mockResilience.execute).not.toHaveBeenCalledWith('flutterwave', expect.any(Function));
    });

    it('returns a deterministic stub when FLUTTERWAVE_SECRET_KEY is unset', async () => {
      mockConfig.get.mockImplementation((key: string, def?: unknown) => ({} as Record<string, unknown>)[key] ?? def);

      const result = await service.refundCharge('ref123', 500);

      expect(result).toEqual({ id: 'stub_ref123', amount: 500, status: 'pending' });
      expect(mockedAxios.get).not.toHaveBeenCalled();
      expect(mockedAxios.post).not.toHaveBeenCalled();
    });
  });
});
