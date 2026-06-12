export interface CertifiedFinanceLike {
  storeCode?: string | null;
  make?: string | null;
  model?: string | null;
  series?: string | null;
  aprRate?: unknown;
  aprTermMonths?: number | null;
}

/**
 * Given a collection of certified finance-like offers (already filtered),
 * compute how many represent duplicate rows for the same logical offer.
 *
 * Logical key: storeCode + make + series/model + aprRate + aprTermMonths.
 * This intentionally ignores year so that certified finance offers like
 * "2020–2026 3 Series at 4.99% for 60 months" are counted once.
 */
export function dedupeCertifiedFinanceCount(records: CertifiedFinanceLike[]): {
  raw: number;
  deduped: number;
  duplicated: number;
} {
  const cfKey = (o: CertifiedFinanceLike) =>
    [
      o.storeCode ?? '',
      (o.make ?? '').trim(),
      ((o.series ?? '') || (o.model ?? '')).trim(),
      o.aprRate == null ? '' : String(o.aprRate),
      o.aprTermMonths == null ? '' : String(o.aprTermMonths),
    ].join('\0');

  const uniqueCfKeys = new Set<string>();
  for (const o of records) {
    uniqueCfKeys.add(cfKey(o));
  }

  const raw = records.length;
  const deduped = uniqueCfKeys.size;
  const duplicated = Math.max(0, raw - deduped);

  return { raw, deduped, duplicated };
}

