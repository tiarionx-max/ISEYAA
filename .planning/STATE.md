---
gsd_state_version: 1.0
milestone: v2.1
milestone_name: — Extraction Backlog Clearance & Settlement Flexibility
status: ready_to_plan
stopped_at: Phase 20 context gathered
last_updated: "2026-07-20T19:12:25.593Z"
last_activity: 2026-07-20 -- Phase 20 execution started
progress:
  total_phases: 5
  completed_phases: 3
  total_plans: 15
  completed_plans: 10
  percent: 60
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-07-19)

**Core value:** A tourist in Abeokuta can discover an attraction, book a guesthouse, buy an event ticket, and request a ride — all paid through one wallet — and the government analyst sees the revenue in real time.
**Current focus:** Phase 20 — grpc-blue-green-healthcheck-retrofit

## Current Position

Phase: 21
Plan: Not started
Status: Ready to plan
Last activity: 2026-07-20

Progress: [░░░░░░░░░░] 0%

## Current Status

- Phases 1-9 (v1.0): substantially shipped — see PROJECT.md Validated section; 8 human-verification checkpoints remain unfiled deferred debt, not blocking v2.1
- Phases 10-17 (v2.0): COMPLETE — shipped 2026-07-19, see PROJECT.md Validated section and `milestones/v2.0-ROADMAP.md`
- Phase 18: Settlement Split Centralization — NOT STARTED (SETTLE-11a, SETTLE-11b, SETTLE-11c, SETTLE-11d)
- Phase 19: Settlement Dispute & Adjustment Workflow — NOT STARTED (SETTLE-10a, SETTLE-10b, SETTLE-10c, SETTLE-10d, SETTLE-10e; depends on Phase 18)
- Phase 20: gRPC Blue-Green Healthcheck Retrofit — NOT STARTED (GRPC-06a, GRPC-06b, GRPC-06c)
- Phase 21: Low-Risk gRPC Extraction — News/Waitlist/Reviews + Scoped Delivery OTP — NOT STARTED (GRPC-07, GRPC-08; depends on Phase 20)
- Phase 22: Scheduled Ministry Exports & LGA Heatmap — NOT STARTED (MIN-08a, MIN-08b, MIN-08c, MIN-09; depends on Phase 20)

## Performance Metrics

**Velocity:**

- Total plans completed: 69 (v2.0 closed; v2.1 not yet started)
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

- **Docker build fix before further live extraction:** `docker build` fails for all 8 `apps/*-service` images with `TS2307: Cannot find module '@iseyaa/proto'` — `backend/package.json` never declares `@iseyaa/proto`, so the image's scoped `npm ci` never links it. Relevant again for Phase 20/21's new service scaffolds. See `.planning/phases/10-documentation-correction-grpc-build-fix/10-VERIFICATION.md`.

### Blockers/Concerns

- v1.0's 8 outstanding human-verification checkpoints remain deferred — do not run any milestone-archival step against `.planning/phases/02-09` without re-confirming with the user first
- **Research gaps requiring explicit design/product decisions during phase planning (not resolvable from code alone):**
  - Phase 19 (SETTLE-10 dispute/adjustment): the exact dispute-workflow schema and insufficient-balance clawback policy (block-and-flag vs. tracked negative vs. platform-wallet absorption) is a compliance/product decision — needs explicit design-doc sign-off before implementation, flagged MEDIUM confidence by research
  - Phase 21 (GRPC-07/08 extraction): the "remaining core modules" second half of GRPC-07 needs a fresh wallet/gateway coupling audit per module before claiming any of Events/Stays/Marketplace/Studio is a clean extraction candidate — all four call `SettlementService.settle()` directly; candidates for the slot are read-mostly services (admin-service/ai-service scaffolds), not confirmed
  - Phase 22 (MIN-09 heatmap): point-density grid vs. true LGA-boundary choropleth needs an explicit stakeholder conversation before implementation estimate is finalized — no LGA boundary GeoJSON exists in the schema today
- Live Paystack secret key (`sk_live_...`) present in `backend/.env` / root `.env` — recommend rotating to test-mode keys for local/CI use (carried over from v1.0, still unresolved)

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260716-lbl | Fix deleteOutDir/tsbuildinfo stale-cache race and root .env not loading in backend dev bootstrap | 2026-07-16 | 5bd04f4 | [260716-lbl-fix-deleteoutdir-tsbuildinfo-stale-cache](./quick/260716-lbl-fix-deleteoutdir-tsbuildinfo-stale-cache/) |

## Deferred Items

Items acknowledged and carried forward from previous milestone close. GRPC-06/07/08, MIN-08/09, and SETTLE-10/11 (previously listed here as "Deferred to v2") are no longer deferred — they are now active v2.1 scope, see Phases 18-22 above.

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| v1.0 checkpoints | 8 unfiled human-verification checkpoints (02-06, 03-08, 04-08, 05-07, 06-06, 07-05, 08-10, 09-13) | Deferred, not blocking v2.1 | 2026-07-15 |
| RESIL-02 | Live Grafana/Sentry dashboard confirmation of a real vendor outage — code-level wiring/sanitization independently verified, only the live-pipeline human check remains open | Deferred, not blocking v2.1 | 2026-07-19 |
| v1.0 checkpoint | Phase 05 (AI Concierge + KYC) human-verification checkpoint (05-07) still unfiled — `05-VERIFICATION.md` status `human_needed` | Deferred, pre-existing v1.0 debt | 2026-07-19 |
| v2.0 hygiene | Phase 11 `11-VERIFICATION.md` record still reads stale `gaps_found`; its sole gap (secret-leak in `onBreak()` logging) is independently confirmed fixed in source (commit `b0fcb3c`) and closed in same-day `11-SECURITY.md` — record itself needs a re-run for hygiene, not a live defect | Deferred, not blocking v2.1 | 2026-07-19 |
| Phase 15 human UAT | Live WhatsApp OTP delivery via approved Meta WABA template — blocked on stakeholder Meta Business Manager template approval, not code | Deferred, not blocking v2.1 | 2026-07-19 |
| Phase 15 human UAT | On-device visual/UX check of 3 new mobile screens (phone.tsx picker, otp.tsx fallback banner, otp-channel-settings.tsx) | Deferred, not blocking v2.1 | 2026-07-19 |
| Quick tasks | 3 pre-v2.0 quick tasks (260713-bx6, 260713-daq, 260716-lbl) have SUMMARY.md filed but flagged "missing" status by the audit tool — bookkeeping only, work is complete | Deferred, not blocking v2.1 | 2026-07-19 |
| Tooling todos | 2 pending todo files (add-compile-step-to-packages-proto, wire-resiliencemodule-into-grpc-service-scaffolds) — both describe INT-01/INT-02, already resolved by Phase 16/17 per their own SUMMARY/VERIFICATION records; todo files themselves not marked complete | Deferred, not blocking v2.1 | 2026-07-19 |

## Session Continuity

Last session: 2026-07-20T17:03:49.075Z
Stopped at: Phase 20 context gathered
Resume file: .planning/phases/20-grpc-blue-green-healthcheck-retrofit/20-CONTEXT.md

## Operator Next Steps

- Run `/gsd-plan-phase 18` to begin planning Settlement Split Centralization
