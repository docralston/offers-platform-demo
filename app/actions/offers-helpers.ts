import { OfferTypeEnum, VehicleCondition } from '@prisma/client';
import { computeBestFinanceRateForVehicle } from '@/lib/domain/finance-rates';
import type { OfferInput } from '@/lib/domain/validation';

/** Certified finance offers intentionally omit year. */
export function yearForOffer(data: {
  condition?: VehicleCondition;
  offerType?: string | null;
  year?: number | null;
}): number | null {
  const isCertifiedFinance =
    data.condition === VehicleCondition.CERTIFIED && toOfferType(data.offerType) === OfferTypeEnum.Finance;
  return isCertifiedFinance ? null : (data.year ?? null);
}

export function toOfferType(v: unknown): OfferTypeEnum | null {
  if (v == null) return null;
  const s = typeof v === 'string' ? v.trim() : String(v);
  const lower = s.toLowerCase();
  if (lower === 'lease') return OfferTypeEnum.Lease;
  if (lower === 'finance') return OfferTypeEnum.Finance;
  if (lower === 'cash') return OfferTypeEnum.Cash;
  return null;
}

/** For Finance offers: derive best aprRate/aprTermMonths from financeRates when present. */
export function financeRatesPayload(
  data: OfferInput
): { aprRate: number | null; aprTermMonths: number | null; financeRates: OfferInput['financeRates'] } {
  const rates = data.financeRates ?? null;
  if (data.offerType === 'Finance' && rates != null && rates.length > 0) {
    const best = computeBestFinanceRateForVehicle(rates, data.fuelType ?? null);
    if (best) {
      return { aprRate: best.aprRate, aprTermMonths: best.aprTermMonths, financeRates: rates };
    }
  }
  return {
    aprRate: data.aprRate ?? null,
    aprTermMonths: data.aprTermMonths ?? null,
    financeRates: rates,
  };
}

/** Group Finance import rows by (storeCode, model, year, condition); merge into one offer per group with financeRates. */
export function mergeFinanceRowsForImport(
  rows: Array<{ offer: OfferInput; rowIndex: number }>
): Array<{ offer: OfferInput; rowIndex: number }> {
  const nonFinance = rows.filter((r) => r.offer.offerType !== 'Finance');
  const financeRows = rows.filter((r) => r.offer.offerType === 'Finance');
  const key = (o: OfferInput) =>
    [o.storeCode ?? '', (o.model ?? '').trim(), String(o.year ?? ''), (o.condition ?? VehicleCondition.NEW).toString()].join('\0');
  const byKey = new Map<string, typeof financeRows>();
  for (const r of financeRows) {
    const k = key(r.offer);
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k)!.push(r);
  }
  const merged: Array<{ offer: OfferInput; rowIndex: number }> = [];
  for (const [, group] of byKey) {
    const rates = group
      .filter((r) => r.offer.aprRate != null && r.offer.aprTermMonths != null)
      .map((r) => ({ aprRate: r.offer.aprRate!, aprTermMonths: r.offer.aprTermMonths! }));
    const firstFuel = group[0]?.offer.fuelType ?? null;
    const best = computeBestFinanceRateForVehicle(rates, firstFuel);
    if (best == null) continue;
    const first = group[0];
    merged.push({
      rowIndex: first.rowIndex,
      offer: {
        ...first.offer,
        financeRates: rates,
        aprRate: best.aprRate,
        aprTermMonths: best.aprTermMonths,
      },
    });
  }
  return [...nonFinance, ...merged];
}
