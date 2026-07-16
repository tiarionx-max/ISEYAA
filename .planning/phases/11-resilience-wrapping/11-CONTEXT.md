# Phase 11: Resilience Wrapping - Context

**Gathered:** 2026-07-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Wrap every external vendor call in the monolith (Paystack, Termii, Anthropic, Cloudflare R2/S3, Firebase FCM) in a `cockatiel`-based circuit-breaker + retry + timeout + fallback policy, so a single vendor outage degrades only the dependent feature — not the whole API — and that degradation is visible in the existing Grafana/Sentry/OpenTelemetry stack.

**In scope:**
- Circuit-breaker + retry + timeout + fallback policy applied to every existing vendor call site (see Code Context below for the full inventory).
- PlatformConfig-backed resilience thresholds (timeout ms, retry count, breaker failure threshold) per vendor.
- Sentry capture on circuit-open transitions; OTel spans/log events for all state transitions (closed → open → half-open) and vendor-call failures.
- Fixing the one currently-unguarded Anthropic call (`getLgaIntelligence`) as a natural byproduct of wrapping it in policy.

**Out of scope:**
- The real gRPC microservice split (Phase 17) — this phase is belt-and-suspenders resilience within the current monolith, independent of and in addition to that later work (per PROJECT.md: stakeholder chose the full split over resilience-as-substitute, but resilience wrapping proceeds anyway since vendor-outage risk exists regardless of process topology).
- Consolidating Termii's two independent inline implementations (`auth.service.ts`, `delivery.service.ts`) into a shared `TermiiService` — explicitly deferred (see Decisions).
- A background retry queue/worker for failed Paystack calls — fail-fast was chosen over queue-and-retry (see Decisions); introducing a queue is a bigger, separate scope.
- Any client-side (mobile/web) changes — a single generic `ServiceUnavailableException` shape was chosen specifically to avoid requiring client-side error-handling changes.

</domain>

<decisions>
## Implementation Decisions

### Fallback behavior (LOCKED)
- **D-01:** Fail loud, fail fast. Once a circuit is open (or retries are exhausted) on Paystack, Anthropic, or S3/R2, the call site throws a generic `ServiceUnavailableException` (503) immediately — no silent hangs, no queuing.
- **D-02:** FCM keeps its existing behavior unchanged: `sendPush()` already never throws — all failure paths (`no_token`, `not_configured`, `auth_failed`, `send_failed`) are caught internally and returned as a result object (`notifications.service.ts:63-113`). This *is* the fallback for FCM; wrap it in the same circuit-breaker/retry/timeout policy for observability and consistency, but preserve its swallow-and-report contract.
- **D-03:** Termii keeps its existing fallback chain per call site: `auth.service.ts` keeps Termii → Twilio → console-stub (L288-333); `delivery.service.ts` keeps Termii → log-and-swallow with its own stub log (L320-346). The circuit breaker wraps each leg of each chain independently — do not unify the two chains' behavior.
- **D-04:** No background retry queue for Paystack — explicitly rejected as bigger scope than this phase (would need a queue/worker that doesn't exist yet). If a Paystack call fails after retries, the request fails now.

### Error contract (LOCKED)
- **D-05:** One generic `ServiceUnavailableException` (503) reused across all vendors for circuit-open/retry-exhausted cases, with a message string identifying which vendor failed (e.g. "Paystack is temporarily unavailable, please try again shortly"). No vendor-specific exception subclasses or error codes — clients already show generic error toasts for 5xx and need no changes.
- Exception: FCM (per D-02) never throws at all — this contract applies to Paystack, Termii (where a chain fully exhausts), Anthropic, and S3/R2.

### Threshold config source (LOCKED)
- **D-06:** Resilience thresholds (timeout ms, retry count, circuit-breaker failure threshold, reset/half-open timing) are PlatformConfig DB-backed, not hardcoded constants and not plain env vars — extending the existing `PlatformConfig` key/value pattern (`prisma/schema.prisma:649-660`, already used for `PLATFORM_FEE_PCT` and transport fare/surge config) to a new domain: infra/resilience config.
- **D-07:** Key granularity is per-vendor, not shared-default-with-overrides — e.g. `resilience.paystack.timeout_ms`, `resilience.paystack.retry_count`, `resilience.paystack.breaker_failure_threshold`, `resilience.termii.timeout_ms`, etc. Each of the 5 vendors gets its own full set of keys (~3-4 keys each), reflecting that these vendors have genuinely different latency/reliability profiles (e.g. Paystack payment calls vs. FCM push calls should not share a timeout).

### Termii duplication (LOCKED — explicitly NOT consolidated)
- **D-08:** Do not extract a shared `TermiiService`. `auth.service.ts`'s `sendTermii()` (L288-333) and `delivery.service.ts`'s `sendTermiiDeliveryOtp()` (L320-346) stay as separate inline implementations. Each gets the resilience policy applied independently, in place. This avoids scope creep into a refactor per CLAUDE.md's "don't refactor beyond what the task requires" — the inconsistency between the two (auth has a Twilio fallback, delivery doesn't) is a pre-existing condition, not something this phase is asked to fix.

### Observability / alerting (LOCKED)
- **D-09:** Circuit-breaker opening is alert-worthy: call `Sentry.captureException` / `Sentry.captureMessage` when a breaker transitions to open, in addition to OTel spans/log events for every state transition (closed → open → half-open) and every vendor-call failure. A vendor outage is treated as an incident, not just a background metric.
- **D-10:** No existing manual tracer/span helper exists anywhere in the codebase (`instrumentation.ts` only sets up `getNodeAutoInstrumentations()` — auto-instrumentation only, zero `getTracer()`/`startSpan()` call sites found). Any manual span wrapping added for circuit-breaker visibility is net-new; there is nothing to reuse.
- **D-11:** Sentry is initialized (`main.ts:11-15`, `tracesSampleRate: 0.1`) but no `SentryGlobalFilter`/`APP_FILTER` is registered anywhere — there's no existing global-exception-capture wiring to hook into. Circuit-open Sentry calls must be made explicitly at the point of transition, not assumed to be caught automatically.

### Claude's Discretion (planner/researcher picks)
- Exact cockatiel policy composition per vendor (retry backoff strategy, circuit-breaker sampling window/duration) — this is implementation detail, not a product decision.
- Whether wrapping happens at the single choke-point method (e.g. `S3Service.upload()`, `PaystackService.initiatePayment()`) or requires touching each of the ~15+ individual controller/service call sites — since these are already centralized services, wrapping at the service-method level should satisfy "every call site" for Paystack/S3/FCM. Termii and the two inline call sites are the exception (per D-08, wrap each independently).
- Anthropic SSE streaming retry semantics: retrying mid-stream (after tokens have already been emitted to the client) is unsafe/non-idempotent. Recommend retry only applies to the initial stream-connection attempt, with no retry once the first token has been emitted — but the planner should confirm this against cockatiel's stream-compatibility.
- Fixing `getLgaIntelligence()`'s complete lack of error handling (`ai.service.ts:515-532`, no try/catch at all today) is required as a byproduct of wrapping it in policy — not a separate scope decision, just noting it needs a try/catch where none exists.
- Whether PlatformConfig resilience keys are seeded via a migration/seed script or created ad-hoc on first read with defaults — implementation detail.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & roadmap
- `.planning/REQUIREMENTS.md` — RESIL-01, RESIL-02 (full requirement text)
- `.planning/ROADMAP.md` §"Phase 11: Resilience Wrapping" — goal, success criteria, dependency on Phase 9
- `.planning/PROJECT.md` — Decisions Log entry: "Resilience-over-rewrite recommended, stakeholder chose full split anyway" — explains why this phase exists alongside (not instead of) the Phase 17 gRPC split

### Vendor call sites (full inventory — see Code Context below for details)
- `backend/src/common/services/paystack.service.ts` — `initiatePayment()` (L26-57), `resolveBvn()` (L59-89), `refundCharge()` (L102-134, only existing call with a timeout: 10_000 at L120)
- `backend/src/modules/auth/auth.service.ts` — `sendTermii()` (L288-333), Termii→Twilio→console-stub fallback chain
- `backend/src/modules/delivery/delivery.service.ts` — `sendTermiiDeliveryOtp()` (L320-346), Termii→log-swallow, own stub log
- `backend/src/modules/ai/ai.service.ts` — `streamChatWithTools()` (L240-332, SSE), `streamItinerary()` (L352-511, SSE), `getLgaIntelligence()` (L515-532, non-streaming, currently unguarded)
- `backend/src/common/services/s3.service.ts` — `upload()` (L65-92), called from 6 sites: `events.service.ts:154,235`, `stays.service.ts:136`, `studio.service.ts:205`, `users.controller.ts:93`, `delivery.service.ts:537`, `itinerary-pdf.service.ts:49`
- `backend/src/modules/notifications/notifications.service.ts` — `sendPush()` (L63-113), called from `tour-notifications.service.ts:195,278,337`, `notifications.controller.ts:28`

### Config pattern to extend
- `backend/prisma/schema.prisma:649-660` — `PlatformConfig` model (key/value/isPublic/metadata)
- `backend/src/modules/marketplace/marketplace.service.ts:187` — existing PlatformConfig read pattern (`PLATFORM_FEE_PCT`)
- `backend/src/modules/transport/transport.service.ts:242-320` — existing PlatformConfig read pattern (fare/surge config) — closest analog for how to read multiple related keys per domain

### Observability to hook into
- `backend/src/main.ts:11-15` — Sentry.init (no global exception filter registered)
- `backend/src/instrumentation.ts` — OpenTelemetry SDK bootstrap, OTLP exporter to Grafana Cloud, auto-instrumentation only (no manual tracer in use anywhere)

### Project conventions
- `c:/Developer/work/ISEYAA/CLAUDE.md` — "Platform fee source: always from DB, never hardcoded" (the precedent D-06 extends); "SELECT FOR UPDATE on every debit; idempotency key required on all wallet mutations" (relevant to why Paystack retries must stay idempotency-safe — reference existing `reference`-keyed idempotency, don't introduce new mutation risk)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- None of the 5 vendor services have a retry/circuit-breaker utility to reuse — `cockatiel` is not yet a dependency (confirmed absent from `backend/package.json`), and no alternative (`p-retry`, `opossum`, `axios-retry`) exists anywhere in the codebase. This is a from-scratch introduction.
- `PlatformConfig` read pattern (`marketplace.service.ts:187`, `transport.service.ts:242-320`) is the direct analog to copy for reading per-vendor resilience keys.

### Established Patterns
- Stub-mode-when-key-absent is already a pattern in 3 of 5 vendors: Paystack's `resolveBvn`/`refundCharge` (deterministic stub responses), Termii (console-log stub in both `auth.service.ts` and `delivery.service.ts`). Anthropic's `streamChatWithTools` also short-circuits with an SSE error if the key is absent, but `getLgaIntelligence` and `streamItinerary` do not have this guard. These stub-mode branches sit *before* any policy wrapping would trigger and should be preserved as-is — the circuit breaker guards the real network call, not the "key absent" branch.
- ioredis's `maxRetriesPerRequest: 0` (`redis.service.ts:22`) is unrelated infrastructure config, not a pattern to mirror for vendor resilience.

### Integration Points
- Paystack, S3, and FCM are each accessed through a single centralized service class already — wrapping at the service-method level naturally covers "every call site" for these three without touching each caller.
- Termii and (for the unguarded call) Anthropic's `getLgaIntelligence` are the two places needing direct, non-centralized changes.

</code_context>

<specifics>
## Specific Ideas

- Sentry capture on circuit-open should identify which vendor tripped (not a generic "a circuit breaker opened" message) — mirrors the generic-exception-with-vendor-name approach chosen for the client-facing error contract (D-05).
- No specific UI/UX mockup or copy was requested for the 503 error message shown to end users — "temporarily unavailable, please try again shortly" per vendor is a reasonable default, exact wording is Claude's discretion at implementation time.

</specifics>

<deferred>
## Deferred Ideas

- **Termii shared-service consolidation** — auth.service.ts and delivery.service.ts's duplicated Termii logic (and the inconsistent Twilio-fallback behavior between them) is a known pre-existing gap. Not fixed this phase (D-08). Candidate for a future cleanup phase if the duplication causes a bug.
- **Background retry queue for failed Paystack calls** — queue-and-retry was considered and explicitly rejected in favor of fail-fast (D-04/D-01). Would need a queue/worker infrastructure that doesn't exist yet. Candidate for a future phase if fail-fast proves too disruptive to top-up UX in practice.
- **Vendor-specific typed error codes for clients** — considered and rejected in favor of one generic `ServiceUnavailableException` (D-05), to avoid requiring mobile/web client changes in a backend-only phase. Revisit if product wants differentiated error UX per vendor later.

None — discussion otherwise stayed within phase scope.

</deferred>

---

*Phase: 11-resilience-wrapping*
*Context gathered: 2026-07-16*
