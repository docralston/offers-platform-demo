import { Prisma } from '@prisma/client';
import { formatAprPercent } from './apr-format';
import { resolveFinanceApr } from './finance-rates';

export type OfferType = 'lease' | 'finance' | 'buyFor' | 'discount' | 'cash' | 'other';

/** Explicit DB enum: "Lease" | "Finance" | "Cash" | "Other" */
export const OFFER_TYPE_EXPLICIT = ['Lease', 'Finance', 'Cash', 'Other'] as const;
export type OfferTypeExplicit = (typeof OFFER_TYPE_EXPLICIT)[number];

/**
 * Active offer types (currently in use).
 * Other is deprecated; kept in OFFER_TYPE_EXPLICIT for backward compatibility with existing DB rows.
 */
export const OFFER_TYPE_ACTIVE = ['Lease', 'Finance', 'Cash'] as const;
export type OfferTypeActive = (typeof OFFER_TYPE_ACTIVE)[number];

/** Display label for explicit offerType; falls back to derived getOfferTypeLabel when null. */
export function getDisplayOfferType(
  offer: { offerType?: string | null; financeRates?: unknown } & OfferTypeFields
): string {
  if (offer.offerType && OFFER_TYPE_EXPLICIT.includes(offer.offerType as OfferTypeExplicit)) {
    return offer.offerType;
  }
  // When offerType is null/not set, treat as Finance if we have finance terms (e.g. legacy or mis-ingested rows)
  if (
    offer.aprRate != null ||
    offer.aprTermMonths != null ||
    (offer.financeRates != null && Array.isArray(offer.financeRates) && offer.financeRates.length > 0)
  ) {
    return 'Finance';
  }
  return getOfferTypeLabel(offer);
}

export type OfferTypeFields = {
  leasePayment?: number | null;
  leaseTerm?: number | null;
  leaseMiles?: number | null;
  dueAtSigning?: number | null;
  msrp?: number | null;
  discount?: number | null;
  buyFor?: number | null;
  /** number (input) or Prisma Decimal (from DB) */
  aprRate?: number | Prisma.Decimal | null;
  aprTermMonths?: number | null;
};

export function formatCurrency(n: number): string {
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  });
}

/**
 * Format lease miles for display. Accepts either:
 * - Raw miles (e.g. 10000 → "10k")
 * - Thousands (e.g. 10 → "10k")
 */
export function formatLeaseMiles(n: number): string {
  if (n >= 1000) {
    const thousands = n / 1000;
    const str = Number.isInteger(thousands)
      ? thousands.toString()
      : thousands.toFixed(1).replace(/\.0$/, '');
    return `${str}k`;
  }
  return `${n}k`;
}

/**
 * Offer type rules (first match wins):
 * - Lease: leasePayment != null && leaseTerm != null
 * - Finance: offerType === 'Finance' or (aprRate/aprTermMonths or financeRates present)
 * - Cash: offerType === 'Cash'
 * - Buy for: buyFor != null
 * - Discount: buyFor == null && discount != null && discount > 0
 * - Other: everything else (deprecated)
 */
export function getOfferType(offer: OfferTypeFields & { offerType?: string | null; financeRates?: unknown }): OfferType {
  if (offer.leasePayment != null && offer.leaseTerm != null) return 'lease';
  if (offer.offerType === 'Finance') return 'finance';
  if (offer.offerType === 'Cash') return 'cash';
  if (
    offer.aprRate != null ||
    offer.aprTermMonths != null ||
    (offer.financeRates != null && Array.isArray(offer.financeRates) && offer.financeRates.length > 0)
  ) {
    return 'finance';
  }
  if (offer.buyFor != null) return 'buyFor';
  if (offer.buyFor == null && offer.discount != null && offer.discount > 0) return 'discount';
  return 'other';
}

export function getOfferTypeLabel(offer: OfferTypeFields & { offerType?: string | null; financeRates?: unknown }): string {
  const t = getOfferType(offer);
  const labels: Record<OfferType, string> = {
    lease: 'Lease',
    finance: 'Finance',
    cash: 'Cash',
    buyFor: 'Buy for',
    discount: 'Discount',
    other: 'Other',
  };
  return labels[t];
}

/** Display label for Condition (e.g. "New", "Used", "Certified") */
export function formatConditionLabel(c: string | null | undefined): string {
  const v = (c || 'NEW').toUpperCase();
  if (v === 'USED') return 'Used';
  if (v === 'CERTIFIED') return 'Certified';
  return 'New';
}

/** Prefix for vehicle title when Used or Certified; empty for New */
export function formatConditionPrefix(c: string | null | undefined): string {
  const v = (c || 'NEW').toUpperCase();
  if (v === 'USED') return 'Used ';
  if (v === 'CERTIFIED') return 'Certified ';
  return '';
}

/**
 * Model string safe for use in a "make + model" display.
 * Strips any leading make (e.g. "Toyota ") from model so we never show "Toyota Toyota Crown".
 * Uses regex with \s+ to handle non-breaking spaces and other Unicode whitespace.
 */
export function modelForDisplay(make: string | null | undefined, model: string | null | undefined): string {
  const m = (model ?? '').trim();
  const makeStr = (make ?? '').trim();
  if (!m || !makeStr) return m;
  let rest = m;
  const makeEscaped = makeStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const makePrefixRe = new RegExp(`^${makeEscaped}\\s+`, 'gi');
  let prev = '';
  while (prev !== rest) {
    prev = rest;
    rest = rest.replace(makePrefixRe, '').trimStart();
  }
  return rest || m;
}

/** Known makes we strip from model when make is null (avoids "Toyota Toyota Crown"). */
const KNOWN_MAKES = ['Toyota', 'Lexus', 'BMW'] as const;

/**
 * Model string suitable for sorting (e.g. "Crown" not "Toyota Crown").
 * Use when sorting offers so Crown appears under C, not T.
 */
export function getModelForSort(offer: { make?: string | null; model?: string | null }): string {
  let make = offer?.make?.trim() || null;
  let model = offer?.model ?? null;
  if (!make && model) {
    const inferred = inferMakeFromModel(model);
    if (inferred) {
      make = inferred.make;
      model = inferred.model;
    }
  }
  return modelForDisplay(make, model) ?? '';
}

/** When make is null, infer it from model if model starts with a known make (e.g. "Toyota Crown"). */
function inferMakeFromModel(model: string | null | undefined): { make: string; model: string } | null {
  const m = (model ?? '').trim();
  if (!m) return null;
  for (const make of KNOWN_MAKES) {
    const re = new RegExp(`^${make.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+`, 'i');
    if (re.test(m)) {
      return { make, model: m.replace(re, '').trimStart() || m };
    }
  }
  return null;
}

/**
 * Vehicle title parts for display: [conditionPrefix, year, make, model].
 * Uses modelForDisplay so we never double the brand (e.g. "Toyota Toyota Crown").
 * When make is null, infers make from model (e.g. "Toyota Crown" → make=Toyota, model=Crown).
 */
export function vehicleTitleParts(offer: {
  condition?: string | null;
  year?: number | null;
  make?: string | null;
  model?: string | null;
}): string[] {
  const prefix = formatConditionPrefix(offer?.condition);
  let make = offer?.make?.trim() || null;
  let model = offer?.model ?? null;
  if (!make && model) {
    const inferred = inferMakeFromModel(model);
    if (inferred) {
      make = inferred.make;
      model = inferred.model;
    }
  }
  const modelDisplay = modelForDisplay(make, model);
  const year = offer?.year != null && !Number.isNaN(Number(offer.year)) ? Number(offer.year) : null;
  const parts = [prefix, year, make, modelDisplay].filter((x) => x != null && x !== '');
  return parts.map(String);
}

/**
 * Full vehicle title string, e.g. "2026 Toyota Crown" or "Certified Toyota Crown".
 * Safe for any offer-like object; never throws.
 */
export function formatVehicleTitle(offer: {
  condition?: string | null;
  year?: number | null;
  make?: string | null;
  model?: string | null;
  trim?: string | null;
} | null | undefined): string {
  if (offer == null || typeof offer !== 'object') return '';
  const parts = vehicleTitleParts(offer);
  const title = parts.join(' ').trim();
  const trim = offer.trim != null && String(offer.trim).trim() !== '' ? String(offer.trim).trim() : null;
  return trim ? `${title} ${trim}`.trim() : title;
}

/** Format APR line for offer details: "4.99% APR up to 72 mo." or "4.99% APR" if no term. */
export function formatAprSummary(aprRate: number | null | undefined, aprTermMonths: number | null | undefined): string {
  if (aprRate == null || Number.isNaN(Number(aprRate))) return '';
  const rate = Number(aprRate);
  if (aprTermMonths != null && !Number.isNaN(Number(aprTermMonths))) {
    return `${formatAprPercent(rate)} APR up to ${aprTermMonths} mo.`;
  }
  return `${formatAprPercent(rate)} APR`;
}

export function getOfferDetailsSummary(
  offer: OfferTypeFields & {
    offerType?: string | null;
    financeRates?: unknown;
    fuelType?: import('@prisma/client').VehicleFuelType | null;
  }
): string {
  let aprNum = offer.aprRate != null ? Number(offer.aprRate) : null;
  let aprTerm = offer.aprTermMonths != null ? Number(offer.aprTermMonths) : null;
  if (offer.offerType === 'Finance') {
    const r = resolveFinanceApr(offer as Parameters<typeof resolveFinanceApr>[0]);
    if (r.apr) {
      aprNum = r.apr.aprRate;
      aprTerm = r.apr.aprTermMonths;
    }
  }
  const aprLine = aprNum != null && !Number.isNaN(aprNum) ? formatAprSummary(aprNum, aprTerm) : '';

  const t = getOfferType(offer);
  let main = '—';
  switch (t) {
    case 'lease': {
      const parts: string[] = [];
      if (offer.leasePayment != null) parts.push(`${formatCurrency(offer.leasePayment)}/mo.`);
      if (offer.leaseTerm != null) parts.push(`${offer.leaseTerm} mo.`);
      main = parts.join(', ') || '—';
      if (offer.leaseMiles != null) main += `, ${formatLeaseMiles(offer.leaseMiles)} mi/yr`;
      if (offer.dueAtSigning != null) main += `; ${formatCurrency(offer.dueAtSigning)} due at signing`;
      break;
    }
    case 'cash':
    case 'buyFor': {
      const buyMain = offer.buyFor != null ? formatCurrency(offer.buyFor) : '—';
      const extra =
        offer.discount != null && offer.discount > 0 ? ` (${formatCurrency(offer.discount)} off)` : '';
      main = buyMain + extra;
      if (main === '—' && offer.discount != null && offer.discount > 0) {
        main = offer.msrp != null
          ? `${formatCurrency(offer.discount)} off MSRP`
          : `${formatCurrency(offer.discount)} off`;
      }
      if (main === '—' && offer.msrp != null) main = `MSRP ${formatCurrency(offer.msrp)}`;
      break;
    }
    case 'discount': {
      if (offer.discount != null && offer.discount > 0) {
        main = offer.msrp != null
          ? `${formatCurrency(offer.discount)} off MSRP`
          : `${formatCurrency(offer.discount)} off`;
      }
      break;
    }
    default:
      break;
  }

  if (aprLine && main !== '—') return `${main} | ${aprLine}`;
  if (aprLine) return aprLine;
  return main;
}
