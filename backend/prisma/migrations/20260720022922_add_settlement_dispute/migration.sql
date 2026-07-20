-- CreateTable
CREATE TABLE "settlement_disputes" (
    "id" TEXT NOT NULL,
    "settlementReference" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "raisedByUserId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "requestedAdjustmentNgn" DECIMAL(65,30),
    "assignedTo" TEXT,
    "resolution" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "adjustmentReference" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "settlement_disputes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "settlement_disputes_status_idx" ON "settlement_disputes"("status");

-- CreateIndex
CREATE INDEX "settlement_disputes_settlementReference_idx" ON "settlement_disputes"("settlementReference");

-- AddForeignKey
ALTER TABLE "settlement_disputes" ADD CONSTRAINT "settlement_disputes_raisedByUserId_fkey" FOREIGN KEY ("raisedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
