-- AlterEnum: Add NEEDS_REVIEW to OfferStatus enum
ALTER TYPE "OfferStatus" ADD VALUE 'NEEDS_REVIEW';

-- AlterTable: Add validationIssues column
ALTER TABLE "Offer" ADD COLUMN "validationIssues" JSONB;

-- CreateIndex: Add index on make, model, year
CREATE INDEX "Offer_make_model_year_idx" ON "Offer"("make", "model", "year");
