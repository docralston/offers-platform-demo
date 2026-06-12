import { config } from "dotenv";
import { canEstimateModelCost } from "@/lib/openai-pricing";

async function main() {
  // Load env vars for CLI usage: .env then .env.local (local overrides).
  config({ path: ".env" });
  config({ path: ".env.local", override: true });

  const { prisma } = await import("@/lib/prisma");

  const grouped = await prisma.openAIRequestLog.groupBy({
    by: ["model"],
    where: { status: "success", estimatedCostUsd: 0 },
    _count: true,
  });

  let pricedButZero = 0;
  let unpricedModel = 0;
  for (const g of grouped) {
    const n = g._count;
    if (canEstimateModelCost(g.model)) pricedButZero += n;
    else unpricedModel += n;
  }

   
  console.log(
    "Zero-cost success rows (model is priceable — run backfill:openai-costs):",
    pricedButZero
  );
   
  console.log("Zero-cost success rows (no pricing rule for model id):", unpricedModel);
}

main().catch((err) => {
   
  console.error(err);
  process.exit(1);
});

