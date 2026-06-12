import 'dotenv/config';
/**
 * One-off migration: strip leading make from model field so we never store
 * "Toyota Crown" (should be "Crown"). Fixes sorting (Crown under C, not T) and
 * display ("Toyota Toyota Crown").
 *
 * Criteria:
 * - Toyota: storeCode = 'TOY' OR storeCodes contains 'TOY', model starts with "Toyota "
 * - Lexus: storeCode in ['LEXDT','LEXWG'] or storeCodes, model starts with "Lexus "
 * - BMW: storeCode = 'BMW' or storeCodes, model starts with "BMW "
 *
 * Effect:
 * - "Toyota Crown" -> "Crown"
 * - "Toyota Toyota Crown" -> "Crown"
 * - "Toyota Crown Signia" -> "Crown Signia"
 *
 * Usage:
 *   npx tsx scripts/fix-toyota-model-prefix.ts
 *
 * Optional:
 *   DRY_RUN=1 to log actions without updating the DB.
 */

import { prisma } from '@/lib/prisma';

const MAKE_PREFIXES: Array<{ stores: string[]; prefix: string }> = [
  { stores: ['TOY'], prefix: 'Toyota' },
  { stores: ['LEXDT', 'LEXWG'], prefix: 'Lexus' },
  { stores: ['BMW'], prefix: 'BMW' },
];

function stripMakePrefix(model: string, prefix: string): string {
  let m = model.trim();
  const re = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+`, 'gi');
  let prev = '';
  while (prev !== m) {
    prev = m;
    m = m.replace(re, '').trimStart();
  }
  return m || model;
}

function offerAppliesToStore(offer: { storeCode: string; storeCodes?: string[] | null }, store: string): boolean {
  return offer.storeCode === store || (offer.storeCodes?.includes(store) ?? false);
}

async function main() {
  const dryRun = process.env.DRY_RUN === '1';

  let totalUpdated = 0;

  for (const { stores, prefix } of MAKE_PREFIXES) {
    const storeConditions = stores.flatMap((s) => [
      { storeCode: s },
      { storeCodes: { has: s } },
    ]);

    const affected = await prisma.offer.findMany({
      where: {
        OR: storeConditions,
        model: {
          startsWith: prefix,
          mode: 'insensitive',
        },
      },
      select: {
        id: true,
        storeCode: true,
        storeCodes: true,
        model: true,
        year: true,
      },
    });

    // Filter to those that actually need the strip (e.g. "Toyota Crown" not "Toyota" alone)
    const toUpdate = affected.filter((o) => {
      const applies = stores.some((s) => offerAppliesToStore(o, s));
      if (!applies) return false;
      const stripped = stripMakePrefix(o.model, prefix);
      return stripped !== o.model;
    });

    if (toUpdate.length === 0) {
      console.log(`No ${prefix} offers found with model starting with "${prefix} ".`);
      continue;
    }

    console.log(`Found ${toUpdate.length} ${prefix} offer(s) to normalize model.`);

    for (const o of toUpdate) {
      const newModel = stripMakePrefix(o.model, prefix);

      if (dryRun) {
        console.log(`[DRY RUN] Offer ${o.id} (${o.storeCode} ${o.model} ${o.year ?? ''}): "${o.model}" -> "${newModel}"`);
        totalUpdated++;
        continue;
      }

      await prisma.offer.update({
        where: { id: o.id },
        data: {
          model: newModel,
          updatedBy: 'fix-toyota-model-prefix-script',
        },
      });

      console.log(`Updated offer ${o.id} (${o.storeCode} ${o.model} ${o.year ?? ''}): "${o.model}" -> "${newModel}"`);
      totalUpdated++;
    }
  }

  console.log(`\nDone. ${totalUpdated} offer(s) ${dryRun ? 'would be ' : ''}updated.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
