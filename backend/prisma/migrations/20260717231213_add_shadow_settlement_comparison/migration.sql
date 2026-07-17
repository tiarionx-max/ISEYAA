-- DropForeignKey
ALTER TABLE "admin_review_flags" DROP CONSTRAINT "admin_review_flags_reviewId_fkey";

-- DropForeignKey
ALTER TABLE "tour_packages" DROP CONSTRAINT "tour_packages_lgaId_fkey";

-- DropForeignKey
ALTER TABLE "tour_packages" DROP CONSTRAINT "tour_packages_tourGuideId_fkey";

-- DropIndex
DROP INDEX "products_category_isActive_idx";

-- DropIndex
DROP INDEX "products_isFeatured_idx";

-- AlterTable
ALTER TABLE "properties" ALTER COLUMN "membershipBenefits" DROP DEFAULT,
ALTER COLUMN "highlights" DROP DEFAULT;

-- CreateTable
CREATE TABLE "shadow_settlement_comparisons" (
    "id" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "oldEarnerAmount" DECIMAL(65,30) NOT NULL,
    "newEarnerAmount" DECIMAL(65,30) NOT NULL,
    "matched" BOOLEAN NOT NULL,
    "comparedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shadow_settlement_comparisons_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "shadow_settlement_comparisons_module_comparedAt_idx" ON "shadow_settlement_comparisons"("module", "comparedAt");

-- CreateIndex
CREATE INDEX "shadow_settlement_comparisons_module_matched_idx" ON "shadow_settlement_comparisons"("module", "matched");

-- CreateIndex
CREATE INDEX "bookings_propertyId_status_escrowReleasedAt_idx" ON "bookings"("propertyId", "status", "escrowReleasedAt");

-- CreateIndex
CREATE INDEX "users_deletedAt_idx" ON "users"("deletedAt");

-- CreateIndex
CREATE INDEX "users_status_idx" ON "users"("status");

-- AddForeignKey
ALTER TABLE "tour_packages" ADD CONSTRAINT "tour_packages_lgaId_fkey" FOREIGN KEY ("lgaId") REFERENCES "lgas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tour_packages" ADD CONSTRAINT "tour_packages_tourGuideId_fkey" FOREIGN KEY ("tourGuideId") REFERENCES "tour_guides"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_review_flags" ADD CONSTRAINT "admin_review_flags_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "reviews"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
