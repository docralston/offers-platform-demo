-- AlterTable: lease cap cost and excess-mile fields
ALTER TABLE "Offer" ADD COLUMN "grossCapCost" INTEGER;
ALTER TABLE "Offer" ADD COLUMN "netCapCost" INTEGER;
ALTER TABLE "Offer" ADD COLUMN "securityDeposit" INTEGER;
ALTER TABLE "Offer" ADD COLUMN "perExcessMile" DECIMAL(65,30);
