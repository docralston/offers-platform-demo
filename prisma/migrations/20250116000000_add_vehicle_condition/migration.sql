-- CreateEnum
CREATE TYPE "VehicleCondition" AS ENUM ('NEW', 'USED', 'CERTIFIED');

-- AlterTable
ALTER TABLE "Offer" ADD COLUMN "condition" "VehicleCondition" NOT NULL DEFAULT 'NEW';
