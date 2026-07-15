---
gsd_state_version: 1.0
milestone: v2.0
milestone_name: Microservices, Multi-Channel Auth & Government Partnership
status: planning
last_updated: "2026-07-15T20:02:03.696Z"
last_activity: 2026-07-15
progress:
  total_phases: 0
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-07-15)

**Core value:** A tourist in Abeokuta can discover an attraction, book a guesthouse, buy an event ticket, and request a ride — all paid through one wallet — and the government analyst sees the revenue in real time.
**Current focus:** v2.0 milestone — defining requirements (Microservices, Multi-Channel Auth & Government Partnership)

## Current Position

Phase: Not started (defining requirements)
Plan: —
Status: Defining requirements
Last activity: 2026-07-15 — Milestone v2.0 started

## Current Status

- Phase 1: COMPLETE (153 tests passing, all Sprint 1 modules shipped 2026-05-11)
- Phase 2: COMPLETE — 13/13 plans done (02-06 Railway deployment verified 2026-05-20)
- Phase 3: IN PROGRESS — 7/8 plans done (03-08 human checkpoint deferred)
- Phase 4: IN PROGRESS — 8/8 plans done (04-08 human checkpoint deferred)
- Phase 5: IN PROGRESS — 6/7 plans done (05-07 human checkpoint deferred, 282 tests passing)
- Phase 6: IN PROGRESS — 5/6 plans done (06-06 human checkpoint pending)
- Phase 7: PLANNED — 5 plans ready to execute (Wave 1: EAS build setup runs immediately)
- Phase 8: IN PROGRESS — 8/11 plans done. Waves 1+2+3 complete & pushed to origin (commit 56ba553). 08-08 (Wave 4, stay detail) blocked on rate limit. 08-09 (EAS build) + 08-10 (verification) are human checkpoints.

### Phase 8 plan ledger

- [x] 08-01 — Foundations (deps + tokens + category-config + cart-store mirroring web/src/lib/cart.ts)
- [x] 08-02 — UI primitives (NewsTicker + PressableScale + CategoryStrip + Chip)
- [x] 08-03 — Discover NewsTicker insertion (slim additive edit)
- [x] 08-04 — Delete 7 legacy tabs + strip hidden Tabs.Screen entries (5-tab final)
- [x] 08-04b — Pre-register marketplace/[id], cart, checkout, host Stack routes
- [x] 08-05 — Book hub 4-pane (Events migrated + Stays + Studio placeholder + Marketplace)
- [x] 08-06 — Product detail + cart drawer + checkout (POST /api/v1/orders — email-only per backend contract)
- [x] 08-07 — Host onboarding screen + profile CTA (POST /api/v1/users/me/become-host)
- [ ] 08-08 — Stay detail rewrite (4-image gallery + 4 mode-aware booking sheets → POST /api/v1/properties/:id/bookings) **BLOCKED — RATE LIMIT**
- [ ] 08-09 — EAS preview build (human checkpoint — operator runs `eas build --platform android --profile preview`)
- [ ] 08-10 — Phase 8 human verification checkpoint (8 SCs)

### Known pre-existing deferred items (tracked in .planning/phases/08-mobile-redesign/deferred-items.md)

- `@sentry/react-native` typecheck error in `mobile/app/_layout.tsx` (unrelated to Phase 8, pre-existed before plan dispatch)
- Worktree-side `expo-image` / `expo-web-browser` typecheck noise is `node_modules`-related, not project-code (verified)

## Performance Metrics

**Velocity:**

- Total plans completed: 0 (Sprint 2+ not yet started)
- Average duration: -
- Total execution time: -

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| - | - | - | - |

*Updated after each plan completion*
| Phase 03-transport-module P01 | 35 | 3 tasks | 6 files |
| Phase 03-transport-module P02 | 10m | 2 tasks | 1 files |
| Phase 03-transport-module P03 | 15m | 3 tasks | 8 files |
| Phase 03-transport-module P04 | 15m | 1 tasks | 2 files |
| Phase 04-delivery-module P02 | 2m | 2 tasks | 1 files |
| Phase 04-delivery-module P03 | 12 | 2 tasks | 8 files |
| Phase 04-delivery-module P04 | 5m | 1 tasks | 2 files |
| Phase 04-delivery-module P05 | 18m | 2 tasks | 5 files |
| Phase 04-delivery-module P06 | 3m | 2 tasks | 3 files |
| Phase 04-delivery-module P07 | 25m | 1 tasks | 1 files |
| Phase 06-qa-security-performance P01 | 2min | 2 tasks | 4 files |
| Phase 06-qa-security-performance P02 | 5min | 2 tasks | 7 files |
| Phase 07-deployment-launch P01 | 5m | 3 tasks | 4 files |

## Accumulated Context

### Decisions

Key decisions logged in PROJECT.md. Decisions affecting current Phase 2 work:

- **Free-first stack**: Neon + Upstash (Redis + Vector + Kafka) + Cloudflare R2 + Railway + Infisical + Grafana Cloud replaces AWS stack (~$11/mo vs ~$600/mo)
- **Microservices with gRPC**: NestJS monolith decomposed into independent services; REST remains the external API surface
- **Typesense over Elasticsearch**: Open source, no JVM, built-in geo-search, typo-tolerant; self-hosted on Railway
- **EventEmitter2 → Upstash Kafka**: Cross-service payment events need a durable bus after monolith decomposition
- [Phase ?]: TransportService plan 04 implementation
- [Phase ?]: Consistent with driver.tsx Alert pattern

### Pending Todos

None yet.

### Blockers/Concerns

- CONCERNS.md flags several issues to address during Phase 6 (QA): escrow release uses `checkIn` not `checkOut` cutoff (bug), marketplace stock not decremented on order, webhook Paystack payment not server-side verified before crediting wallet, Firebase legacy FCM API deprecated
- Admin `getRevenue()` raw SQL references non-existent `vendors.category` column — will 500 until fixed
- NIN and BVN stored plaintext in Sprint 1; Phase 5 KYC work must migrate to AES-256-GCM encryption
- Swagger UI exposed without auth in production — must gate before Phase 7 launch
- **CRITICAL (found 2026-07-13 E2E audit):** Phase 9 migration `20260623120000_phase9_tour_packages` contained a subquery inside a CHECK constraint — invalid Postgres SQL that rolled back the entire migration on every apply attempt. None of the 6 Phase 9 tables ever existed in any environment where `prisma migrate deploy` ran (very possibly including production/Railway), despite ROADMAP.md marking Phase 9 complete. Fixed via quick task 260713-bx6 (see Quick Tasks Completed below) — verify this reaches the production database before trusting any live Phase 9 data.
- ~~Web (`web/`) and Mobile (`mobile/`) have **zero test files**~~ — **RESOLVED 2026-07-13 via quick task 260713-daq**: `web/` now has a working `npm test` (next/jest, 4 passing smoke tests) and `mobile/` `npm test` now discovers and runs tests (jest-expo preset, 6 passing smoke tests). Smoke-level coverage only, not comprehensive — cart math + one component render on web, cart math + query-string builders on mobile.
- **NEW (found 2026-07-13, quick task 260713-daq):** `e2e-tour-booking.e2e-spec.ts` Steps 7-11 (5/17 tests) fail due to a real dependency on live Paystack API network connectivity, which is unreliable from the sandboxed agent environment used to run this task (confirmed via debug logging: intermittent TLS socket disconnects and Paystack-side validation responses, not application bugs). Steps 1-6 were fixed and now pass deterministically (12/17 total, up from 6/17). A human operator with reliable network egress to `api.paystack.co` (e.g. the Railway deployment) should re-run the full suite to confirm true 17/17.
- **NEW (found 2026-07-13, quick task 260713-daq):** `backend/.env` (and root `.env`) contain a **live** Paystack secret key (`sk_live_...`), not a test-mode key. Local/E2E test runs are hitting Paystack's production API. Predates this quick task; recommend rotating to test-mode keys for local/CI use.
- Most roadmap-listed human verification checkpoints (02-06, 03-08, 04-08, 05-07, 06-06, 07-05, 08-10) have no corresponding VERIFICATION.md file on disk at all. Phase 9's `09-VERIFICATION.md` exists but is a completely blank, unfilled template despite Phase 9 being marked `[x]` complete in ROADMAP.md.
- **DEFERRED (2026-07-15, milestone v2.0 kickoff):** v1.0 was never formally closed via `/gsd-complete-milestone` — by decision, its 8 outstanding human-verification checkpoints (02-06, 03-08, 04-08, 05-07, 06-06, 07-05, 08-09, 08-10) are being treated as known debt and deferred rather than blocking v2.0 work. Phase directories 02-09 remain on disk under `.planning/phases/` (not archived) — do not run `phases.clear` / any milestone-archival step against them without re-confirming with the user first, since v1.0 is still technically open.
- **CORRECTED (2026-07-15):** ROADMAP.md Phase 2 marks gRPC service extraction `[x]` complete for 8 services (02-07 through 02-10b). Code audit found zero `@GrpcMethod`/`ClientGrpc` usage in `backend/src`, a single `NestFactory.create()` in `main.ts`, and only one `backend` container in `docker-compose.yml`/`railway.toml`. The `.proto` contracts under `packages/proto/` were written but never wired up — production has run as a single monolith the whole time. This is being corrected for real in milestone v2.0.

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260713-bx6 | Fix subquery-in-CHECK-constraint bug in phase9 tour_packages migration | 2026-07-13 | fe75adc | [260713-bx6-fix-subquery-in-check-constraint-bug-in-](./quick/260713-bx6-fix-subquery-in-check-constraint-bug-in-/) |
| 260713-daq | Fix E2E app.listen bug (+ cascading JWT/fixture bugs) + add web/mobile Jest smoke tests | 2026-07-13 | d972f42, e42cc95, a34ce2b | [260713-daq-fix-e2e-tour-booking-app-listen-bug-and-](./quick/260713-daq-fix-e2e-tour-booking-app-listen-bug-and-/) |

## Phase History

- Phase 1 (Sprint 1): Auth, Users, LGAs, Tourism, Events, Stays, Marketplace, Wallet, Admin, Webhooks, AI (basic), Web, Mobile — SHIPPED 2026-05-11

## Session Continuity

Last session: 2026-05-21T02:06:53.096Z
Stopped at: Completed 06-01-PLAN.md
Resume file: None
