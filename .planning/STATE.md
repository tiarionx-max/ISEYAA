---
gsd_state_version: 1.0
milestone: v2.0
milestone_name: — Microservices, Multi-Channel Auth & Government Partnership
status: Awaiting next milestone
stopped_at: Phase 17 context gathered
last_updated: "2026-07-19T13:22:58.962Z"
last_activity: 2026-07-19 — Milestone v2.0 completed and archived
progress:
  total_phases: 8
  completed_phases: 8
  total_plans: 54
  completed_plans: 54
  percent: 100
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-07-15)

**Core value:** A tourist in Abeokuta can discover an attraction, book a guesthouse, buy an event ticket, and request a ride — all paid through one wallet — and the government analyst sees the revenue in real time.
**Current focus:** Phase 17 — grpc-proof-of-pattern-extraction-notifications-service

## Current Position

Phase: Milestone v2.0 complete
Plan: —
Status: Awaiting next milestone
Last activity: 2026-07-19 — Milestone v2.0 completed and archived

## Current Status

- Phases 1-9 (v1.0): substantially shipped — see PROJECT.md Validated section for full detail; 8 human-verification checkpoints (02-06, 03-08, 04-08, 05-07, 06-06, 07-05, 08-10, 09-13) remain unfiled and are deferred debt, not blocking v2.0
- Phase 10: Documentation Correction + gRPC Build Fix — NOT STARTED (DOC-01, GRPC-01, GRPC-02)
- Phase 11: Resilience Wrapping — NOT STARTED (RESIL-01, RESIL-02)
- Phase 12: Settlement Engine Foundation — NOT STARTED (SETTLE-01, 02, 05, 06, 07, 08)
- Phase 13: Settlement Cutover — Transport & Delivery — NOT STARTED (SETTLE-03, 04, 09; depends on Phase 12)
- Phase 14: Ministry Dashboard — COMPLETE (MIN-01 through MIN-07 satisfied; human UAT approved 2026-07-18)
- Phase 15: Multi-Channel OTP — NOT STARTED (OTP-01 through OTP-04)
- Phase 16: Connection Pooling Infrastructure — NOT STARTED (POOL-01, POOL-02; depends on Phase 10)
- Phase 17: gRPC Proof-of-Pattern Extraction (notifications-service) — GAPS FOUND (6/6 plans executed 2026-07-19; verification failed criterion 3 — gRPC SendPush silently reports success:true on real send failures; gap closure plan needed before phase can close; see 17-VERIFICATION.md)

## Performance Metrics

**Velocity:**

- Total plans completed: 24 (v2.0 not yet started)
- Average duration: -
- Total execution time: -

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 10 | 3 | - | - |
| 13 | 4 | - | - |
| 15 | 6 | - | - |
| 16 | 4 | - | - |
| 17 | 7 | - | - |

*Updated after each plan completion*
| Phase 10 P01 | 3min | 2 tasks | 1 files |
| Phase 10 P02 | 7min | 3 tasks | 18 files |
| Phase 10 P03 | 10min | 3 tasks | 26 files |

## Accumulated Context

### Decisions

Key decisions logged in PROJECT.md. Decisions affecting current v2.0 work:

- **Real gRPC microservice split, notifications-service as first live extraction target** (not Transport) — lowest blast radius, no wallet coupling, proves the pattern before repeating it
- **Wallet, Transport, Delivery, Events, Stays, Marketplace, Auth, Tour modules stay in-process this milestone** — their `SELECT FOR UPDATE` wallet transactions can't safely span a gRPC boundary without an out-of-scope outbox/saga redesign (GRPC-05)
- **Settlement generalization sequenced ahead of gRPC extraction** — determines the in-process constraint above before extraction order is locked in
- **Transport/Delivery cutover onto the new settlement engine is its own gated phase (13)**, separate from building the engine (12), with mandatory shadow-mode verification — never a big-bang swap of live payouts
- **cockatiel** chosen for resilience (retry+circuit-breaker+timeout+fallback in one dependency) over Opossum
- **Termii WhatsApp Token API reuse** preferred over direct Meta Cloud API integration — pending a support-ticket spike to confirm activation status before Phase 15 is planned in detail
- [Phase 10]: PROJECT.md required zero edits for DOC-01 audit — All four candidate lines already stated the corrected proto-only gRPC reality (zero live @GrpcMethod/ClientGrpc wiring, monolithic NestFactory.create()); only ROADMAP.md's Phase 2 success criterion 2 and 02-07-PLAN.md entry needed correction
- [Phase 10]: Widened rootDir at the per-service tsconfig.app.json level only (not shared backend/tsconfig.json) to keep the monolith's dist/main.js output path unchanged for the live Railway start:prod command — Avoids a breaking change to production deployment while fixing the TS6059 build failure across all 8 gRPC service scaffolds
- [Phase 10]: Resolved ts-proto plugin path to the .cmd shim on Windows (MINGW/MSYS/Cygwin) since protoc.exe cannot execute the POSIX shell-script bin shim via direct Win32 CreateProcess — Plan's literal command line fails on Windows dev machines with 'not a valid Win32 application'; POSIX branch left unchanged for Linux/Mac CI
- [Quick 260716-lbl]: TypeScript's incremental `tsBuildInfoFile` now lives inside `backend/dist/` (was defaulting to the project root) so nest-cli's `deleteOutDir: true` wipes it together with `dist/` on every restart — previously a stale cache outside `dist/` made tsc skip re-emitting into an empty `dist/`, crashing every second cold start with `Cannot find module dist/main`
- [Quick 260716-lbl]: `ConfigModule.forRoot()` in `backend/src/app.module.ts` now sets `envFilePath` to the repo-root `.env` (npm workspace cwd is `backend/`, which has no `.env` of its own) — local `npm run dev:backend` was silently failing the required-env-var check unless vars were manually exported; Docker Compose's `env_file: .env` path is unaffected since injected `process.env` vars always take precedence over file-loaded ones

### Pending Todos

- **Docker build fix before Phase 17 (live extraction):** `docker build` fails for all 8 `apps/*-service` images with `TS2307: Cannot find module '@iseyaa/proto'` — `backend/package.json` never declares `@iseyaa/proto`, so the image's scoped `npm ci --workspace=backend --include=workspace=shared` never links it (works locally only via the unscoped repo-root `npm install`). Pre-existing, universal defect surfaced by Phase 10 verification; out of Phase 10's `nest build` scope. Fix: declare `@iseyaa/proto` as a `backend` dependency and widen the Docker `npm ci` workspace scope. See `.planning/phases/10-documentation-correction-grpc-build-fix/10-VERIFICATION.md`.
- **INT-01 — Wire ResilienceModule into gRPC service scaffolds:** `ResilienceModule` is never imported by any of the 8 `backend/apps/*-service` scaffolds — latent today, will block Phase 17's first live extraction. See `.planning/todos/pending/2026-07-17-wire-resiliencemodule-into-grpc-service-scaffolds.md`.
- **INT-02 — Add compile step to packages/proto:** `@iseyaa/proto` has no build script; `nest build` passes via lenient tsc resolution but `require('@iseyaa/proto')` fails at real Node.js runtime. Blocks Phase 16 and Phase 17. See `.planning/todos/pending/2026-07-17-add-compile-step-to-packages-proto.md`.

### Blockers/Concerns

- v1.0's 8 outstanding human-verification checkpoints remain deferred (see PROJECT.md Context) — do not run any milestone-archival step against `.planning/phases/02-09` without re-confirming with the user first
- **Research gaps requiring a vendor/product spike before detailed planning:**
  - Phase 15 (Multi-Channel OTP): Termii WhatsApp Token API activation status is unconfirmed — needs a direct support-ticket spike before scoping in detail
  - Phase 12 (Settlement Engine Foundation): Marketplace/Events/Studio's real current settlement mechanism (if any exists outside the dead-lettered webhook path) needs a targeted code audit before implementation planning
  - Phase 14 (Ministry Dashboard): `VisitorLog.purpose` taxonomy (categories the Ministry actually wants) is undefined — needs a stakeholder conversation during Phase 14 planning
  - Ministry wallet identity (same entity as `tour.government_wallet_user_id` vs. a distinct standing wallet) needs explicit stakeholder confirmation before Phase 12's schema/config work begins
- Live Paystack secret key (`sk_live_...`) present in `backend/.env` / root `.env` — recommend rotating to test-mode keys for local/CI use (carried over from v1.0, still unresolved)

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260716-lbl | Fix deleteOutDir/tsbuildinfo stale-cache race and root .env not loading in backend dev bootstrap | 2026-07-16 | 5bd04f4 | [260716-lbl-fix-deleteoutdir-tsbuildinfo-stale-cache](./quick/260716-lbl-fix-deleteoutdir-tsbuildinfo-stale-cache/) |

## Deferred Items

Items acknowledged and carried forward from previous milestone close:

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| v1.0 checkpoints | 8 unfiled human-verification checkpoints (02-06, 03-08, 04-08, 05-07, 06-06, 07-05, 08-10, 09-13) | Deferred, not blocking v2.0 | 2026-07-15 |
| gRPC scope | Blue-green/canary deploys per extracted service (GRPC-06) | Deferred to v2 | 2026-07-15 |
| gRPC scope | Live extraction of Delivery + remaining modules beyond notifications-service (GRPC-07) | Deferred to v2 | 2026-07-15 |
| gRPC scope | Live extraction of news/waitlist/reviews (GRPC-08) | Deferred to v2 | 2026-07-15 |
| Ministry scope | Scheduled/recurring export delivery (MIN-08) | Deferred to v2 | 2026-07-15 |
| Ministry scope | Seasonal/LGA heatmap visualization (MIN-09) | Deferred to v2 | 2026-07-15 |
| Settlement scope | Dispute/adjustment workflow (SETTLE-10) | Deferred to v2 | 2026-07-15 |
| Settlement scope | Configurable per-module Ministry split tiers (SETTLE-11) | Deferred to v2 | 2026-07-15 |
| RESIL-02 | Live Grafana/Sentry dashboard confirmation of a real vendor outage — code-level wiring/sanitization independently verified, only the live-pipeline human check remains open | Deferred, not blocking v2.0 close | 2026-07-19 |
| v1.0 checkpoint | Phase 05 (AI Concierge + KYC) human-verification checkpoint (05-07) still unfiled — `05-VERIFICATION.md` status `human_needed` | Deferred, pre-existing v1.0 debt | 2026-07-19 |
| v2.0 hygiene | Phase 11 `11-VERIFICATION.md` record still reads stale `gaps_found`; its sole gap (secret-leak in `onBreak()` logging) is independently confirmed fixed in source (commit `b0fcb3c`) and closed in same-day `11-SECURITY.md` — record itself needs a re-run for hygiene, not a live defect | Deferred, not blocking v2.0 close | 2026-07-19 |
| Phase 15 human UAT | Live WhatsApp OTP delivery via approved Meta WABA template — blocked on stakeholder Meta Business Manager template approval, not code | Deferred, not blocking v2.0 close | 2026-07-19 |
| Phase 15 human UAT | On-device visual/UX check of 3 new mobile screens (phone.tsx picker, otp.tsx fallback banner, otp-channel-settings.tsx) | Deferred, not blocking v2.0 close | 2026-07-19 |
| Quick tasks | 3 pre-v2.0 quick tasks (260713-bx6, 260713-daq, 260716-lbl) have SUMMARY.md filed but flagged "missing" status by the audit tool — bookkeeping only, work is complete | Deferred, not blocking v2.0 close | 2026-07-19 |
| Tooling todos | 2 pending todo files (add-compile-step-to-packages-proto, wire-resiliencemodule-into-grpc-service-scaffolds) — both describe INT-01/INT-02, already resolved by Phase 16/17 per their own SUMMARY/VERIFICATION records; todo files themselves not marked complete | Deferred, not blocking v2.0 close | 2026-07-19 |

## Session Continuity

Last session: 2026-07-19T00:02:02.716Z
Stopped at: Phase 17 context gathered
Resume file: .planning/phases/17-grpc-proof-of-pattern-extraction-notifications-service/17-CONTEXT.md
</content>

## Operator Next Steps

- Start the next milestone with /gsd-new-milestone
