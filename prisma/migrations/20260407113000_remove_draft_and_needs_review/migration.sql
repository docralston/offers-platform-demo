-- Backfill deprecated statuses to INACTIVE before enum shrink
UPDATE "Offer"
SET "status" = 'INACTIVE'
WHERE "status" IN ('DRAFT', 'NEEDS_REVIEW');

-- Rebuild enum without deprecated values (Postgres does not support DROP VALUE)
ALTER TYPE "OfferStatus" RENAME TO "OfferStatus_old";
CREATE TYPE "OfferStatus" AS ENUM ('LIVE', 'INACTIVE');

ALTER TABLE "Offer"
  ALTER COLUMN "status" DROP DEFAULT,
  ALTER COLUMN "status" TYPE "OfferStatus" USING ("status"::text::"OfferStatus"),
  ALTER COLUMN "status" SET DEFAULT 'INACTIVE';

DROP TYPE "OfferStatus_old";
