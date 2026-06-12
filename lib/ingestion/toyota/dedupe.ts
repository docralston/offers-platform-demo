/**
 * Per-trim relevance: OfferGroupKey, emit multiple rows only when non-trim fields differ.
 * When only trim differs, keep one representative row (first alphabetically by trim; blank last).
 */

import type { OfferInput } from '@/lib/domain/validation';
import type { NormalizedToyotaOffer } from './normalize';

/** Key identifying "same program" across trims for grouping. */
export type OfferGroupKey = string;

const SEP = '\x00';

/** Build stable string key for grouping. programId included when available. */
export function offerGroupKey(row: NormalizedToyotaOffer): OfferGroupKey {
  const parts = [
    row.storeCode ?? '',
    row.condition ?? 'NEW',
    String(row.year ?? ''),
    (row.make ?? '').trim(),
    (row.model ?? '').trim(),
    (row.offerType ?? '').trim(),
    (typeof row.startDate === 'string' ? row.startDate : (row.startDate as Date)?.toISOString?.()?.slice(0, 10) ?? ''),
    (typeof row.endDate === 'string' ? row.endDate : (row.endDate as Date)?.toISOString?.()?.slice(0, 10) ?? ''),
    (row as NormalizedToyotaOffer).programId ?? '',
  ];
  return parts.join(SEP);
}

/** Non-trim fields used to decide "same offer" within a group. */
function nonTrimSignature(row: NormalizedToyotaOffer): string {
  const fields = [
    row.leasePayment,
    row.leaseTerm,
    row.leaseMiles,
    row.dueAtSigning,
    row.acquisitionFee,
    row.downPayment,
    row.msrp,
    row.discount,
    row.buyFor,
    row.aprRate,
    row.aprTermMonths,
    row.rebateTotal,
    row.customerCash,
    row.leaseCash,
    row.aprCash,
    row.bonusCash,
    row.disclaimer ?? '',
    row.additionalNotes ?? '',
  ];
  return fields.map((v) => (v == null ? '' : String(v))).join(SEP);
}

/**
 * Within each group, keep multiple rows only when non-trim fields differ.
 * When only trim differs, keep one row: representative = first alphabetically by trim (blank last).
 */
export function dedupeByTrimRelevance(rows: NormalizedToyotaOffer[]): OfferInput[] {
  const byKey = new Map<OfferGroupKey, NormalizedToyotaOffer[]>();

  for (const row of rows) {
    const k = offerGroupKey(row);
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k)!.push(row);
  }

  const out: OfferInput[] = [];

  for (const group of byKey.values()) {
    const bySig = new Map<string, NormalizedToyotaOffer[]>();
    for (const row of group) {
      const sig = nonTrimSignature(row);
      if (!bySig.has(sig)) bySig.set(sig, []);
      bySig.get(sig)!.push(row);
    }

    for (const sameSig of bySig.values()) {
      if (sameSig.length === 1) {
        out.push(stripProgramId(sameSig[0]));
        continue;
      }
      const sorted = [...sameSig].sort((a, b) => {
        const ta = (a.trim ?? '').trim();
        const tb = (b.trim ?? '').trim();
        if (!ta && !tb) return 0;
        if (!ta) return 1;
        if (!tb) return -1;
        return ta.localeCompare(tb, 'en');
      });
      out.push(stripProgramId(sorted[0]));
    }
  }

  return out;
}

function stripProgramId(row: NormalizedToyotaOffer): OfferInput {
  const { programId: _, ...rest } = row;
  return rest as OfferInput;
}
