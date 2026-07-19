# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v2.0 — Microservices, Multi-Channel Auth & Government Partnership

**Shipped:** 2026-07-19
**Phases:** 8 (10-17) | **Plans:** 54 | **Timeline:** 2026-07-15 → 2026-07-19 (5 days)

### What Was Built
- Corrected the false "8 services extracted" documentation claim and fixed the build for all 8 `backend/apps/*-service` gRPC scaffolds, authoring `.proto` contracts for the 7 previously-unstubbed modules
- Circuit-breaker + retry + timeout + fallback resilience (`cockatiel`) wrapped around every external vendor call (Paystack, Termii, Anthropic, Cloudflare R2/S3, Firebase FCM)
- A generalized `SettlementService` + standing Ministry wallet, fixing two pre-existing revenue bugs (Stays' zero-fee escrow leak, missing Marketplace/Events/Studio settlement consumers)
- Transport and Delivery's live payouts cut over to a three-way (vendor/rider, Ministry, platform) settlement split, shadow-mode verified with zero discrepancy before cutover
- A `MINISTRY_VIEWER` read-only dashboard: visitor counts by LGA/time, purpose-of-visit breakdown, revenue-to-government-share, CSV/branded-PDF export, zero row-level PII
- Multi-channel OTP (WhatsApp/Email/SMS) selectable at registration with automatic bounded-timeout SMS fallback and per-identity brute-force lockout unbypassable by channel switching
- Pooled Neon connections for every Prisma client plus a combined-topology load test proving headroom under Neon's connection ceiling
- The first genuinely live gRPC extraction (`notifications-service`, own Railway process, called via `ClientGrpc`) with zero REST behavior change for web/mobile clients — proving the extraction pattern before repeating it on other modules

### What Worked
- Shadow-mode dual-run comparison before flipping any live cutover flag (Phase 13) — driver/rider payout amounts were mathematically proven identical before either `settlement_engine_enabled` flag could go live, eliminating the risk of a silent payout regression
- Picking the lowest-blast-radius service (`notifications-service`, not Transport) as the first live gRPC extraction target proved the pattern without touching any wallet-adjacent code path
- The documented caller-graph audit gating extraction (GRPC-04) caught real in-process dependencies before cutover, not after
- Re-verification loops caught real regressions that a single verification pass missed: Phase 17's gap closure caught a silently-hardcoded `success: true` on real send failures; Phase 14's caught a date-range off-by-one and a PDF row-overlap bug — both via independent source re-reads, not by trusting prior SUMMARY.md claims
- Sequencing settlement generalization (Phase 12) ahead of the gRPC extraction (Phase 17) meant the extraction phase already knew which modules had to stay in-process, instead of discovering that constraint mid-extraction

### What Was Inefficient
- `REQUIREMENTS.md`'s checkboxes and traceability table repeatedly drifted stale relative to the actual `VERIFICATION.md` status — GRPC-04/GRPC-05 and all 7 MIN-* rows still read "Pending" despite their owning phases' verification reports independently confirming SATISFIED, weeks apart in two separate instances. Required manual reconciliation at milestone close instead of being caught as each phase closed.
- `STATE.md`'s narrative "Current Status" section went stale and self-contradicted its own frontmatter (`completed_phases` count) for at least one full phase cycle — flagged by the mid-milestone audit but not fixed until this close.
- Phase 11's `11-VERIFICATION.md` sat at a stale `gaps_found` status for the rest of the milestone after its sole blocking gap was fixed in source (commit `b0fcb3c`) and closed same-day in `11-SECURITY.md` — the verification record itself was never re-run to match.
- Several completed artifacts (Phase 14's gap-closure re-verification + human UAT, Phase 15-17's `PATTERNS.md` files) were generated during execution but left uncommitted until the milestone-close audit surfaced them.

### Patterns Established
- Shadow-mode dual-run comparison as the standard, non-negotiable gate before any live cutover of money-moving logic — proven in Phase 13, should be the default for any future settlement/payout change
- Resilience-first, extraction-second sequencing: wrap vendor calls in circuit breakers (Phase 11) before attempting any service split (Phase 17), so the extracted service inherits resilience rather than needing it retrofitted
- A generalized, reusable settlement engine (`SettlementService` in `CommonModule`) proven against 5+ independent callers (Tour, Marketplace, Events, Studio, Stays) before either Transport or Delivery's live payouts touched it

### Key Lessons
1. Update `REQUIREMENTS.md` checkboxes and the traceability table in the same commit that a `VERIFICATION.md` flips a requirement to SATISFIED — don't let it drift until milestone close, where it becomes a bulk manual reconciliation task instead of a one-line diff.
2. Re-run `VERIFICATION.md` (not just fix the source) whenever a blocking gap closes, so the verification record itself never contradicts the codebase it describes — a stale `gaps_found` record is indistinguishable from a real unresolved gap to anyone reading it later.
3. Commit phase artifacts (pattern docs, gap-closure verification/UAT updates) as each plan completes rather than batching them until milestone close — they're easy to lose track of and the milestone-close audit shouldn't be the first time they're discovered uncommitted.

### Cost Observations
- Model mix: not tracked this milestone
- Sessions: not tracked this milestone
- Notable: 2 re-verification rounds (Phase 14, Phase 17) each closed a real BLOCKER-severity gap that a single verification pass missed — the cost of the extra round was small relative to the cost of shipping either defect (a silently-wrong Ministry PDF export, a silently-lying gRPC health signal)

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Sessions | Phases | Key Change |
|-----------|----------|--------|------------|
| v1.0 | - | 9 | Initial MVP; several human-verification checkpoints left unfiled at milestone boundary (carried forward as deferred debt) |
| v2.0 | - | 8 (10-17) | First milestone run through `/gsd-complete-milestone`; introduced re-verification-after-gap-closure as a standard step, shadow-mode verification before live cutovers |

### Cumulative Quality

| Milestone | Tests | Coverage | Zero-Dep Additions |
|-----------|-------|----------|-------------------|
| v1.0 | 153 | - | - |
| v2.0 | 619 (backend) + mobile smoke tests | - | `cockatiel` (resilience) |

### Top Lessons (Verified Across Milestones)

1. Unfiled human-verification checkpoints accumulate as debt across milestones (8 from v1.0 still open; v2.0 added 2 more via Phase 15's WhatsApp template/visual checks) — worth a dedicated cleanup pass rather than perpetual carry-forward.
2. Documentation bookkeeping (REQUIREMENTS.md checkboxes, STATE.md narrative sections) needs to be updated at the same time as the underlying verification, not reconciled retroactively — this pattern repeated across both v1.0 and v2.0.
