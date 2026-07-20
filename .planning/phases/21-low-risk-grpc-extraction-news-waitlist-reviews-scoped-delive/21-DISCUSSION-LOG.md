# Phase 21: Low-Risk gRPC Extraction — News/Waitlist/Reviews + Scoped Delivery OTP - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-20
**Phase:** 21-Low-Risk gRPC Extraction — News/Waitlist/Reviews + Scoped Delivery OTP
**Areas discussed:** Delivery OTP module scope, Service naming, Rollout sequencing, Rollout order

---

## Delivery OTP module scope

| Option | Description | Selected |
|--------|-------------|----------|
| Reuse full DeliveryModule | Import DeliveryModule as-is into the new service, like notifications-service reuses the full NotificationsModule. Fastest, matches precedent exactly, but ships WalletModule/AuthModule into a process that only checks an OTP. | ✓ |
| Extract a lean OTP-only module | Pull verifyOtp's Redis+Prisma logic into a new small module/service with zero Wallet/Auth deps. Cleaner blast-radius isolation, matches GRPC-07's 'scoped' framing, but is a real refactor of code the in-process DeliveryService still needs to call too. | |
| You decide | Let the researcher/planner weigh effort vs coupling and pick during planning. | |

**User's choice:** Reuse full DeliveryModule
**Notes:** Chosen for speed and precedent-fidelity over minimal blast radius, consistent with this phase's low-risk/low-effort framing.

---

## Service naming

| Option | Description | Selected |
|--------|-------------|----------|
| delivery-otp-service | Name signals narrow, deliberate scope — matches how GRPC-07 vs GRPC-07x are split in REQUIREMENTS.md. If Delivery is ever fully extracted later, that'd likely be a new/renamed service anyway. | ✓ |
| delivery-service (OTP-only for now) | Name assumes this is the seed of the eventual full Delivery extraction, growing in place when GRPC-07x unblocks. | |
| You decide | Let Claude pick based on repo naming conventions. | |

**User's choice:** delivery-otp-service
**Notes:** None.

---

## Rollout sequencing

| Option | Description | Selected |
|--------|-------------|----------|
| Staggered, one at a time (recommended) | Each service gets its own canary flag flip + bake period before the next starts, matching the established Phase 17/20 caution level for a government platform. Slower, but isolates any regression to one service at a time. | ✓ |
| All four in one wave | All four extracted, deployed, and canary-enabled together. Faster to ship, but a regression in one is harder to isolate from the other three shipping simultaneously. | |
| You decide | Let the planner sequence plans/waves based on dependency and risk, not a fixed answer here. | |

**User's choice:** Staggered, one at a time
**Notes:** None.

---

## Rollout order

| Option | Description | Selected |
|--------|-------------|----------|
| Risk-ascending: News → Waitlist → Reviews → Delivery OTP | News and Waitlist are pure read/write CRUD with no cross-domain writes or shared mutable state — lowest risk, good pattern-proving warm-up. Reviews has the cross-domain rating recompute. Delivery OTP touches Redis+Postgres state shared with the still-in-process DeliveryService — highest risk, goes last. | ✓ |
| Roadmap listing order: News → Waitlist → Reviews, then Delivery OTP | Matches the order they're named in the roadmap's success criteria — same practical order as risk-ascending, stated as the simpler rationale. | |
| You decide | Let the planner sequence based on what it finds during research. | |

**User's choice:** Risk-ascending: News → Waitlist → Reviews → Delivery OTP
**Notes:** Both top options resolve to the same practical order; user picked the risk-based rationale explicitly.

---

## Claude's Discretion

- Exact gRPC port assignments for the four new services (ports 5001-5008 already taken by existing apps; new services need 5009+)
- Concrete bake-period length/gate criteria between each staggered rollout step — defer to Phase 20's `20-CONTEXT.md`/`20-PATTERNS.md` as the operational reference

## Deferred Ideas

None raised — discussion stayed within phase scope. Full Delivery extraction (RequestDelivery/AcceptDelivery/CompleteDelivery/Gateway) is already tracked as GRPC-07x in REQUIREMENTS.md, not a new idea surfaced here.
