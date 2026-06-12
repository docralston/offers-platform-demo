/*
  Warnings:

  - The primary key for the `openai_request_log` table will be changed. If it partially fails, the table could be left without primary key constraint.

*/
-- DropIndex
DROP INDEX "idx_openai_request_log_created_at";

-- DropIndex
DROP INDEX "idx_openai_request_log_tags_gin";

-- AlterTable
ALTER TABLE "openai_request_log" DROP CONSTRAINT "openai_request_log_pkey",
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "id" SET DATA TYPE TEXT,
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "input_tokens" DROP DEFAULT,
ALTER COLUMN "output_tokens" DROP DEFAULT,
ALTER COLUMN "total_tokens" DROP DEFAULT,
ALTER COLUMN "estimated_cost_usd" DROP DEFAULT,
ALTER COLUMN "estimated_cost_usd" SET DATA TYPE DECIMAL(65,30),
ALTER COLUMN "tags" DROP DEFAULT,
ADD CONSTRAINT "openai_request_log_pkey" PRIMARY KEY ("id");

-- CreateIndex
CREATE INDEX "openai_request_log_created_at_idx" ON "openai_request_log"("created_at");

-- RenameIndex
ALTER INDEX "idx_openai_request_log_model" RENAME TO "openai_request_log_model_idx";

-- RenameIndex
ALTER INDEX "idx_openai_request_log_status" RENAME TO "openai_request_log_status_idx";
