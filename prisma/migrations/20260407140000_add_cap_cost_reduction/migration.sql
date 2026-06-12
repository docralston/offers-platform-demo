ALTER TABLE "Offer"
ADD COLUMN "capCostReduction" INTEGER;

-- Backfill from legacy notes format:
-- "PDF cap cost reduction: $7,999"
UPDATE "Offer"
SET "capCostReduction" = NULLIF(
  regexp_replace(
    regexp_replace("additionalNotes", '^.*PDF cap cost reduction:\s*\$', '', 'i'),
    '[^0-9]',
    '',
    'g'
  ),
  ''
)::INTEGER
WHERE "capCostReduction" IS NULL
  AND "additionalNotes" ~* 'PDF cap cost reduction:\s*\$';
