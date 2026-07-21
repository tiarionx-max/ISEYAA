# Milestones

## v2.1 Extraction Backlog Clearance & Settlement Flexibility (Shipped: 2026-07-21)

**Phases completed:** 5 phases, 27 plans, 63 tasks
**Timeline:** 2026-07-19 → 2026-07-21 (3 days) | 234 commits | 237 files changed (+25,713/-402 LOC)

**Key accomplishments:**

- Centralized settlement split configuration into one validated `SettlementSplitTier` resolver (`resolveSplit()`), replacing 6 duplicated inline `PlatformConfig` reads and adding a `Number.isFinite()` guard that rejects NaN-corrupted config before it can reach a wallet mutation (Phase 18)
- Built a `SUPER_ADMIN`-only dispute/adjustment workflow — `OPEN → IN_REVIEW → RESOLVED/DISMISSED` lifecycle over a new `SettlementDispute` model, with `SettlementService.adjust()` as an append-only compensating-transaction primitive that never mutates historical `Transaction` rows (Phase 19)
- Retrofitted every extracted gRPC service with a real `grpc.health.v1.Health` endpoint gating Railway rollout, guarded all 6 named `@Cron` jobs against dual-liveness double-fire with `setNx()` distributed locks, and authored a 6-step blue-green cutover/rollback runbook (Phase 20)
- Extracted News, Waitlist, and Reviews to independently-deployable gRPC services plus Delivery's `VerifyDeliveryOtp` RPC, each following the `notifications-service` hybrid HTTP+gRPC pattern with zero client-visible behavior change (Phase 21)
- Shipped scheduled, recurring Ministry export digests (CSV + branded PDF, distributed-lock-guarded `@Cron`, configurable recipients/cadence via DB) and an LGA×month visitor heatmap on the Ministry dashboard built with zero new backend queries or mapping dependencies (Phase 22)

**Human-verified:** 800 backend tests passing, zero circular deps. A code-review gap-closure round (21-08) fixed a business-exception-to-503 downgrade bug in Reviews/Waitlist gRPC controllers before this milestone closed.

**Known deferred items at close:** 12 (see STATE.md Deferred Items) — none block v2.1; all are live-deployment human-verification checks (Meta WhatsApp template approval, Railway healthcheck live test, blue-green cutover live rehearsal) or pre-existing bookkeeping debt carried from v1.0/v2.0, not missing code.

---

## v2.0 Microservices, Multi-Channel Auth & Government Partnership (Shipped: 2026-07-19)

**Phases completed:** 8 phases, 54 plans, 119 tasks

**Key accomplishments:**

- Corrected the false "8 services extracted" documentation claim, made all 8 `backend/apps/*-service` gRPC scaffolds build cleanly, and authored `.proto` contracts for the 7 previously-unstubbed modules (Phase 10)
- Wrapped every external vendor call (Paystack, Termii, Anthropic, Cloudflare R2/S3, Firebase FCM) in circuit-breaker + retry + timeout + fallback resilience via `cockatiel` (Phase 11)
- Built a generalized `SettlementService` + standing Ministry wallet, fixing two pre-existing revenue bugs — Stays' zero-fee escrow leak and missing Marketplace/Events/Studio settlement consumers (Phase 12)
- Cut Transport and Delivery's live payouts onto the three-way (vendor/rider, Ministry, platform) settlement engine, shadow-mode verified with zero payout discrepancy before cutover (Phase 13)
- Shipped a `MINISTRY_VIEWER` read-only dashboard — visitor counts by LGA/time, purpose-of-visit breakdown, revenue-to-government-share, CSV/PDF export, zero row-level PII leakage (Phase 14)
- Shipped multi-channel OTP (WhatsApp/Email/SMS selectable at registration) with bounded-timeout automatic SMS fallback and per-identity brute-force lockout unbypassable by channel switching (Phase 15)
- Put every Prisma client on pooled Neon connections and proved combined-topology connection headroom under load (Phase 16)
- Proved the live gRPC extraction pattern end-to-end: `notifications-service` now runs as a genuinely separate deployable process called via `ClientGrpc`, with zero REST behavior change for web/mobile clients (Phase 17)

**Human-verified:** Railway service topology confirmed live; REST response shapes confirmed unchanged pre/post cutover; Ministry PDF/CSV exports visually approved; 619 backend tests + mobile smoke tests passing.

**Known deferred items at close:** 10 (see STATE.md Deferred Items) — none block v2.0; largely pre-existing v1.0 debt and stakeholder-gated human sign-offs (live WhatsApp Meta template approval, live Grafana/Sentry dashboard confirmation).

---
