import 'dotenv/config';
/**
 * Merge duplicate Lexus Certified Finance offers into one per model (across LEXDT + LEXWG).
 * Groups by model; keeps one row per model with storeCodes = ['LEXDT','LEXWG'], merged financeRates, year = null;
 * marks the rest INACTIVE.
 *
 * Usage: npx tsx scripts/merge-lexus-certified-finance.ts
 * Optional: DRY_RUN=1 to log actions without updating the DB.
 */

import { prisma } from '@/lib/prisma';
import { OfferStatus, VehicleCondition } from '@prisma/client';
import { computeBestFinanceRate, parseFinanceRates, uniqueFinanceRates } from '@/lib/domain/finance-rates';

const LEXUS_STORE_CODES = ['LEXDT', 'LEXWG'] as const;

async function main() {
  const dryRun = process.env.DRY_RUN === '1';

  const offers = await prisma.offer.findMany({
    where: {
      storeCode: { in: [...LEXUS_STORE_CODES] },
      condition: VehicleCondition.CERTIFIED,
      offerType: 'Finance',
      status: { not: OfferStatus.INACTIVE },
    },
    select: {
      id: true,
      storeCode: true,
      storeCodes: true,
      model: true,
      year: true,
      aprRate: true,
      aprTermMonths: true,
      financeRates: true,
      startDate: true,
      endDate: true,
    },
  });

  const byModel = new Map<string, typeof offers>();
  for (const o of offers) {
    const model = (o.model ?? '').trim() || 'unknown';
    if (!byModel.has(model)) byModel.set(model, []);
    byModel.get(model)!.push(o);
  }

  let updated = 0;
  let inactivated = 0;

  for (const [model, group] of byModel) {
    if (group.length <= 1) continue;

    const allRates: Array<{ aprRate: number; aprTermMonths: number }> = [];
    for (const o of group) {
      const fromJson = parseFinanceRates(o.financeRates);
      for (const r of fromJson) allRates.push(r);
      if (o.aprRate != null && o.aprTermMonths != null) {
        allRates.push({ aprRate: Number(o.aprRate), aprTermMonths: o.aprTermMonths });
      }
    }
    const mergedRates = uniqueFinanceRates(allRates);
    const best = computeBestFinanceRate(mergedRates);

    const keeper =
      group.find((o) => o.storeCode === 'LEXDT') ??
      group.sort((a, b) => (a.endDate > b.endDate ? -1 : 1))[0];
    const toInactivate = group.filter((o) => o.id !== keeper.id);

    if (dryRun) {
      console.log(
        `[DRY RUN] Model "${model}": keep ${keeper.id} (${keeper.storeCode}), merge ${mergedRates.length} rate(s), best ${best ? `${best.aprRate}% / ${best.aprTermMonths} mo` : 'n/a'}`
      );
      console.log(`[DRY RUN] Would mark INACTIVE: ${toInactivate.map((o) => o.id).join(', ')}`);
      updated++;
      inactivated += toInactivate.length;
    } else {
      await prisma.offer.update({
        where: { id: keeper.id },
        data: {
          storeCode: 'LEXDT',
          storeCodes: ['LEXDT', 'LEXWG'],
          year: null,
          financeRates: mergedRates as any,
          aprRate: best?.aprRate ?? null,
          aprTermMonths: best?.aprTermMonths ?? null,
          updatedBy: 'merge-lexus-certified-finance-script',
        },
      });
      updated++;

      for (const o of toInactivate) {
        await prisma.offer.update({
          where: { id: o.id },
          data: { status: OfferStatus.INACTIVE, updatedBy: 'merge-lexus-certified-finance-script' },
        });
        inactivated++;
      }
    }
  }

  console.log(
    dryRun
      ? `[DRY RUN] Would update ${updated} keeper(s), inactivate ${inactivated} duplicate(s).`
      : `Updated ${updated} keeper(s), inactivated ${inactivated} duplicate(s).`
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
