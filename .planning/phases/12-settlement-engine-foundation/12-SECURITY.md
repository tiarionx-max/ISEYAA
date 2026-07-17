---
phase: 12
slug: settlement-engine-foundation
status: verified
threats_open: 0
asvs_level: 1
created: 2026-07-17
---

# Phase 12 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|----------------|
| Paystack webhook → settlement caller → `SettlementService` | Webhook payload (`metadata`) is untrusted; every `recipients[].walletId` must be server-side resolved by the caller before reaching `settle()`, never taken from webhook `metadata` | Wallet ids, NGN amounts |
| Seed script → Postgres | Trusted, operator-run, one-time/idempotent provisioning — not a runtime attack surface | Ministry User+Wallet rows, `PlatformConfig` fee/levy keys |
| `PlatformConfig.tour.government_wallet_user_id` → `SettlementService` callers | Every caller trusts this value as the Ministry's wallet-owning user id; only mutable via the existing `PATCH /admin/config/:key` route | Ministry wallet id |
| Hourly cron (`releaseEscrow`) → `SettlementService` | Internal, non-webhook-triggered settlement — no external input; host/Ministry wallets resolved from server-side FK chains | Wallet ids, NGN amounts |
| Client → `GET /settlements/statement` | Any authenticated user of any role can call this route; `walletId` query param is client-controlled and untrusted for every role except `SUPER_ADMIN` (unrestricted) / `LGA_ADMIN` (own-LGA-scoped) | `Transaction` CREDIT rows (settlement audit trail) |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-12-01 | Repudiation/Tampering | `SettlementService.settle()` idempotency precheck | mitigate | `Transaction.reference @unique` DB constraint (`schema.prisma:635`) is the authoritative guard; `startsWith` precheck (`settlement.service.ts:94-103`) is a fast-path optimization | closed |
| T-12-02 | Tampering/Elevation of Privilege | `SettlementService.settle()` concurrent duplicate webhook delivery | mitigate | `catch` block (`settlement.service.ts:236-254`) catches `Prisma.PrismaClientKnownRequestError` `code === 'P2002'`, narrowed post-audit to conflicts on the `reference` constraint specifically (WR-01 hardening beyond the original plan) — benign replay, no refund | closed |
| T-12-03 | Tampering | Drift/rounding manipulation across many small settlements | mitigate | `Math.abs(drift) > 0.02` throws (`settlement.service.ts:125-131`) before any wallet write; platform wallet always absorbs legitimate drift, never a recipient | closed |
| T-12-04 | Information Disclosure | Ministry wallet id caching | mitigate | `resolveMinistryWallet()` (`settlement.service.ts:321-328`) reads `PlatformConfig` fresh on every call — no cache field, no memoization | closed |
| T-12-05 | Denial of Service | Large recipient count holding a Postgres connection during `$transaction` | accept | Documented ceiling (Prisma default `timeout: 5000ms`); this phase's callers max out at ~5 recipients (Tour) — see Accepted Risks Log | closed |
| T-12-06 | Tampering | `PlatformConfig` fee/levy keys read by settlement callers | accept | Values seeded server-side (`prisma/seed.ts:1445-1514`), only mutable via `PATCH /admin/config/:key` — see Accepted Risks Log for a caveat on this route's actual role gate | closed |
| T-12-07 | Information Disclosure | Ministry user account (`ministry@iseyaa.local`) | accept | Confirmed structurally non-loginable: `prisma/seed.ts:1409-1421` creates the row with no `passwordHash` and no `phone` field set — see Accepted Risks Log | closed |
| T-12-08 | Tampering | Tour vendor wallet resolution | mitigate | `tour-settlement.service.ts` resolution loop keys wallet lookups off `TourGuide.userId`/`Property.hostId`/`Event.organizerId`/`tour.government_wallet_user_id`; `payload.metadata` matches (grep-confirmed) are only used for `bookingId`/`shareKey`/`parentReference` — never assigned to a `walletId` field | closed |
| T-12-09 | Repudiation | Regression risk during refactor (12 existing tested scenarios) | mitigate | `tour-settlement.service.spec.ts` — all 12 scenarios pass unmodified (12-03-SUMMARY.md); full-suite run in 12-09 (42 suites / 505 tests) confirms no cross-plan regression | closed |
| T-12-10 | Tampering | Vendor/Ministry wallet resolution in `handleOrderPayment` | mitigate | `marketplace.service.ts:276-283` — vendor wallet resolved via `Vendor.findUnique({ where: { id: order.vendorId } })` then `wallet.findUnique({ where: { userId: vendor.userId } })`; Ministry via `resolveMinistryWallet()` — never from webhook `metadata` | closed |
| T-12-11 | Repudiation | Duplicate `payment.order_payment` delivery | mitigate | `order.status !== 'PENDING'` early-return guard (`marketplace.service.ts:271`) plus `SettlementService`'s own reference-prefix idempotency precheck — two independent layers | closed |
| T-12-12 | Tampering | Organiser/Ministry wallet resolution in `handleTicketPayment` | mitigate | `events.service.ts:255` resolves organiser wallet via `ticket.ticketType.event.organizerId` server-side FK chain; Ministry via `resolveMinistryWallet()` | closed |
| T-12-13 | Tampering | Fee/levy percentage source | mitigate | `events.service.ts:243,245` reads `events.platform_fee_pct`/`events.govt_levy_pct` from `PlatformConfig`, in-code fallback (`0.10`/`0.05`) only when the key is entirely unset | closed |
| T-12-14 | Tampering | Ministry wallet resolution in `handleStudioPayment` | mitigate | `studio.service.ts:179` resolves Ministry wallet via `resolveMinistryWallet()`, never from webhook `metadata`; no vendor wallet leg exists (D-10) | closed |
| T-12-15 | Tampering | Fee/levy percentage source | mitigate | `studio.service.ts:172,174` reads `studio.platform_fee_pct`/`studio.govt_levy_pct` from `PlatformConfig`, in-code fallback only when unset | closed |
| T-12-16 | Tampering | `Booking.govtLevyPct` value used at escrow-release time | mitigate | Snapshotted at booking-creation time (`stays.service.ts` `createBooking()`, value written into `booking.create` data) from `stays.govt_levy_pct` `PlatformConfig`; `releaseEscrow()` reads `Number(booking.govtLevyPct)` off the row (`stays.service.ts:336`), never re-reads `PlatformConfig` live, never client-suppliable | closed |
| T-12-17 | Denial of Service | `releaseEscrow()` per-booking failure blocking the whole batch | accept | Per-booking `try/catch` (`stays.service.ts:328-365`) ensures one booking's failure does not block remaining `dueBookings`; failed bookings retry next hourly cron since `escrowReleasedAt` stays null — see Accepted Risks Log | closed |
| T-12-18 | Elevation of Privilege (IDOR) | `SettlementController.getStatement()` `walletId` query param | mitigate | `settlement.controller.ts:63-92` — non-admin (`else` branch) always resolves `targetWalletId` via `prisma.wallet.findUnique({ where: { userId: user.userId } })`; `SUPER_ADMIN` unrestricted, `LGA_ADMIN` cross-checked against target wallet owner's `lgaId` (WR-06 hardening); regression-tested in `settlement.controller.spec.ts` with an explicit attacker-supplied `walletId` | closed |
| T-12-19 | Information Disclosure | Statement response shape leaks other recipients' PII | accept | Response is the existing `Transaction` row shape already returned by `GET /wallet/transactions` — no new PII surface; `metadata` is settlement audit data (recipientType, bookingId, etc.), not citizen PII — see Accepted Risks Log | closed |
| T-12-20 | Repudiation | Cross-plan regression (5 callers sharing one engine) | mitigate | Full-suite run (12-09) — 42 suites / 505 tests green, all five callers + statement controller coexisting | closed |
| T-12-21 | (Audit) | All threats from earlier plans re-confirmed in shipped code | mitigate | 12-09's grep-based audit plus this independent re-verification (all `settle()`, wallet-resolution, and IDOR-gate source lines directly inspected, not inferred from SUMMARY narrative) | closed |

*Status: open · closed*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|--------------|------|
| AR-12-01 | T-12-05 | `SettlementService.settle()` holds one Postgres connection per `$transaction` call for the duration of an N recipient fan-out (Prisma default `timeout: 5000ms`). This phase's highest-N caller (Tour, GUIDE/HOST/ORGANISER/ATTRACTION) has no hard code-level cap, but the current product surface (tour package vendor splits) never exceeds ~5 recipients in practice. Revisit if a future caller (Phase 13 Transport/Delivery, or a Tour package redesign) introduces a materially larger N. | gsd-security-auditor (phase-12 audit) | 2026-07-17 |
| AR-12-02 | T-12-06 | `events.*`/`studio.*`/`stays.*`/`marketplace.*` fee/levy `PlatformConfig` keys are seeded server-side and only mutable via `PATCH /admin/config/:key`. **Caveat found during this audit:** `AdminController`'s class-level `@Roles(UserRole.SUPER_ADMIN, UserRole.LGA_ADMIN)` guard applies to `setConfig()` (no per-route override), so `LGA_ADMIN` — not just `SUPER_ADMIN` as the original threat model's mitigation text states — can also PATCH these keys today. This route is unchanged by Phase 12 (pre-existing behavior), so it is accepted as-is rather than treated as a phase-12 regression, but the discrepancy between the documented mitigation ("SUPER_ADMIN-gated") and the actual gate (SUPER_ADMIN OR LGA_ADMIN) should be corrected in a future admin-security pass. | gsd-security-auditor (phase-12 audit) | 2026-07-17 |
| AR-12-03 | T-12-07 | The standing Ministry account (`ministry@iseyaa.local`) is provisioned with no `passwordHash` and no `phone` (`prisma/seed.ts:1409-1421`, confirmed by direct read), making it structurally non-loginable through both the password-login flow (requires `passwordHash`) and the OTP flow (requires `phone`). No code path was found that could authenticate as this user. | gsd-security-auditor (phase-12 audit) | 2026-07-17 |
| AR-12-04 | T-12-17 | `releaseEscrow()`'s per-booking `try/catch` (unchanged, pre-existing pattern) means a single booking's settlement failure is logged and skipped rather than blocking the batch; the failed booking simply retries on the next hourly cron run (`escrowReleasedAt` stays `null`). Accepted as sufficient DoS containment for a cron-driven internal process with no external caller waiting on the response. | gsd-security-auditor (phase-12 audit) | 2026-07-17 |
| AR-12-05 | T-12-19 | `GET /settlements/statement` returns the existing `Transaction` row shape, already exposed today via `GET /wallet/transactions` to the transaction's own wallet owner. No new PII fields are introduced; `metadata` on settlement rows contains audit fields (recipientType, bookingId/orderId/ticketId, module) rather than citizen PII (no BVN/NIN/phone/email present in any settlement `Transaction.metadata` write site reviewed in this audit). | gsd-security-auditor (phase-12 audit) | 2026-07-17 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|----------------|--------|------|--------|
| 2026-07-17 | 21 | 21 | 0 | gsd-security-auditor |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-07-17
