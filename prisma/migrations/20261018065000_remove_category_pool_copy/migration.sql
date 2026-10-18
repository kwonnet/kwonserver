-- Remove room-pool explanations from category cards while preserving room copy.
UPDATE "GameCategory"
SET "description" = btrim(regexp_replace(
  "description",
  '\s*Every room draws questions from the full category pool\.?',
  '',
  'gi'
))
WHERE "description" ILIKE '%Every room draws questions from the full category pool%';
