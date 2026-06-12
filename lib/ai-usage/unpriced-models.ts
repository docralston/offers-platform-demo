import { canEstimateModelCost } from '@/lib/openai-pricing';
import { prisma } from '@/lib/prisma';

/** Success rows in the last N days with zero cost and no pricing rule for the model id. */
export async function countUnpricedSuccessRequests(days = 30): Promise<number> {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const grouped = await prisma.openAIRequestLog.groupBy({
    by: ['model'],
    where: {
      status: 'success',
      estimatedCostUsd: 0,
      createdAt: { gte: since },
    },
    _count: true,
  });

  let unpriced = 0;
  for (const g of grouped) {
    if (!canEstimateModelCost(g.model)) {
      unpriced += g._count;
    }
  }
  return unpriced;
}
