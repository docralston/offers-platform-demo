import 'dotenv/config';
/**
 * One-off fix: BMW Finance offers that were incorrectly stored as 90 instead of 0.9%
 * (and similar) due to percent-vs-fraction handling. Rescale aprRate (and financeRates
 * entries) when in [50, 100] to value/100 (e.g. 90 -> 0.9, 95 -> 0.95).
 *
 * Usage:
 *   npx tsx scripts/fix-bmw-apr-90-to-decimal.ts
 *
 * Optional:
 *   DRY_RUN=1 to log actions without updating the DB.
 */

import { prisma } from '@/lib/prisma';
import type { Prisma } from '@prisma/client';

const MIN_WRONG = 50;
const MAX_WRONG = 100;

function rescaleFinanceRates(value: unknown): unknown {
  if (!Array.isArray(value)) return value;
  let changed = false;
  const out = value.map((item) => {
    if (item == null || typeof item !== 'object') return item;
    const apr = (item as { aprRate?: unknown }).aprRate;
    const term = (item as { aprTermMonths?: unknown }).aprTermMonths;
    if (typeof apr !== 'number' || typeof term !== 'number') return item;
    if (apr >= MIN_WRONG && apr <= MAX_WRONG) {
      changed = true;
      return { ...item, aprRate: Math.round((apr / 100) * 100) / 100, aprTermMonths: term };
    }
    return item;
  });
  return changed ? out : value;
}

async function main() {
  const dryRun = process.env.DRY_RUN === '1';

  const affected = await prisma.offer.findMany({
    where: {
      storeCode: 'BMW',
      offerType: 'Finance',
      aprRate: {
        gte: MIN_WRONG,
        lte: MAX_WRONG,
      },
    },
    select: {
      id: true,
      storeCode: true,
      model: true,
      year: true,
      aprRate: true,
      aprTermMonths: true,
      financeRates: true,
    },
  });

  // Also fix financeRates on these offers when entries are in [50, 100]
  const toFix = affected;

  if (!toFix.length) {
    console.log(
      `No BMW Finance offers found with aprRate in [${MIN_WRONG}, ${MAX_WRONG}].`
    );
    return;
  }

  console.log(
    `Found ${toFix.length} BMW Finance offer(s) to fix. Rescaling to percent (e.g. 90 -> 0.9).`
  );

  for (const o of toFix) {
    const currentApr = o.aprRate != null ? Number(o.aprRate) : null;
    const needAprFix =
      currentApr != null && currentApr >= MIN_WRONG && currentApr <= MAX_WRONG;
    const nextApr = needAprFix
      ? Math.round((currentApr / 100) * 100) / 100
      : currentApr;

    const rawRates = o.financeRates as unknown;
    const scaledRates = rescaleFinanceRates(rawRates);
    const needRatesFix = JSON.stringify(rawRates) !== JSON.stringify(scaledRates);

    if (dryRun) {
      console.log(
        `[DRY RUN] Offer ${o.id} (${o.storeCode} ${o.model} ${o.year}): aprRate ${currentApr} -> ${nextApr}${needRatesFix ? ', financeRates rescaled' : ''}`
      );
      continue;
    }

    const data: {
      aprRate?: number;
      financeRates?: Prisma.InputJsonValue;
      updatedBy: string;
    } = {
      updatedBy: 'fix-bmw-apr-90-to-decimal-script',
    };
    if (needAprFix && nextApr != null) data.aprRate = nextApr;
    if (needRatesFix) data.financeRates = scaledRates as Prisma.InputJsonValue;

    await prisma.offer.update({
      where: { id: o.id },
      data,
    });

    console.log(
      `Updated offer ${o.id} (${o.storeCode} ${o.model} ${o.year}): aprRate ${currentApr} -> ${nextApr}${needRatesFix ? ', financeRates rescaled' : ''}`
    );
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
