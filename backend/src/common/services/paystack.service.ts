import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

export interface InitiatePaymentParams {
  email: string;
  amountKobo: number;
  reference: string;
  metadata?: Record<string, any>;
  callbackUrl?: string;
}

export interface InitiatePaymentResult {
  authorizationUrl: string;
  accessCode: string;
  reference: string;
}

@Injectable()
export class PaystackService {
  private readonly logger = new Logger(PaystackService.name);
  private readonly baseUrl = 'https://api.paystack.co';

  constructor(private config: ConfigService) {}

  async initiatePayment(params: InitiatePaymentParams): Promise<InitiatePaymentResult> {
    const { email, amountKobo, reference, metadata, callbackUrl } = params;
    const secretKey = this.config.get<string>('PAYSTACK_SECRET_KEY', '');

    try {
      const response = await axios.post(
        `${this.baseUrl}/transaction/initialize`,
        {
          email,
          amount: amountKobo,
          reference,
          metadata,
          ...(callbackUrl && { callback_url: callbackUrl }),
        },
        { headers: { Authorization: `Bearer ${secretKey}` } },
      );

      const { authorization_url, access_code, reference: ref } = response.data.data;
      return { authorizationUrl: authorization_url, accessCode: access_code, reference: ref };
    } catch (err) {
      this.logger.error('Paystack initiate payment failed', err?.response?.data ?? err.message);
      throw err;
    }
  }

  async resolveBvn(bvn: string): Promise<{ verified: boolean; firstName: string; lastName: string; dob?: string }> {
    const secretKey = this.config.get<string>('PAYSTACK_SECRET_KEY');

    if (!secretKey) {
      this.logger.warn('[PAYSTACK STUB] BVN verification stub mode (no PAYSTACK_SECRET_KEY) — returning verified:true');
      return { verified: true, firstName: 'Stub', lastName: 'User' };
    }

    try {
      // Never log the BVN value — only log errors
      const response = await axios.get(`${this.baseUrl}/bank/resolve_bvn/${bvn}`, {
        headers: { Authorization: `Bearer ${secretKey}` },
      });

      const { status, data } = response.data;
      if (status === true && data) {
        return {
          verified: true,
          firstName: data.first_name ?? '',
          lastName: data.last_name ?? '',
          dob: data.formatted_dob ?? undefined,
        };
      }

      throw new BadRequestException('BVN verification failed');
    } catch (err: any) {
      if (err instanceof BadRequestException) throw err;
      this.logger.error('Paystack BVN resolve failed', err?.response?.data ?? err.message);
      throw new BadRequestException('BVN verification failed');
    }
  }
}
