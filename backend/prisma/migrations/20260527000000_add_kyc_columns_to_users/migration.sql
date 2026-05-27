-- Add KYC verification timestamp columns and BVN/NIN hash columns
-- These exist in schema.prisma but were missing from the baseline migration

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "bvnHash"              TEXT,
  ADD COLUMN IF NOT EXISTS "ninHash"              TEXT,
  ADD COLUMN IF NOT EXISTS "kycBvnVerifiedAt"     TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "kycNinVerifiedAt"     TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "kycLivenessVerifiedAt" TIMESTAMP(3);
