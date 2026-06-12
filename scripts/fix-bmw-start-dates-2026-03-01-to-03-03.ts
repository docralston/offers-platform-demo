import 'dotenv/config';
/**
 * One-off migration: move BMW offer start dates from 2026-03-01 to 2026-03-03.
 *
 * Criteria:
 * - storeCode = 'BMW' OR storeCodes array contains 'BMW'
 * - startDate is 2026-03-01 in Eastern Time
 *
 * Usage:
 *   npx tsx scripts/fix-bmw-start-dates-2026-03-01-to-03-03.ts
 *
 * Optional:
 *   DRY_RUN=1 to log actions without updating the DB.
 */

import { prisma } from '@/lib/prisma';
import { formatEasternDate, createEasternDate } from '@/lib/utils/dates';

async function main() {
  const dryRun = process.env.DRY_RUN === '1';

  // Compute the exact Date objects for the two Eastern midnights we care about
  const fromEastern = createEasternDate('2026-03-01');
  const toEastern = createEasternDate('2026-03-02');

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
          startDate: {
            gte: fromEastern,
            lt: toEastern,
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
      startDate: true,
    },
  });

  if (!affected.length) {
    console.log('No BMW offers found with startDate = 2026-03-01 (Eastern).');
    return;
  }

  console.log(`Found ${affected.length} BMW offer(s) with startDate = 2026-03-01 (Eastern).`);

  const newStartDate = createEasternDate('2026-03-03');

  for (const o of affected) {
    const storeCodesLabel = o.storeCodes?.length ? ` [${o.storeCodes.join(', ')}]` : '';
    const before = formatEasternDate(o.startDate);
    const after = formatEasternDate(newStartDate);

    if (dryRun) {
      console.log(
        `[DRY RUN] Offer ${o.id} (${o.storeCode}${storeCodesLabel} ${o.model} ${o.year ?? ''}): startDate ${before} -> ${after}`
      );
      continue;
    }

    await prisma.offer.update({
      where: { id: o.id },
      data: {
        startDate: newStartDate,
        updatedBy: 'fix-bmw-start-dates-2026-03-01-to-03-03-script',
      },
    });

    console.log(
      `Updated offer ${o.id} (${o.storeCode}${storeCodesLabel} ${o.model} ${o.year ?? ''}): startDate ${before} -> ${after}`
    );
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

