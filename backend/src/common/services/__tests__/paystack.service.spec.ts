import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import axios from 'axios';
import { PaystackService } from '../paystack.service';
import { ResilienceService } from '../../../resilience/resilience.service';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

// Default pass-through resilience mock — circuit-breaker mechanics are tested in
// resilience.service.spec.ts; this file tests PaystackService's own error-mapping
// and vendor-key routing.
const mockResilience = {
  execute: jest.fn((vendor: string, fn: (context: { signal: AbortSignal | undefined }) => any) =>
    fn({ signal: undefined }),
  ),
};

const mockConfig = {
  get: jest.fn((key: string, def?: unknown) =>
    ({ PAYSTACK_SECRET_KEY: 'sk_test_xxx' } as Record<string, unknown>)[key] ?? def,
  ),
};

describe('PaystackService', () => {
  let service: PaystackService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockResilience.execute.mockImplementation(
      (vendor: string, fn: (context: { signal: AbortSignal | undefined }) => any) => fn({ signal: undefined }),
    );
    mockConfig.get.mockImplementation(
      (key: string, def?: unknown) => ({ PAYSTACK_SECRET_KEY: 'sk_test_xxx' } as Record<string, unknown>)[key] ?? def,
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaystackService,
        { provide: ConfigService, useValue: mockConfig },
        { provide: ResilienceService, useValue: mockResilience },
      ],
    }).compile();

    service = module.get<PaystackService>(PaystackService);
  });

  describe('initiatePayment()', () => {
    it('Test 1: returns the mapped result on axios.post success', async () => {
      mockedAxios.post.mockResolvedValue({
        data: { data: { authorization_url: 'https://paystack.co/pay/xyz', access_code: 'code123', reference: 'ref123' } },
      });

      const result = await service.initiatePayment({ email: 'a@b.com', amountKobo: 1000, reference: 'ref123' });

      expect(result).toEqual({ authorizationUrl: 'https://paystack.co/pay/xyz', accessCode: 'code123', reference: 'ref123' });
    });

    it('Test 2: throws ServiceUnavailableException when resilience.execute rejects', async () => {
      mockResilience.execute.mockRejectedValue(new Error('circuit open'));

      await expect(
        service.initiatePayment({ email: 'a@b.com', amountKobo: 1000, reference: 'ref123' }),
      ).rejects.toThrow(ServiceUnavailableException);
    });

    it('Test 6a: calls resilience.execute with "paystack" as the first argument', async () => {
      mockedAxios.post.mockResolvedValue({
        data: { data: { authorization_url: 'https://paystack.co/pay/xyz', access_code: 'code123', reference: 'ref123' } },
      });

      await service.initiatePayment({ email: 'a@b.com', amountKobo: 1000, reference: 'ref123' });

      expect(mockResilience.execute).toHaveBeenCalledWith('paystack', expect.any(Function));
    });

    it('Test 7: forwards the EXACT AbortSignal instance cockatiel provides into axios.post config (reference-identity, not just presence)', async () => {
      mockedAxios.post.mockResolvedValue({
        data: { data: { authorization_url: 'https://paystack.co/pay/xyz', access_code: 'code123', reference: 'ref123' } },
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

  describe('resolveBvn()', () => {
    it('Test 3: throws BadRequestException when the resolved axios response has data: { status: false }', async () => {
      mockedAxios.get.mockResolvedValue({ data: { status: false, data: null } });

      await expect(service.resolveBvn('12345678901')).rejects.toThrow(BadRequestException);
    });

    it('Test 4: throws ServiceUnavailableException when resilience.execute rejects', async () => {
      mockResilience.execute.mockRejectedValue(new Error('circuit open'));

      await expect(service.resolveBvn('12345678901')).rejects.toThrow(ServiceUnavailableException);
    });

    it('Test 6b: calls resilience.execute with "paystack" as the first argument', async () => {
      mockedAxios.get.mockResolvedValue({
        data: { status: true, data: { first_name: 'John', last_name: 'Doe', formatted_dob: '1990-01-01' } },
      });

      await service.resolveBvn('12345678901');

      expect(mockResilience.execute).toHaveBeenCalledWith('paystack', expect.any(Function));
    });
  });

  describe('refundCharge()', () => {
    it('Test 5: throws ServiceUnavailableException on any failure', async () => {
      mockResilience.execute.mockRejectedValue(new Error('circuit open'));

      await expect(service.refundCharge('ref123')).rejects.toThrow(ServiceUnavailableException);
    });

    it('Test 6c: calls resilience.execute with "paystackRefund" (NOT "paystack")', async () => {
      mockedAxios.post.mockResolvedValue({ data: { data: { id: 1, amount: 1000, status: 'success' } } });

      await service.refundCharge('ref123');

      expect(mockResilience.execute).toHaveBeenCalledWith('paystackRefund', expect.any(Function));
      expect(mockResilience.execute).not.toHaveBeenCalledWith('paystack', expect.any(Function));
    });
  });
});
