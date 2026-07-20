-- CreatePartialUniqueIndex
-- Enforces "at most one ACTIVE (OPEN/IN_REVIEW/BLOCKED) SettlementDispute row
-- per settlementReference" at the database level — closes the TOCTOU race in
-- raise()'s non-atomic findFirst() + create() pre-check (CR-02). Mirrors the
-- SettlementSplitTier precedent (`settlement_split_tiers_module_tierName_active_key`,
-- migration 20260719180003): Postgres/Prisma can't express a partial unique
-- index as an `@@unique` schema attribute, so it's added here via raw SQL.
CREATE UNIQUE INDEX "settlement_disputes_active_per_reference"
  ON "settlement_disputes" ("settlementReference")
  WHERE "status" IN ('OPEN', 'IN_REVIEW', 'BLOCKED');
