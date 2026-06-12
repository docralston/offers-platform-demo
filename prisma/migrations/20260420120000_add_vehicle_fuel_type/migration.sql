-- CreateEnum
CREATE TYPE "VehicleFuelType" AS ENUM ('GAS', 'HYBRID', 'PLUG_IN_HYBRID');

-- AlterTable
ALTER TABLE "Offer" ADD COLUMN "fuelType" "VehicleFuelType";
