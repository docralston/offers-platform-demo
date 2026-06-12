import { config } from "dotenv";

async function main() {
  // Load env vars for CLI usage: .env then .env.local (local overrides).
  config({ path: ".env" });
  config({ path: ".env.local", override: true });

  const { prisma } = await import("@/lib/prisma");

  const rows = await prisma.openAIRequestLog.findMany({
    where: {
      status: "success",
      estimatedCostUsd: 0,
    },
    orderBy: { createdAt: "asc" },
  });

   
  console.log(
    JSON.stringify(
      rows.map((r) => ({
        id: r.id,
        createdAt: r.createdAt,
        model: r.model,
        inputTokens: r.inputTokens,
        outputTokens: r.outputTokens,
        totalTokens: r.totalTokens,
        tags: r.tags,
      })),
      null,
      2,
    ),
  );
}

main().catch((err) => {
   
  console.error(err);
  process.exit(1);
});

