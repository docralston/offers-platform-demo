import 'dotenv/config';
/**
 * One-off migration: merge duplicate Lexus offers (LEXDT + LEXWG) into one row per logical offer.
 * Finds offers with storeCode in ['LEXDT','LEXWG'], groups by logical key (same as Lexus
 * ingestion externalId: model, year, condition, offerType, dates, terms, etc. — no storeCode).
 * Keeps one row (prefer LEXDT), sets storeCodes = ['LEXDT','LEXWG']; marks the rest INACTIVE.
 *
 * Run after applying the storeCodes schema migration and backfill.
 * Usage: npx tsx scripts/merge-lexus-offers.ts
 * Optional: DRY_RUN=1 to log actions without updating the DB.
 */

import { prisma } from '@/lib/prisma';
import { OfferStatus } from '@prisma/client';
import { computeLexusExternalId } from '@/lib/ingestion/external-id';
import type { OfferInput } from '@/lib/domain/validation';

const LEXUS_STORE_CODES = ['LEXDT', 'LEXWG'] as const;

function rowToOfferInput(row: {
  year: number | null;
  make: string | null;
  model: string;
  trim: string | null;
  offerType: string | null;
  startDate: Date;
  endDate: Date;
  leasePayment: number | null;
  msrp: number | null;
  leaseTerm: number | null;
  aprRate: unknown;
  aprTermMonths: number | null;
}): OfferInput {
  return {
    storeCode: 'LEXDT', // not used in hash
    model: row.model,
    year: row.year ?? undefined,
    make: row.make ?? undefined,
    trim: row.trim ?? undefined,
    offerType: (row.offerType ?? undefined) as OfferInput['offerType'],
    startDate: row.startDate,
    endDate: row.endDate,
    leasePayment: row.leasePayment ?? undefined,
    msrp: row.msrp ?? undefined,
    leaseTerm: row.leaseTerm ?? undefined,
    aprRate: row.aprRate != null ? Number(row.aprRate) : undefined,
    aprTermMonths: row.aprTermMonths ?? undefined,
  };
}

async function main() {
  const dryRun = process.env.DRY_RUN === '1';

  const lexusOffers = await prisma.offer.findMany({
    where: { storeCode: { in: [...LEXUS_STORE_CODES] } },
    select: {
      id: true,
      storeCode: true,
      storeCodes: true,
      model: true,
      year: true,
      make: true,
      trim: true,
      offerType: true,
      startDate: true,
      endDate: true,
      leasePayment: true,
      msrp: true,
      leaseTerm: true,
      aprRate: true,
      aprTermMonths: true,
      status: true,
    },
  });

  const byLogicalKey = new Map<string, typeof lexusOffers>();
  for (const o of lexusOffers) {
    const input = rowToOfferInput(o);
    const k = computeLexusExternalId(input);
    if (!byLogicalKey.has(k)) byLogicalKey.set(k, []);
    byLogicalKey.get(k)!.push(o);
  }

  let updated = 0;
  let inactivated = 0;

  for (const [, group] of byLogicalKey) {
    if (group.length <= 1) continue;

    const preferred = group.find((o) => o.storeCode === 'LEXDT') ?? group[0];
    const toInactivate = group.filter((o) => o.id !== preferred.id);

    if (dryRun) {
      console.log(
        `[DRY RUN] Would keep ${preferred.id} (${preferred.storeCode} ${preferred.model} ${preferred.year}), set storeCodes = ['LEXDT','LEXWG']`
      );
      console.log(`[DRY RUN] Would mark INACTIVE: ${toInactivate.map((o) => o.id).join(', ')}`);
    } else {
      await prisma.offer.update({
        where: { id: preferred.id },
        data: {
          storeCodes: ['LEXDT', 'LEXWG'],
          storeCode: 'LEXDT',
          updatedBy: 'merge-lexus-offers-script',
        },
      });
      updated++;

      for (const o of toInactivate) {
        await prisma.offer.update({
          where: { id: o.id },
          data: { status: OfferStatus.INACTIVE, updatedBy: 'merge-lexus-offers-script' },
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
