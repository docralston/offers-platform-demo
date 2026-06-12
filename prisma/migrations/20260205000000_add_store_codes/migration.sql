-- AlterTable: add storeCodes array; backfill so each row has [storeCode] for backward compatibility
ALTER TABLE "Offer" ADD COLUMN IF NOT EXISTS "storeCodes" TEXT[] DEFAULT '{}';

UPDATE "Offer" SET "storeCodes" = ARRAY["storeCode"]::TEXT[] WHERE "storeCodes" = '{}' OR "storeCodes" IS NULL;
