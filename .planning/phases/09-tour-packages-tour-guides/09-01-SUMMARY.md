---
phase: 09-tour-packages-tour-guides
plan: 01
subsystem: backend-data
tags: [prisma, schema, migration, postgres, tours]
requirements: [TOUR-01, TOUR-02, TOUR-03, TOUR-06, TOUR-07]
dependency-graph:
  requires: []
  provides:
    - "@prisma/client types: TourGuide, TourPackage, TourBooking, Itinerary, Review, AdminReviewFlag"
    - "Enums: TourPackageCategory, TourPackageStatus, TourGuideStatus, ReviewTargetType"
    - "UserRole.TOUR_GUIDE (additive)"
    - "PlatformConfig keys: tour.bulk_discount_t1/t2, tour.platform_commission_pct, tour.government_wallet_user_id, tour.notify_t_minus_24h_hours, tour.notify_t_minus_2h_hours"
  affects: [User, LGA]
tech-stack:
  added: []
  patterns:
    - "Additive enum extension via ALTER TYPE ADD VALUE (Prisma diff would otherwise drop & recreate)"
    - "Polymorphic Review via targetType + targetId (no FK)"
    - "DB-level CHECK constraint with jsonb_array_elements aggregation"
key-files:
  created:
    - backend/prisma/migrations/20260623120000_phase9_tour_packages/migration.sql
    - .planning/phases/09-tour-packages-tour-guides/09-01-SUMMARY.md
  modified:
    - backend/prisma/schema.prisma
    - backend/prisma/seed.ts
decisions:
  - "TourPackage.lgaId + tourGuideId NULLABLE to enable AI DRAFT shape from 09-04; service guard (09-04) enforces both populated before status leaves DRAFT"
  - "TourBooking.status reuses existing BookingStatus enum (no parallel TourBookingStatus)"
  - "Itinerary.items stored as JSON (single-table read, atomic per booking)"
  - "TourGuide.availability JSON shape: { blockedDates: ISO date strings, weeklyOffDays: 0-6 UTC }"
  - "Migration hand-authored (not via `prisma migrate diff`) to preserve additive ALTER TYPE — Prisma diff would otherwise drop the enum"
metrics:
  completed: 2026-06-24
  duration: ~25min
  tasks: 3
  commits: 3
---

# Phase 9 Plan 01: Tour Packages — Data Foundation Summary

Additive Prisma schema + hand-authored PostgreSQL migration that lays the entire data foundation for Phase 9 (tour packages, tour guides, bookings, itineraries, reviews, admin moderation queue) without disturbing the existing 282+ tests or the `UserRole` enum FKs.

## Models Added

6 new models, 4 new enums, 1 enum value:

| Model              | Table                | Notable |
|--------------------|----------------------|---------|
| `TourGuide`        | `tour_guides`        | 1:1 with `users`; AES-256-GCM ciphertext + bcrypt hash for NIN; `availability` JSON |
| `TourPackage`      | `tour_packages`      | `lgaId` + `tourGuideId` NULLABLE (AI DRAFT); JSON `settlementSplit` + `itineraryTemplate`; CHECK constraint on split sum |
| `TourBooking`      | `tour_bookings`      | `reference` unique (ISY-TOUR-<12char> from 09-02); `status` REUSES existing `BookingStatus` enum |
| `Itinerary`        | `itineraries`        | 1:1 with `TourBooking` (FK lives on `TourBooking.itineraryId`); `pdfUrl` populated by 09-07 |
| `Review`           | `reviews`            | Polymorphic via `targetType` + `targetId` (no FK on targetId) |
| `AdminReviewFlag`  | `admin_review_flags` | Queue for auto-flagged reviews (rating <= 2) |

New enums: `TourPackageCategory` (9 values), `TourPackageStatus`, `TourGuideStatus`, `ReviewTargetType`. `UserRole` got one new value `TOUR_GUIDE` (additive — Phase 9 truth).

## Migration Highlights

File: `backend/prisma/migrations/20260623120000_phase9_tour_packages/migration.sql`
SHA-256: `8d0c61b4f31dd024d919aef6ab7b1eed79ebbfd6b5ebcabf07684ce02f1fb0c8`

Ordering: ALTER ENUM → 4 CREATE TYPE → tour_guides → tour_packages → itineraries → tour_bookings → reviews → admin_review_flags → indexes → FKs → CHECK constraint. Itineraries precede `tour_bookings.itineraryId` FK as required.

- **Additive enum extension:** `ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'TOUR_GUIDE';` (not enum drop/recreate — preserves every FK on `users.role`).
- **Nullable FKs:** `"lgaId" TEXT` and `"tourGuideId" TEXT` (NULL) on `tour_packages` — intentional per orchestrator patch to support 09-04's AI DRAFT shape. Service-layer guard in 09-04 will reject status transitions past `DRAFT` until both are populated.
- **CHECK constraint:** `tour_packages_split_sum_check` enforces `COALESCE((SELECT SUM((elem->>'percentage')::numeric) FROM jsonb_array_elements("settlementSplit") elem), 0) <= 100`. `COALESCE` lets DRAFT rows with empty/null `settlementSplit` pass (service guard in 09-04 enforces a non-empty split before status moves past DRAFT). Trade-off documented: PostgreSQL-only — if the database ever switches engines, the constraint must move into the service layer.
- **Decimal precision:** `DECIMAL(65,30)` everywhere — matches existing migrations (drivers/trips/delivery_orders) byte-for-byte.
- **Date column:** `tour_bookings.tourDate` is `DATE` (per `@db.Date`), not `TIMESTAMP(3)` — tour dates are calendar-day semantics.
- **Hand-authored** (not via `prisma migrate dev --create-only`) because Prisma's enum diff would otherwise drop & recreate `UserRole`, breaking every FK on `users.role`.

## Seed Entries (`backend/prisma/seed.ts`)

Section 5b added — 6 upserts immediately after the KYC PlatformConfig block:

| Key                                  | Value         | isPublic | Notes |
|--------------------------------------|---------------|----------|-------|
| `tour.bulk_discount_t1`              | `0.10`        | true     | 10% off for 10-24 passengers |
| `tour.bulk_discount_t2`              | `0.20`        | true     | 20% off for 25-50 passengers |
| `tour.platform_commission_pct`       | `0.15`        | false    | Platform cut when split < 100% |
| `tour.government_wallet_user_id`     | `Prisma.JsonNull` | false | **OPERATOR ACTION REQUIRED** — must be set post-deploy before any ATTRACTION-type split goes live |
| `tour.notify_t_minus_24h_hours`      | `24`          | false    | T-24h reminder offset |
| `tour.notify_t_minus_2h_hours`       | `2`           | false    | T-2h reminder offset |

Bulk-discount tiers placed in PlatformConfig per CLAUDE.md anti-pattern: "Platform fee source: Always from DB, never hardcoded."

Import line updated: `import { PrismaClient, Prisma, AttractionCategory } from '@prisma/client';` (adds `Prisma` for `Prisma.JsonNull`).

## ⚠️ Operator Action Required

Before any `TourPackage` with an `ATTRACTION`-type settlement split goes live, an operator MUST run:

```sql
UPDATE platform_configs
SET value = '"<USER_UUID_OF_OGUN_GOVERNMENT_WALLET>"'::jsonb
WHERE key = 'tour.government_wallet_user_id';
```

The metadata flag `requires_operator_setup: true` is set so this surfaces in any config-audit dashboard.

## Truths Verified

- [x] `UserRole` enum contains `TOUR_GUIDE` (additively appended — schema line 24).
- [x] `TourPackageCategory` exists with exactly 9 values (HERITAGE/CULTURAL/ADIRE/FESTIVAL/FOOD/FAMILY/FAITH/SCHOOL/CORPORATE).
- [x] `TourGuide`, `TourPackage`, `TourBooking`, `Itinerary`, `Review`, `AdminReviewFlag` all defined with `@@map` to snake_case tables.
- [x] `TourBooking.status` references existing `BookingStatus` enum — `grep -n TourBookingStatus backend/prisma/schema.prisma` returns 0.
- [x] CHECK constraint `tour_packages_split_sum_check` present in migration SQL using `jsonb_array_elements`.
- [x] 6 `tour.*` PlatformConfig upserts present in seed.ts.
- [x] `npx prisma@5.22.0 format` runs clean.
- [x] `npx prisma@5.22.0 validate` returns "The schema at prisma/schema.prisma is valid 🚀".

## Deviations from Plan

**[Rule 1 - Bug] Comment removed to satisfy plan's grep-style verification**
The originally drafted comment on `TourBooking.status` was `"REUSE existing enum — no parallel TourBookingStatus"`. The plan's automated `verify` step does a substring match for `TourBookingStatus` to assert the enum was NOT added, and was tripping on my comment. Re-worded the comment to `"REUSE existing BookingStatus enum — see 09-01-PLAN must_haves"`. Same meaning, no substring collision. Captured in commit `273a8c7`.

**[Rule 3 - Blocking] Worktree lacks `@prisma/client@5.x` install — `prisma generate` + `tsc --noEmit` not run here**
The parallel-execution worktree (`.claude/worktrees/agent-a39a22157a337dafd/`) does not have `@prisma/client` populated (root workspace has v7 CLI alongside v5 client — incompatible). Could not run `prisma generate` (`Could not resolve @prisma/client`) or `tsc --noEmit` (no `tsc` bin) inside this worktree. The plan itself defers `prisma migrate dev` to the operator (§7: "Do NOT run prisma migrate dev (requires live DB; operator runs)"); by the same logic, the runtime `generate` step belongs in the operator's `npm install && npx prisma generate && npm run build && npm test` cycle on the main repo checkout. What I validated structurally:
- `npx prisma@5.22.0 validate` → schema valid.
- `npx prisma@5.22.0 format` → clean formatting applied.
- Migration SQL conforms byte-for-byte to existing migration conventions (DECIMAL(65,30), TIMESTAMP(3), TEXT[], JSONB).
- Seed structural checks: all 6 keys present, `Prisma.JsonNull` used correctly, `import` line updated.

## Smoke Test (operator-side, deferred)

After `npx prisma migrate deploy` (or `migrate resolve --applied 20260623120000_phase9_tour_packages`), this insert MUST fail with `check_violation`:

```sql
INSERT INTO tour_packages
  (id, slug, name, category, price, "durationHours", "itineraryTemplate", "settlementSplit", "updatedAt")
VALUES
  (gen_random_uuid(), 'bad-split-test', 'Bad Split', 'HERITAGE', 1000, 4,
   '[]'::jsonb,
   '[{"vendorType":"GUIDE","vendorId":"x","percentage":110}]'::jsonb,
   now());
-- Expected: ERROR:  new row for relation "tour_packages" violates check constraint "tour_packages_split_sum_check"
```

A valid split (sum <= 100) should succeed. Document the result here when the operator runs it.

## Commits

- `273a8c7` — `feat(09-01): extend schema for Phase 9 tour packages + tour guides`
- `d78a298` — `feat(09-01): add additive migration SQL for Phase 9 tour packages`
- `19f281d` — `feat(09-01): seed 6 tour.* PlatformConfig keys for Phase 9`

## Self-Check: PASSED

- [x] `backend/prisma/schema.prisma` exists and modified.
- [x] `backend/prisma/migrations/20260623120000_phase9_tour_packages/migration.sql` exists (218 lines, SHA `8d0c61b4...`).
- [x] `backend/prisma/seed.ts` exists and modified (+80 lines).
- [x] Commits `273a8c7`, `d78a298`, `19f281d` present in `git log`.
- [x] `npx prisma@5.22.0 validate` passed.
- [x] Schema grep checks all green.
- [x] Migration SQL grep checks all green.
- [x] Seed grep checks all green.

## Status: COMPLETE (with operator-side `prisma generate` + `prisma migrate deploy` pending in the main repo's install)
