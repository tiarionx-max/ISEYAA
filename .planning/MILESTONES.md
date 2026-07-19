# Milestones

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
