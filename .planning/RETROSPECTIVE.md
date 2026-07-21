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

## Milestone: v2.1 — Extraction Backlog Clearance & Settlement Flexibility

**Shipped:** 2026-07-21
**Phases:** 5 (18-22) | **Plans:** 27 | **Timeline:** 2026-07-19 → 2026-07-21 (3 days)

### What Was Built
- A single validated, effective-dated `SettlementSplitTier` resolver (`SettlementService.resolveSplit()`) replacing 6 duplicated inline `PlatformConfig` reads, with a `Number.isFinite()` guard rejecting NaN-corrupted config before any wallet mutation
- A `SUPER_ADMIN`-only dispute/adjustment workflow (`OPEN → IN_REVIEW → RESOLVED/DISMISSED`) over a new `SettlementDispute` model, with `SettlementService.adjust()` as an append-only compensating-transaction primitive
- A real `grpc.health.v1.Health` endpoint on every extracted gRPC service gating Railway rollout, `setNx()` distributed-lock guards on all 6 named `@Cron` jobs, and a documented blue-green cutover/rollback runbook
- Four more services extracted to live, independently-deployed gRPC processes (News, Waitlist, Reviews, Delivery's `VerifyDeliveryOtp`) following the `notifications-service` hybrid HTTP+gRPC pattern
- Scheduled Ministry export digests (CSV + branded PDF, DB-configurable cadence/recipients) and an LGA×month visitor heatmap on the Ministry dashboard, both built with zero new npm dependencies

### What Worked
- Sequencing Phase 18 (split centralization) strictly before Phase 19 (disputes) meant the dispute/adjustment resolver had exactly one source of truth for "what split should have applied" — zero rework needed when Phase 19 built on top
- Sequencing Phase 20 (healthcheck retrofit) strictly before Phase 21 (new extractions) meant every one of the 4 new services shipped with a real health endpoint from day one, instead of retrofitting it after they were already live
- Risk-ascending rollout order within Phase 21 (News → Waitlist → Reviews → Delivery OTP, each with its own canary flag and bake period) meant the riskiest extraction (Delivery OTP) benefited from 3 prior successful cutovers' worth of confidence before it shipped
- Gap-closure rounds caught real defects a single verification pass missed: Phase 18 caught a unique-constraint violation in the audit-trail update path pre-verification; Phase 19's two gap-closure rounds (19-05, 19-06) fixed a recurring money-conservation bug class in `computeAdjustmentLines()`; Phase 21's gap closure (21-08) caught a business-exception-to-503 downgrade bug that would have silently turned every 4xx business rejection into a generic 503 once canary was live

### What Was Inefficient
- The same money-conservation bug class in `computeAdjustmentLines()` (Phase 19) took two separate gap-closure rounds to fully close, plus a residual code-unreachable variant that was risk-accepted rather than fixed — a more thorough first-pass design review of the compensating-transaction math might have caught both at once
- Phase 20's D-09 circular-dependency fix in `NotificationsClientModule` blocked Wave 2 (`test:e2e:tours` bootstraps the full `AppModule`) — a dependency that wasn't visible until execution, not planning
- The Reviews/Waitlist gRPC controllers' business-exception-to-503 bug (Phase 21, CR-01/CR-02) was a pattern that `delivery-otp-grpc.controller.ts` had already gotten right earlier in the same phase — the correct pattern existed in the codebase but wasn't propagated to the later controllers until gap closure caught the divergence

### Patterns Established
- Centralize-before-extend: build the single source of truth (split resolver) before adding a workflow that depends on it (disputes), rather than the reverse
- Retrofit-before-repeat: prove the safety mechanism (health-gated blue-green) on the existing extraction before using it to gate new extractions, rather than extracting first and retrofitting safety after
- Risk-ascending staggered rollout with per-service canary flags and bake periods as the standard pattern for any batch of independent service extractions
- When one controller in a batch gets an exception-mapping pattern right, explicitly diff the other controllers in the same phase against it before considering the phase done — don't assume correctness propagates by copy-paste

### Key Lessons
1. A compensating-transaction / adjustment primitive touching money needs its balancing math reviewed as thoroughly as the original transaction primitive was — `computeAdjustmentLines()` took two gap-closure rounds where the original `settle()` needed none, suggesting the adjustment path deserves the same TDD rigor established for settlements in v2.0.
2. When multiple controllers in one phase implement the same integration pattern (e.g., wrapping business exceptions for gRPC), verify all of them against the first-correct one explicitly — don't rely on the pattern "obviously" propagating.
3. Sequencing a safety/infrastructure phase (healthcheck retrofit, split centralization) strictly before the phases that depend on it continues to pay off, exactly as v2.0's resilience-before-extraction sequencing did.

### Cost Observations
- Model mix: not tracked this milestone
- Sessions: not tracked this milestone
- Notable: 3 phases (18, 19, 21) each needed at least one gap-closure round before verification passed clean — consistent with v2.0's finding that re-verification catches real BLOCKER-severity gaps a single pass misses, at a cost small relative to shipping a money-conservation or exception-mapping defect live

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Sessions | Phases | Key Change |
|-----------|----------|--------|------------|
| v1.0 | - | 9 | Initial MVP; several human-verification checkpoints left unfiled at milestone boundary (carried forward as deferred debt) |
| v2.0 | - | 8 (10-17) | First milestone run through `/gsd-complete-milestone`; introduced re-verification-after-gap-closure as a standard step, shadow-mode verification before live cutovers |
| v2.1 | - | 5 (18-22) | 3 of 5 phases needed a gap-closure round before clean verification (18, 19, 21) — re-verification-after-gap-closure held as standard; risk-ascending staggered rollout (per-service canary + bake period) introduced for batched independent extractions |

### Cumulative Quality

| Milestone | Tests | Coverage | Zero-Dep Additions |
|-----------|-------|----------|-------------------|
| v1.0 | 153 | - | - |
| v2.0 | 619 (backend) + mobile smoke tests | - | `cockatiel` (resilience) |
| v2.1 | 800 (backend) | - | LGA×month heatmap (custom CSS-grid, no mapping dep) |

### Top Lessons (Verified Across Milestones)

1. Unfiled human-verification checkpoints accumulate as debt across milestones (8 from v1.0 still open; v2.0 added 2 more via Phase 15's WhatsApp template/visual checks; v2.1 added 7 more across Phases 19-21, all live-deployment-gated) — worth a dedicated cleanup pass rather than perpetual carry-forward.
2. Documentation bookkeeping (REQUIREMENTS.md checkboxes, STATE.md narrative sections) needs to be updated at the same time as the underlying verification, not reconciled retroactively — this pattern repeated across v1.0, v2.0, and v2.1 (STATE.md's Current Status/Performance Metrics sections were still found stale at v2.1's milestone close).
3. Money-moving compensating-transaction logic (v2.1's `computeAdjustmentLines()`) needs the same TDD rigor as the primary transaction path it corrects — it took two gap-closure rounds where the original `settle()` (v2.0) needed none.
