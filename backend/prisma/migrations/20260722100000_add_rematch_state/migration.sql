-- AlterTable
ALTER TABLE "trips"
    ADD COLUMN "matchAttempts" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "matchDeadlineAt" TIMESTAMP(3),
    ADD COLUMN "excludedDriverIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "delivery_orders"
    ADD COLUMN "matchAttempts" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "matchDeadlineAt" TIMESTAMP(3),
    ADD COLUMN "excludedRiderIds" TEXT[] DEFAULT ARRAY[]::TEXT[];
