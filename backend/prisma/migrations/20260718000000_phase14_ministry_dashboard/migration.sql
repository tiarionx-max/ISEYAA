-- ============================================================================
-- Phase 14 — Ministry Dashboard (additive migration)
-- ----------------------------------------------------------------------------
-- This migration is hand-authored to use ALTER TYPE ... ADD VALUE for the
-- UserRole enum extension (Prisma's diff would otherwise drop & recreate the
-- enum, breaking every FK referencing users.role).
--
-- Plan: 14-01-PLAN.md
-- Ordering matters: PG requires ALTER TYPE ADD VALUE to precede any DDL that
-- uses the new enum value. Order is: ALTER ENUM → new enum → visitor_logs
-- table → indexes → foreign key.
--
-- D-07: visitor_logs deliberately excludes every PII column (no BVN/NIN/
-- phone/name/email) — structural half of MIN-07's "zero row-level PII"
-- guarantee, verified by Plan 14-06's automated allowlist test.
-- ============================================================================

-- 1. Extend UserRole enum additively (PG requires ALTER TYPE ADD VALUE).
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'MINISTRY_VIEWER';

-- 2. Create new enum.
CREATE TYPE "VisitorSourceType" AS ENUM ('EVENT', 'STAY', 'TOUR');

-- 3. Create visitor_logs.
CREATE TABLE "visitor_logs" (
    "id" TEXT NOT NULL,
    "lgaId" TEXT,
    "purpose" TEXT NOT NULL,
    "sourceType" "VisitorSourceType" NOT NULL,
    "sourceId" TEXT NOT NULL,
    "visitedAt" TIMESTAMP(3) NOT NULL,
    "userRole" "UserRole" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "visitor_logs_pkey" PRIMARY KEY ("id")
);

-- ─── Indexes ────────────────────────────────────────────────────────────────
CREATE INDEX "visitor_logs_lgaId_idx" ON "visitor_logs"("lgaId");

CREATE INDEX "visitor_logs_visitedAt_idx" ON "visitor_logs"("visitedAt");

CREATE INDEX "visitor_logs_sourceType_sourceId_idx" ON "visitor_logs"("sourceType", "sourceId");

-- ─── Foreign keys ───────────────────────────────────────────────────────────
ALTER TABLE "visitor_logs" ADD CONSTRAINT "visitor_logs_lgaId_fkey" FOREIGN KEY ("lgaId") REFERENCES "lgas"("id") ON DELETE SET NULL ON UPDATE CASCADE;
