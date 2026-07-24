-- Seed default active SettlementSplitTier rows for every module that calls
-- SettlementService.resolveSplit(module, amountNgn). Without an active row,
-- resolveSplit() throws "No active SettlementSplitTier found" and every real
-- payment settlement for that module fails outright (verified empty on a
-- freshly-migrated dev database — this was blocking ALL settlement).
--
-- Percentages match the values already asserted throughout each module's test
-- suite (transport/delivery/events/studio/stays/marketplace .spec.ts files),
-- which represent the intended design defaults.
INSERT INTO "settlement_split_tiers"
  ("id", "module", "tierName", "earnerPct", "ministryPct", "platformPct", "isActive", "effectiveFrom", "createdAt", "updatedAt")
VALUES
  (gen_random_uuid(), 'transport',   'default', 0.85, 0.05, 0.10, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'delivery',    'default', 0.80, 0.05, 0.15, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'events',      'default', 0.85, 0.05, 0.10, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'studio',      'default', 0.00, 0.05, NULL, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'stays',       'default', 0.95, 0.05, NULL, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'marketplace', 'default', 0.90, 0.00, 0.10, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("module", "tierName") WHERE "isActive" = true DO NOTHING;
