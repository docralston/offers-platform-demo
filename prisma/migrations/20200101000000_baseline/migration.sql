-- Baseline: initial schema so shadow DB can replay all migrations.
-- Original tables were created outside Prisma (create_tables.sql, merge_dates_and_add_fields.sql).
-- This migration creates the Offer and OfferVersion tables in the state before add_vehicle_condition.

-- CreateEnum
CREATE TYPE "OfferStatus" AS ENUM ('DRAFT', 'LIVE');

-- CreateTable
CREATE TABLE "Offer" (
    "id" TEXT NOT NULL,
    "storeCode" TEXT NOT NULL,
    "make" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "trim" TEXT,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "status" "OfferStatus" NOT NULL DEFAULT 'DRAFT',
    "inventoryUrl" TEXT,
    "imageUrl" TEXT,
    "leasePayment" INTEGER,
    "leaseTerm" INTEGER,
    "leaseMiles" INTEGER,
    "dueAtSigning" INTEGER,
    "acquisitionFee" INTEGER,
    "downPayment" INTEGER,
    "stockNumber" TEXT,
    "msrp" INTEGER,
    "discount" INTEGER,
    "buyFor" INTEGER,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Offer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OfferVersion" (
    "id" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "changedBy" TEXT NOT NULL,
    "changeNote" TEXT,
    "snapshot" JSONB NOT NULL,
    CONSTRAINT "OfferVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Offer_storeCode_status_idx" ON "Offer"("storeCode", "status");
CREATE INDEX "Offer_endDate_idx" ON "Offer"("endDate");
CREATE INDEX "Offer_startDate_idx" ON "Offer"("startDate");
CREATE INDEX "OfferVersion_offerId_versionNumber_idx" ON "OfferVersion"("offerId", "versionNumber");

-- AddForeignKey
ALTER TABLE "OfferVersion" ADD CONSTRAINT "OfferVersion_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "Offer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
