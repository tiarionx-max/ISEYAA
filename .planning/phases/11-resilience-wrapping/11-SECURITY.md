---
phase: 11
slug: resilience-wrapping
status: verified
threats_open: 0
asvs_level: 1
created: 2026-07-16
---

# Phase 11 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Backend → Paystack / Termii / Anthropic / S3-R2 / FCM | Outbound HTTPS calls to 7 external vendors, all routed through `ResilienceService.execute()` | Vendor request/response payloads; vendor errors must never leak to callers |
| `ResilienceService` → Sentry / OTel | Telemetry sink for circuit-breaker state transitions (`onBreak`/`onReset`/`onHalfOpen`) | Vendor name + generic error class only — never raw request/response or PII |
| `ResilienceService` → PlatformConfig / Postgres | Trusted admin-writable resilience policy config (retry/timeout/breaker thresholds) | Numeric policy config only |
| Mobile/web client → `registerToken` → `User.metadata` | FCM token registration write path | Push token string; JSON column shared with other unrelated metadata keys |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-11-01 | Information Disclosure | Vendor-service exception construction (paystack/s3/ai/notifications/termii catch blocks) | mitigate | Callers construct `ServiceUnavailableException` from a static per-vendor string only; raw `err.response.data`/`err.message` is never interpolated into exceptions returned to callers (reinforced by commit b0fcb3c stopping raw vendor error logging on breaker-open) | closed |
| T-11-02 | Denial of Service (retry amplification) | `resilience.service.ts` policy composition; Anthropic SDK client construction; `wrap()` composition order | mitigate | `ExponentialBackoff(200ms-3000ms)` + breaker fail-fast; SDK `maxRetries: 0` so cockatiel is sole retry source; composition reordered so timeout is per-attempt not per-sequence; real `AbortSignal` threaded into Anthropic streams | closed |
| T-11-03 | Information Disclosure (PII in observability payloads/logs) | `onBreak`/`onReset`/`onHalfOpen` handlers; `notifications.service.ts` `sendPush`; Termii catch blocks | mitigate | Span/Sentry payloads carry only vendor name + generic error class; push/SMS catch blocks log only `err.message`, never phone numbers, OTPs, or push token bodies | closed |
| T-11-04 | Denial of Service (false-positive circuit trip / cross-vendor lockout) | `isTransientError` filter; independent `termiiAuth`/`termiiDelivery` policy keys; Anthropic stream timeout window | mitigate | 4xx business errors excluded from breaker failure accounting; separate cockatiel policy instances per vendor prevent cross-tenant lockout (verified via Plan 05 cross-vendor isolation test — S3 succeeds while Paystack breaker is open); `stream.withResponse()` gives timeout/breaker a genuine cancellation window (Plan 09) | closed |
| T-11-05 | Repudiation / financial-integrity (double-refund) | `paystackRefund` vendor policy; `refundCharge()` | mitigate | Dedicated `retryCount: 0` policy — refunds are never auto-retried; real `AbortSignal` threaded so an aggressively-timed-out refund call is actually cancelled rather than possibly landing server-side after the client gives up | closed |
| T-11-06 | Tampering (unintended data destruction via non-isolated write) | `registerToken` → `User.metadata` | mitigate | Changed from full-document replace to read-then-merge, preventing unrelated metadata keys from being clobbered | closed |
| T-11-07 | Test-coverage gap (informational — no new attack surface) | `sendPush` AbortSignal forwarding tests | accept | Test-only addition; no production code path changed | closed (accepted) |
| T-11-08 | Denial of Service (retry/breaker accounting drift under future timeout-strategy change) | `isTransientError()` | mitigate | `'ERR_CANCELED'` added to the transient-error allowlist, removing reliance on `TaskCancelledError` race-timing coincidence for correct classification | closed |
| T-11-09 | Test-coverage gap (informational — no new attack surface) | s3/auth/delivery spec AbortSignal forwarding tests | accept | Test-only addition; no production code path changed | closed (accepted) |

*Status: open · closed*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-11-01 | T-11-07 | Test-only AbortSignal-forwarding coverage addition for `sendPush`; no production code path changed, no new attack surface introduced | gsd-secure-phase (plan-time disposition) | 2026-07-16 |
| AR-11-02 | T-11-09 | Test-only AbortSignal-forwarding coverage addition for s3/auth/delivery specs; no production code path changed, no new attack surface introduced | gsd-secure-phase (plan-time disposition) | 2026-07-16 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-07-16 | 9 | 9 | 0 | gsd-secure-phase (register authored at plan time across 11/11 plans; short-circuit per workflow rule — no threats left OPEN, auditor not spawned) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-07-16
