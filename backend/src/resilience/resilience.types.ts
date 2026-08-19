/**
 * Resilience contract types shared by ResilienceService and all vendor call sites.
 *
 * `flutterwaveRefund` is a distinct vendor key from `flutterwave` — see RESEARCH.md
 * Pitfall 6. Retrying `initiatePayment`/`resolveBvn` on a transient failure is safe;
 * retrying `refundCharge` after a lost response risks a double-refund if Flutterwave's
 * server actually processed the first attempt. `flutterwaveRefund` defaults its retry
 * count to zero so cockatiel never auto-retries a refund call.
 */

export type Vendor =
  | 'flutterwave'
  | 'flutterwaveRefund'
  | 'sendchampAuth'
  | 'sendchampDelivery'
  | 'anthropic'
  | 's3'
  | 'fcm'
  | 'sendgrid'
  | 'notificationsGrpc'
  | 'newsGrpc'
  | 'waitlistGrpc'
  | 'reviewsGrpc'
  | 'deliveryOtpGrpc';

export interface VendorThresholds {
  timeoutMs: number;
  retryCount: number;
  failureThreshold: number;
  halfOpenAfterMs: number;
}

export const RESILIENCE_DEFAULTS: Record<Vendor, VendorThresholds> = {
  flutterwave: { timeoutMs: 10_000, retryCount: 2, failureThreshold: 5, halfOpenAfterMs: 30_000 },
  // retryCount: 0 — never auto-retry a refund; a lost response after a server-side-successful
  // refund must not trigger a second one (RESEARCH.md Pitfall 6).
  flutterwaveRefund: { timeoutMs: 10_000, retryCount: 0, failureThreshold: 5, halfOpenAfterMs: 30_000 },
  sendchampAuth: { timeoutMs: 5_000, retryCount: 1, failureThreshold: 5, halfOpenAfterMs: 30_000 },
  sendchampDelivery: { timeoutMs: 5_000, retryCount: 1, failureThreshold: 5, halfOpenAfterMs: 30_000 },
  // retryCount: 0 — the Anthropic SDK client is constructed with its own maxRetries: 0
  // (Plan 03), making cockatiel circuit-breaking/timeout-only for this vendor
  // (RESEARCH.md Pitfall 3 — avoid compounding two independent retry layers).
  anthropic: { timeoutMs: 8_000, retryCount: 0, failureThreshold: 3, halfOpenAfterMs: 30_000 },
  s3: { timeoutMs: 15_000, retryCount: 2, failureThreshold: 5, halfOpenAfterMs: 20_000 },
  fcm: { timeoutMs: 5_000, retryCount: 1, failureThreshold: 8, halfOpenAfterMs: 20_000 },
  sendgrid: { timeoutMs: 8_000, retryCount: 1, failureThreshold: 5, halfOpenAfterMs: 30_000 },
  // Mirrors `fcm`'s shape: a same-region Railway-internal gRPC hop, best-effort/
  // non-financial, expected to be at least as fast as the FCM HTTP round-trip fcm
  // already wraps. Tunable later via PlatformConfig without a code change.
  notificationsGrpc: { timeoutMs: 5_000, retryCount: 1, failureThreshold: 8, halfOpenAfterMs: 20_000 },
  // Mirrors `fcm`'s shape: a same-region Railway-internal gRPC hop, best-effort/
  // non-financial, expected to be at least as fast as the FCM HTTP round-trip fcm
  // already wraps. Tunable later via PlatformConfig without a code change.
  newsGrpc: { timeoutMs: 5_000, retryCount: 1, failureThreshold: 8, halfOpenAfterMs: 20_000 },
  // Mirrors `fcm`'s shape: a same-region Railway-internal gRPC hop, best-effort/
  // non-financial, expected to be at least as fast as the FCM HTTP round-trip fcm
  // already wraps. Tunable later via PlatformConfig without a code change.
  waitlistGrpc: { timeoutMs: 5_000, retryCount: 1, failureThreshold: 8, halfOpenAfterMs: 20_000 },
  // Mirrors `fcm`'s shape: a same-region Railway-internal gRPC hop, best-effort/
  // non-financial, expected to be at least as fast as the FCM HTTP round-trip fcm
  // already wraps. Tunable later via PlatformConfig without a code change.
  reviewsGrpc: { timeoutMs: 5_000, retryCount: 1, failureThreshold: 8, halfOpenAfterMs: 20_000 },
  // Mirrors `fcm`'s shape: a same-region Railway-internal gRPC hop, best-effort/
  // non-financial, expected to be at least as fast as the FCM HTTP round-trip fcm
  // already wraps. Tunable later via PlatformConfig without a code change.
  deliveryOtpGrpc: { timeoutMs: 5_000, retryCount: 1, failureThreshold: 8, halfOpenAfterMs: 20_000 },
};
