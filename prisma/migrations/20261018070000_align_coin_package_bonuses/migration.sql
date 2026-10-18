-- Shared catalog packages receive the same bonus coins in both currencies.
-- Preserve personalized offers, prices, base amounts and purchase history.
UPDATE "CoinPackage" AS package
SET "bonus" = catalog.bonus,
    "ngnBonus" = catalog.bonus,
    "updatedAt" = CURRENT_TIMESTAMP
FROM (VALUES
  ('Starter Pack', 10),
  ('Bronze Pack', 20),
  ('Silver Pack', 30),
  ('Gold Pack', 40),
  ('Elite Pack', 50),
  ('Pro Pack', 60),
  ('Mega Pack', 70),
  ('Ultra Pack', 80),
  ('Master Pack', 90),
  ('Legend Pack', 100),
  ('Titan Pack', 110),
  ('Giant Pack', 120),
  ('Colossal Pack', 130),
  ('Zenith Pack', 140),
  ('Infinity Pack', 150)
) AS catalog(name, bonus)
WHERE package."name" = catalog.name
  AND package."userId" IS NULL
  AND (package."bonus" IS DISTINCT FROM catalog.bonus
    OR package."ngnBonus" IS DISTINCT FROM catalog.bonus);
