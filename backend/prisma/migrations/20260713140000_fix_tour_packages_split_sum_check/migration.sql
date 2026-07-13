-- ============================================================================
-- Forward-fix: tour_packages_split_sum_check used an inline correlated
-- subquery inside a CHECK constraint. PostgreSQL unconditionally rejects
-- subqueries in CHECK constraints (error 0A000: "cannot use subquery in
-- check constraint"). Because DDL migrations run inside a single transaction,
-- that failing ALTER TABLE statement rolled back the *entire*
-- 20260623120000_phase9_tour_packages migration — meaning none of the 6
-- Phase 9 tables (tour_guides, tour_packages, tour_bookings, itineraries,
-- reviews, admin_review_flags) were ever actually created wherever
-- `prisma migrate deploy` ran against that migration.
--
-- Fix: PostgreSQL permits a CHECK constraint to call a function, even if
-- that function internally runs a query over its own parameter — the "no
-- subquery" restriction only applies to subquery syntax written inline in
-- the CHECK expression itself. So we extract the same logic into an
-- IMMUTABLE SQL function and have the CHECK constraint call it instead.
--
-- Business rule preserved exactly (from original migration, lines 208-211):
-- sum(settlementSplit[].percentage) <= 100. If "settlementSplit" is
-- null/empty, COALESCE returns 0 and the row is allowed (DRAFT rows may be
-- created without splits yet — service guard in 09-04 enforces a non-empty
-- split before status moves past DRAFT).
-- ============================================================================

-- 1. Drop the broken constraint defensively. IF EXISTS because the original
-- migration never successfully committed it in a fresh DB (the whole
-- transaction rolled back) — this is a safe no-op there, while also being
-- correct for any environment where the constraint somehow exists.
ALTER TABLE "tour_packages" DROP CONSTRAINT IF EXISTS "tour_packages_split_sum_check";

-- 2. Create an IMMUTABLE SQL function that encapsulates the sum check.
-- The subquery lives inside the function body, not inline in a CHECK
-- expression, which PostgreSQL permits.
CREATE OR REPLACE FUNCTION check_settlement_split_sum(split jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT COALESCE(SUM((elem ->> 'percentage')::numeric), 0) <= 100
    FROM jsonb_array_elements(split) AS elem
$$;

-- 3. Re-add the constraint, now calling the function.
ALTER TABLE "tour_packages" ADD CONSTRAINT "tour_packages_split_sum_check" CHECK (check_settlement_split_sum("settlementSplit"));
