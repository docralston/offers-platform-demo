import 'dotenv/config';
/**
 * One-off migration: merge duplicate Finance offers by (storeCode, model, year, condition).
 * For each group, keeps one row with financeRates (all rate/term combos) and best aprRate/aprTermMonths;
 * marks the rest INACTIVE.
 *
 * Run after applying the financeRates schema migration.
 * Usage: npx tsx scripts/merge-finance-offers.ts
 * Optional: DRY_RUN=1 to log actions without updating the DB.
 */

import { prisma } from '@/lib/prisma';
import { OfferStatus } from '@prisma/client';
import { computeBestFinanceRate } from '@/lib/domain/finance-rates';

function key(o: { storeCode: string; model: string; year: number | null; condition: string }) {
  return [o.storeCode, o.model, String(o.year ?? ''), o.condition].join('\0');
}

async function main() {
  const dryRun = process.env.DRY_RUN === '1';

  const financeOffers = await prisma.offer.findMany({
    where: { offerType: 'Finance' },
    select: {
      id: true,
      storeCode: true,
      model: true,
      year: true,
      condition: true,
      aprRate: true,
      aprTermMonths: true,
      status: true,
    },
  });

  const byKey = new Map<string, typeof financeOffers>();
  for (const o of financeOffers) {
    const k = key(o);
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k)!.push(o);
  }

  let updated = 0;
  let inactivated = 0;

  for (const [, group] of byKey) {
    if (group.length <= 1) continue;

    const rates = group
      .filter((o) => o.aprRate != null && o.aprTermMonths != null)
      .map((o) => ({
        aprRate: Number(o.aprRate),
        aprTermMonths: o.aprTermMonths!,
      }));
    const best = computeBestFinanceRate(rates);
    if (best == null) continue;

    const keeper = group[0];
    const toInactivate = group.slice(1);

    if (dryRun) {
      console.log(`[DRY RUN] Would update ${keeper.id} (${keeper.storeCode} ${keeper.model} ${keeper.year} ${keeper.condition}) with financeRates (${rates.length} entries), best ${best.aprRate}% / ${best.aprTermMonths} mo.`);
      console.log(`[DRY RUN] Would mark INACTIVE: ${toInactivate.map((o) => o.id).join(', ')}`);
    } else {
      await prisma.offer.update({
        where: { id: keeper.id },
        data: {
          financeRates: rates,
          aprRate: best.aprRate,
          aprTermMonths: best.aprTermMonths,
          updatedBy: 'merge-finance-offers-script',
        },
      });
      updated++;

      for (const o of toInactivate) {
        await prisma.offer.update({
          where: { id: o.id },
          data: { status: OfferStatus.INACTIVE, updatedBy: 'merge-finance-offers-script' },
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
