import 'dotenv/config';
/**
 * One-off migration: rescale BMW Finance APR values stored as fractional rates into percent units.
 * For example, 0.0399 becomes 3.99 to match the global contract (aprRate is always a percent).
 *
 * Usage:
 *   npx tsx scripts/fix-bmw-apr-rate.ts
 *
 * Optional:
 *   DRY_RUN=1 to log actions without updating the DB.
 */

import { prisma } from '@/lib/prisma';

async function main() {
  const dryRun = process.env.DRY_RUN === '1';

  const affected = await prisma.offer.findMany({
    where: {
      storeCode: 'BMW',
      offerType: 'Finance',
      aprRate: {
        not: null,
        gt: 0,
        lt: 1,
      },
    },
    select: {
      id: true,
      storeCode: true,
      model: true,
      year: true,
      aprRate: true,
      aprTermMonths: true,
    },
  });

  if (!affected.length) {
    console.log('No BMW Finance offers found with fractional aprRate between 0 and 1.');
    return;
  }

  console.log(`Found ${affected.length} BMW Finance offer(s) with fractional aprRate between 0 and 1.`);

  for (const o of affected) {
    const current = Number(o.aprRate);
    const next = current * 100;
    if (dryRun) {
      console.log(
        `[DRY RUN] Offer ${o.id} (${o.storeCode} ${o.model} ${o.year}): aprRate ${current} -> ${next}`
      );
      continue;
    }

    await prisma.offer.update({
      where: { id: o.id },
      data: {
        aprRate: next,
        updatedBy: 'fix-bmw-apr-rate-script',
      },
    });

    console.log(
      `Updated offer ${o.id} (${o.storeCode} ${o.model} ${o.year}): aprRate ${current} -> ${next}`
    );
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

