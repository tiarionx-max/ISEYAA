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

/**
 * Flutterwave v3 API client — replaces PaystackService (260819-ji6 migration).
 *
 * Note on API version: Flutterwave's current public docs (developer.flutterwave.com)
 * document only the v4 API (customers -> payment-methods -> charges resource model,
 * `flutterwave-signature` HMAC-SHA256 webhooks). This service deliberately targets the
 * legacy-but-still-live v3 API (`api.flutterwave.com/v3/...`) to match the pre-existing
 * `handleFlutterwave` webhook handler in webhooks.service.ts, which already implements
 * v3's `verif-hash` header scheme. Live endpoint probing during Task 1 (unauthenticated
 * requests against every v3 path used below, including `/v3/kyc/bvns/{bvn}`) returned
 * HTTP 401 "Authorization required" — NOT 404 — for all 5 endpoints, confirming they are
 * live, routed endpoints on Flutterwave's API gateway even though no longer documented
 * on the public site. See 260819-ji6-SUMMARY.md for the full verification path.
 */
@Injectable()
export class FlutterwaveService {
  private readonly logger = new Logger(FlutterwaveService.name);
  private readonly baseUrl = 'https://api.flutterwave.com/v3';

  constructor(
    private config: ConfigService,
    private resilience: ResilienceService,
  ) {}

  async initiatePayment(params: InitiatePaymentParams): Promise<InitiatePaymentResult> {
    const { email, amountKobo, reference, metadata, callbackUrl } = params;
    const secretKey = this.config.get<string>('FLUTTERWAVE_SECRET_KEY', '');

    if (!secretKey) {
      this.logger.error('Flutterwave initiate payment skipped — FLUTTERWAVE_SECRET_KEY is not set in env');
      throw new Error('FLUTTERWAVE_SECRET_KEY not configured');
    }
    // Flutterwave amounts are the major unit (naira), NOT kobo — divide by 100.
    const amountNgn = amountKobo / 100;
    this.logger.log(`Flutterwave initiate: ref=${reference} amount=${amountNgn} keyPrefix=${secretKey.slice(0, 8)}…`);

    try {
      const response = await this.resilience.execute('flutterwave', ({ signal }) =>
        axios.post(
          `${this.baseUrl}/payments`,
          {
            tx_ref: reference,
            amount: amountNgn,
            currency: 'NGN',
            customer: { email },
            meta: metadata,
            ...(callbackUrl && { redirect_url: callbackUrl }),
          },
          { headers: { Authorization: `Bearer ${secretKey}`, 'Content-Type': 'application/json' }, signal },
        ),
      );

      const data = response.data.data;
      // Flutterwave has no `access_code` equivalent to Paystack's initialize response.
      // Populate `accessCode` with the numeric transaction id (stringified) if present,
      // else '' — keeps InitiatePaymentResult's shape stable for call sites that only
      // read `.authorizationUrl` / `.reference`.
      return {
        authorizationUrl: data.link,
        accessCode: data.id !== undefined && data.id !== null ? String(data.id) : '',
        reference,
      };
    } catch (err) {
      const status = (err as any)?.response?.status;
      const body = (err as any)?.response?.data;
      this.logger.error(`Flutterwave initiate failed (HTTP ${status}): ${JSON.stringify(body) ?? (err as Error).message}`);
      throw new ServiceUnavailableException('Flutterwave is temporarily unavailable, please try again shortly');
    }
  }

  /**
   * Re-query Flutterwave for a transaction's authoritative status by its `tx_ref`.
   * New method (not a 1:1 Paystack port) — Paystack verification happened purely via
   * webhook signature; Flutterwave's own webhook docs recommend always re-querying the
   * API before trusting webhook data. Wraps `GET /v3/transactions/verify_by_reference`.
   */
  async verifyTransaction(txRef: string): Promise<{
    id: string;
    status: string;
    reference: string;
    amountNgn: number;
    currency: string;
    cardToken: string | null;
  }> {
    const secretKey = this.config.get<string>('FLUTTERWAVE_SECRET_KEY', '');

    if (!secretKey) {
      this.logger.error('Flutterwave verifyTransaction skipped — FLUTTERWAVE_SECRET_KEY is not set in env');
      throw new Error('FLUTTERWAVE_SECRET_KEY not configured');
    }

    try {
      const response = await this.resilience.execute('flutterwave', ({ signal }) =>
        axios.get(`${this.baseUrl}/transactions/verify_by_reference`, {
          params: { tx_ref: txRef },
          headers: { Authorization: `Bearer ${secretKey}` },
          signal,
        }),
      );

      const data = response.data.data;
      return {
        id: String(data.id),
        status: String(data.status),
        reference: String(data.tx_ref),
        amountNgn: Number(data.amount),
        currency: String(data.currency),
        cardToken: data.card?.token ?? null,
      };
    } catch (err) {
      const status = (err as any)?.response?.status;
      const body = (err as any)?.response?.data;
      this.logger.error(`Flutterwave verifyTransaction failed (HTTP ${status}): ${JSON.stringify(body) ?? (err as Error).message}`);
      throw new ServiceUnavailableException('Flutterwave is temporarily unavailable, please try again shortly');
    }
  }

  /**
   * Silently re-charge a previously-saved card via its reusable token — used for
   * recurring billing (e.g. monthly memberships) with no customer interaction.
   * Replaces `PaystackService.chargeAuthorization`. Wraps `POST /v3/tokenized-charges`.
   */
  async chargeToken(params: {
    token: string;
    email: string;
    amountKobo: number;
    reference: string;
    metadata?: Record<string, any>;
  }): Promise<{ status: string; reference: string }> {
    const { token, email, amountKobo, reference, metadata } = params;
    const secretKey = this.config.get<string>('FLUTTERWAVE_SECRET_KEY', '');

    if (!secretKey) {
      this.logger.error('Flutterwave chargeToken skipped — FLUTTERWAVE_SECRET_KEY is not set in env');
      throw new Error('FLUTTERWAVE_SECRET_KEY not configured');
    }

    // Flutterwave amounts are the major unit (naira), NOT kobo — divide by 100.
    const amountNgn = amountKobo / 100;

    try {
      const response = await this.resilience.execute('flutterwave', ({ signal }) =>
        axios.post(
          `${this.baseUrl}/tokenized-charges`,
          {
            token,
            currency: 'NGN',
            country: 'NG',
            amount: amountNgn,
            email,
            tx_ref: reference,
            metadata,
          },
          { headers: { Authorization: `Bearer ${secretKey}`, 'Content-Type': 'application/json' }, signal },
        ),
      );

      const { status, tx_ref: ref } = response.data.data;
      return { status, reference: ref };
    } catch (err) {
      const status = (err as any)?.response?.status;
      const body = (err as any)?.response?.data;
      this.logger.error(`Flutterwave chargeToken failed (HTTP ${status}): ${JSON.stringify(body) ?? (err as Error).message}`);
      throw new ServiceUnavailableException('Flutterwave is temporarily unavailable, please try again shortly');
    }
  }

  async resolveBvn(bvn: string): Promise<{ verified: boolean; firstName: string; lastName: string; dob?: string }> {
    const secretKey = this.config.get<string>('FLUTTERWAVE_SECRET_KEY');

    if (!secretKey) {
      if (this.config.get<string>('NODE_ENV') === 'production') {
        this.logger.error('Flutterwave BVN verification unavailable in production — FLUTTERWAVE_SECRET_KEY not configured');
        throw new ServiceUnavailableException('BVN verification is temporarily unavailable');
      }
      this.logger.warn('[FLUTTERWAVE STUB] BVN verification stub mode (no FLUTTERWAVE_SECRET_KEY) — returning verified:true');
      return { verified: true, firstName: 'Stub', lastName: 'User' };
    }

    try {
      // Never log the BVN value — only log errors
      const response = await this.resilience.execute('flutterwave', ({ signal }) =>
        axios.get(`${this.baseUrl}/kyc/bvns/${bvn}`, {
          headers: { Authorization: `Bearer ${secretKey}` },
          signal,
        }),
      );

      const { status, data } = response.data;
      if ((status === true || status === 'success') && data) {
        return {
          verified: true,
          firstName: data.first_name ?? '',
          lastName: data.last_name ?? '',
          dob: data.date_of_birth ?? undefined,
        };
      }

      throw new BadRequestException('BVN verification failed');
    } catch (err: any) {
      if (err instanceof BadRequestException) throw err;
      this.logger.error('Flutterwave BVN resolve failed', err?.response?.data ?? err.message);
      throw new ServiceUnavailableException('Flutterwave is temporarily unavailable, please try again shortly');
    }
  }

  /**
   * Refund a previously settled Flutterwave charge.
   *
   * Unlike Paystack (which accepts the charge reference string directly), Flutterwave's
   * refund endpoint requires Flutterwave's own numeric transaction `id` — so this method
   * first calls verify-by-reference to resolve that id, then POSTs the refund.
   * Wraps `GET /v3/transactions/verify_by_reference` + `POST /v3/transactions/{id}/refund`.
   * When `FLUTTERWAVE_SECRET_KEY` is unset (dev / CI), returns a deterministic stub so
   * RefundService can still write the audit row without hitting the gateway.
   *
   * @param reference  The original Flutterwave charge tx_ref (e.g. `ISY-TOUR-...`).
   * @param amountKobo Optional partial-refund amount in kobo. Omit for full refund.
   * @param reason     No direct Flutterwave field exists for an arbitrary refund note
   *                   (unlike Paystack's `customer_note`) — logged only, not sent.
   */
  async refundCharge(
    reference: string,
    amountKobo?: number,
    reason?: string,
  ): Promise<{ id: string; amount: number; status: string }> {
    const secretKey = this.config.get<string>('FLUTTERWAVE_SECRET_KEY', '');
    if (!secretKey) {
      this.logger.warn('[FLUTTERWAVE STUB] FLUTTERWAVE_SECRET_KEY not set — refund stubbed in dev');
      return { id: `stub_${reference}`, amount: amountKobo ?? 0, status: 'pending' };
    }

    if (reason) {
      this.logger.log(`Flutterwave refund note (not sent to gateway, no matching field): ${reason}`);
    }

    try {
      const { data: verifyBody } = await this.resilience.execute('flutterwaveRefund', ({ signal }) =>
        axios.get(`${this.baseUrl}/transactions/verify_by_reference`, {
          params: { tx_ref: reference },
          headers: { Authorization: `Bearer ${secretKey}` },
          signal,
        }),
      );
      const transactionId = verifyBody.data.id;

      const body: Record<string, any> = {};
      if (amountKobo) body.amount = amountKobo / 100;

      const { data } = await this.resilience.execute('flutterwaveRefund', ({ signal }) =>
        axios.post(`${this.baseUrl}/transactions/${transactionId}/refund`, body, {
          headers: { Authorization: `Bearer ${secretKey}`, 'Content-Type': 'application/json' },
          signal,
        }),
      );
      return {
        id: String(data.data.id),
        amount: Number(data.data.amount_refunded),
        status: String(data.data.status),
      };
    } catch (err: any) {
      this.logger.error(
        `Flutterwave refund failed for ${reference}`,
        err?.response?.data ?? err.message,
      );
      throw new ServiceUnavailableException('Refund gateway unavailable. Retry queued.');
    }
  }
}
