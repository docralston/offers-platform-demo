import { config } from "dotenv";

async function main() {
  // Load env vars for CLI usage: .env then .env.local (local overrides).
  config({ path: ".env" });
  config({ path: ".env.local", override: true });

  const { prisma } = await import("@/lib/prisma");

  const whereFullPages: any = {
    status: "success",
    tags: {
      path: ["feature"],
      equals: "model-page-generator",
    },
  };

  const whereFaqsOnly: any = {
    status: "success",
    tags: {
      path: ["feature"],
      equals: "model-page-generator-faqs-only",
    },
  };

  const fullPages = await prisma.openAIRequestLog.groupBy({
    by: ["model"],
    where: whereFullPages,
    _count: { _all: true },
    _avg: {
      inputTokens: true,
      outputTokens: true,
      totalTokens: true,
    },
  });

  const faqsOnly = await prisma.openAIRequestLog.groupBy({
    by: ["model"],
    where: whereFaqsOnly,
    _count: { _all: true },
    _avg: {
      inputTokens: true,
      outputTokens: true,
      totalTokens: true,
    },
  });

  console.log("=== Full model pages (feature = model-page-generator) ===");
  console.log(JSON.stringify(fullPages, null, 2));

  console.log("\n=== FAQ-only passes (feature = model-page-generator-faqs-only) ===");
  console.log(JSON.stringify(faqsOnly, null, 2));
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});

