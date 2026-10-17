-- This explanation belongs on room descriptions, not category cards.
-- Preserve room descriptions and all other category copy.
UPDATE "GameCategory"
SET "description" = btrim(regexp_replace(
  "description",
  '\s*Every room uses the same category content and rules\.?',
  '',
  'gi'
))
WHERE "description" ILIKE '%Every room uses the same category content and rules%';
