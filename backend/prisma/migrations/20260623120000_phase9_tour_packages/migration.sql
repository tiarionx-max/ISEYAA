-- ============================================================================
-- Phase 9 — Tour Packages & Tour Guides (additive migration)
-- ----------------------------------------------------------------------------
-- This migration is hand-authored to use ALTER TYPE ... ADD VALUE for the
-- UserRole enum extension (Prisma's diff would otherwise drop & recreate the
-- enum, breaking every FK referencing users.role).
--
-- Plan: 09-01-PLAN.md
-- Ordering matters: itineraries must exist before tour_bookings can add an FK
-- to it. Order is: ALTER ENUM → new enums → tour_guides → tour_packages →
-- itineraries → tour_bookings → reviews → admin_review_flags.
-- ============================================================================

-- 1. Extend UserRole enum additively (PG requires ALTER TYPE ADD VALUE).
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'TOUR_GUIDE';

-- 2. Create new enums.
CREATE TYPE "TourPackageCategory" AS ENUM ('HERITAGE', 'CULTURAL', 'ADIRE', 'FESTIVAL', 'FOOD', 'FAMILY', 'FAITH', 'SCHOOL', 'CORPORATE');

CREATE TYPE "TourPackageStatus" AS ENUM ('DRAFT', 'PENDING', 'APPROVED', 'REJECTED');

CREATE TYPE "TourGuideStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

CREATE TYPE "ReviewTargetType" AS ENUM ('GUIDE', 'PACKAGE', 'VENUE');

-- 3. Create tour_guides.
CREATE TABLE "tour_guides" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "bio" TEXT,
    "yearsExperience" INTEGER NOT NULL DEFAULT 0,
    "languagesSpoken" TEXT[],
    "certifications" TEXT[],
    "ninCiphertext" TEXT,
    "ninHash" TEXT,
    "kycTier" INTEGER NOT NULL DEFAULT 0,
    "availability" JSONB,
    "status" "TourGuideStatus" NOT NULL DEFAULT 'PENDING',
    "rating" DECIMAL(65,30),
    "reviewCount" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "tour_guides_pkey" PRIMARY KEY ("id")
);

-- 4. Create tour_packages. tourGuideId + lgaId are NULLABLE to support the
-- AI-suggestion DRAFT shape (09-04 service guard promotes to PENDING only
-- once both are populated).
CREATE TABLE "tour_packages" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "lgaId" TEXT,
    "tourGuideId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" "TourPackageCategory" NOT NULL,
    "price" DECIMAL(65,30) NOT NULL,
    "durationHours" INTEGER NOT NULL,
    "maxGroupSize" INTEGER NOT NULL DEFAULT 50,
    "coverImageUrl" TEXT,
    "imageUrls" TEXT[],
    "attractionIds" TEXT[],
    "propertyId" TEXT,
    "eventIds" TEXT[],
    "transportNote" TEXT,
    "itineraryTemplate" JSONB NOT NULL,
    "settlementSplit" JSONB NOT NULL,
    "rating" DECIMAL(65,30),
    "reviewCount" INTEGER NOT NULL DEFAULT 0,
    "status" "TourPackageStatus" NOT NULL DEFAULT 'DRAFT',
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "tour_packages_pkey" PRIMARY KEY ("id")
);

-- 5. Create itineraries (must exist BEFORE tour_bookings.itineraryId FK).
CREATE TABLE "itineraries" (
    "id" TEXT NOT NULL,
    "items" JSONB NOT NULL,
    "notes" TEXT,
    "pdfUrl" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "itineraries_pkey" PRIMARY KEY ("id")
);

-- 6. Create tour_bookings. status REUSES the existing "BookingStatus" enum.
CREATE TABLE "tour_bookings" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "tourPackageId" TEXT NOT NULL,
    "buyerUserId" TEXT NOT NULL,
    "groupLeaderUserId" TEXT,
    "tourDate" DATE NOT NULL,
    "passengerCount" INTEGER NOT NULL,
    "passengers" JSONB,
    "unitPrice" DECIMAL(65,30) NOT NULL,
    "totalAmount" DECIMAL(65,30) NOT NULL,
    "paymentReference" TEXT,
    "status" "BookingStatus" NOT NULL DEFAULT 'PENDING',
    "itineraryId" TEXT,
    "splitBillEnabled" BOOLEAN NOT NULL DEFAULT false,
    "splitBillPaidUserIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "snapshot" JSONB,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "tour_bookings_pkey" PRIMARY KEY ("id")
);

-- 7. Create reviews (polymorphic — no FK on targetId).
CREATE TABLE "reviews" (
    "id" TEXT NOT NULL,
    "targetType" "ReviewTargetType" NOT NULL,
    "targetId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tourBookingId" TEXT,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "photos" TEXT[],
    "flagged" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

-- 8. Create admin_review_flags.
CREATE TABLE "admin_review_flags" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "assignedTo" TEXT,
    "resolution" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admin_review_flags_pkey" PRIMARY KEY ("id")
);

-- ─── Unique indexes ─────────────────────────────────────────────────────────
CREATE UNIQUE INDEX "tour_guides_userId_key" ON "tour_guides"("userId");

CREATE UNIQUE INDEX "tour_packages_slug_key" ON "tour_packages"("slug");

CREATE UNIQUE INDEX "tour_bookings_reference_key" ON "tour_bookings"("reference");

CREATE UNIQUE INDEX "tour_bookings_itineraryId_key" ON "tour_bookings"("itineraryId");

CREATE UNIQUE INDEX "admin_review_flags_reviewId_key" ON "admin_review_flags"("reviewId");

-- ─── Non-unique indexes ─────────────────────────────────────────────────────
CREATE INDEX "tour_guides_status_idx" ON "tour_guides"("status");

CREATE INDEX "tour_packages_status_category_idx" ON "tour_packages"("status", "category");

CREATE INDEX "tour_packages_tourGuideId_idx" ON "tour_packages"("tourGuideId");

CREATE INDEX "tour_packages_lgaId_idx" ON "tour_packages"("lgaId");

CREATE INDEX "tour_bookings_tourPackageId_status_idx" ON "tour_bookings"("tourPackageId", "status");

CREATE INDEX "tour_bookings_buyerUserId_idx" ON "tour_bookings"("buyerUserId");

CREATE INDEX "tour_bookings_tourDate_status_idx" ON "tour_bookings"("tourDate", "status");

CREATE INDEX "reviews_targetType_targetId_idx" ON "reviews"("targetType", "targetId");

CREATE INDEX "reviews_userId_idx" ON "reviews"("userId");

CREATE INDEX "reviews_flagged_idx" ON "reviews"("flagged");

CREATE INDEX "admin_review_flags_status_idx" ON "admin_review_flags"("status");

-- ─── Foreign keys ───────────────────────────────────────────────────────────
ALTER TABLE "tour_guides" ADD CONSTRAINT "tour_guides_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "tour_packages" ADD CONSTRAINT "tour_packages_lgaId_fkey" FOREIGN KEY ("lgaId") REFERENCES "lgas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "tour_packages" ADD CONSTRAINT "tour_packages_tourGuideId_fkey" FOREIGN KEY ("tourGuideId") REFERENCES "tour_guides"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "tour_bookings" ADD CONSTRAINT "tour_bookings_tourPackageId_fkey" FOREIGN KEY ("tourPackageId") REFERENCES "tour_packages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "tour_bookings" ADD CONSTRAINT "tour_bookings_buyerUserId_fkey" FOREIGN KEY ("buyerUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "tour_bookings" ADD CONSTRAINT "tour_bookings_itineraryId_fkey" FOREIGN KEY ("itineraryId") REFERENCES "itineraries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "reviews" ADD CONSTRAINT "reviews_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "reviews" ADD CONSTRAINT "reviews_tourBookingId_fkey" FOREIGN KEY ("tourBookingId") REFERENCES "tour_bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "admin_review_flags" ADD CONSTRAINT "admin_review_flags_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── CHECK constraint: sum(settlementSplit[].percentage) <= 100 ─────────────
-- REMOVED (2026-07-13, see forward-fix migration 20260713140000): this used
-- an inline correlated subquery inside a CHECK constraint, which PostgreSQL
-- unconditionally rejects (error 0A000 "cannot use subquery in check
-- constraint"). Because DDL migrations run inside a single transaction, this
-- statement rolled back this ENTIRE migration every time it was applied —
-- meaning none of the 6 Phase 9 tables ever actually existed in any database
-- this migration ran against. This statement never successfully committed
-- anywhere, so removing it here is safe. The equivalent constraint is
-- re-added correctly (via an IMMUTABLE SQL function instead of an inline
-- subquery) in 20260713140000_fix_tour_packages_split_sum_check.
