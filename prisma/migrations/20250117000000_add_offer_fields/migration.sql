-- Add OfferTypeEnum and new offer columns. All nullable for existing rows.
-- Reversible: to undo, run the statements in the comment block at the end.

-- CreateEnum
CREATE TYPE "OfferTypeEnum" AS ENUM ('Lease', 'Finance', 'Cash', 'Other');

-- AlterTable
ALTER TABLE "Offer" ADD COLUMN "offerType" "OfferTypeEnum";
ALTER TABLE "Offer" ADD COLUMN "aprRate" DECIMAL(65,30);
ALTER TABLE "Offer" ADD COLUMN "aprTermMonths" INTEGER;
ALTER TABLE "Offer" ADD COLUMN "rebateTotal" DECIMAL(65,30);
ALTER TABLE "Offer" ADD COLUMN "customerCash" DECIMAL(65,30);
ALTER TABLE "Offer" ADD COLUMN "leaseCash" DECIMAL(65,30);
ALTER TABLE "Offer" ADD COLUMN "aprCash" DECIMAL(65,30);
ALTER TABLE "Offer" ADD COLUMN "bonusCash" DECIMAL(65,30);
ALTER TABLE "Offer" ADD COLUMN "disclaimer" TEXT;
ALTER TABLE "Offer" ADD COLUMN "additionalNotes" TEXT;

-- Reversal (run manually if needed):
-- ALTER TABLE "Offer" DROP COLUMN IF EXISTS "additionalNotes";
-- ALTER TABLE "Offer" DROP COLUMN IF EXISTS "disclaimer";
-- ALTER TABLE "Offer" DROP COLUMN IF EXISTS "bonusCash";
-- ALTER TABLE "Offer" DROP COLUMN IF EXISTS "aprCash";
-- ALTER TABLE "Offer" DROP COLUMN IF EXISTS "leaseCash";
-- ALTER TABLE "Offer" DROP COLUMN IF EXISTS "customerCash";
-- ALTER TABLE "Offer" DROP COLUMN IF EXISTS "rebateTotal";
-- ALTER TABLE "Offer" DROP COLUMN IF EXISTS "aprTermMonths";
-- ALTER TABLE "Offer" DROP COLUMN IF EXISTS "aprRate";
-- ALTER TABLE "Offer" DROP COLUMN IF EXISTS "offerType";
-- DROP TYPE IF EXISTS "OfferTypeEnum";
