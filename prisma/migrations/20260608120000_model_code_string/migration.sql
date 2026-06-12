-- AlterTable: modelCode Int? -> String? (Toyota numeric + BMW alphanumeric)
ALTER TABLE "Offer" ALTER COLUMN "modelCode" TYPE TEXT USING "modelCode"::text;
