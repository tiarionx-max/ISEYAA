# Feature Research

**Domain:** Government super-app platform evolution — real microservice extraction, multi-channel identity verification, government-partner analytics, N-way payment settlement
**Researched:** 2026-07-15
**Confidence:** MEDIUM-HIGH (patterns are well-established industry practice; Nigeria-specific and government-dashboard specifics are MEDIUM — synthesized from general public-sector BI practice, not an Ogun State-specific source)

## Feature Landscape

This milestone bundles four largely independent capability areas. Each is broken out separately below, then merged into one MVP/dependency view at the end.

---

### Area 1 — Real gRPC Microservice Extraction

#### Table Stakes (the split must deliver this or it isn't worth doing)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Correct the false "done" claim before adding new work | `ROADMAP.md` currently claims Phase 2 gRPC extraction is complete; code audit shows zero `@GrpcMethod`/`ClientGrpc` usage and a single `NestFactory.create()`. Any roadmap/status doc that isn't corrected first will silently re-break trust in the next audit. | LOW | Pure documentation/roadmap correction — no code. Already called out in PROJECT.md; the parent orchestrator must not treat proto-stub existence as evidence of a working split. |
| Extract candidates chosen by blast-radius/coupling, not "most important first" | Industry consensus (Strangler Fig literature) is that instinct to extract the highest-value/most-critical module first is usually wrong — start with low-coupling, high-isolation-value seams. | MEDIUM | Confirmed via search: "the instinct to extract the most important or most painful service first is usually wrong... start with low-risk, low-coupling seams." ([oneuptime.com](https://oneuptime.com/blog/post/2026-02-17-how-to-implement-the-strangler-fig-pattern-to-migrate-monoliths-to-microservices-on-gke/view), [Confluent](https://developer.confluent.io/patterns/compositional-patterns/strangler-fig/)) |
| Circuit breaker + retry + fallback around **every** external vendor call (Paystack, Termii, Anthropic, S3/R2, FCM) | This is the actual stated goal — "blast-radius isolation from vendor API outages." A gRPC split alone does not protect against a Paystack/Termii/Anthropic outage; the resilience wrapper is what does that. Stakeholder explicitly chose the harder path (full split) over the architect's cheaper recommendation (resilience-only), so resilience patterns are *mandatory regardless*, not optional. | MEDIUM | Cockatiel (TS-native, all 4 patterns, actively maintained) or Opossum (de-facto Node circuit breaker) are the standard libraries; wrap via NestJS interceptor so it's consistent across services. 2–3s timeouts recommended for synchronous user-facing calls, not the 30s default. ([1xapi.com](https://1xapi.com/blog/resilient-api-circuit-breaker-bulkhead-retry-nodejs-2026), [RipeSeed](https://ripeseed.io/blogs/circuit-breakers-for-third-party-ap-is-in-node-js-the-airbag-for-your-backend)) |
| gRPC for internal service-to-service calls only; REST/HTTP stays the external-facing contract | Consensus pattern: "REST is often used for public APIs and external integrations, gRPC for internal low-latency service communication... The API Gateway is the only piece that speaks REST to the outside world, while every internal call uses gRPC." | LOW | Matches existing `packages/proto/*.proto` intent — the API gateway (current monolith's controllers, or a thin new gateway) stays REST for web/mobile clients; internal fan-out uses gRPC. Web/mobile clients require zero changes. ([Zuplo](https://zuplo.com/learning-center/rest-or-grpc-guide), [freeCodeCamp](https://www.freecodecamp.org/news/service-to-service-communication-when-to-use-rest-grpc-and-event-driven-messaging/)) |
| Operational readiness before first extraction: observability, CI/CD, routing | "Operational readiness (observability, CI/CD, routing) must come before the first extraction." ISEYAA already has OpenTelemetry/Grafana/Sentry from Phase 2 — that groundwork exists and should be verified to cover the new service boundaries before cutover, not after. | MEDIUM | Existing Grafana/Sentry/OTel stack is a real asset here — this is cheaper than for a team starting from zero. Verify per-service tracing (not just per-process) works before declaring extraction "done" this time. |
| Idempotency and wallet invariants preserved across the network boundary | Wallet module's `SELECT FOR UPDATE` + idempotency-key pattern only works within a single Postgres transaction. Once wallet debits are called over gRPC from another service, the caller must not retry a network timeout as if it were a failure — the callee may have already committed. | HIGH | This is the single riskiest correctness issue in the whole split. Any service that calls into Wallet over gRPC needs idempotency keys propagated end-to-end and must NOT blindly retry gRPC deadline-exceeded errors without checking transaction state first. |

#### Differentiators (worth doing, not required for "the split works")

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Independent per-service scaling (e.g. Transport's WebSocket GPS service scaled separately from Marketplace) | Transport's live GPS WebSocket load pattern (spiky, latency-sensitive, <1s requirement per CLAUDE.md) is structurally different from Marketplace's request/response CRUD load — genuinely benefits from its own pod/instance count and possibly its own runtime tuning. | HIGH | Strongest gRPC-split candidate by far. Real-time GPS matching + driver-match <60s + WebSocket <1s latency are hard SLAs that a shared monolith risks violating under Marketplace/Events traffic spikes (e.g. ticket on-sale). |
| Blue-green / canary deploys per service | Once services are independently deployable, low-traffic/low-risk modules (news, waitlist, reviews) can ship more aggressively while Wallet/Transport get slower, more cautious rollouts. | MEDIUM | Genuine differentiator once the split exists — not needed for correctness, but is the actual payoff of doing a "real" split instead of resilience-only. |
| Database-per-service for genuinely independent domains | "Organizations using [database-per-service] reported a 30% improvement in deployment speed... services can be individually developed, deployed, tested and scaled." | VERY HIGH | Explicitly flag as NOT required for this milestone. A full DB split invalidates the `SELECT FOR UPDATE` wallet pattern and introduces distributed transactions (Saga pattern) for cross-service writes — a much larger, riskier undertaking than what the stakeholder asked for. Recommend: shared Postgres (Neon) initially, gRPC for process/deploy isolation only. Revisit DB-per-service only if a specific service's schema genuinely diverges. |
| Event-driven (Kafka) decoupling between services for non-critical-path work | ISEYAA already has `KafkaService` wired (no-op when `KAFKA_BROKER_URL` unset, real when set) and `TourSettlementService` already consumes `payment.tour_booking` via Kafka *and* `EventEmitter2` as a dual-path fallback. This pattern already exists and generalizes cleanly to the new split. | MEDIUM | This is a genuine, underused asset: the codebase already proves the "Kafka when available, EventEmitter2 in-process when not" dual-path pattern works. Reuse it for any new cross-service async flow (e.g. Ministry dashboard ingesting events from Transport/Events/Stays without synchronous gRPC calls). |

#### Anti-Features (seem good, are traps here)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|------------------|-------------|
| Extracting every listed module (transport, delivery, tour-packages, tour-guides, news, waitlist, reviews) as separate deployable services with separate CI/CD pipelines in one milestone | Roadmap language ("all backend modules") reads as "do it all now" | News, waitlist, and reviews are low-traffic, low-coupling, low-risk modules — extracting them delivers proto-contract coverage but near-zero blast-radius benefit, while multiplying deploy pipelines, health checks, and on-call surface area for the team to maintain. Doing all 7+ modules simultaneously also means the first production cutover is the riskiest possible one (many things change at once) instead of a validated pattern replicated outward. | Proto-stub ALL modules now (documentation/contract work, cheap), but physically extract-and-deploy in priority order: Transport first (GPS, real isolation value) → Delivery (similar shape) → the rest, validating the extraction pattern once before repeating it. Low-traffic modules (news, waitlist, reviews) can get `.proto` contracts for consistency without urgency on actual separate-process deployment. |
| Two-phase-commit / distributed transactions across service boundaries for wallet operations | Feels like the "correct" way to guarantee consistency once Wallet is a separate service | 2PC is a well-documented anti-pattern in microservices — blocking, poor availability, doesn't scale. The Saga pattern (local transactions + compensating actions) is the accepted alternative but is nontrivial to retrofit onto the existing wallet-debit code. | Keep Wallet mutations behind a single gRPC call that itself does the `SELECT FOR UPDATE` transaction server-side (as today) — callers treat it as one atomic RPC, not a multi-step saga, until/unless cross-service money movement genuinely requires compensating transactions. |
| Splitting the shared Postgres database along with the service split | "Real" microservices textbook says database-per-service | As noted above: invalidates the wallet SELECT FOR UPDATE invariant, and the wallet module's constraints (idempotency key required, platform fee always from DB) become distributed-consistency problems overnight. Massive scope increase for a milestone the stakeholder scoped as "process isolation from vendor outages." | Shared Neon Postgres, gRPC for process boundaries. Revisit only when/if a specific service's data genuinely needs to scale or evolve independently of the rest. |

---

### Area 2 — Multi-Channel OTP (WhatsApp + Email + SMS)

#### Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Channel selection at registration, with a sane default | Standard multi-channel auth UX pattern; also the explicit requirement ("selectable at registration"). | LOW | Existing `sendOtp`/`sendTermii` flow in `auth.service.ts` already takes `dto.phone` — extend `OtpSendDto` with an optional `channel: 'SMS' \| 'WHATSAPP' \| 'EMAIL'` field, default SMS (matches existing user expectation, zero behavior change for users who don't pick). |
| Automatic fallback if the chosen channel fails to deliver | "Best implementations route to WhatsApp first, and fall back to SMS silently... automatic fallback to SMS after 10–30 seconds of WhatsApp delivery failure." Universal pattern across every OTP vendor guide surveyed. | MEDIUM | The codebase ALREADY implements this shape for Termii→Twilio (`sendTermii` catches Termii failure and falls through to Twilio). Generalize the same try/catch-and-fall-through structure to WhatsApp→SMS→(Email as last resort), reusing the existing code shape rather than inventing a new one. |
| Same OTP code and expiry across fallback attempts, logged per-channel | "Keep the same OTP code for both attempts (same expiration) and log the channel used for each authentication." | LOW | Redis already stores `otp:{phone}` with attempt count (`OTP_TTL`, brute-force lockout at 3 attempts / 15-min lock per CLAUDE.md). Just add a `channel` field to the stored value/metadata for audit logging — don't regenerate a new code per channel. |
| Per-channel rate limiting, not just per-phone | Prevents a user (or attacker) from bypassing the existing 3-attempt/15-min lockout by round-robining channels. | MEDIUM | Extend the existing `otp_lock:{phone}` Redis key scheme to be channel-aware or keep it phone-scoped but ensure fallback attempts count against the SAME lockout counter — don't give each channel its own independent 3-strikes budget, or the lockout is trivially bypassable. |
| Short OTP expiry (5–10 min) regardless of channel | Universal security baseline; already implemented (`OTP_TTL`). No change needed, just confirm WhatsApp/Email paths reuse the same `OTP_TTL` constant rather than introducing a second one. | LOW | Already correct in the codebase for SMS — extend, don't duplicate. |
| Authentication-template-only WhatsApp messages (code + expiry, no marketing copy) | Meta's WhatsApp Business Platform requires pre-approved "Authentication" template category for OTP sends — free-form messages will be rejected outside the 24-hour customer service window. | MEDIUM | This is a Meta/WhatsApp platform *requirement*, not a preference: authentication templates must be submitted and approved before go-live, and can only contain the code, expiry, and a security disclaimer — no greeting, no branding copy. Budget lead time for template approval. ([Meta for Developers](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/authentication-templates/authentication-templates), [D7 Networks](https://d7networks.com/blog/whatsapp-otp-a-complete-guide-to-whatsapp-authentication-verification-otp-services/)) |
| NDPA-valid consent capture at channel selection | NDPA requires consent to be "freely given, specific, informed, and unambiguous"; for WhatsApp specifically, requests for consent must be sent via the channel itself and cannot be pre-selected/assumed. | MEDIUM | Nigeria-specific: don't pre-check "WhatsApp" as a default in a way that could be read as pre-selected consent — present all 3 channels as an explicit user choice. The existing `ndpaConsent: true` field on registration (enforced in `AuthService.register()`) already covers general data-processing consent; channel selection itself doesn't need a *separate* consent flow if it's framed as user choice of delivery method rather than a new data-processing purpose. Flag for legal review, not just engineering — this is a LOW-confidence legal interpretation, not verified against NDPC guidance directly. |

#### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Use Termii's own WhatsApp Token API instead of integrating Meta's WhatsApp Business API directly | Termii already offers a `send-whatsapp-token` endpoint (per Termii's own developer docs) that wraps Meta's Business API. Since Termii is already the existing SMS vendor (`TERMII_API_KEY` already in `.env.example`, `sendTermii()` already exists), routing WhatsApp OTP through Termii avoids standing up a second vendor relationship, a second webhook integration, and separate template-approval bureaucracy with Meta directly. | LOW-MEDIUM (vs. HIGH for direct Meta integration) | Confirmed via Termii's public docs: `developer.termii.com/send-whatsapp-token` — "not enabled by default... contact support@whatsapp@termii.com to activate." Recommend evaluating this path FIRST before building a parallel Meta Cloud API integration from scratch — it reuses existing vendor trust, billing, and the existing `sendTermii()` code shape almost unchanged. Confidence: MEDIUM (public docs found; feature-flag-gated activation not independently verified — flag for a spike/support ticket to Termii before committing to the approach). |
| Delivery-status webhook-driven fallback (vs. fixed timeout) | "Monitor delivery confirmations via webhooks and trigger SMS fallback if delivery isn't confirmed within your SLA" — more responsive than a blind timeout, avoids waiting the full timeout window when a provider fails fast. | MEDIUM | Nice-to-have; a fixed 15–30s timeout-then-fallback (matching the existing Termii→Twilio try/catch pattern) is sufficient for MVP and dramatically simpler than webhook-driven state tracking. |
| Per-user remembered channel preference for subsequent logins | Convenience — user picks once at registration, subsequent OTP sends default to their prior successful channel. | LOW | Cheap add-on once channel selection exists; store `preferredOtpChannel` on the `User` model. |

#### Anti-Features

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|------------------|-------------|
| Per-login channel re-selection (asking every time) | Seems more flexible than a one-time choice | Adds friction to every login for a decision users will make once and expect to stick. Also multiplies UI surface and rate-limit edge cases (does re-selecting reset the lockout counter?). | Select at registration (per the actual requirement), store as `preferredOtpChannel`, allow changing it from account settings — not on every login screen. |
| Sending OTP simultaneously on all 3 channels "to be safe" | Seems like it maximizes delivery odds | Costs 3x per OTP send, and users receiving the same code on 3 channels simultaneously is a confusing, low-trust UX (especially in a government-identity context where consistency matters). Also complicates rate-limit and audit-log semantics ("which channel actually delivered?"). | Sequential fallback (primary channel → fallback channel with a bounded timeout) — the pattern already implemented in `sendTermii()` for SMS→Twilio. |
| Treating WhatsApp as SMS-equivalent universal reach | Seems like a straightforward channel swap | WhatsApp reaches only ~70-75% of users (requires the app + connectivity) vs. SMS's ~99.9% reach — WhatsApp cannot be the *only* channel or the default-with-no-fallback for a government platform serving ~7M citizens across urban/rural Ogun State. | WhatsApp as an equal-priority option users can choose, SMS (existing Termii/Twilio path) remains the always-available fallback, never removed. |

---

### Area 3 — Ministry Dashboard (Government/Tourism Analytics + Export)

#### Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| `MINISTRY_VIEWER` role, strictly read-only | Explicit requirement; government dashboards in general practice are read-only for external/partner stakeholders — write access to platform data by a non-operating party is both a security risk and outside the partnership's actual need. | LOW-MEDIUM | Fits the existing `RolesGuard`/`@Roles()` decorator pattern already used for `LGA_ADMIN`/`SUPER_ADMIN`. New enum member on `UserRole`; new Prisma migration; guard every Ministry endpoint with `@Roles(UserRole.MINISTRY_VIEWER, UserRole.SUPER_ADMIN)` and ensure NO mutating endpoints (`POST`/`PATCH`/`DELETE`) are ever reachable by this role — a controller-level `@Roles` audit is required, not just a docs note. |
| Visitor entry counts (by LGA, by time period) | Baseline metric every tourism-ministry dashboard surveyed exposes — this is the "did anyone even show up" number policymakers ask for first. | LOW-MEDIUM | Existing `AdminModule` already does revenue by LGA/category/month (per PROJECT.md Validated section) — visitor counts are a parallel query against Tourism/Events/Stays check-in data, not a new data model. Confirm QR check-in events (already built for Events module) are the count-of-truth, not just ticket-purchase counts (purchased ≠ attended). |
| Purpose-of-visit breakdown (net new field) | Real government tourism dashboards (India's Ministry of Tourism portal, Hawaii's DBEDT dashboard) universally break FTA/DTV data down by purpose of visit — it's the standard axis alongside geography and time. | MEDIUM | This is genuinely net-new data capture, not just a new report on existing data — requires adding a `purposeOfVisit` field somewhere in the booking/check-in flow (likely on Tourism attraction check-in, Events ticket purchase, or a general "trip intent" prompt) and deciding WHERE in the user journey to ask without adding friction. This is the one Area-3 item that touches product/UX, not just reporting. |
| Revenue-to-government-share reporting | This is the actual commercial point of the Ministry partnership — the government needs to see what its cut is, tied directly into the new 3-way settlement split (Area 4). | MEDIUM | Should query the Ministry's standing wallet transaction ledger (once Area 4 exists) rather than recomputing shares ad hoc — single source of truth. Depends on Area 4 shipping first or in parallel. |
| CSV export | Universal baseline for "let me put this in a spreadsheet / forward it to my director" — the most-requested format across every public-sector BI source surveyed, and the lowest-complexity to build. | LOW | Straightforward: query → CSV stream response. No new library needed beyond a CSV serializer (or hand-rolled, given the low column complexity of these reports). |
| PDF export | Government stakeholders explicitly want to "present this to government" — a formatted, presentable PDF (charts + summary + letterhead) is what actually gets carried into a meeting or briefing, not a raw CSV. | MEDIUM | Higher complexity than CSV — needs a PDF generation library (e.g. Puppeteer-rendered HTML→PDF, or a dedicated PDF lib) plus a designed report template using the existing Forest Green/Tropical Gold brand. This is where most of Area 3's build effort will actually go. |

#### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Seasonal/LGA heatmap visualization | Visual, presentation-ready way to show tourism density across Ogun's 20 LGAs and across seasons — directly supports the "present this to government" use case with something more compelling than a table. | MEDIUM-HIGH | Web-only (admin panel), uses existing LGA geo data (already seeded per PROJECT.md: "20 Ogun State LGAs + 61 attractions seeded"). Recharts is already a dependency (`recharts` 3.8.x) — a heatmap/choropleth is a natural extension, not a new charting library. |
| Live BI connector (Power BI / direct DB read replica) | Public-sector BI platforms (Power BI, Qlik, Looker) are common in government IT environments already, and a live connector avoids re-building dashboard functionality that a Ministry's own analysts might prefer to build themselves. | HIGH | Recommend explicitly deferring this — it requires either exposing a read replica (infra/security work, PII exposure risk) or building/maintaining an OData or similar live-query API contract. CSV+PDF export satisfies the stated "present this to government" need without this. Revisit only if the Ministry explicitly asks for a live connector, which the requirements as given do not indicate. |
| Scheduled/recurring export delivery (e.g. auto-email monthly PDF to Ministry contact) | Removes the need for a Ministry stakeholder to log in at all to get their monthly report — reduces adoption friction. | LOW-MEDIUM | Cheap to add on top of the PDF export once it exists (reuse `SendgridService`, already a dependency) — genuinely low effort, high goodwill. Worth flagging as a fast-follow even if not MVP. |

#### Anti-Features

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|------------------|-------------|
| Giving `MINISTRY_VIEWER` access to raw citizen PII (names, BVN/NIN, phone numbers) alongside aggregate stats | Seems useful for "full transparency" with the government partner | Direct NDPA violation risk — BVN/NIN are the most sensitive PII categories in the platform (already AES-256-GCM encrypted at rest per CLAUDE.md constraints) and a non-operating third party (Ministry) should never see them, encrypted or not, without a specific lawful basis distinct from the platform's own operational need. | Aggregate-only dashboards (counts, sums, breakdowns by category/LGA/time) — never expose row-level user records to `MINISTRY_VIEWER`. Enforce this at the query layer (aggregation queries only), not just at the UI layer. |
| Real-time/live-updating dashboard (WebSocket push) for Ministry stakeholders | "Real-time government analytics dashboard" appears in the Core Value statement, so it's tempting to build Ministry's view the same way | The Core Value's "real-time" framing refers to the *internal* `AdminModule` KPI dashboard already built for platform operators — a Ministry stakeholder checking monthly/quarterly numbers for a presentation does not need sub-second freshness, and building WebSocket infra for a low-frequency-access external role is disproportionate effort. | Standard request/response dashboard with on-demand refresh, reusing `AdminModule`'s existing query patterns; export (CSV/PDF) is inherently a point-in-time snapshot anyway. |

---

### Area 4 — Three-Way (N-Way) Settlement Split

#### Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Generalize Phase 9's `TourSettlementService` pattern rather than rewrite | The existing `tour_bookings/tour-settlement.service.ts` already implements N-way atomic wallet fan-out: one `$transaction`, `SELECT FOR UPDATE` on every wallet row touched (vendor + system wallet), idempotency via `<ref>-V-<idx>`/`<ref>-PLAT` reference scheme, drift-tolerance assertion (>₦0.02 throws), and a documented failure→refund→REFUNDED path. This is a proven, tested pattern (has its own `wallet-invariant.e2e-spec.ts`) — reinventing it for the generalized 3-way split would be needless risk. | MEDIUM (extend) vs HIGH (rewrite) | Concretely: add a `MINISTRY` vendorType (parallel to existing `GUIDE`/`HOST`/`ORGANISER`/`ATTRACTION`) that resolves to the Ministry's standing wallet (same resolution pattern already used for `ATTRACTION` → `tour.government_wallet_user_id` PlatformConfig lookup) — then replace Transport's hardcoded 85/15 and Delivery's hardcoded 80/20 splits with `PlatformConfig`-driven `settlementSplit` arrays that include a Ministry share, reusing the exact same resolve→validate→`$transaction`→credit-fan-out code shape. |
| `PlatformConfig`-driven percentages, never hardcoded | This is an existing, explicit CLAUDE.md constraint ("Platform fee source: Always from DB... never hardcoded") — the whole point of this milestone's settlement work is to retire Transport's hardcoded 85/15 and Delivery's hardcoded 80/20 in favor of the DB-driven pattern Phase 9 already proved. | LOW (pattern exists) | Direct continuation of an existing, already-battle-tested constraint — not new risk, just wider application. |
| Standing Ministry wallet, provisioned like the existing system wallet | The settlement engine needs a real wallet row to credit the Ministry's share into — same bootstrap need as `ensureSystemWallet()`/`SYSTEM_USER_ID` already does for platform commission. | LOW-MEDIUM | Either reuse the `tour.government_wallet_user_id` PlatformConfig key platform-wide, or introduce a dedicated `ministry.wallet_user_id` config key if Ministry and "government attraction revenue" need to be distinct recipients — needs a product decision, not just an engineering one, since they may or may not be the same entity in practice. |
| Per-recipient settlement statements | This is compliance-sensitive: the settlement replaces direct tax remittance to government, so the Ministry (and vendors/drivers/riders) need an auditable, itemized statement of what they were paid and why — not just a wallet balance number. | MEDIUM | The existing `Transaction` model already stores rich `metadata` (module, bookingId, vendorType, vendorId, percentage) per settlement leg — a "statement" is a filtered/formatted read view over existing `Transaction` rows grouped by recipient + period, not a new data model. Building the export view (likely reusing Area 3's CSV/PDF machinery) is the actual new work. |
| Audit trail preserving original + correction records (never overwrite) | "When a deposit, fee, or adjustment was wrong, the system should preserve the original record and add a new entry explaining the correction... a reviewer able to see the full sequence rather than only the cleaned-up final value." Directly relevant given this replaces tax remittance — a government auditor will expect to reconstruct history, not trust a mutated final number. | LOW (pattern exists) | The existing settlement engine already follows this — it never overwrites a `Transaction` row; failures produce a REFUNDED status + a new refund transaction, not a rewritten original. Confirm the same discipline extends to any manual adjustment/correction flow introduced for the 3-way split (see Differentiators below — manual adjustment is NOT yet built and needs the same append-only discipline designed in from the start). |
| Wallet invariant assertion generalized to N-way (not just tour bookings) | The existing `sum(vendor credits) + platform commission == buyer paid amount` assertion with a ₦0.02 drift tolerance is the actual correctness guarantee of the whole settlement engine — it must be preserved (not dropped) when the pattern is generalized to Transport/Delivery/other modules. | MEDIUM | This is the highest-value single piece of code to carry forward unchanged into the generalized service — do not let the 3-way generalization silently drop the drift assertion in the name of flexibility. |

#### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Dispute/adjustment workflow (manual correction with reason + reviewer) | Not present in the existing settlement engine at all today — failures auto-refund, but there's no path for "the Ministry disputes their share was miscalculated for booking X, please adjust." Compliance-sensitive N-way splits generally need this per the reconciliation research (chargebacks/adjustments must propagate across all recipients' records simultaneously). | HIGH | Genuinely new capability, not an extension of existing code. Needs: an admin-only mutation endpoint, a required reason/reviewer field, and — critically — must follow the append-only audit discipline above (new correcting `Transaction` row referencing the original, never an in-place `UPDATE` of a settled amount). Recommend scoping this as its own explicit sub-feature with its own review, given it's the one piece of Area 4 with no existing pattern to lean on. |
| Automated monthly reconciliation report (Ministry share vs. expected tax-equivalent baseline) | Since this literally replaces a tax-remittance relationship, the Ministry will want confidence the automated split matches what they'd have expected from prior manual/statutory remittance. | MEDIUM-HIGH | Pairs naturally with Area 3's PDF/CSV export and per-recipient statements — likely the same underlying report-generation machinery, scoped specifically to the Ministry recipient. |
| Configurable split *tiers* (e.g. different Ministry percentage for tourism-attraction bookings vs. transport rides) | Real-world government revenue-share deals are rarely a single flat percentage across every product line. | LOW (pattern already supports it) | Already naturally supported — `PlatformConfig` is keyed per-context (e.g. `tour.government_wallet_user_id` is tour-specific), so per-module Ministry percentages are just more config rows, not new code. Flag as "cheap to support, confirm product wants it" rather than a big lift. |

#### Anti-Features

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|------------------|-------------|
| Rewriting the settlement engine from scratch as a "proper" generic N-way splitter | Feels cleaner than extending tour-specific naming/types | Phase 9's engine is tested (`tour-settlement.service.spec.ts`, `wallet-invariant.e2e-spec.ts`) and has already absorbed real edge cases (unresolved-wallet rollup, split-bill children, Kafka+EventEmitter2 dual-path delivery, rounding drift). A rewrite discards that hard-won correctness for stylistic cleanliness. | Generalize by widening the `vendorType` union and the resolution `switch`, and parameterizing which `PlatformConfig` keys feed which module's split — keep the transaction/locking/audit skeleton exactly as-is. |
| Real-time settlement notifications to the Ministry (push/webhook on every single transaction) | Sounds like better transparency | At government-partnership scale this is noise, not signal — a Ministry stakeholder doesn't want a webhook per ride/ticket/booking; they want periodic statements and dashboard access. Also multiplies the surface area needing NDPA-safe, non-PII payload design per-event instead of per-report. | Periodic (daily/monthly) statement generation + on-demand dashboard access (Area 3), not per-transaction push. |
| Letting `MINISTRY_VIEWER` (or the Ministry as a "recipient") directly initiate withdrawals from their standing wallet through the same self-serve flow vendors/drivers use | Symmetry with existing vendor withdrawal flow seems consistent | A government partner's fund movement is far more compliance-sensitive than a driver cashing out — this likely needs an out-of-band/manual settlement process (bank transfer reconciliation, not Paystack payout to a personal account) that the existing vendor withdrawal flow was never designed for. | Ministry wallet balance is visible/reportable, but actual fund movement out of the platform to government accounts should go through a separate, more controlled process (manual admin-initiated transfer with sign-off) rather than reusing the self-serve vendor withdrawal endpoint verbatim. Flag as a product/finance-ops decision, not purely engineering. |

---

## Feature Dependencies

```
[Real gRPC extraction — Transport service]
    └──should precede──> [Independent scaling of Transport GPS WebSocket]
                              (extraction with no scaling payoff is wasted effort)

[Circuit breaker / retry / fallback on vendor calls]
    └──independent of──> [gRPC extraction]
    (resilience wrapping delivers blast-radius protection on its own; do NOT
     gate this behind the full service split being finished)

[Multi-channel OTP: WhatsApp]
    └──requires──> [Meta authentication-template approval (or Termii WhatsApp
                     Token API activation)]
                       └──blocks──> [WhatsApp channel going live for users]

[Channel-aware OTP rate limiting]
    └──requires──> [Existing Redis otp_lock:{phone} scheme extended, not replaced]

[Ministry dashboard — revenue-to-government-share reporting]
    └──requires──> [Three-way settlement split shipped (Area 4)]
                       (cannot report a Ministry revenue share that doesn't
                        exist as a real wallet ledger yet)

[Ministry dashboard — purpose-of-visit breakdown]
    └──requires──> [New purposeOfVisit data capture in booking/check-in flow]
                       (this is a product/UX decision, not just a report)

[Three-way settlement split — MINISTRY vendorType]
    └──requires──> [Standing Ministry wallet provisioned]
                       └──requires──> [PlatformConfig key(s) for Ministry wallet
                                        user id, decided: shared with
                                        tour.government_wallet_user_id or distinct]

[Three-way settlement split generalization]
    └──extends──> [Phase 9 TourSettlementService pattern]
                      (keep transaction/locking/audit skeleton unchanged;
                       widen vendorType union + PlatformConfig keys only)

[Dispute/adjustment workflow]
    └──requires──> [Three-way settlement split shipped]
    └──enhances──> [Audit trail / per-recipient statements]

[CSV/PDF export machinery (Area 3)]
    └──enhances──> [Per-recipient settlement statements (Area 4)]
                       (same underlying report-generation code, different
                        recipient scope — build once, reuse)

[MINISTRY_VIEWER role]
    └──requires──> [Ministry dashboard endpoints exist AND are read-only-audited]
                       (role without audited read-only guarantee is a PII leak risk)

[Full database-per-service split] ──conflicts──> [Wallet SELECT FOR UPDATE
                                                    invariant as currently built]
    (explicitly out of scope for this milestone — see Anti-Features, Area 1)
```

### Dependency Notes

- **Ministry dashboard revenue reporting requires the 3-way settlement split:** the dashboard's "revenue-to-government-share" feature has nothing real to query until the Ministry wallet exists and is being credited by Area 4's generalized settlement engine. Sequence Area 4 (or at minimum, the Ministry wallet + `PlatformConfig` plumbing) before or alongside Area 3's revenue reporting, not after.
- **Circuit breaker/resilience work does NOT depend on gRPC extraction finishing:** these are separable. Given the stakeholder explicitly reconfirmed the full split over the architect's cheaper resilience-only recommendation, do both — but resilience wrapping around Paystack/Termii/Anthropic/S3/FCM can ship independently and immediately, while the service-by-service gRPC extraction is sequenced by coupling/value (Transport first).
- **The 3-way settlement split explicitly extends, not replaces, Phase 9's engine:** every table-stakes item in Area 4 traces back to a specific, already-tested piece of `tour-settlement.service.ts`. Treat any design that doesn't visibly reuse that transaction/locking/reference-scheme skeleton as a red flag warranting extra scrutiny.
- **Full database-per-service conflicts with the existing wallet invariant:** flagged explicitly as an anti-feature/out-of-scope because it would force a Saga-pattern rewrite of the SELECT FOR UPDATE wallet debit logic — a fundamentally larger, riskier project than what was requested.

## MVP Definition

### Launch With (v1 — this milestone)

- [ ] Corrected roadmap/status documentation reflecting the true (monolith) starting state — prerequisite for honest planning of everything else
- [ ] Circuit breaker + retry + fallback wrapping around Paystack, Termii, Anthropic, S3/R2, FCM — delivers the core "blast-radius isolation" goal on its own and is independent of the gRPC timeline
- [ ] gRPC extraction of Transport (strongest isolation/scaling case: WebSocket GPS, hard latency SLA) as the first, validated extraction — proves the pattern before repeating it
- [ ] `.proto` contract authoring (not necessarily live extraction) for all remaining unstubbed modules (transport already covered above; delivery, tour-packages, tour-guides, news, waitlist, reviews) — cheap, keeps the "real contracts everywhere" commitment honest without requiring 7+ simultaneous production cutovers
- [ ] WhatsApp OTP channel (via Termii's WhatsApp Token API if activation is confirmed available — spike this first — otherwise direct Meta Cloud API), selectable at registration, falling back to SMS on delivery failure, sharing the existing OTP code/expiry/lockout Redis scheme
- [ ] `MINISTRY_VIEWER` role, read-only-audited across all endpoints
- [ ] Ministry dashboard: visitor entry counts, purpose-of-visit breakdown (net-new capture point), revenue-to-government-share (depends on Area 4 below)
- [ ] CSV export for all Ministry dashboard reports
- [ ] PDF export for all Ministry dashboard reports (the "present this to government" deliverable)
- [ ] Three-way `PlatformConfig`-driven settlement split generalized from `TourSettlementService`, replacing Transport's hardcoded 85/15 and Delivery's hardcoded 80/20
- [ ] Standing Ministry wallet + per-recipient settlement statements (reusing Area 3's export machinery)
- [ ] Audit trail discipline (append-only, original-preserved) carried into every new settlement/adjustment path

### Add After Validation (v1.x)

- [ ] Blue-green/canary deploys per extracted service — once Transport extraction is validated in production
- [ ] Extend gRPC extraction to remaining high-value services (Delivery next, by similarity to Transport's shape)
- [ ] Scheduled/recurring export delivery (auto-email monthly Ministry PDF)
- [ ] Seasonal/LGA heatmap visualization on the Ministry dashboard
- [ ] Dispute/adjustment workflow for settlement corrections — trigger: first real-world instance of a Ministry or vendor disputing a settled amount
- [ ] Configurable per-module Ministry split tiers — trigger: product/government partner requests differentiated rates by product line

### Future Consideration (v2+)

- [ ] Extraction of remaining low-traffic modules (news, waitlist, reviews) as genuinely separate deployed services — defer until proto contracts + higher-value extractions are proven; low ROI relative to effort
- [ ] Live BI connector (Power BI/Qlik) for Ministry — defer unless explicitly requested; CSV/PDF satisfies the stated need
- [ ] Database-per-service — defer indefinitely unless a specific service's data needs diverge sharply enough to justify a Saga-pattern rewrite of wallet operations

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|----------------------|----------|
| Circuit breaker/retry/fallback on vendor calls | HIGH | MEDIUM | P1 |
| Transport gRPC extraction (first validated split) | HIGH | HIGH | P1 |
| Proto contracts for remaining modules (stub only) | MEDIUM | LOW | P1 |
| WhatsApp OTP + fallback | HIGH | MEDIUM | P1 |
| MINISTRY_VIEWER role + read-only audit | HIGH | LOW-MEDIUM | P1 |
| Ministry dashboard core metrics (visitor counts, purpose-of-visit) | HIGH | MEDIUM | P1 |
| CSV export | HIGH | LOW | P1 |
| PDF export | HIGH | MEDIUM | P1 |
| Three-way settlement split (generalized from Phase 9) | HIGH | MEDIUM | P1 |
| Standing Ministry wallet + statements | HIGH | MEDIUM | P1 |
| Full extraction of remaining modules (beyond Transport) | MEDIUM | HIGH | P2 |
| Seasonal/LGA heatmap | MEDIUM | MEDIUM-HIGH | P2 |
| Scheduled export delivery | MEDIUM | LOW-MEDIUM | P2 |
| Dispute/adjustment workflow | MEDIUM | HIGH | P2 |
| Live BI connector | LOW | HIGH | P3 |
| Database-per-service split | LOW (for this milestone's stated goals) | VERY HIGH | P3 (do not build) |
| Extraction of news/waitlist/reviews as live services | LOW | MEDIUM | P3 |

**Priority key:**
- P1: Must have for this milestone
- P2: Should have, add when possible / fast-follow
- P3: Nice to have or explicitly deferred/anti-feature

## Competitor / Reference Pattern Analysis

| Feature | Reference Pattern A | Reference Pattern B | Our Approach |
|---------|---------------------|----------------------|--------------|
| Service split strategy | Strangler Fig — extract by coupling, not importance ([Confluent](https://developer.confluent.io/patterns/compositional-patterns/strangler-fig/)) | "Extract everything at once" big-bang rewrite (widely documented as high-risk) | Strangler Fig, Transport first, proto-stub the rest for contract completeness without forcing 7 simultaneous cutovers |
| Internal service communication | gRPC for internal, REST for external gateway ([Zuplo](https://zuplo.com/learning-center/rest-or-grpc-guide)) | Pure REST everywhere (simpler, slower, looser typing) | gRPC internal / REST external — matches existing `.proto` intent already in the repo |
| OTP channel fallback | WhatsApp-first with silent SMS fallback ([QuickAuth](https://quickauth.in/blog/whatsapp-otp-sms-fallback)) | Simultaneous multi-channel blast | Sequential fallback (user-chosen primary → SMS fallback), reusing existing `sendTermii()` try/catch shape |
| Government dashboard export | Power BI/Qlik live connector (large public-sector orgs, e.g. Microsoft-ecosystem governments) | Static CSV/PDF export (majority of smaller/state-level government reporting needs, per India Ministry of Tourism data portal pattern) | CSV + PDF export; defer live BI connector |
| Multi-party settlement | Database-per-service + Saga pattern (large-scale marketplaces, e.g. Walmart Global Tech's documented approach) | Shared-DB atomic transaction with SELECT FOR UPDATE fan-out (already proven in this codebase's Phase 9) | Extend the existing shared-DB atomic pattern — appropriate at ISEYAA's current scale; Saga/DB-per-service is over-engineering for this milestone |

## Sources

- Strangler Fig pattern: [Confluent](https://developer.confluent.io/patterns/compositional-patterns/strangler-fig/), [OneUptime](https://oneuptime.com/blog/post/2026-02-17-how-to-implement-the-strangler-fig-pattern-to-migrate-monoliths-to-microservices-on-gke/view) (MEDIUM confidence — WebSearch, cross-referenced across multiple independent sources)
- gRPC vs REST for microservices: [Zuplo](https://zuplo.com/learning-center/rest-or-grpc-guide), [freeCodeCamp](https://www.freecodecamp.org/news/service-to-service-communication-when-to-use-rest-grpc-and-event-driven-messaging/), [IBM](https://www.ibm.com/think/topics/grpc-vs-rest) (MEDIUM-HIGH confidence — consistent consensus across vendor-neutral and vendor sources)
- NestJS gRPC hybrid application pattern: [NestJS official docs](https://docs.nestjs.com/microservices/grpc), [NestJS GitHub sample](https://github.com/nestjs/nest/blob/master/sample/04-grpc/src/main.ts) (HIGH confidence — official documentation)
- Circuit breaker/retry/fallback in Node.js: [1xAPI](https://1xapi.com/blog/resilient-api-circuit-breaker-bulkhead-retry-nodejs-2026), [RipeSeed](https://ripeseed.io/blogs/circuit-breakers-for-third-party-ap-is-in-node-js-the-airbag-for-your-backend), [nestjs-resilience GitHub](https://github.com/SocketSomeone/nestjs-resilience) (MEDIUM confidence — WebSearch, community sources; Cockatiel/Opossum library recommendations independently corroborated)
- Database-per-service and Saga pattern: [microservices.io](https://microservices.io/patterns/data/database-per-service.html), [Walmart Global Tech](https://medium.com/walmartglobaltech/designing-microservices-using-database-per-service-and-saga-patterns-98c0a547212f) (MEDIUM confidence)
- WhatsApp Business API OTP best practices: [Meta for Developers — Authentication templates](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/authentication-templates/authentication-templates) (HIGH confidence — official Meta docs), [D7 Networks](https://d7networks.com/blog/whatsapp-otp-a-complete-guide-to-whatsapp-authentication-verification-otp-services/), [QuickAuth](https://quickauth.in/blog/whatsapp-otp-sms-fallback) (MEDIUM confidence — vendor/community sources, cross-referenced)
- Termii WhatsApp Token API: [Termii developer docs](https://developer.termii.com/send-whatsapp-token) (MEDIUM confidence — official vendor docs found via search snippet; activation gating not independently verified, recommend a support-ticket spike before committing)
- Nigeria NDPA consent requirements: [Clym — NDPA overview](https://www.clym.io/regulations/nigeria-data-protection-act-ndpa), [GEPLAW](https://geplaw.com/the-cost-of-consent-a-turning-point-for-privacy-in-nigeria/), [Securiti](https://securiti.ai/overview-of-nigeria-data-protection-act/) (MEDIUM confidence — legal-adjacent summaries, not the NDPC's own guidance document directly reviewed; flag for legal review before implementation)
- Government/tourism dashboard patterns: [India Ministry of Tourism data portal](https://data.tourism.gov.in/), [Hawaii DBEDT Tourism Dashboard](https://dbedt.hawaii.gov/visitor/tourism-dashboard/), [insightsoftware — Government BI](https://insightsoftware.com/solutions/government/) (MEDIUM confidence — real government dashboard examples reviewed, not Ogun-State-specific)
- Government export format preferences (CSV/PDF/BI connector): [insightsoftware](https://insightsoftware.com/solutions/government/), [Coupler.io — CSV to Power BI](https://www.coupler.io/power-bi-integrations/csv-to-power-bi) (MEDIUM confidence)
- Marketplace multi-party reconciliation, audit trail, disputes: [Optimus.tech](https://optimus.tech/blog/payment-reconciliation-for-marketplaces), [Rexi Finance — audit trails](https://rexi.finance/blog/payment-reconciliation-software/payment-reconciliation-audit-trails.html), [NAYA Finance](https://naya.finance/learn/marketplace-payment-reconciliation-guide) (MEDIUM confidence — fintech/reconciliation-vendor content, consistent across multiple independent sources)
- Codebase ground truth (HIGH confidence — direct code review): `backend/src/modules/tour-bookings/tour-settlement.service.ts`, `backend/src/modules/tour-packages/tour-packages.service.ts`, `backend/src/modules/auth/auth.service.ts` (`sendOtp`/`sendTermii`), `backend/src/kafka/kafka.service.ts`, `backend/src/modules/admin/admin.service.ts`, `packages/proto/*.proto`, `.planning/PROJECT.md`

---
*Feature research for: ISEYAA v2.0 — gRPC microservice extraction, multi-channel OTP, Ministry dashboard, N-way settlement split*
*Researched: 2026-07-15*
