/**
 * Helpers for finance offer rate/term arrays.
 * Best = lowest aprRate, then longest aprTermMonths for that rate.
 * When vehicle fuelType and per-row fuelType are set, pick best only among matching rows.
 */

import type { Offer, VehicleFuelType } from '@prisma/client';

const FUEL_TYPE_VALUES = new Set<string>(['GAS', 'HYBRID', 'PLUG_IN_HYBRID']);

function parseFuelTypeField(v: unknown): VehicleFuelType | undefined {
  if (typeof v !== 'string' || !FUEL_TYPE_VALUES.has(v)) return undefined;
  return v as VehicleFuelType;
}

export interface FinanceRateEntry {
  aprRate: number;
  aprTermMonths: number;
  /** When set, this APR row applies only to this fuel class; omit for "any". */
  fuelType?: VehicleFuelType;
}

/**
 * Parse financeRates from DB (Json) into a typed array. Returns [] if invalid or null.
 */
export function parseFinanceRates(value: unknown): FinanceRateEntry[] {
  if (value == null) return [];
  if (!Array.isArray(value)) return [];
  const out: FinanceRateEntry[] = [];
  for (const item of value) {
    if (item == null || typeof item !== 'object') continue;
    const raw = item as Record<string, unknown>;
    const aprRate = typeof raw.aprRate === 'number' ? raw.aprRate : null;
    const aprTermMonths = typeof raw.aprTermMonths === 'number' ? raw.aprTermMonths : null;
    const fuelType = parseFuelTypeField(raw.fuelType);
    if (aprRate != null && aprTermMonths != null && !Number.isNaN(aprRate) && !Number.isNaN(aprTermMonths)) {
      const entry: FinanceRateEntry = { aprRate, aprTermMonths };
      if (fuelType) entry.fuelType = fuelType;
      out.push(entry);
    }
  }
  return out;
}

/**
 * Deduplicate by (aprRate, aprTermMonths, fuelType). Keeps first occurrence of each tuple.
 */
export function uniqueFinanceRates(rates: FinanceRateEntry[]): FinanceRateEntry[] {
  const seen = new Set<string>();
  return rates.filter((r) => {
    const key = `${r.aprRate}-${r.aprTermMonths}-${r.fuelType ?? ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Sort for display: aprRate ascending, then aprTermMonths descending.
 * Does not mutate the input.
 */
export function sortFinanceRatesForDisplay(rates: FinanceRateEntry[]): FinanceRateEntry[] {
  return [...rates].sort((a, b) => {
    if (a.aprRate !== b.aprRate) return a.aprRate - b.aprRate;
    return b.aprTermMonths - a.aprTermMonths;
  });
}

/**
 * Best offer rule: lowest aprRate, then longest aprTermMonths for that rate.
 * Returns null if rates is empty or invalid.
 */
export function computeBestFinanceRate(rates: FinanceRateEntry[]): FinanceRateEntry | null {
  if (!rates.length) return null;
  const sorted = sortFinanceRatesForDisplay(rates);
  return sorted[0];
}

/**
 * Pick best rate for persistence/display when vehicle fuel is known:
 * prefer rows matching vehicleFuelType or untagged rows; fall back to global best.
 */
export function computeBestFinanceRateForVehicle(
  rates: FinanceRateEntry[],
  vehicleFuelType: VehicleFuelType | null | undefined
): FinanceRateEntry | null {
  if (!rates.length) return null;
  if (vehicleFuelType) {
    const matched = rates.filter((r) => !r.fuelType || r.fuelType === vehicleFuelType);
    if (matched.length > 0) return computeBestFinanceRate(matched);
  }
  return computeBestFinanceRate(rates);
}

/**
 * From an array of { aprRate, aprTermMonths }, compute best and return
 * { best: { aprRate, aprTermMonths } | null, sortedRates for display }.
 */
export function getBestAndSorted(rates: FinanceRateEntry[]) {
  const sorted = sortFinanceRatesForDisplay(rates);
  const best = sorted.length ? sorted[0] : null;
  return { best, sortedRates: sorted };
}

export type FinanceAprResolution = {
  apr: { aprRate: number; aprTermMonths: number } | null;
  /** Operator-facing messages when fuel matching fell back or was unknown. */
  alerts: string[];
};

function hasFinanceShape(offer: Pick<Offer, 'offerType' | 'aprRate' | 'aprTermMonths' | 'financeRates'>): boolean {
  return (
    offer.offerType === 'Finance' &&
    ((offer.aprRate != null && offer.aprTermMonths != null) ||
      (offer.financeRates != null &&
        Array.isArray(offer.financeRates) &&
        (offer.financeRates as unknown[]).length > 0))
  );
}

/**
 * Resolve displayed/stored APR for a finance offer using vehicle fuelType and optional per-row fuel in financeRates.
 */
export function resolveFinanceApr(
  offer: Pick<Offer, 'offerType' | 'aprRate' | 'aprTermMonths' | 'financeRates' | 'fuelType'>
): FinanceAprResolution {
  const alerts: string[] = [];
  if (!hasFinanceShape(offer)) {
    return { apr: null, alerts };
  }

  const rates = parseFinanceRates(offer.financeRates);
  const fuel = offer.fuelType ?? null;
  const hasTopLevel = offer.aprRate != null && offer.aprTermMonths != null;

  if (rates.length > 0) {
    if (fuel) {
      const matched = rates.filter((r) => !r.fuelType || r.fuelType === fuel);
      if (matched.length > 0) {
        const best = computeBestFinanceRate(matched)!;
        return { apr: { aprRate: best.aprRate, aprTermMonths: best.aprTermMonths }, alerts };
      }
      const best = computeBestFinanceRate(rates);
      if (best) {
        alerts.push(
          `No APR row matches fuel type ${fuel}; using best available rate from program (${best.aprRate}% / ${best.aprTermMonths} mo). Verify before publishing.`
        );
        return { apr: { aprRate: best.aprRate, aprTermMonths: best.aprTermMonths }, alerts };
      }
    } else {
      const best = computeBestFinanceRate(rates);
      if (best) {
        return { apr: { aprRate: best.aprRate, aprTermMonths: best.aprTermMonths }, alerts };
      }
    }
  }

  if (hasTopLevel) {
    const apr = { aprRate: Number(offer.aprRate), aprTermMonths: offer.aprTermMonths! };
    return { apr, alerts };
  }

  return { apr: null, alerts };
}

/**
 * APR used for cards, specials, and email (fuel-aware).
 */
export function getFinanceApr(offer: Offer): { aprRate: number; aprTermMonths: number } | null {
  return resolveFinanceApr(offer).apr;
}
