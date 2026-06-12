/**
 * BMW normalize: BmwRawOffer[] → OfferInput[] with BMW-specific field mappings.
 */

import { VehicleCondition, OfferStatus } from '@prisma/client';
import type { OfferInput } from '@/lib/domain/validation';
import { BMW_STORE_CODE } from './constants';
import type {
  BmwRawLeaseOffer,
  BmwRawLoanOffer,
  BmwRawOffer,
  ParseBmwExcelResult,
} from './parse-excel';
import { inferBmwSeries } from '@/lib/domain/bmw-series';
import { computeBestFinanceRate } from '@/lib/domain/finance-rates';

export type BmwNormalizedOffer = OfferInput;

/** Round to nearest whole number; null stays null. */
function roundToInt(n: number | null | undefined): number | null {
  if (n == null || Number.isNaN(n)) return null;
  return Math.round(n);
}

function toNum(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === 'number' && !Number.isNaN(v)) return v;
  if (typeof v === 'string') {
    const n = parseFloat(v.replace(/[,$\s%]/g, ''));
    return Number.isNaN(n) ? null : n;
  }
  return null;
}

/** Round a percentage-like number to two decimal places; null stays null. */
function roundToTwoDecimals(n: number | null | undefined): number | null {
  if (n == null || Number.isNaN(n)) return null;
  return Math.round(n * 100) / 100;
}

/** Normalize model name for cross-sheet lookup keys. */
export function normalizeBmwModelKey(modelYear: string | null, officialModelName: string | null): string {
  const year = (modelYear ?? '').trim();
  const name = (officialModelName ?? '').trim().replace(/\s+/g, ' ');
  return `${year}|${name}`;
}

/** Build lease MSRP lookup from parsed lease offers. */
export function buildLeaseMsrpLookup(leaseOffers: BmwRawLeaseOffer[]): Map<string, number> {
  const lookup = new Map<string, number>();
  for (const offer of leaseOffers) {
    const key = normalizeBmwModelKey(offer.modelYear, offer.officialModelName);
    if (!key || key === '|') continue;
    const msrp = roundToInt(offer.msrp);
    if (msrp != null && msrp > 0) {
      lookup.set(key, msrp);
    }
  }
  return lookup;
}

/** Split a BMW marketing name into model + trim. E.g. "228 Gran Coupe" → "228" / "Gran Coupe". */
function splitBmwModelAndTrim(fullName: string): { model: string; trim: string | null } {
  const normalized = fullName.trim().replace(/\s+/g, ' ');
  if (!normalized) return { model: '', trim: null };
  const parts = normalized.split(' ');
  const model = parts[0] ?? '';
  const trim = parts.slice(1).join(' ') || null;
  return { model, trim };
}

function deriveBmwModelFields(fullName: string): Pick<OfferInput, 'model' | 'trim' | 'series'> {
  const { model, trim } = splitBmwModelAndTrim(fullName);
  const series = inferBmwSeries(model);
  return { model, trim, series };
}

function normalizeAprValue(value: number | null): number | null {
  if (value == null) return null;
  const aprRaw = value > 0 && value < 0.25 ? value * 100 : value;
  return roundToTwoDecimals(aprRaw);
}

function normalizeLeaseOffer(
  raw: BmwRawLeaseOffer,
  startDate: string,
  endDate: string
): BmwNormalizedOffer {
  const year = toNum(raw.modelYear);
  const fullName = raw.officialModelName?.trim() ?? '';
  const { model, trim, series } = deriveBmwModelFields(fullName);

  return {
    storeCode: BMW_STORE_CODE,
    make: 'BMW',
    model,
    trim,
    series,
    year,
    modelCode: raw.localModelCode?.trim() || null,
    condition: VehicleCondition.NEW,
    startDate,
    endDate,
    status: OfferStatus.LIVE,
    offerType: 'Lease',
    msrp: roundToInt(raw.msrp),
    leaseMiles: roundToInt(raw.annualMileage),
    leaseCash: roundToInt(raw.leaseCredit),
    leasePayment: roundToInt(raw.leasePayment ?? null),
    leaseTerm: roundToInt(raw.leaseTerm ?? null),
    dueAtSigning: roundToInt(raw.dueAtSigning ?? null),
    acquisitionFee: roundToInt(raw.acquisitionFee),
    capCostReduction: roundToInt(raw.centerContribution),
    bonusCash: roundToInt(raw.nationalCredit),
  };
}

function resolveFinanceMsrp(
  raw: BmwRawLoanOffer,
  leaseMsrpLookup: Map<string, number>
): number | null {
  const key = normalizeBmwModelKey(raw.modelYear, raw.officialModelName);
  const fromLease = leaseMsrpLookup.get(key);
  if (fromLease != null && fromLease > 0) return fromLease;

  const totalCost = roundToInt(raw.totalCost);
  if (totalCost != null && totalCost > 0) return totalCost;

  const msrpAlt = roundToInt(raw.msrpAlt);
  if (msrpAlt != null && msrpAlt > 0) return msrpAlt;

  const msrp = roundToInt(raw.msrp);
  if (msrp != null && msrp > 1000) return msrp;

  return null;
}

function normalizeLoanOffer(
  raw: BmwRawLoanOffer,
  startDate: string,
  endDate: string,
  leaseMsrpLookup: Map<string, number>
): BmwNormalizedOffer {
  const year = toNum(raw.modelYear);
  const fullName = raw.officialModelName?.trim() ?? '';
  const { model, trim, series } = deriveBmwModelFields(fullName);

  const financeRates =
    raw.financeRateOptions.length > 0
      ? raw.financeRateOptions.map((opt) => ({
          aprRate: normalizeAprValue(opt.aprRate)!,
          aprTermMonths: roundToInt(opt.aprTermMonths)!,
        }))
      : raw.aprRate60mo != null && raw.aprTerm != null
        ? [
            {
              aprRate: normalizeAprValue(raw.aprRate60mo)!,
              aprTermMonths: roundToInt(raw.aprTerm)!,
            },
          ]
        : null;

  const best = financeRates?.length ? computeBestFinanceRate(financeRates) : null;
  const aprRate = best?.aprRate ?? normalizeAprValue(raw.aprRate60mo);
  const aprTermMonths = best?.aprTermMonths ?? roundToInt(raw.aprTerm);

  return {
    storeCode: BMW_STORE_CODE,
    make: 'BMW',
    model,
    trim,
    series,
    year,
    modelCode: raw.localModelCode?.trim() || null,
    condition: VehicleCondition.NEW,
    startDate,
    endDate,
    status: OfferStatus.LIVE,
    offerType: 'Finance',
    msrp: resolveFinanceMsrp(raw, leaseMsrpLookup),
    downPayment: roundToInt(raw.customerDownPayment),
    customerCash: roundToInt(raw.purchaseCredit),
    bonusCash: roundToInt(raw.nationalCredit),
    capCostReduction: roundToInt(raw.centerContribution),
    aprRate,
    aprTermMonths,
    financeRates,
  };
}

export interface NormalizeBmwOffersOptions {
  leaseMsrpLookup?: Map<string, number>;
}

/**
 * Normalize BMW raw offers into OfferInput[].
 * Accepts either a raw offer array or a full parse result (for lease MSRP cross-ref).
 */
export function normalizeBmwOffers(
  offersOrParsed: BmwRawOffer[] | ParseBmwExcelResult,
  startDate: string,
  endDate: string,
  options?: NormalizeBmwOffersOptions
): BmwNormalizedOffer[] {
  const offers = Array.isArray(offersOrParsed)
    ? offersOrParsed
    : [...offersOrParsed.leaseOffers, ...offersOrParsed.loanOffers];

  const leaseMsrpLookup =
    options?.leaseMsrpLookup ??
    (Array.isArray(offersOrParsed)
      ? buildLeaseMsrpLookup(offers.filter((o): o is BmwRawLeaseOffer => o.sheetType === 'lease'))
      : buildLeaseMsrpLookup(offersOrParsed.leaseOffers));

  return offers.map((raw) => {
    if (raw.sheetType === 'lease') {
      return normalizeLeaseOffer(raw, startDate, endDate);
    }
    return normalizeLoanOffer(raw, startDate, endDate, leaseMsrpLookup);
  });
}
