import 'dotenv/config';
/**
 * One-off migration: normalize BMW i-series offers so all "i" models use "BMW i" as series.
 *
 * Criteria:
 * - storeCode = 'BMW' OR storeCodes array contains 'BMW'
 * - model starts with "i" (case-insensitive), e.g. i3, i4, i5, i7, iX, etc.
 *
 * Effect:
 * - Sets series = "BMW i" for all matching offers.
 *
 * Usage:
 *   npx tsx scripts/fix-bmw-i-series.ts
 *
 * Optional:
 *   DRY_RUN=1 to log actions without updating the DB.
 */

import { prisma } from '@/lib/prisma';

async function main() {
  const dryRun = process.env.DRY_RUN === '1';

  const affected = await prisma.offer.findMany({
    where: {
      AND: [
        {
          OR: [
            { storeCode: 'BMW' },
            { storeCodes: { has: 'BMW' } },
          ],
        },
        {
          model: {
            startsWith: 'i',
            mode: 'insensitive',
          },
        },
      ],
    },
    select: {
      id: true,
      storeCode: true,
      storeCodes: true,
      model: true,
      year: true,
      series: true,
    },
  });

  if (!affected.length) {
    console.log('No BMW i-model offers found needing series normalization.');
    return;
  }

  console.log(`Found ${affected.length} BMW i-model offer(s) to normalize series -> "BMW i".`);

  for (const o of affected) {
    const storeCodesLabel = o.storeCodes?.length ? ` [${o.storeCodes.join(', ')}]` : '';
    const beforeSeries = o.series ?? '(null)';
    const afterSeries = 'BMW i';

    if (dryRun) {
      console.log(
        `[DRY RUN] Offer ${o.id} (${o.storeCode}${storeCodesLabel} ${o.model} ${o.year ?? ''}): series ${beforeSeries} -> ${afterSeries}`
      );
      continue;
    }

    await prisma.offer.update({
      where: { id: o.id },
      data: {
        series: afterSeries,
        updatedBy: 'fix-bmw-i-series-script',
      },
    });

    console.log(
      `Updated offer ${o.id} (${o.storeCode}${storeCodesLabel} ${o.model} ${o.year ?? ''}): series ${beforeSeries} -> ${afterSeries}`
    );
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

