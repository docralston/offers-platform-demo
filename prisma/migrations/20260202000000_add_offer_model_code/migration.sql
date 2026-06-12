-- AlterTable: Add modelCode column (Toyota model code from spec line e.g. 2557)
ALTER TABLE "Offer" ADD COLUMN IF NOT EXISTS "modelCode" INTEGER;
