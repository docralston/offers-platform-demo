/**
 * ToyotaRawOffer → OfferInput-compatible normalized rows.
 * Mapping rules per plan §5; cash-only suppression; no rounding of APR; leave leaseMiles/leaseTerm/dueAtSigning blank when missing.
 */

import { VehicleCondition, OfferStatus } from '@prisma/client';
import { formatAprDisclaimer } from '@/lib/domain/apr-disclaimer';
import { computeBestFinanceRate, type FinanceRateEntry } from '@/lib/domain/finance-rates';
import { computeRebateTotal } from '@/lib/domain/offer-rebate';
import type { OfferInput } from '@/lib/domain/validation';
import { TOYOTA_STORE_CODE } from './constants';
import type { ToyotaRawOffer } from './types';

/** OfferInput plus optional programId for dedupe grouping. */
export type NormalizedToyotaOffer = OfferInput & { programId?: string | null };
export type ToyotaSkipReason =
  | 'invalid_model'
  | 'missing_required_fields'
  | 'unsupported_offer_type'
  | 'cash_without_lease_or_finance_context'
  | 'finance_group_without_valid_rates';

export interface ToyotaNormalizeStats {
  skippedByReason: Record<ToyotaSkipReason, number>;
  skippedOffers: Array<{
    reason: ToyotaSkipReason;
    model: string | null;
    year: number | null;
    programType: string | null;
    apr: number | null;
    aprTermMonths: number | null;
    monthlyPayment: number | null;
    termMonths: number | null;
  }>;
}

function toNum(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === 'number' && !Number.isNaN(v)) return v;
  if (typeof v === 'string') {
    const n = parseFloat(v.replace(/[,$\s]/g, ''));
    return Number.isNaN(n) ? null : n;
  }
  return null;
}

function toStr(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s || null;
}

/** Parse YYYY-MM-DD or common variants to YYYY-MM-DD string. */
function toDateString(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === 'string') {
    const m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(v);
    if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) {
      const y = d.getFullYear();
      const mo = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${mo}-${day}`;
    }
  }
  return null;
}

/** Infer offerType from raw: Lease | Finance | Other. Cash-only detected elsewhere for suppression. */
function inferOfferType(r: ToyotaRawOffer): 'Lease' | 'Finance' | 'Cash' | 'Other' {
  const t = (toStr(r.programType) ?? '').toLowerCase();
  if (t.includes('lease')) return 'Lease';
  if (t.includes('finance') || t.includes('apr')) return 'Finance';
  if (t.includes('cash')) return 'Cash';
  if (r.monthlyPayment != null && r.termMonths != null) return 'Lease';
  if (r.apr != null && r.aprTermMonths != null) return 'Finance';
  return 'Other';
}

/** Rebate/special offers we skip; header fragments that are not vehicle model names. */
const SKIP_MODELS = new Set(['college', 'military', 'hybrids and', 'crossovers and']);

function isInvalidModel(model: string | null): boolean {
  if (!model || model.length < 2) return true;
  const lower = model.toLowerCase().trim();
  if (SKIP_MODELS.has(lower)) return true;
  if (lower.endsWith(' and')) return true;
  return false;
}

/** Normalize known short/ambiguous model names (when no card context available, e.g. from API). */
function normalizeModelName(model: string): string {
  let m = model.trim();

  // Some Toyota payloads include the make in the model field (e.g. "Toyota Crown").
  // Strip any leading "Toyota" tokens so we don't render "Toyota Toyota Crown".
  const makePrefix = 'toyota';
  while (m.toLowerCase().startsWith(`${makePrefix} `)) {
    m = m.slice(makePrefix.length).trimStart();
  }

  if (m === 'Land') return 'Land Cruiser';
  return m;
}

/**
 * Map one ToyotaRawOffer to OfferInput. Returns null if required fields missing or cash-only (no lease/finance context).
 */
export function normalizeOne(raw: ToyotaRawOffer): NormalizedToyotaOffer | null {
  return normalizeOneWithReason(raw).row;
}

function normalizeOneWithReason(raw: ToyotaRawOffer): {
  row: NormalizedToyotaOffer | null;
  reason: ToyotaSkipReason | null;
} {
  const storeCode = TOYOTA_STORE_CODE;
  const condition = VehicleCondition.NEW;
  const make = 'Toyota';
  let model = toStr(raw.model);

  // Skip rebate/special offers (College, Military) and header fragments (Hybrids and, Crossovers and)
  if (!model || isInvalidModel(model)) return { row: null, reason: 'invalid_model' };
  // Strip stray "Customer" (e.g. "Tundra i-FORCE MAXCustomer" from "Customer Cash" text)
  model = model.replace(/\s*Customer\s*$/i, '').trim();
  model = normalizeModelName(model);

  // Combine model + trim when trim denotes a distinct model variant (not a grade like "SE"/"XLE")
  const rawTrim = toStr(raw.trim);
  const variantTrims = ['i-force max', 'plug-in hybrid', 'plug in hybrid', 'hatchback', 'prime', 'hybrid', 'cross'];
  const isVariantTrim =
    rawTrim &&
    (rawTrim.includes(' ') || variantTrims.some((v) => rawTrim.toLowerCase().includes(v))) &&
    !model.toLowerCase().includes(rawTrim.toLowerCase());
  if (isVariantTrim) {
    model = `${model} ${rawTrim}`.trim();
  }

  const year = toNum(raw.year);
  const trim = toStr(raw.trim) ?? null;
  const modelCodeNum = toNum(raw.modelCode);
  const modelCode = modelCodeNum != null ? String(modelCodeNum) : null;
  const startDate = toDateString(raw.startDate);
  const endDate = toDateString(raw.endDate);

  // endDate is required, but if missing from DOM extraction, skip this offer
  // (DOM extraction should have extracted it from "Exp. MM/DD/YY" text)
  if (!model || year == null || !startDate || !endDate) {
    return { row: null, reason: 'missing_required_fields' };
  }

  const offerType = inferOfferType(raw);

  // Exclude offers that are not lease or buy/finance
  if (offerType === 'Other') return { row: null, reason: 'unsupported_offer_type' };

  if (offerType === 'Cash') {
    const hasLease = raw.monthlyPayment != null || raw.termMonths != null;
    const hasFinance = raw.apr != null || raw.aprTermMonths != null;
    if (!hasLease && !hasFinance) {
      return { row: null, reason: 'cash_without_lease_or_finance_context' };
    }
  }

  const leasePayment = toNum(raw.monthlyPayment) ?? null;
  const leaseTerm = toNum(raw.termMonths) ?? null;
  // Lease offers: assume 10k mi/yr when not specified
  let leaseMiles = toNum(raw.milesPerYear) ?? null;
  if (offerType === 'Lease' && leaseMiles == null) leaseMiles = 10000;
  const dueAtSigning = toNum(raw.dueAtSigning) ?? null;
  let acquisitionFee = toNum(raw.acquisitionFee) ?? null;
  if (acquisitionFee == null) acquisitionFee = 750;
  const downPayment = toNum(raw.downPayment) ?? null;
  // Toyota uses "Total SRP of $33,134" in lease disclaimers; parse when msrp not in raw
  let msrp = toNum(raw.msrp) ?? null;
  const disclaimerStr = toStr(raw.disclaimer);
  if (msrp == null && disclaimerStr) {
    const m = disclaimerStr.match(/Total SRP of \$\s*([0-9,]+)/i);
    if (m?.[1]) {
      const n = parseInt(m[1].replace(/,/g, ''), 10);
      if (!Number.isNaN(n) && n > 0) msrp = n;
    }
  }
  const discount = toNum(raw.discount) ?? null;
  const buyFor = toNum(raw.buyFor) ?? null;
  const aprRate = toNum(raw.apr) ?? null;
  const aprTermMonths = toNum(raw.aprTermMonths) ?? null;
  const customerCash = toNum(raw.customerCash) ?? null;
  const leaseCash = toNum(raw.leaseCash) ?? null;
  const aprCash = toNum(raw.aprCash) ?? null;
  const bonusCash = toNum(raw.bonusCash) ?? null;

  const rebateInput = {
    rebateTotal: toNum(raw.rebateTotal) ?? null,
    customerCash,
    leaseCash,
    aprCash,
    bonusCash,
  };
  const rebateTotal = computeRebateTotal(rebateInput) ?? rebateInput.rebateTotal ?? null;

  const row: NormalizedToyotaOffer = {
    storeCode,
    make,
    model,
    year,
    trim,
    modelCode,
    condition,
    startDate,
    endDate,
    status: OfferStatus.LIVE,
    inventoryUrl: toStr(raw.inventoryUrl) ?? null,
    imageUrl: toStr(raw.imageUrl) ?? null,
    offerType,
    leasePayment,
    leaseTerm,
    leaseMiles,
    dueAtSigning,
    acquisitionFee,
    downPayment,
    msrp,
    discount,
    buyFor,
    stockNumber: toStr(raw.stockNumber) ?? null,
    aprRate,
    aprTermMonths,
    rebateTotal,
    customerCash,
    leaseCash,
    aprCash,
    bonusCash,
    disclaimer:
      offerType === 'Finance' && aprRate != null && aprTermMonths != null
        ? formatAprDisclaimer(aprRate, aprTermMonths)
        : (toStr(raw.disclaimer) ?? null),
    additionalNotes: toStr(raw.additionalNotes) ?? null,
    programId: toStr(raw.programId) ?? null,
  };

  return { row, reason: null };
}

/** Group key for Finance offers: one row per (storeCode, model, year, condition). */
function financeGroupKey(row: NormalizedToyotaOffer): string {
  return [
    row.storeCode ?? '',
    (row.model ?? '').trim(),
    String(row.year ?? ''),
    (row.condition ?? VehicleCondition.NEW).toString(),
  ].join('\0');
}

/**
 * Normalize all raw offers; skip cash-only and rows missing required fields.
 * Finance offers are grouped by (storeCode, model, year, condition); each group
 * becomes one row with financeRates and best aprRate/aprTermMonths.
 */
export function normalizeRawOffers(rawOffers: ToyotaRawOffer[]): NormalizedToyotaOffer[] {
  return normalizeRawOffersDetailed(rawOffers).rows;
}

export function normalizeRawOffersDetailed(rawOffers: ToyotaRawOffer[]): {
  rows: NormalizedToyotaOffer[];
  stats: ToyotaNormalizeStats;
} {
  const skippedByReason: Record<ToyotaSkipReason, number> = {
    invalid_model: 0,
    missing_required_fields: 0,
    unsupported_offer_type: 0,
    cash_without_lease_or_finance_context: 0,
    finance_group_without_valid_rates: 0,
  };
  const skippedOffers: ToyotaNormalizeStats['skippedOffers'] = [];
  const all: NormalizedToyotaOffer[] = [];
  for (const r of rawOffers) {
    const { row, reason } = normalizeOneWithReason(r);
    if (row) all.push(row);
    else if (reason) {
      skippedByReason[reason]++;
      skippedOffers.push({
        reason,
        model: toStr(r.model),
        year: toNum(r.year),
        programType: toStr(r.programType),
        apr: toNum(r.apr),
        aprTermMonths: toNum(r.aprTermMonths),
        monthlyPayment: toNum(r.monthlyPayment),
        termMonths: toNum(r.termMonths),
      });
    }
  }

  const nonFinance = all.filter((row) => row.offerType !== 'Finance');
  const financeRows = all.filter((row) => row.offerType === 'Finance');

  const financeByKey = new Map<string, NormalizedToyotaOffer[]>();
  for (const row of financeRows) {
    const key = financeGroupKey(row);
    if (!financeByKey.has(key)) financeByKey.set(key, []);
    financeByKey.get(key)!.push(row);
  }

  // Build lease MSRP lookup by (storeCode, model, year, condition) so finance can inherit it
  const leaseMsrpByKey = new Map<string, number>();
  for (const row of nonFinance) {
    if (row.msrp != null && row.msrp > 0) {
      const k = financeGroupKey(row);
      if (!leaseMsrpByKey.has(k)) leaseMsrpByKey.set(k, row.msrp);
    }
  }

  const consolidatedFinance: NormalizedToyotaOffer[] = [];
  for (const [key, group] of financeByKey) {
    const rates: FinanceRateEntry[] = [];
    for (const row of group) {
      if (row.aprRate != null && row.aprTermMonths != null) {
        rates.push({ aprRate: row.aprRate, aprTermMonths: row.aprTermMonths });
      }
    }
    const best = computeBestFinanceRate(rates);
    if (best == null) {
      skippedByReason.finance_group_without_valid_rates++;
      skippedOffers.push({
        reason: 'finance_group_without_valid_rates',
        model: toStr(group[0]?.model),
        year: toNum(group[0]?.year),
        programType: 'Finance',
        apr: null,
        aprTermMonths: null,
        monthlyPayment: null,
        termMonths: null,
      });
      continue;
    }
    const first = group[0];
    const disclaimer = formatAprDisclaimer(best.aprRate, best.aprTermMonths) ?? first.disclaimer ?? null;
    const msrp = first.msrp ?? leaseMsrpByKey.get(key) ?? null;
    consolidatedFinance.push({
      ...first,
      financeRates: rates,
      aprRate: best.aprRate,
      aprTermMonths: best.aprTermMonths,
      disclaimer,
      msrp,
    });
  }

  return {
    rows: [...nonFinance, ...consolidatedFinance],
    stats: { skippedByReason, skippedOffers },
  };
}
