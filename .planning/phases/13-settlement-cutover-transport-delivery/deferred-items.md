# Deferred Items — Phase 13

Items discovered during plan execution that are out of scope for the current task/plan
and are logged here for follow-up rather than silently fixed.

## 13-01 Task 2: Pre-existing schema/migration drift swept into `add_shadow_settlement_comparison`

**Discovered during:** 13-01 Task 2 ("Apply the schema migration")
**Severity:** Medium — one item is a real behavioral change to FK delete semantics

**What happened:** Running the plan-mandated `npx prisma migrate dev --name add_shadow_settlement_comparison`
generated a migration that correctly creates `shadow_settlement_comparisons`, but Prisma's
diff engine also reconciled several **pre-existing, unrelated** differences between
`backend/prisma/schema.prisma` (as it already existed before this plan touched it) and the
last-recorded migration history. These differences predate Phase 13 — none were introduced by
this plan — but because `prisma migrate dev` diffs full migration history against the current
schema file (not a scoped diff), they were bundled into migration
`20260717231213_add_shadow_settlement_comparison` and applied to the local dev database.

A manual revert via raw SQL was attempted but blocked by the environment's permission system
(auto-mode classifier: "Modify Shared Resources" — hand-written DDL against a shared dev DB
without explicit user authorization). Given that editing an already-applied migration's SQL
file after the fact also breaks Prisma's checksum integrity model (a worse practice), the
migration was left as generated. Flagging here for a maintainer decision instead.

**Bundled unrelated changes (all pre-existing, none caused by Phase 13):**

1. **FK onDelete behavior changes (needs review — real behavioral change):**
   - `admin_review_flags_reviewId_fkey`: `ON DELETE CASCADE` → `ON DELETE RESTRICT`.
     Previously deleting a `Review` would cascade-delete its `AdminReviewFlag`; now the DB
     will **block** the delete unless application code deletes the flag first. Root cause:
     `AdminReviewFlag.reviewId` in `schema.prisma` has no explicit `onDelete` annotation, so
     Prisma's default for a required relation (`Restrict`) was applied — the original Phase 9
     migration (`20260623120000_phase9_tour_packages`) had explicitly hardcoded `Cascade`
     instead. Whichever behavior is intended should be made explicit via `@relation(... onDelete: Cascade)`
     (or `Restrict`) in `schema.prisma` and re-migrated deliberately.
   - `tour_packages_lgaId_fkey` / `tour_packages_tourGuideId_fkey`: `ON DELETE RESTRICT` →
     `ON DELETE SET NULL`. Root cause: `TourPackage.lgaId`/`tourGuideId` were made nullable
     (`String?`) at some point after the Phase 9 migration — see the `// NOTE: lgaId + tourGuideId
     are NULLABLE to support AI-suggestion DRAFT shape` comment at `schema.prisma:947` — but the
     matching migration for that nullability change (and its default `SetNull` FK behavior) was
     never generated. This one looks intentional given the comment, but was never confirmed via
     a dedicated migration.

2. **Index drops/adds (missing-index catch-up, lower risk but worth confirming intentional):**
   - Dropped `products_category_isActive_idx`, `products_isFeatured_idx` — these indexes exist
     in the DB (from `20260609100000_marketplace_categories_and_news`) but `schema.prisma`'s
     `Product` model no longer declares them. Unclear if removed intentionally or by oversight
     during the Phase 8 marketplace redesign.
   - Added `bookings_propertyId_status_escrowReleasedAt_idx`, `users_deletedAt_idx`,
     `users_status_idx` — these are already declared in `schema.prisma` (`Booking`/`User`
     models) but had never been migrated. This direction is a genuine correctness catch-up
     (missing DB index) and is likely safe/desirable to keep.

3. **Column default removals (low risk):**
   - `properties.membershipBenefits` / `properties.highlights`: `DROP DEFAULT` (was
     `ARRAY[]::TEXT[]` per `20260609000000_extend_property_for_experiences`).
     `schema.prisma` no longer declares `@default([])` on these `String[]` fields. Low risk
     since existing rows are unaffected and application code likely always supplies a value,
     but worth confirming no code path relies on the DB-level default.

**Recommended follow-up:** A maintainer should review item 1 (the `admin_review_flags` CASCADE→RESTRICT
change) specifically before this migration is deployed to any shared/staging/production
environment — confirm whether cascade-delete of admin review flags on review deletion is
still the desired behavior, and either add an explicit `onDelete: Cascade` back to
`schema.prisma` (generating a follow-up migration to restore it) or confirm `Restrict` is
now correct and update any review-deletion code path that previously relied on the cascade.

**Files:** `backend/prisma/migrations/20260717231213_add_shadow_settlement_comparison/migration.sql`,
`backend/prisma/schema.prisma`
