-- CreateEnum
CREATE TYPE "DisclaimerSource" AS ENUM ('AUTO', 'MANUAL');

-- AlterTable
ALTER TABLE "Offer" ADD COLUMN "disclaimerSource" "DisclaimerSource" NOT NULL DEFAULT 'AUTO';

-- CreateTable
CREATE TABLE "AppSetting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("key")
);
