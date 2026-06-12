import { OfferStatus, VehicleCondition } from '@prisma/client';
import type { OfferInput } from '@/lib/domain/validation';
import { computeBestFinanceRate, type FinanceRateEntry } from '@/lib/domain/finance-rates';
import { getDefaultAcquisitionFee } from '@/lib/config/stores';
import type { LexusFeedOffer, LexusTrim } from './types';
import { LEXUS_STORE_CODES, type LexusStoreCode } from './constants';

/** OfferInput plus Lexus-specific metadata used only for preview/debug. */
export type NormalizedLexusOffer = OfferInput & {
  sourceCategory: 'new' | 'cpo';
  sourceOfferId?: string | null;
  sourceFingerprint?: string;
  msrpSource?: 'disclaimer' | 'manual_override' | 'none';
};

export type LexusSkipReason =
  | 'unsupported_offer_type'
  | 'missing_year_or_series'
  | 'missing_end_date'
  | 'finance_missing_apr_or_term'
  | 'cpo_lease_excluded'
  | 'lease_missing_payment'
  | 'lease_missing_term'
  | 'finance_group_without_valid_rates';

export interface LexusNormalizeStats {
  skippedByReason: Record<LexusSkipReason, number>;
  skippedOffers: Array<{
    reason: LexusSkipReason;
    sourceCategory: 'new' | 'cpo';
    seriesShortName: string | null;
    trimName: string | null;
    year: number | null;
    offerType: string | null;
    amount: number | null;
    term: number | null;
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

function toKebabLower(v: unknown): string {
  const s = String(v ?? '').trim().toLowerCase();
  if (!s) return '';
  return s
    .replace(/,/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

function formatDateYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Parse "Expires 03-02-2026." (and common variants) into YYYY-MM-DD. */
function parseEndDateFromText(texts: Array<string | undefined>): string | null {
  const combined = texts
    .filter((t) => t && t.trim().length > 0)
    .join(' ')
    .trim();
  if (!combined) return null;

  // Expires 03-02-2026 or Expires 03/02/26
  const reNumeric = /Expires\s+(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})/i;
  const mNumeric = combined.match(reNumeric);
  if (mNumeric) {
    const [, mm, dd, yyyy] = mNumeric;
    let year = parseInt(yyyy, 10);
    if (year < 100) year += 2000;
    const month = parseInt(mm, 10);
    const day = parseInt(dd, 10);
    if (!Number.isNaN(year) && !Number.isNaN(month) && !Number.isNaN(day)) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }

  // Expires March 2, 2026
  const reNamed =
    /Expires\s+([A-Za-z]+)\s+(\d{1,2}),\s*(\d{2,4})/i;
  const mNamed = combined.match(reNamed);
  if (mNamed) {
    const [, monthName, dd, yyyy] = mNamed;
    const months = [
      'january',
      'february',
      'march',
      'april',
      'may',
      'june',
      'july',
      'august',
      'september',
      'october',
      'november',
      'december',
    ];
    const idx = months.indexOf(monthName.toLowerCase());
    if (idx >= 0) {
      let year = parseInt(yyyy, 10);
      if (year < 100) year += 2000;
      const day = parseInt(dd, 10);
      if (!Number.isNaN(year) && !Number.isNaN(day)) {
        const month = idx + 1;
        return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      }
    }
  }

  return null;
}

type ParsedLeaseFields = {
  leaseTerm: number;
  leaseMiles: number | null;
  dueAtSigning: number;
};

/** Parse lease term/miles/due from concatenated description + disclaimer text. */
function parseLeaseFieldsFromText(texts: Array<string | undefined>): ParsedLeaseFields | null {
  const combined = texts
    .filter((t) => t && t.trim().length > 0)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!combined) return null;

  // 36 months / 36 mos. / 36-mo.
  const termMatch =
    combined.match(/(\d+)\s*(?:months?|mos?\.?|mo\.)/i) ??
    combined.match(/(\d+)-month\s+lease/i);

  // 10,000 miles per year / 10,000 mi/yr
  const milesMatch = combined.match(
    /(\d{1,3}(?:,\d{3})?)\s*(?:miles\s+per\s+year|mi\/yr|miles\/year|mi\.?\s*per\s+year)/i
  );

  // $3,999 due at signing
  const dueMatch = combined.match(/\$\s*([\d,]+)\s+due\s+at\s+signing/i);

  if (!termMatch || !dueMatch) {
    return null;
  }

  const leaseTerm = parseInt(termMatch[1], 10);
  const dueAtSigning = parseInt(dueMatch[1].replace(/,/g, ''), 10);

  if (
    Number.isNaN(leaseTerm) ||
    Number.isNaN(dueAtSigning) ||
    leaseTerm <= 0 ||
    dueAtSigning < 0
  ) {
    return null;
  }

  let leaseMiles: number | null = null;
  if (milesMatch) {
    const raw = milesMatch[1].replace(/,/g, '');
    const n = parseInt(raw, 10);
    if (!Number.isNaN(n) && n > 0) {
      leaseMiles = n;
    }
  }

  return {
    leaseTerm,
    leaseMiles,
    dueAtSigning,
  };
}

function parseLeaseMilesFromTextOnly(texts: Array<string | undefined>): number | null {
  const combined = texts
    .filter((t) => t && t.trim().length > 0)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!combined) return null;
  const milesMatch = combined.match(
    /(\d{1,3}(?:,\d{3})?)\s*(?:miles\s+per\s+year|miles\/year|mi\/yr|mi\.?\s*per\s+year|miles?\/yr)/i
  );
  if (!milesMatch || !milesMatch[1]) return null;
  const n = parseInt(milesMatch[1].replace(/,/g, ''), 10);
  return Number.isNaN(n) || n <= 0 ? null : n;
}

function extractLeaseMilesFromOfferFields(offer: LexusFeedOffer): number | null {
  const rec = offer as unknown as Record<string, unknown>;
  for (const [rawKey, rawValue] of Object.entries(rec)) {
    const key = rawKey.toLowerCase();
    if (
      !(
        key.includes('mile') ||
        key.includes('mileage') ||
        key.includes('annualmiles') ||
        key.includes('milesperyear') ||
        key.includes('yearlymiles')
      )
    ) {
      continue;
    }
    const n = toNum(rawValue);
    if (n != null && n > 0) return n;
    const s = toStr(rawValue);
    if (!s) continue;
    const m = s.match(/(\d{1,3}(?:,\d{3})?)/);
    if (!m) continue;
    const parsed = parseInt(m[1].replace(/,/g, ''), 10);
    if (!Number.isNaN(parsed) && parsed > 0) return parsed;
  }
  return null;
}

/** Extract MSRP from disclaimer text matching "Lease example based on vehicle MSRP of $###,###." */
function parseMsrpFromDisclaimer(disclaimer: string | null | undefined): number | null {
  if (!disclaimer) return null;
  
  // Match "Lease example based on vehicle MSRP of $54,785."
  const msrpMatch = disclaimer.match(/Lease example based on vehicle MSRP of\s+\$\s*([\d,]+)/i);
  if (msrpMatch && msrpMatch[1]) {
    const n = parseInt(msrpMatch[1].replace(/,/g, ''), 10);
    return Number.isNaN(n) || n <= 0 ? null : n;
  }
  
  return null;
}

/**
 * Map hybrid seriesShortName to base model used for display and trim stripping.
 * e.g. TXh → TX, RXh → RX, NX PHEV → NX, RX PHEV → RX, NXh → NX; non-hybrids unchanged.
 */
function getBaseModelFromSeriesShortName(seriesShortName: string): string {
  const s = seriesShortName.trim();
  if (!s) return s;
  // TXh, RXh, NXh, etc. → drop trailing "h"
  if (/^[A-Z]{2,}h$/i.test(s)) return s.slice(0, -1);
  // XX PHEV (e.g. NX PHEV, RX PHEV) → XX
  const phevMatch = s.match(/^([A-Z]{2,})\s+PHEV$/i);
  if (phevMatch) return phevMatch[1];
  return s;
}

/** Extract trim from name by removing base model prefix. */
function extractTrimFromName(name: string | null, baseModel: string | null): string | null {
  if (!name) return null;
  if (!baseModel) return name.trim();
  
  const nameTrimmed = name.trim();
  const prefix = baseModel.trim();
  
  // Remove base model prefix (case-insensitive)
  if (nameTrimmed.toLowerCase().startsWith(prefix.toLowerCase())) {
    const remaining = nameTrimmed.slice(prefix.length).trim();
    return remaining || null;
  }
  
  return nameTrimmed;
}

function normalizeOneOfferForTrim(
  offer: LexusFeedOffer,
  trim: LexusTrim,
  sourceCategory: 'new' | 'cpo',
  storeCode: LexusStoreCode
): NormalizedLexusOffer | null {
  return normalizeOneOfferForTrimDetailed(offer, trim, sourceCategory, storeCode).row;
}

function normalizeOneOfferForTrimDetailed(
  offer: LexusFeedOffer,
  trim: LexusTrim,
  sourceCategory: 'new' | 'cpo',
  storeCode: LexusStoreCode
): { row: NormalizedLexusOffer | null; reason: LexusSkipReason | null } {
  const sourceOfferId = toStr(offer.offerId);
  const offerTypeRaw = (offer.offerType ?? '').toUpperCase();
  const cardTemplate = (offer.cardTemplate ?? '').toLowerCase();
  const offerLabel = (offer.offerLabel ?? '').toLowerCase();
  const offerTypeDisplayName = (offer.offerTypeDisplayName ?? '').toLowerCase();
  const isApr = offerTypeRaw === 'APR';
  const isLease =
    offerTypeRaw === 'LEASE' ||
    cardTemplate.includes('lease') ||
    offerLabel.includes('lease') ||
    offerTypeDisplayName.includes('lease');

  // Only APR (finance) and Lease offers are ingested.
  if (!isApr && !isLease) return { row: null, reason: 'unsupported_offer_type' };

  const year = toNum(trim.year ?? offer.year);
  const trimName = toStr(trim.name);
  const seriesShortName = toStr(offer.seriesShortName);
  if (year == null || !seriesShortName) {
    return { row: null, reason: 'missing_year_or_series' };
  }

  // Base model for display and trim stripping (TXh→TX, RX PHEV→RX, etc.)
  const baseModel = getBaseModelFromSeriesShortName(seriesShortName);
  let model: string;
  let extractedTrim: string | null;

  // "XX HYBRID" (e.g. NX HYBRID): model = "NXh", trim = null
  const hybridMatch = trimName?.match(/^([A-Z]{2,})\s+HYBRID$/i);
  if (hybridMatch) {
    model = hybridMatch[1] + 'h';
    extractedTrim = null;
  } else {
    extractedTrim = extractTrimFromName(trimName, baseModel);
    model = baseModel;
    // Certified + "XX PHEV": do not add a trim
    const isPhev =
      /^[A-Z]{2,}\s+PHEV$/i.test(seriesShortName) || /^[A-Z]{2,}\s+PHEV$/i.test(trimName ?? '');
    if (sourceCategory === 'cpo' && isPhev) {
      extractedTrim = null;
    }
  }

  // Extract modelCode from trimCode
  const modelCodeNum = toNum(trim.trimCode);
  const modelCode = modelCodeNum != null ? String(modelCodeNum) : null;

  const condition =
    sourceCategory === 'cpo' ? VehicleCondition.CERTIFIED : VehicleCondition.NEW;

  const endDate = parseEndDateFromText([offer.description, offer.disclaimer]);
  if (!endDate) return { row: null, reason: 'missing_end_date' };

  const startDate = formatDateYmd(new Date());

  const additionalOffer = toStr(offer.additionalOffer);
  const description = toStr(offer.description);
  const disclaimer = toStr(offer.disclaimer);

  // Default acquisition fee for all Lexus offers
  const defaultAcqFee = getDefaultAcquisitionFee(storeCode) ?? 895;

  const sourceFingerprintParts = [
    sourceOfferId ?? '',
    sourceCategory,
    offerTypeRaw,
    String(year ?? ''),
    seriesShortName ?? '',
    trimName ?? '',
    String(offer.amount ?? ''),
    String(offer.term ?? ''),
    String(offer.downPayment ?? ''),
  ];
  const sourceFingerprint = sourceFingerprintParts
    .map((part) => toKebabLower(part))
    .filter((part) => part.length > 0)
    .join('-');

  // APR (Finance) offers
  if (isApr) {
    const aprRate = toNum(offer.amount);
    const aprTermMonths = toNum(offer.term);
    if (aprRate == null || aprTermMonths == null) {
      return { row: null, reason: 'finance_missing_apr_or_term' };
    }
    const aprCash = toNum(offer.aprCash);

    const row: NormalizedLexusOffer = {
      storeCode,
      make: 'Lexus',
      model: baseModel,
      year,
      trim: extractedTrim,
      modelCode,
      condition,
      startDate,
      endDate,
      status: OfferStatus.LIVE,
      inventoryUrl: null,
      imageUrl: null,
      offerType: 'Finance',
      leasePayment: null,
      leaseTerm: null,
      leaseMiles: null,
      dueAtSigning: null,
      acquisitionFee: defaultAcqFee,
      downPayment: null,
      msrp: null,
      discount: null,
      buyFor: null,
      stockNumber: null,
      aprRate,
      aprTermMonths,
      rebateTotal: null,
      customerCash: null,
      leaseCash: null,
      aprCash: aprCash ?? null,
      bonusCash: null,
      disclaimer,
      additionalNotes: additionalOffer,
      sourceCategory,
      sourceOfferId,
      sourceFingerprint,
      msrpSource: 'none',
    };

    return { row, reason: null };
  }

  // Lease offers (NEW only; Certified Lexus must be Finance per validation rules).
  if (isLease) {
    if (sourceCategory === 'cpo') {
      return { row: null, reason: 'cpo_lease_excluded' };
    }

    // Use amount field for leasePayment
    const leasePayment = toNum(offer.amount);
    if (leasePayment == null || leasePayment <= 0) {
      return { row: null, reason: 'lease_missing_payment' };
    }

    // Try to parse lease fields from text, but use API fields as fallback
    const parsed = parseLeaseFieldsFromText([description ?? undefined, disclaimer ?? undefined]);
    
    // Use term from API if available, otherwise try parsed term
    const leaseTerm = toNum(offer.term) ?? parsed?.leaseTerm ?? null;
    if (leaseTerm == null || leaseTerm <= 0) {
      return { row: null, reason: 'lease_missing_term' };
    }

    // Extract MSRP from disclaimer
    const msrp = parseMsrpFromDisclaimer(disclaimer);
    const msrpSource: NormalizedLexusOffer['msrpSource'] = msrp != null ? 'disclaimer' : 'none';

    // Due at signing: use downPayment field from API (Lexus uses downPayment for dueAtSigning)
    const dueAtSigning = toNum(offer.downPayment) ?? parsed?.dueAtSigning ?? null;

    const leaseMiles =
      extractLeaseMilesFromOfferFields(offer) ??
      parsed?.leaseMiles ??
      parseLeaseMilesFromTextOnly([description ?? undefined, disclaimer ?? undefined]) ??
      null;

    const row: NormalizedLexusOffer = {
      storeCode,
      make: 'Lexus',
      model: baseModel,
      year,
      trim: extractedTrim,
      modelCode,
      condition,
      startDate,
      endDate,
      status: OfferStatus.LIVE,
      inventoryUrl: null,
      imageUrl: null,
      offerType: 'Lease',
      leasePayment,
      leaseTerm,
      leaseMiles,
      dueAtSigning,
      acquisitionFee: defaultAcqFee,
      downPayment: null,
      msrp,
      discount: null,
      buyFor: null,
      stockNumber: null,
      aprRate: null,
      aprTermMonths: null,
      rebateTotal: null,
      customerCash: null,
      leaseCash: null,
      aprCash: null,
      bonusCash: null,
      disclaimer,
      additionalNotes: additionalOffer,
      sourceCategory,
      sourceOfferId,
      sourceFingerprint,
      msrpSource,
    };

    return { row, reason: null };
  }

  return { row: null, reason: 'unsupported_offer_type' };
}

/** Group key for Finance: one row per (model, year, condition) — storeCode omitted since we use one canonical row. */
function financeGroupKey(row: NormalizedLexusOffer): string {
  return [
    (row.model ?? '').trim(),
    String(row.year ?? ''),
    (row.condition ?? VehicleCondition.NEW).toString(),
  ].join('\0');
}

/** Canonical store for Lexus merged offers (one row applies to both LEXDT and LEXWG). */
const LEXUS_CANONICAL_STORE: LexusStoreCode = 'LEXDT';

export function normalizeLexusOffers(params: {
  newOffers: LexusFeedOffer[];
  cpoOffers: LexusFeedOffer[];
  storeCodes: LexusStoreCode[];
}): NormalizedLexusOffer[] {
  return normalizeLexusOffersDetailed(params).rows;
}

export function normalizeLexusOffersDetailed(params: {
  newOffers: LexusFeedOffer[];
  cpoOffers: LexusFeedOffer[];
  storeCodes: LexusStoreCode[];
}): { rows: NormalizedLexusOffer[]; stats: LexusNormalizeStats } {
  const { newOffers, cpoOffers } = params;
  const out: NormalizedLexusOffer[] = [];
  const skippedByReason: Record<LexusSkipReason, number> = {
    unsupported_offer_type: 0,
    missing_year_or_series: 0,
    missing_end_date: 0,
    finance_missing_apr_or_term: 0,
    cpo_lease_excluded: 0,
    lease_missing_payment: 0,
    lease_missing_term: 0,
    finance_group_without_valid_rates: 0,
  };
  const skippedOffers: LexusNormalizeStats['skippedOffers'] = [];

  const process = (
    offers: LexusFeedOffer[],
    sourceCategory: 'new' | 'cpo'
  ) => {
    for (const offer of offers) {
      const trims = Array.isArray(offer.trims) && offer.trims.length > 0 ? offer.trims : [{
        trimCode: undefined,
        year: offer.year,
        name: offer.seriesShortName,
        id: `${offer.year}_${offer.seriesId}`,
      }];

      for (const trim of trims) {
        const { row, reason } = normalizeOneOfferForTrimDetailed(
          offer,
          trim,
          sourceCategory,
          LEXUS_CANONICAL_STORE
        );
        if (row) {
          out.push({
            ...row,
            storeCodes: [...LEXUS_STORE_CODES],
          });
        } else if (reason) {
          skippedByReason[reason]++;
          skippedOffers.push({
            reason,
            sourceCategory,
            seriesShortName: toStr(offer.seriesShortName),
            trimName: toStr(trim.name),
            year: toNum(trim.year ?? offer.year),
            offerType: toStr(offer.offerType),
            amount: toNum(offer.amount),
            term: toNum(offer.term),
          });
        }
      }
    }
  };

  process(newOffers, 'new');
  process(cpoOffers, 'cpo');

  const nonFinance = out.filter((row) => row.offerType !== 'Finance');
  const financeRows = out.filter((row) => row.offerType === 'Finance');

  const financeByKey = new Map<string, NormalizedLexusOffer[]>();
  for (const row of financeRows) {
    const key = financeGroupKey(row);
    if (!financeByKey.has(key)) financeByKey.set(key, []);
    financeByKey.get(key)!.push(row);
  }

  const consolidatedFinance: NormalizedLexusOffer[] = [];
  for (const [, group] of financeByKey) {
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
        sourceCategory: firstSourceCategory(group),
        seriesShortName: null,
        trimName: null,
        year: toNum(group[0]?.year),
        offerType: 'APR',
        amount: null,
        term: null,
      });
      continue;
    }
    const first = group[0];
    consolidatedFinance.push({
      ...first,
      financeRates: rates,
      aprRate: best.aprRate,
      aprTermMonths: best.aprTermMonths,
    });
  }

  return {
    rows: [...nonFinance, ...consolidatedFinance],
    stats: { skippedByReason, skippedOffers },
  };
}

function firstSourceCategory(rows: NormalizedLexusOffer[]): 'new' | 'cpo' {
  return rows[0]?.sourceCategory === 'cpo' ? 'cpo' : 'new';
}

