import { config } from "dotenv";
import { estimateCostUsd, canEstimateModelCost } from "@/lib/openai-pricing";

async function main() {
  config({ path: ".env" });
  config({ path: ".env.local", override: true });

  const repriceAll = process.argv.includes("--all");
  const { prisma } = await import("@/lib/prisma");

  const batchSize = 500;
  let totalUpdated = 0;
  let lastId: string | undefined;

  while (true) {
    const rows = await prisma.openAIRequestLog.findMany({
      where: {
        status: "success",
        ...(repriceAll ? {} : { estimatedCostUsd: 0 }),
        ...(lastId ? { id: { gt: lastId } } : {}),
      },
      orderBy: { id: "asc" },
      take: batchSize,
    });

    if (rows.length === 0) {
      break;
    }

    lastId = rows[rows.length - 1].id;
    let updatedInBatch = 0;

    for (const row of rows) {
      if (!canEstimateModelCost(row.model)) continue;
      const cost = estimateCostUsd(row.model, row.inputTokens, row.outputTokens);
      if (!repriceAll && cost === 0) continue;
      if (repriceAll && Number(row.estimatedCostUsd) === cost) continue;

      await prisma.openAIRequestLog.update({
        where: { id: row.id },
        data: { estimatedCostUsd: cost },
      });

      totalUpdated += 1;
      updatedInBatch += 1;
    }

    console.log(
      `Scanned batch of ${rows.length} rows, updated ${updatedInBatch} (total updates: ${totalUpdated})`
    );
  }

  console.log(
    `Backfill complete (${repriceAll ? "--all" : "zero-cost only"}). Total rows updated: ${totalUpdated}`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
