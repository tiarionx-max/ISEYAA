-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "UserRole" ADD VALUE 'TOURIST';
ALTER TYPE "UserRole" ADD VALUE 'ORGANISER';
ALTER TYPE "UserRole" ADD VALUE 'HOST';
ALTER TYPE "UserRole" ADD VALUE 'DRIVER';
ALTER TYPE "UserRole" ADD VALUE 'CREATIVE';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "ndpaConsent" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "ndpaConsentAt" TIMESTAMP(3),
ADD COLUMN     "registeredRoles" "UserRole"[];
