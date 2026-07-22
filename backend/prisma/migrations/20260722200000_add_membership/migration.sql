-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('PENDING', 'ACTIVE', 'PAST_DUE', 'CANCELLED', 'EXPIRED');

-- CreateTable
CREATE TABLE "memberships" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "monthlyPriceNgn" DECIMAL(65,30) NOT NULL,
    "govtLevyPct" DECIMAL(65,30) NOT NULL DEFAULT 0.05,
    "status" "MembershipStatus" NOT NULL DEFAULT 'PENDING',
    "paystackRef" TEXT NOT NULL,
    "paystackAuthCode" TEXT,
    "paystackEmail" TEXT NOT NULL,
    "currentPeriodEnd" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "memberships_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "memberships_paystackRef_key" ON "memberships"("paystackRef");

-- CreateIndex
CREATE INDEX "memberships_status_currentPeriodEnd_idx" ON "memberships"("status", "currentPeriodEnd");

-- CreateIndex
CREATE INDEX "memberships_userId_idx" ON "memberships"("userId");

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
