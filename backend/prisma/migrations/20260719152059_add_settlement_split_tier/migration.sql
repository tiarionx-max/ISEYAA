-- CreateTable
CREATE TABLE "settlement_split_tiers" (
    "id" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "tierName" TEXT NOT NULL DEFAULT 'default',
    "minAmountNgn" DECIMAL(65,30),
    "maxAmountNgn" DECIMAL(65,30),
    "earnerPct" DECIMAL(65,30) NOT NULL,
    "ministryPct" DECIMAL(65,30) NOT NULL,
    "platformPct" DECIMAL(65,30),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "settlement_split_tiers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "settlement_split_tiers_module_isActive_idx" ON "settlement_split_tiers"("module", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "settlement_split_tiers_module_tierName_key" ON "settlement_split_tiers"("module", "tierName");
