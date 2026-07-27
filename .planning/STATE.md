---
gsd_state_version: 1.0
milestone: v2.1
milestone_name: — Extraction Backlog Clearance & Settlement Flexibility
status: Awaiting next milestone
stopped_at: Phase 22 UI-SPEC approved
last_updated: "2026-07-27T09:47:23Z"
last_activity: 2026-07-27 - Completed quick task 260727-c0m: Build real host dashboard (property CRUD + bookings view)
progress:
  total_phases: 5
  completed_phases: 5
  total_plans: 27
  completed_plans: 27
  percent: 100
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-07-19)

**Core value:** A tourist in Abeokuta can discover an attraction, book a guesthouse, buy an event ticket, and request a ride — all paid through one wallet — and the government analyst sees the revenue in real time.
**Current focus:** Planning next milestone — run `/gsd-new-milestone`

## Current Position

Phase: Milestone v2.1 complete
Plan: —
Status: Awaiting next milestone
Last activity: 2026-07-27 - Completed quick task 260727-c0m: Build real host dashboard (property CRUD + bookings view)

## Current Status

- Phases 1-9 (v1.0): substantially shipped — see PROJECT.md Validated section; 8 human-verification checkpoints remain unfiled deferred debt, not blocking v2.1
- Phases 10-17 (v2.0): COMPLETE — shipped 2026-07-19, see PROJECT.md Validated section and `milestones/v2.0-ROADMAP.md`
- Phases 18-22 (v2.1): COMPLETE — shipped 2026-07-21, see PROJECT.md Validated section and `milestones/v2.1-ROADMAP.md`
- Next milestone: not yet defined — run `/gsd-new-milestone`

## Performance Metrics

**Velocity:**

- Total plans completed: 108 (v1.0 + v2.0 + v2.1 all closed)
- Average duration: -
- Total execution time: -

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 10 | 3 | - | - |
| 11 | 11 | - | - |
| 12 | 9 | - | - |
| 13 | 4 | - | - |
| 14 | 10 | - | - |
| 15 | 6 | - | - |
| 16 | 4 | - | - |
| 17 | 7 | - | - |
| 19 | 6 | - | - |
| 20 | 5 | - | - |
| 21 | 8 | - | - |
| 22 | 4 | - | - |

*Updated after each plan completion*

## Accumulated Context

### Decisions

Key decisions logged in PROJECT.md. Decisions affecting current v2.1 work:

- **5-phase structure adopted from research SUMMARY.md**: Settlement Split Centralization (18) → Settlement Dispute & Adjustment (19) → gRPC Blue-Green Healthcheck Retrofit (20) → Low-Risk gRPC Extraction: news/waitlist/reviews + scoped Delivery OTP (21) → Scheduled Ministry Exports & LGA Heatmap (22)
- **Financial correctness sequenced before deploy infrastructure**: Phase 19's dispute/adjustment resolver has a hard data dependency on Phase 18's centralized `resolveSplit()` as the source of truth for "what split should have applied"
- **Healthcheck retrofit sequenced before any new gRPC extraction**: cutting live traffic to a new `ClientGrpc` service without a working health endpoint defeats blue-green — Phase 20 is a hard prerequisite for Phase 21, not a preference
- **GRPC-07 scoped down to `VerifyDeliveryOtp` only**: `RequestDelivery`/`AcceptDelivery`/`CompleteDelivery` and `DeliveryGateway` stay in-process this milestone — they're wallet-adjacent and/or Socket.IO-coupled, and extracting them needs a durable match-timeout + Socket.IO Redis adapter redesign explicitly out of scope (research pitfall 1)
- **No wallet-touching service is extracted this milestone**: any newly-extracted service that needs `SettlementService` embeds its own copy against the same Postgres rather than calling a separately-extracted wallet-service over gRPC (reaffirms GRPC-05 decision from v2.0)
- **Phase 22 has no technical dependency on Phases 18/19/21**, only on Phase 20's distributed-lock cron pattern for its own new scheduled export job — can run as a parallel track once Phase 20 lands

### Pending Todos

None currently open for active work — 2 pre-existing todo files (add-compile-step-to-packages-proto, wire-resiliencemodule-into-grpc-service-scaffolds) describe work already resolved by Phase 16/17; see Deferred Items below.

### Blockers/Concerns

- v1.0's 8 outstanding human-verification checkpoints remain deferred — do not run any milestone-archival step against `.planning/phases/02-09` without re-confirming with the user first
- Live Paystack secret key (`sk_live_...`) present in `backend/.env` / root `.env` — recommend rotating to test-mode keys for local/CI use (carried over from v1.0, still unresolved)
- Railway production backend (`@iseyaa/backend` in project `lucid-flexibility`) was found 2026-07-24 running a build frozen at Phase 9 (commit `243ebcb5`, ~2 months / 100+ commits stale) because the service had a custom Start Command override (`npm run start`) that bypassed the Dockerfile's `start.sh` entrypoint — silently skipping `prisma migrate deploy` on every deploy. Fixed by clearing the override and redeploying from `main` (`9ca7954`); migrations now run correctly on deploy. Watch for schema-drift symptoms again if this override reappears.
- Twilio SMS is on a trial account (error 21608: can only send to manually-verified numbers) — not viable for real users. Termii is the intended primary SMS provider (`TERMII_API_KEY` was just added 2026-07-24) but Termii calls are still failing fast via the `termiiAuth` resilience timeout (5s) while the account is mid-activation — revisit once Termii activation completes.
- SendGrid permanently declined account activation; `SendgridService` (2026-07-24, quick task 260724-hon) is now code-complete against the Resend SDK, but a real `RESEND_API_KEY` still needs to be provisioned (resend.com → API Keys) and set in production (Railway) before transactional email actually sends — until then the service degrades gracefully rather than crashing. Resend also requires a verified sending domain (SPF/DKIM) for `noreply@iseyaa.gov.ng`, same as SendGrid required; see `MANUAL-ACTIONS.md`.
- 2026-07-27, quick task 260727-8v6: the executor's `isolation="worktree"` agent was created from a stale pre-session base commit (`ffe4282`) instead of the intended current-HEAD commit passed via `EXPECTED_BASE`, despite the plan's embedded worktree-branch-base-correction check — the check's `git reset --hard` step apparently did not fire or did not persist. Caught before merging by comparing `git merge-base` against the expected commit; resolved via a manual dry-run merge (`git merge --no-commit --no-ff`) plus a full backend test/typecheck pass to confirm no earlier work was lost. Watch for this recurring on future worktree-isolated quick tasks — if it does, the base-correction step in `quick.md`'s worktree_branch_check may need a more robust fix upstream. (Note: on the very next worktree-isolated quick task, 260727-aym, the same check correctly self-corrected a similar stale-base mismatch before any edits — so the check does work at least sometimes; the failure mode above may be intermittent rather than systemic.)
- 2026-07-27, mobile completeness audit (ad-hoc, prompted by user catching the missing email-registration screen) — user directed fixing ALL of it plus a fresh re-audit afterward; actively being worked through as a sequence of quick tasks this same session: (1) forgot/change-password + logout revocation — DONE, 260727-bgr; (2) profile-edit + avatar + account deletion — DONE, 260727-bhw; (3) driver/rider dashboard reachability + become-driver endpoint — in progress, 260727-bph; (4) host dashboard — investigated (deeper than expected: `RolesGuard` checks the single active `role`, not `registeredRoles[]`, so a host who switched active role away needs to switch back before create/edit works; `CreatePropertyDto` only covers 5 of 11 `PropertyType` enum values and is missing `bookingMode`/`pricePerHour`/`membershipMonthlyPrice`/`isActive` toggle; no property-creation UI exists anywhere, web included — not yet planned/built); (5) vendor/organiser onboarding — investigated and found much larger than originally scoped: zero mobile UI exists for a vendor to manage products or an organiser to manage events even though all backend CRUD endpoints already exist; user explicitly confirmed building the full management suite (product/event CRUD, image upload, order fulfillment, submit-for-approval, analytics), not just the application step — not yet planned/built. Minor items from the original audit not yet actioned: wallet withdraw-to-bank stub, email verification step for email-registered accounts.

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260716-lbl | Fix deleteOutDir/tsbuildinfo stale-cache race and root .env not loading in backend dev bootstrap | 2026-07-16 | 5bd04f4 | [260716-lbl-fix-deleteoutdir-tsbuildinfo-stale-cache](./quick/260716-lbl-fix-deleteoutdir-tsbuildinfo-stale-cache/) |
| 260720-qth | Correct README.md inaccuracies against current codebase (stale monolith description, missing microservices/gRPC architecture) | 2026-07-21 | 2e88e78 | [260720-qth-correct-readme-md-inaccuracies-against-c](./quick/260720-qth-correct-readme-md-inaccuracies-against-c/) |
| 260722-qdl | Fix NDPA consent compliance gap in phone-OTP mobile signup flow (auth.service.ts phoneAuth hardcoded ndpaConsent:true with no real consent collection; added ndpaConsent field to PhoneAuthDto + mobile consent checkbox) | 2026-07-22 | a87dba5 | [260722-qdl-fix-ndpa-consent-compliance-gap-in-phone](./quick/260722-qdl-fix-ndpa-consent-compliance-gap-in-phone/) |
| 260723-mobile-alert-crash-fix | Fix remaining Alert.alert/text-render native crash sites from array-typed ValidationPipe error messages (UnexpectedNativeTypeException) across 8 mobile screens, routed through existing getErrorMessage() helper | 2026-07-23 | 8d03de2 | [260723-mobile-alert-crash-fix](./quick/260723-mobile-alert-crash-fix/) |
| 260723-fnm | Virtualize the Discover tab attractions grid with FlatList instead of a plain View+.map() to fix perf/lazy-loading | 2026-07-23 | c22b8c3 | [260723-fnm-virtualize-the-discover-tab-attractions-](./quick/260723-fnm-virtualize-the-discover-tab-attractions-/) |
| 260723-gik | Fix wallet Send screen missing required idempotencyKey field causing guaranteed HTTP 400 on every transfer | 2026-07-23 | 7f844de | [260723-gik-fix-wallet-send-screen-missing-required-](./quick/260723-gik-fix-wallet-send-screen-missing-required-/) |
| 260724-cfd | Fix SendGrid email dispatch broken by namespace import stripping prototype methods (sgMail.send is not a function) — breaks all transactional email including OTP, ticket/booking confirmations, ministry digests | 2026-07-24 | fe98ff9 | [260724-cfd-fix-sendgrid-email-dispatch-broken-by-na](./quick/260724-cfd-fix-sendgrid-email-dispatch-broken-by-na/) |
| 260724-hon | SendGrid permanently declined account activation — migrate SendgridService internals from @sendgrid/mail to Resend SDK (resend@^6.18.0), preserving class name, all 5 public method signatures, and each method's throw-vs-swallow contract (SMS fallback / FAILED-status tracking depend on it) | 2026-07-24 | 9bcd9b4 | [260724-hon-migrate-sendgridservice-s-internals-from](./quick/260724-hon-migrate-sendgridservice-s-internals-from/) |
| 260726-riy | Add mobile email+password sign-in screen and verify web email login end-to-end — web NextAuth credentials flow confirmed working against a live backend (no changes needed); added mobile/app/auth/email.tsx wired to POST /auth/login, reachable from onboarding.tsx, registered in _layout.tsx | 2026-07-27 | 6b4eb3c | [260726-riy-add-mobile-email-sign-in-screen-and-veri](./quick/260726-riy-add-mobile-email-sign-in-screen-and-veri/) |
| 260727-6nh | Wire real reservation logic into events/stays gRPC controllers (extended proto contracts with email/guests/Paystack fields, imported EventsModule/StaysModule+KafkaModule into their gRPC microservices, delegated ReserveTicket/CreateBooking to the real EventsService/StaysService with exception-safe mapping) and build the missing event-approval workflow (organizer submitForApproval, admin updateEventStatus, admin-grpc ApproveItem wiring) — followup to an ad-hoc whole-codebase bug-sweep workflow (9 commits, 21 of 25 confirmed bugs fixed, not tracked in this table) that intentionally deferred these two items as needing design decisions | 2026-07-27 | ce0eaa4 | [260727-6nh-wire-real-reservation-logic-into-events-](./quick/260727-6nh-wire-real-reservation-logic-into-events-/) |
| 260727-8v6 | Add vendor product image upload (POST /products/:id/images, reuses ImageService.resizeProduct + S3Service, vendor-ownership gated) and admin attraction image upload (POST admin/attractions/:id/images, role-gated only — attractions have no creator field); wire mobile to display real photos (events detail hero, events list cards, Discover attraction cards) via expo-image with gradient fallback; configure Android notification icon (placeholder asset + app.json plugin config) — closes the remaining two gaps from the design-team asset brief. Executor worktree was found based on a stale pre-session commit (ffe4282) rather than current HEAD; verified via manual dry-run merge + full backend suite (886 tests) before committing | 2026-07-27 | 9a7edbe | [260727-8v6-build-marketplace-tourism-image-upload-e](./quick/260727-8v6-build-marketplace-tourism-image-upload-e/) |
| 260727-aym | Add mobile email+password registration screen (mobile/app/auth/register.tsx) — user pointed out email.tsx (built earlier same day) only supported sign-in for existing users, no way to create a new account via email on mobile (only phone/OTP auto-registers). New screen collects firstName/lastName/email/phone/password + NDPA consent checkbox, posts to the already-complete POST /auth/register, stores tokens on success; linked from onboarding.tsx and email.tsx. Followed by a mobile completeness audit — see Blockers/Concerns for the ongoing fix sequence | 2026-07-27 | 732a4a9 | [260727-aym-add-mobile-email-password-registration-s](./quick/260727-aym-add-mobile-email-password-registration-s/) |
| 260727-bhw | Add mobile Edit Profile screen (mobile/app/profile-edit.tsx) — firstName/lastName editing via existing PATCH /users/me, avatar picker+upload via expo-image-picker + existing POST /users/me/avatar, AvatarRing updated to render the real photo with initials fallback; and a visually-separated, explicitly-confirmed "Danger Zone" account-deletion action on the Profile tab calling the existing DELETE /users/me/data (NDPA right-to-erasure), best-effort revoking the refresh token then clearing local session and returning to onboarding. No backend changes — both endpoints were already complete | 2026-07-27 | 46f19c6 | [260727-bhw-add-mobile-profile-edit-screen-with-avat](./quick/260727-bhw-add-mobile-profile-edit-screen-with-avat/) |
| 260727-bgr | Add phone-OTP password recovery (POST /auth/reset-password, new shared consumeValidOtp helper extracted from verifyOtp, byte-identical behavior preserved), change-password while logged in (PATCH /users/me/password), and server-side logout revocation (mobile now calls POST /auth/logout with the stored refresh token before clearing SecureStore). New mobile screens: auth/forgot-password.tsx, auth/reset-password.tsx, change-password.tsx. Real merge conflicts against 260727-bhw in profile.tsx/_layout.tsx (both touched the same import lines and icon list) resolved manually — both features' additions verified coexisting via grep + full 894-test backend suite + mobile tsc | 2026-07-27 | 336e3ff | [260727-bgr-add-password-recovery-via-phone-otp-chan](./quick/260727-bgr-add-password-recovery-via-phone-otp-chan/) |
| 260727-bph | Add POST /users/me/become-driver (mirrors becomeHost exactly — DRIVER wasn't in REGISTERABLE_ROLES and had no self-service grant path, a chicken-and-egg gap since POST /transport/drivers itself required the DRIVER role to already exist). New mobile/app/driver-application.tsx (licence + vehicle form, chains POST /transport/drivers → POST /transport/drivers/:id/vehicles). profile.tsx rewired with 4 mutually-exclusive driver states (become-driver CTA → complete-application CTA → pending-review card → real go-online/offline toggle wired to /transport/go-online|offline, replacing a local-only UI flip) plus a driver-dashboard link and a new "My Rides" menu row reaching the previously-unreachable rider-dashboard.tsx. Third consecutive real merge conflict in profile.tsx/_layout.tsx against Tasks 1+2, resolved manually — all three tasks' additions verified coexisting, full 897-test backend suite + both tsc clean | 2026-07-27 | 9c0fb53 | [260727-bph-fix-driver-and-rider-dashboard-reachabil](./quick/260727-bph-fix-driver-and-rider-dashboard-reachabil/) |
| 260727-c0m | Build a real host dashboard, replacing host.tsx's "Coming soon" stub — no property-creation UI existed anywhere in the app (mobile or web) before this. New backend: GET /properties/mine (host-scoped, deliberately no isActive filter so paused listings show), GET /properties/:id/bookings (ownership-checked, ForbiddenException on mismatch); CreatePropertyDto/UpdatePropertyDto now import PropertyType/BookingMode from @prisma/client (all 11/4 values, was hand-copied to only 5) plus bookingMode/pricePerHour/membershipMonthlyPrice/highlights/category/coverImageUrl/isActive. New mobile screens: host-dashboard.tsx, property-create.tsx, property-edit/[id].tsx, property-bookings/[id].tsx, all gated on a silent ensureHostRole reconciliation (RolesGuard checks active role not registeredRoles[], so a host who switched roles elsewhere would otherwise 403). Clean auto-merge, no conflicts — full 904-test backend suite + both tsc clean | 2026-07-27 | d889e79 | [260727-c0m-build-a-real-host-dashboard-with-propert](./quick/260727-c0m-build-a-real-host-dashboard-with-propert/) |

## Deferred Items

Items acknowledged and carried forward from previous milestone close. GRPC-06/07/08, MIN-08/09, and SETTLE-10/11 (previously listed here as "Deferred to v2") are no longer deferred — they are now active v2.1 scope, see Phases 18-22 above.

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| v1.0 checkpoints | 8 unfiled human-verification checkpoints (02-06, 03-08, 04-08, 05-07, 06-06, 07-05, 08-10, 09-13) | Deferred, not blocking v2.1 close | 2026-07-15 |
| RESIL-02 | Live Grafana/Sentry dashboard confirmation of a real vendor outage — code-level wiring/sanitization independently verified, only the live-pipeline human check remains open | Deferred, not blocking v2.1 close | 2026-07-19 |
| v1.0 checkpoint | Phase 05 (AI Concierge + KYC) human-verification checkpoint (05-07) still unfiled — `05-VERIFICATION.md` status `human_needed` | Deferred, pre-existing v1.0 debt | 2026-07-19 |
| v2.0 hygiene | Phase 11 `11-VERIFICATION.md` record still reads stale `gaps_found`; its sole gap (secret-leak in `onBreak()` logging) is independently confirmed fixed in source (commit `b0fcb3c`) and closed in same-day `11-SECURITY.md` — record itself needs a re-run for hygiene, not a live defect | Deferred, not blocking v2.1 close | 2026-07-19 |
| Phase 15 human UAT | Live WhatsApp OTP delivery via approved Meta WABA template — blocked on stakeholder Meta Business Manager template approval, not code | Deferred, not blocking v2.1 close | 2026-07-19 |
| Phase 15 human UAT | On-device visual/UX check of 3 new mobile screens (phone.tsx picker, otp.tsx fallback banner, otp-channel-settings.tsx) | Deferred, not blocking v2.1 close | 2026-07-19 |
| Quick tasks | 4 quick tasks (260713-bx6, 260713-daq, 260716-lbl, 260720-qth) have SUMMARY.md filed but flagged "missing" status by the audit tool — bookkeeping only, work is complete | Deferred, not blocking v2.1 close | 2026-07-21 |
| Tooling todos | 2 pending todo files (add-compile-step-to-packages-proto, wire-resiliencemodule-into-grpc-service-scaffolds) — both describe INT-01/INT-02, already resolved by Phase 16/17 per their own SUMMARY/VERIFICATION records; todo files themselves not marked complete | Deferred, not blocking v2.1 close | 2026-07-19 |
| Phase 19 human UAT | `19-HUMAN-UAT.md` partial — 2 pending scenarios: CR-02 migration deployment to staging/production unconfirmed, and a residual code-unreachable platform-row variant of the money-conservation bug class risk-accepted rather than gap-closed | Deferred, not blocking v2.1 close | 2026-07-21 |
| Phase 20 human UAT | `20-HUMAN-UAT.md` partial — 3 pending scenarios requiring a live Railway deployment: healthcheck actually blocking promotion, concurrent-replica cron dedup, full live cutover + rollback rehearsal — pre-scoped as manual-only during planning, not discovered gaps | Deferred, not blocking v2.1 close | 2026-07-21 |
| Phase 21 human UAT | `21-HUMAN-UAT.md` partial — 2 pending scenarios: D-08 sizing-gate SQL re-check and a live end-to-end smoke test of the CR-01/CR-02 fix against a running deployment | Deferred, not blocking v2.1 close | 2026-07-21 |
| Phase 22 code review | `22-REVIEW.md` flagged 4 non-blocking warnings: scheduler failure-path status write isn't itself guarded (could abort remaining due-subscription loop and double-send), digest CSV has no formula-injection guard on free-text fields, `setNx()` fails open on Redis errors, heatmap's "Unknown"-LGA bucket folds into color-scale max but never renders | Deferred, not blocking v2.1 close — candidate for a follow-up pass | 2026-07-21 |

## Session Continuity

Last session: 2026-07-24T18:19:29Z
Stopped at: Completed quick task 260724-hon-migrate-sendgridservice-s-internals-from
Resume file: none — next step is defining the next milestone

## Operator Next Steps

- Start the next milestone with `/gsd-new-milestone` (questioning → research → requirements → roadmap)
