-- AlterEnum: Add INACTIVE to OfferStatus enum (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname IN ('OfferStatus', 'offerstatus')
      AND e.enumlabel = 'INACTIVE'
  ) THEN
    ALTER TYPE "OfferStatus" ADD VALUE 'INACTIVE';
  END IF;
END $$;

-- AlterTable: Add externalId column for Toyota ingestion upsert identity
ALTER TABLE "Offer" ADD COLUMN IF NOT EXISTS "externalId" TEXT;

-- CreateIndex: Unique on (storeCode, externalId) for upsert
CREATE UNIQUE INDEX IF NOT EXISTS "Offer_storeCode_externalId_key" ON "Offer"("storeCode", "externalId");
