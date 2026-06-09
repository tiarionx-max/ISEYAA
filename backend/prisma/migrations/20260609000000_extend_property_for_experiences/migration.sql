-- Extend Property model to support Airbnb-style experience categories
-- (lounges, clubs, beaches, tours, social-club memberships, attractions)

-- CreateEnum
CREATE TYPE "BookingMode" AS ENUM ('NIGHTLY', 'HOURLY', 'TIMED_EVENT', 'MEMBERSHIP');

-- AlterEnum: PropertyType — add new variants
ALTER TYPE "PropertyType" ADD VALUE IF NOT EXISTS 'LOUNGE';
ALTER TYPE "PropertyType" ADD VALUE IF NOT EXISTS 'CLUB';
ALTER TYPE "PropertyType" ADD VALUE IF NOT EXISTS 'BEACH';
ALTER TYPE "PropertyType" ADD VALUE IF NOT EXISTS 'TOUR';
ALTER TYPE "PropertyType" ADD VALUE IF NOT EXISTS 'EXPERIENCE';
ALTER TYPE "PropertyType" ADD VALUE IF NOT EXISTS 'ATTRACTION';

-- AlterTable: properties — new columns
ALTER TABLE "properties"
  ADD COLUMN IF NOT EXISTS "bookingMode" "BookingMode" NOT NULL DEFAULT 'NIGHTLY',
  ADD COLUMN IF NOT EXISTS "category" TEXT,
  ADD COLUMN IF NOT EXISTS "coverImageUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "pricePerHour" DECIMAL(65,30),
  ADD COLUMN IF NOT EXISTS "membershipMonthlyPrice" DECIMAL(65,30),
  ADD COLUMN IF NOT EXISTS "membershipBenefits" TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS "highlights" TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS "rating" DECIMAL(65,30),
  ADD COLUMN IF NOT EXISTS "reviewCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "isFeatured" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "properties_type_isActive_idx" ON "properties"("type", "isActive");
CREATE INDEX IF NOT EXISTS "properties_bookingMode_idx" ON "properties"("bookingMode");
