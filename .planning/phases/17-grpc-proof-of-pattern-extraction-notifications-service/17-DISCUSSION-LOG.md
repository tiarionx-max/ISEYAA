# Phase 17: gRPC Proof-of-Pattern Extraction (notifications-service) - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-18
**Phase:** 17-grpc-proof-of-pattern-extraction-notifications-service
**Areas discussed:** Pending todos, Client wrapper design, gRPC call resilience, Push payload regression, Cutover strategy

---

## Pending Todos

| Todo | Description | Selected |
|------|-------------|----------|
| Docker dependency fix | `@iseyaa/proto` still isn't declared as a backend dependency — blocks a real Docker image for notifications-service | ✓ Fold |
| ResilienceModule wiring (all 8 scaffolds) | Broader todo; notifications-service's own instance already fixed in Phase 16 | ✓ Fold (full 8-scaffold scope, per user's explicit choice) |

**User's choice:** Fold both.
**Notes:** User chose to fold INT-01's *full* scope (all 8 scaffolds), not just the notifications-service-specific piece already resolved in Phase 16. Flagged in CONTEXT.md for the planner to confirm whether this should be a separate plan/wave.

---

## Client wrapper design

**Q: How should the 2 call sites reach notifications-service?**

| Option | Description | Selected |
|--------|-------------|----------|
| Thin facade | NotificationsClientService with today's exact method signatures, backed by ClientGrpc internally | ✓ |
| Raw @Client() at each site | Each call site directly injects ClientGrpc | |
| You decide | | |

**Q: Where should the gRPC client registration live?**

| Option | Description | Selected |
|--------|-------------|----------|
| New NotificationsClientModule | Small dedicated module exporting the facade/client token | ✓ |
| Register inside NotificationsModule | Fewer new files, blurs module boundary | |
| You decide | | |

**Q: Should listForUser() go over gRPC too?**

| Option | Description | Selected |
|--------|-------------|----------|
| Keep it a local no-op stub | No proto RPC added, returns [] directly | ✓ |
| Add a real ListForUser gRPC RPC | Proto gains a 3rd RPC | |
| You decide | | |

**Q: Naming convention for the gRPC target URL?**

| Option | Description | Selected |
|--------|-------------|----------|
| NOTIFICATIONS_GRPC_URL env var | Follows existing per-service env var pattern | ✓ |
| Hardcoded default + env override | Less config locally, hidden default | |
| You decide | | |

**User's choice:** All recommended options.
**Notes:** None.

---

## gRPC call resilience

**Q: Wrap calls in ResilienceModule/cockatiel?**

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, wrap it | Matches Phase 11's pattern for external vendor calls | ✓ |
| No, leave it bare | Pushes are already fire-and-forget/best-effort | |
| You decide | | |

**Q: Failure behavior for REST-facing paths?**

| Option | Description | Selected |
|--------|-------------|----------|
| Propagate a clear error to the caller | Honest 503 rather than silent success | ✓ |
| Fallback to a no-op success | Degrade-gracefully, same as Termii stub mode | |
| You decide | | |

**Q: Same wrapping for TourNotificationsService's cron/event paths?**

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, same wrapping | Consistency with PaystackService/SendgridService | ✓ |
| No special handling needed | Already catch-and-log without rethrowing | |
| You decide | | |

**User's choice:** All recommended options.
**Notes:** Cron/event paths' existing catch-and-log-without-rethrow contract is preserved; the resilience wrapping governs the underlying gRPC call, not that contract.

---

## Push payload regression

**Q: sendPush's data param isn't in the .proto contract. How to handle before cutover?**

| Option | Description | Selected |
|--------|-------------|----------|
| Fix the proto now | Add a map<string,string> data field, forward it through | ✓ |
| Accept and document the gap | Ship without it, document as known regression | |
| You decide | | |

**Q: Does the new data field affect anything beyond notifications-service and its 2 call sites?**

| Option | Description | Selected |
|--------|-------------|----------|
| No — confirm and move on | Purely additive, no other proto consumer exists yet | ✓ |
| Double-check for other proto consumers first | | |

**User's choice:** Fix the proto now; confirmed no other consumer exists.
**Notes:** Treated as a correctness issue (real regression risk), not a style preference.

---

## Cutover strategy

**Q: Straight cutover or feature-flag dual path?**

| Option | Description | Selected |
|--------|-------------|----------|
| Straight cutover | Matches lowest-blast-radius rationale for this module | ✓ |
| Feature-flag dual path | Settlement-style, heavier, arguably overkill here | |
| You decide | | |

**Q: Rollback plan if it breaks in production?**

| Option | Description | Selected |
|--------|-------------|----------|
| Revert commit + redeploy monolith | Standard git revert + Railway redeploy | ✓ |
| Keep old in-process path dormant as emergency fallback | | |
| You decide | | |

**Q: Form of the caller-graph audit (GRPC-04)?**

| Option | Description | Selected |
|--------|-------------|----------|
| A committed markdown doc in the phase directory | Grep-based table, permanent reviewable artifact | ✓ |
| Inline in the plan/verification docs only | | |
| You decide | | |

**User's choice:** All recommended options.
**Notes:** User explicitly contrasted this module's non-financial risk profile against Phase 13's Settlement cutover ceremony to justify skipping the feature-flag approach.

---

## Claude's Discretion

- Exact 503/error response shape for the REST-facing failure path.
- Exact cockatiel policy parameters (timeout, retry count, circuit-breaker thresholds) — likely mirroring Phase 11's existing per-vendor policy shape.
- Exact format/columns of the caller-graph audit markdown doc.

## Deferred Ideas

- Feature-flag-gated dual in-process/gRPC path — deferred indefinitely for this module; revisit only for a future extraction involving financial/wallet-adjacent data.
- Adding a real ListForUser gRPC RPC — deferred until listForUser() gets real persistence (currently a stub, out of this phase's scope).
- Live extraction of Delivery + remaining modules (GRPC-07) and news/waitlist/reviews (GRPC-08) — already deferred to v2 per REQUIREMENTS.md, unaffected by this discussion.
