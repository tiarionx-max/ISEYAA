import { Injectable, Logger, BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { ResilienceService } from '../../resilience/resilience.service';

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

  constructor(
    private config: ConfigService,
    private resilience: ResilienceService,
  ) {}

  async initiatePayment(params: InitiatePaymentParams): Promise<InitiatePaymentResult> {
    const { email, amountKobo, reference, metadata, callbackUrl } = params;
    const secretKey = this.config.get<string>('PAYSTACK_SECRET_KEY', '');

    if (!secretKey) {
      this.logger.error('Paystack initiate payment skipped — PAYSTACK_SECRET_KEY is not set in env');
      throw new Error('PAYSTACK_SECRET_KEY not configured');
    }
    this.logger.log(`Paystack initiate: ref=${reference} amount=${amountKobo} keyPrefix=${secretKey.slice(0, 8)}…`);

    try {
      const response = await this.resilience.execute('paystack', ({ signal }) =>
        axios.post(
          `${this.baseUrl}/transaction/initialize`,
          {
            email,
            amount: amountKobo,
            reference,
            metadata,
            ...(callbackUrl && { callback_url: callbackUrl }),
          },
          { headers: { Authorization: `Bearer ${secretKey}` }, signal },
        ),
      );

      const { authorization_url, access_code, reference: ref } = response.data.data;
      return { authorizationUrl: authorization_url, accessCode: access_code, reference: ref };
    } catch (err) {
      const status = (err as any)?.response?.status;
      const body = (err as any)?.response?.data;
      this.logger.error(`Paystack initiate failed (HTTP ${status}): ${JSON.stringify(body) ?? (err as Error).message}`);
      throw new ServiceUnavailableException('Paystack is temporarily unavailable, please try again shortly');
    }
  }

  /**
   * Silently re-charge a previously-saved card via its `authorization_code` —
   * used for recurring billing (e.g. monthly memberships) with no customer
   * interaction. Wraps `POST /transaction/charge_authorization`.
   */
  async chargeAuthorization(params: {
    authorizationCode: string;
    email: string;
    amountKobo: number;
    reference: string;
    metadata?: Record<string, any>;
  }): Promise<{ status: string; reference: string }> {
    const { authorizationCode, email, amountKobo, reference, metadata } = params;
    const secretKey = this.config.get<string>('PAYSTACK_SECRET_KEY', '');

    if (!secretKey) {
      this.logger.error('Paystack charge_authorization skipped — PAYSTACK_SECRET_KEY is not set in env');
      throw new Error('PAYSTACK_SECRET_KEY not configured');
    }

    try {
      const response = await this.resilience.execute('paystack', ({ signal }) =>
        axios.post(
          `${this.baseUrl}/transaction/charge_authorization`,
          {
            authorization_code: authorizationCode,
            email,
            amount: amountKobo,
            reference,
            metadata,
          },
          { headers: { Authorization: `Bearer ${secretKey}` }, signal },
        ),
      );

      const { status, reference: ref } = response.data.data;
      return { status, reference: ref };
    } catch (err) {
      const status = (err as any)?.response?.status;
      const body = (err as any)?.response?.data;
      this.logger.error(`Paystack charge_authorization failed (HTTP ${status}): ${JSON.stringify(body) ?? (err as Error).message}`);
      throw new ServiceUnavailableException('Paystack is temporarily unavailable, please try again shortly');
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
      const response = await this.resilience.execute('paystack', ({ signal }) =>
        axios.get(`${this.baseUrl}/bank/resolve_bvn/${bvn}`, {
          headers: { Authorization: `Bearer ${secretKey}` },
          signal,
        }),
      );

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
      throw new ServiceUnavailableException('Paystack is temporarily unavailable, please try again shortly');
    }
  }

  /**
   * Refund a previously settled Paystack charge.
   *
   * Wraps `POST https://api.paystack.co/transaction/refund`.
   * When `PAYSTACK_SECRET_KEY` is unset (dev / CI), returns a deterministic stub so
   * RefundService can still write the audit row without hitting the gateway.
   *
   * @param reference  The original Paystack charge reference (e.g. `ISY-TOUR-...`).
   * @param amountKobo Optional partial-refund amount in kobo. Omit for full refund.
   * @param reason     Optional human-readable note, forwarded as Paystack `customer_note`.
   */
  async refundCharge(
    reference: string,
    amountKobo?: number,
    reason?: string,
  ): Promise<{ id: string; amount: number; status: string }> {
    const secretKey = this.config.get<string>('PAYSTACK_SECRET_KEY', '');
    if (!secretKey) {
      this.logger.warn('[PAYSTACK STUB] PAYSTACK_SECRET_KEY not set — refund stubbed in dev');
      return { id: `stub_${reference}`, amount: amountKobo ?? 0, status: 'pending' };
    }

    const body: Record<string, any> = { transaction: reference };
    if (amountKobo) body.amount = amountKobo;
    if (reason) body.customer_note = reason;

    try {
      const { data } = await this.resilience.execute('paystackRefund', ({ signal }) =>
        axios.post(`${this.baseUrl}/transaction/refund`, body, {
          headers: { Authorization: `Bearer ${secretKey}`, 'Content-Type': 'application/json' },
          signal,
        }),
      );
      return {
        id: String(data.data.id),
        amount: Number(data.data.amount),
        status: String(data.data.status),
      };
    } catch (err: any) {
      this.logger.error(
        `Paystack refund failed for ${reference}`,
        err?.response?.data ?? err.message,
      );
      throw new ServiceUnavailableException('Refund gateway unavailable. Retry queued.');
    }
  }
}
