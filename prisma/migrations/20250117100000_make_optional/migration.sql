-- AlterTable: make is optional (required only when condition is USED)
ALTER TABLE "Offer" ALTER COLUMN "make" DROP NOT NULL;
