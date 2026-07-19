-- DropIndex
DROP INDEX "settlement_split_tiers_module_tierName_key";

-- CreateIndex
CREATE INDEX "settlement_split_tiers_module_tierName_idx" ON "settlement_split_tiers"("module", "tierName");

-- CreatePartialUniqueIndex
-- Enforces "at most one ACTIVE row per (module, tierName)" without blocking
-- updateSplitTier()'s insert-new-row/deactivate-old audit trail (D-05), which
-- otherwise violates a plain @@unique([module, tierName]) constraint the
-- moment a second (deactivated) historical row exists for the same key.
CREATE UNIQUE INDEX "settlement_split_tiers_module_tierName_active_key"
  ON "settlement_split_tiers"("module", "tierName")
  WHERE "isActive" = true;
