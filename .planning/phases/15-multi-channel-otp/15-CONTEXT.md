# Phase 15: Multi-Channel OTP - Context

**Gathered:** 2026-07-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Users can choose WhatsApp, Email, or SMS as their OTP verification channel at registration (defaulting to SMS if unselected), with automatic bounded-timeout fallback to SMS on delivery failure, and brute-force protection scoped per-identity so switching channels cannot bypass the existing 3-attempts/15-minute lockout.

**In scope:**
- New channel-preference field on registration (`RegisterDto`), persisted on the user, defaulting to SMS
- A new, direct WhatsApp Business Cloud API (Meta Graph API) integration — replaces today's Termii `channel: 'whatsapp'` passthrough entirely
- SMS stays on Termii (unchanged send path); Email OTP is net-new on SendGrid (today SendGrid only sends post-purchase confirmations, never OTP codes)
- Bounded-timeout SMS fallback wrapped in the existing `ResilienceModule`/cockatiel pattern (RESIL-01), triggered on send-API failure/timeout — not on true WhatsApp delivery-receipt confirmation
- Visible fallback messaging on the registration/verification screen when a fallback occurs
- A settings-screen control letting a user change their OTP channel preference after registration
- Meta-approved Authentication-category WhatsApp template (code + expiry only, no marketing) — Claude drafts the template text as a deliverable; actual Meta approval is a stakeholder/ops action outside the codebase
- Existing per-phone (`otp:<phone>`, `otp_lock:<phone>`) rate-limit/lockout keys stay the single source of truth regardless of which channel is used — no new per-channel counters

**Out of scope (belongs to other phases or explicitly deferred):**
- True async WhatsApp delivery-receipt confirmation (a Meta message-status webhook) — fallback triggers on send-API failure only, not on waiting for a delivered/read receipt
- Re-selecting OTP channel per-attempt on login/resend/password-reset screens — channel is set at registration and changeable later via settings, not re-picked every time an OTP is sent
- Getting the WhatsApp template actually approved by Meta — Claude delivers the compliant template text; submission/approval is the stakeholder's action
- Any change to Termii SMS or SendGrid email's existing send mechanics beyond adding OTP as a new email use case

</domain>

<decisions>
## Implementation Decisions

### WhatsApp delivery path (OTP-04, and the STATE.md-flagged vendor-activation risk)
- **D-01:** WhatsApp moves to a **direct Meta Business Cloud API (Graph API) integration**, not Termii's `channel: 'whatsapp'` passthrough. This supersedes the `.planning/PROJECT.md` "Termii WhatsApp Token API reuse preferred" decision and STATE.md's flagged blocker ("Termii WhatsApp Token API activation status is unconfirmed") — that risk is resolved by not depending on Termii for WhatsApp at all. `TERMII_WHATSAPP_SENDER_ID` and the `sendTermii()` whatsapp-channel branch (`auth.service.ts:293-325`) are removed/replaced.
- **D-02:** SMS stays on Termii exactly as today (`sendTermii`, generic/dnd channel). Email is net-new on SendGrid, reusing `sendgrid.service.ts`'s existing client/auth but adding a new OTP-code email (today SendGrid only sends booking/ticket/studio confirmations, never a verification code).
- **D-03:** Claude drafts the Meta-approved Authentication-category template text (verification code + expiry only, no marketing) as part of this phase's deliverable. Actually submitting it to Meta for approval, and confirming the Meta Business/WhatsApp Business Account is set up with valid credentials, is the stakeholder's action outside the codebase — not blocking code completion.
- **D-04:** WhatsApp is **always shown** as a channel option in the registration picker, regardless of whether Meta approval/activation has actually completed by ship time. If the Meta API call fails (unapproved template, invalid credentials, account not yet live), OTP-02's bounded-timeout SMS fallback covers it — the user still gets a working code via SMS. No feature flag hiding the option.
- **Researcher must confirm:** exact Meta Graph API request shape for sending a template message (`POST /{phone-number-id}/messages`), the auth/token model (system user access token vs. temporary token), and what config vars are needed (e.g. `META_WHATSAPP_ACCESS_TOKEN`, `META_WHATSAPP_PHONE_NUMBER_ID`, `META_WHATSAPP_TEMPLATE_NAME`) — none of this exists in the codebase today.

### Channel selection UX (OTP-01)
- **D-05:** Channel picker appears **once, at registration** — a new field on `RegisterDto` (currently has no channel field at all), defaulting to SMS if unselected per OTP-01's literal wording. Not re-shown on every OTP send (login/resend/password-reset reuse whatever channel is on file).
- **D-06:** The explicit user choice **replaces** today's silent `sendTermii()` auto-preference logic entirely (the "prefer WhatsApp when `TERMII_WHATSAPP_SENDER_ID` is set" branch goes away along with D-01's Termii-WhatsApp removal). No hidden channel-selection behavior remains — every user has an explicit, visible channel on file.
- **D-07:** A **settings-screen control** lets a user change their OTP channel preference after registration (e.g. their WhatsApp number changed, or they defaulted to SMS and now want WhatsApp). This is net-new UI/endpoint work this phase, not deferred.

### Fallback timeout semantics (OTP-02)
- **D-08:** "Bounded timeout" means the **channel's send-API call itself** fails or times out (~5-10s, matching today's Termii→Twilio fail-fast pattern) — not waiting for a true WhatsApp delivery-receipt webhook. No new incoming Meta message-status webhook endpoint is built this phase. Same code and expiry are reused across the fallback attempt per OTP-02's literal wording (no new OTP generated).
- **D-09:** The WhatsApp/Email send calls are wrapped in the **existing `ResilienceModule`/cockatiel `resilience.execute()` pattern** (RESIL-01) — the same infrastructure `auth.service.ts` already uses for Termii/Twilio (`this.resilience.execute('termiiAuth', ...)`). Consistent with the project's one-resilience-pattern-for-every-vendor-call convention; gets circuit-breaker/timeout/Grafana-Sentry visibility (RESIL-02) for free rather than building bespoke OTP-specific fallback logic.
- **D-10:** When a fallback to SMS occurs, the registration/verification screen **shows it to the user** (e.g. "We sent your code via SMS instead") rather than resolving silently — avoids the user checking the wrong app for their code.

### Claude's Discretion
- Exact Meta Graph API integration details (request/response shapes, token refresh strategy, new env var names) — researcher/planner's call, grounded in Meta's current WhatsApp Business Cloud API docs.
- Exact wording/copy of the fallback-notice UI message (D-10) and the settings-screen channel-change control's placement — implementation detail, should follow existing Forest Green/Gold design language.
- Whether the new channel preference is stored as a plain enum column on `User` or a small related table — data-modeling call for planning, no existing precedent to follow since this field doesn't exist today.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & roadmap
- `.planning/REQUIREMENTS.md` §"Multi-Channel OTP" — OTP-01 through OTP-04 full requirement text.
- `.planning/ROADMAP.md` §"Phase 15: Multi-Channel OTP" — goal, 4 success criteria, depends on Phase 9 (independent of Phases 10-14, safe to run in parallel).
- `.planning/PROJECT.md` §Key Decisions — "Channel-choice OTP (WhatsApp/Email/SMS)" row (status: was "Pending", now resolved by D-01 through D-10 above); note this phase's D-01 **supersedes** the adjacent "Termii WhatsApp Token API reuse preferred" project-level note.
- `.planning/STATE.md` §Blockers/Concerns — flagged "Termii WhatsApp Token API activation status is unconfirmed — needs a direct support-ticket spike before scoping in detail." Resolved by D-01: this phase no longer depends on Termii's WhatsApp activation at all.

### Existing OTP implementation (being extended)
- `backend/src/modules/auth/auth.service.ts` — `sendOtp` (132-144), `verifyOtp` (146-179), `phoneAuth` (181-236, the combined verify+register+login flow), `sendTermii` (290-338, includes the WhatsApp-channel branch being removed per D-01), `sendTwilio` (340+, SMS-only fallback, unaffected). Constants: `OTP_TTL = 300` (line 24), `OTP_MAX_ATTEMPTS`, `OTP_LOCK_TTL`.
- `backend/src/modules/auth/dto/otp-send.dto.ts`, `otp-verify.dto.ts`, `phone-auth.dto.ts`, `register.dto.ts` — none have a channel field today; `RegisterDto` needs the new field (D-05).
- `.env.example:29` — `TERMII_WHATSAPP_SENDER_ID` (existing var, to be removed per D-01/D-02).

### Resilience pattern to reuse (D-09)
- `backend/src/common/resilience/` (`ResilienceModule`, cockatiel-based) — the `resilience.execute('termiiAuth', ...)` call site in `auth.service.ts:302` is the direct template for wrapping the new WhatsApp/Email send calls.
- `.planning/phases/11-resilience-wrapping/` (Phase 11 CONTEXT/PLAN, if present) — architectural background on how RESIL-01/RESIL-02 wired circuit-breaker+retry+timeout+fallback around every vendor call; WhatsApp/Email OTP sends should follow the same wiring, not a bespoke pattern.

### Email OTP (net-new use case for existing service)
- `backend/src/common/services/sendgrid.service.ts` — existing `sendTicketConfirmation`/`sendBookingConfirmation`/`sendStudioBookingConfirmation` inline-HTML template pattern; the direct template for a new `sendOtpEmail` method.

### Project conventions
- `c:/Developer/work/ISEYAA/CLAUDE.md` — Node 20/NestJS/TypeScript strict stack constraint; NDPA/data-residency constraints (not directly triggered by OTP channel data, but `User` PII handling conventions apply to any new channel-preference field).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `ResilienceModule`/cockatiel `resilience.execute()` — direct reuse for wrapping new WhatsApp (Meta) and Email (SendGrid OTP) send calls, per D-09.
- `sendgrid.service.ts`'s inline-HTML transactional email pattern — template for the new OTP email.
- Existing Redis OTP state machine (`otp:<phone>`, `otp_lock:<phone>`, `OTP_TTL`/`OTP_MAX_ATTEMPTS`/`OTP_LOCK_TTL`) — stays entirely as-is; channel selection only changes *how* the code is delivered, never the identity-scoped rate-limit/lockout keying (satisfies OTP-03 structurally, already phone-keyed not channel-keyed).

### Established Patterns
- `sendTermii()`'s try/catch-then-fallback shape (Termii fails → falls back to Twilio) — the structural precedent for the new WhatsApp/Email → SMS fallback, but now routed through `ResilienceModule` per D-09 rather than a bespoke try/catch.
- `RegisterDto`/`OtpSendDto` class-validator DTO pattern — template for adding the new channel-preference field with `@IsEnum`.

### Integration Points
- `phoneAuth()` (`auth.service.ts:181-236`) is the actual live registration+verify+login flow (not `sendOtp`/`verifyOtp` in isolation) — the channel-selection field and fallback logic need to thread through this combined flow, not just the standalone send/verify pair.
- New settings endpoint (D-07) for changing channel preference post-registration — likely lives in `UsersModule` (profile fields) rather than `AuthModule`, planner's call.

</code_context>

<specifics>
## Specific Ideas

- The user explicitly chose to move WhatsApp off Termii and onto a direct Meta Cloud API integration — this is a bigger scope decision than reusing the existing `channel: 'whatsapp'` code path, and should be flagged prominently to the researcher since none of Meta's Graph API auth/template/request shape exists in this codebase today.
- The user wants WhatsApp visible as an option even before Meta approval is confirmed (D-04) — deliberately accepting that early attempts may all silently fall back to SMS until the stakeholder completes template approval. This is a considered trade-off (ship the UI now, let approval catch up), not an oversight.

</specifics>

<deferred>
## Deferred Ideas

- **True WhatsApp delivery-receipt webhook** (waiting for Meta's async delivered/read status before falling back, per D-08's rejected alternative) — deferred; today's send-API-response-only timeout is sufficient for OTP-02's literal requirement and avoids building new inbound webhook infrastructure this phase.
- **Per-attempt channel re-selection** on login/resend/password-reset screens (D-05's rejected alternative) — deferred; channel is set at registration and changeable via settings (D-07), not re-picked on every OTP send.

### Reviewed Todos (not folded)
- **Wire ResilienceModule into gRPC service scaffolds (INT-01)** (`.planning/todos/pending/2026-07-17-wire-resiliencemodule-into-grpc-service-scaffolds.md`) — surfaced as a weak keyword match (score 0.4) during todo cross-reference. Reviewed and confirmed unrelated: it concerns wiring `ResilienceModule` into the 8 `backend/apps/*-service` gRPC scaffolds ahead of Phase 17's live extraction, not this phase's OTP channel work. Not folded.

</deferred>

---

*Phase: 15-multi-channel-otp*
*Context gathered: 2026-07-18*
