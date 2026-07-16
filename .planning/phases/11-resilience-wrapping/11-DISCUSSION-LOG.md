# Phase 11: Resilience Wrapping - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-16
**Phase:** 11-resilience-wrapping
**Areas discussed:** Fallback behavior, Threshold config source, Termii duplication, Alert loudness, Config granularity, Error contract

---

## Fallback behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Fail loud, fail fast | Paystack/S3/Anthropic fail immediately with an explicit error once the breaker trips; FCM keeps existing silent-swallow; Termii keeps existing fallback chain | ✓ |
| Queue-and-retry for money paths | Paystack failures queued for background retry instead of failing outright | |
| Describe per-vendor | Walk through each vendor individually | |

**User's choice:** Fail loud, fail fast
**Notes:** Rejected the queue option as bigger scope (no queue/worker infra exists yet) — captured as a deferred idea.

---

## Threshold config source

| Option | Description | Selected |
|--------|-------------|----------|
| Hardcoded constants per vendor | SCREAMING_SNAKE_CASE constants, requires deploy to change | |
| PlatformConfig DB-backed | Extends existing PlatformConfig table pattern to infra/resilience thresholds | ✓ |

**User's choice:** PlatformConfig DB-backed
**Notes:** Extends CLAUDE.md's "platform fee source: always from DB" principle to a new domain (infra config, not business config) — noted as a new application of an existing pattern.

---

## Termii duplication

| Option | Description | Selected |
|--------|-------------|----------|
| Wrap in place, don't consolidate | Keep auth.service.ts and delivery.service.ts's separate inline Termii implementations, wrap each independently | ✓ |
| Consolidate into shared TermiiService | Extract one shared service, apply policy once | |

**User's choice:** Wrap in place, don't consolidate
**Notes:** Avoids scope creep into a refactor. The pre-existing inconsistency (auth has Twilio fallback, delivery doesn't) stays as-is — captured as a deferred idea for a future cleanup phase.

---

## Alert loudness

| Option | Description | Selected |
|--------|-------------|----------|
| Sentry-captured, alert-worthy | Circuit-open calls Sentry.captureException/captureMessage, in addition to OTel spans/logs | ✓ |
| Log + span only, no alert | Dashboard-only, nothing pages anyone | |

**User's choice:** Sentry-captured, alert-worthy
**Notes:** Treats a vendor outage as an incident, not just a metric.

---

## Config granularity (follow-up to Threshold config source)

| Option | Description | Selected |
|--------|-------------|----------|
| Per-vendor keys | e.g. resilience.paystack.timeout_ms — full key set per vendor (~3-4 keys × 5 vendors) | ✓ |
| Shared default + per-vendor overrides | One default set, vendor-specific keys only where they differ | |

**User's choice:** Per-vendor keys
**Notes:** Vendors have genuinely different latency/reliability profiles; fewer indirection layers at read time.

---

## Error contract (follow-up to Fallback behavior)

| Option | Description | Selected |
|--------|-------------|----------|
| One generic ServiceUnavailableException | Same 503 shape for all vendors, message string identifies which vendor | ✓ |
| Vendor-specific typed errors | Distinct exception subclass/error code per vendor | |

**User's choice:** One generic ServiceUnavailableException
**Notes:** Avoids requiring mobile/web client-side changes in what's otherwise a backend-only phase — captured as a deferred idea if product wants differentiated error UX later.

---

## Claude's Discretion

- Exact cockatiel policy composition per vendor (backoff strategy, breaker sampling window).
- Whether wrapping happens at the centralized service-method choke point vs. touching individual call sites (centralized services satisfy "every call site" at the method level; Termii's two inline sites are the exception).
- Anthropic SSE streaming retry semantics — recommend retry only on initial connection, not mid-stream (unsafe/non-idempotent once tokens are emitted).
- Adding the missing try/catch to `getLgaIntelligence()` (currently fully unguarded) as a byproduct of policy wrapping.
- Whether PlatformConfig resilience keys are seeded via migration/seed script or created ad-hoc with defaults on first read.

## Deferred Ideas

- Termii shared-service consolidation (removing the auth/delivery duplication and fallback-chain inconsistency) — future cleanup phase candidate.
- Background retry queue for failed Paystack calls — future phase candidate if fail-fast proves disruptive to top-up UX.
- Vendor-specific typed error codes for clients — future phase candidate if product wants differentiated error UX per vendor.
