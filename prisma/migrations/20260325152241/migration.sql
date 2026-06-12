-- CreateTable
CREATE TABLE "vendor_cost_snapshot" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "window_start" TIMESTAMP(3) NOT NULL,
    "window_end" TIMESTAMP(3) NOT NULL,
    "realized_cost_usd" DECIMAL(65,30) NOT NULL,
    "estimated_cost_usd" DECIMAL(65,30) NOT NULL,
    "delta_usd" DECIMAL(65,30) NOT NULL,
    "delta_pct" DECIMAL(65,30),
    "drift" BOOLEAN NOT NULL DEFAULT false,
    "snapshot_created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "normalization_debug" JSONB,

    CONSTRAINT "vendor_cost_snapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "vendor_cost_snapshot_provider_snapshot_created_at_idx" ON "vendor_cost_snapshot"("provider", "snapshot_created_at");

-- CreateIndex
CREATE INDEX "vendor_cost_snapshot_provider_window_start_idx" ON "vendor_cost_snapshot"("provider", "window_start");
