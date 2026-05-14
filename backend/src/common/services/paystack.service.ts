import { Injectable, Logger } from '@nestjs/common';
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
}
