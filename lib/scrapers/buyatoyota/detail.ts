/**
 * Toyota Central Atlantic detail scraper: load offer detail page, read __SSR_STATE__,
 * find offer by offerId, map to DB record shape; apply regex enrichment for lease.
 */

import type { Page } from 'playwright';
import { OfferStatus, VehicleCondition, OfferTypeEnum } from '@prisma/client';
import type { OfferInput } from '@/lib/domain/validation';
import { findOfferInSsrState, parseMoney, parseMmDdYy } from './helpers';
import { extractDisclaimerFields } from './regex';

const STORE_CODE = 'TOY';
const MAKE = 'Toyota';
const BASE_URL = 'https://www.buyatoyota.com';
const DETAIL_TIMEOUT_MS = 30_000;

/** Record shape for DB upsert: OfferInput plus externalId (offerId). */
export interface CentralAtlanticOfferRecord extends OfferInput {
  externalId: string;
}

function toStr(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s || null;
}

function toInt(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === 'number' && !Number.isNaN(v)) return Math.round(v);
  if (typeof v === 'string') {
    const n = parseFloat(v.replace(/[,$\s]/g, ''));
    return Number.isNaN(n) ? null : Math.round(n);
  }
  return null;
}

/** Parse year and model from heading like "2025 Tacoma" or "2026 4Runner". */
function parseHeading(heading: string | null | undefined): { year: number | null; model: string | null } {
  const s = toStr(heading);
  if (!s) return { year: null, model: null };
  const m = /^(\d{4})\s+(.+)$/.exec(s);
  if (m) return { year: parseInt(m[1], 10), model: m[2].trim() || null };
  return { year: null, model: s };
}

/** Infer offerType from typeText: Lease | Finance | Other. */
function inferOfferType(typeText: string | null | undefined): OfferTypeEnum {
  const t = (toStr(typeText) ?? '').toLowerCase();
  if (t.includes('lease')) return OfferTypeEnum.Lease;
  if (t.includes('apr')) return OfferTypeEnum.Finance;
  return OfferTypeEnum.Other;
}

/** Absolutize image URL against base. */
function absolutizeUrl(href: string | null | undefined, base: string): string | null {
  const s = toStr(href);
  if (!s) return null;
  try {
    return new URL(s, base).href;
  } catch {
    return null;
  }
}

/** Join disclaimers array with blank lines. */
function joinDisclaimers(disclaimers: unknown): string | null {
  if (disclaimers == null) return null;
  if (!Array.isArray(disclaimers)) return toStr(disclaimers);
  const parts = disclaimers.map((d) => toStr(d)).filter(Boolean);
  return parts.length ? parts.join('\n\n') : null;
}

/**
 * Scrape a single offer detail page: get __SSR_STATE__, find offer, map to DB record.
 * startDate = now; endDate from offer.endDate (MM/DD/YY); status = active/expired.
 */
export async function scrapeOfferDetail(
  page: Page,
  offerId: string,
  detailUrl: string,
  options?: { timeoutMs?: number }
): Promise<CentralAtlanticOfferRecord | null> {
  const timeoutMs = options?.timeoutMs ?? DETAIL_TIMEOUT_MS;
  await page.goto(detailUrl, { waitUntil: 'domcontentloaded', timeout: timeoutMs });

  const ssrState = await page.evaluate(() => {
    return (window as unknown as { __SSR_STATE__?: unknown }).__SSR_STATE__;
  });

  const offer = findOfferInSsrState(ssrState, offerId);
  if (!offer) return null;

  const startDate = new Date();
  const endDateStr = toStr(offer.endDate);
  const endDate = parseMmDdYy(endDateStr) ?? startDate;
  const status: OfferStatus = endDate >= startDate ? OfferStatus.LIVE : OfferStatus.INACTIVE;

  const typeText = toStr(offer.typeText);
  const offerType = inferOfferType(typeText);
  const heading = toStr(offer.heading);
  const { year, model: modelFromHeading } = parseHeading(heading);
  const model = modelFromHeading ?? toStr(offer.seriesName) ?? 'Unknown';
  const subHeading = toStr(offer.subHeading);
  const trim =
    offerType === OfferTypeEnum.Finance && /APR\s*Offer/i.test(subHeading ?? '') ? null : subHeading;

  const disclaimer = joinDisclaimers(offer.disclaimers);
  const additionalNotes = toStr(offer.description);
  const imageUrl = absolutizeUrl(toStr(offer.imageSrc), BASE_URL);

  const details = offer.details as Record<string, unknown> | undefined;
  const rateStr = details ? toStr(details.rate) : null;
  const durationVal = details ? toInt(details.duration) : null;
  const dueStr = details ? toStr(details.due) : null;

  let leasePayment: number | null = null;
  let leaseTerm: number | null = null;
  let dueAtSigning: number | null = null;
  let aprRate: number | null = null;
  let aprTermMonths: number | null = null;

  if (offerType === OfferTypeEnum.Lease) {
    leasePayment = parseMoney(rateStr);
    leaseTerm = durationVal;
    dueAtSigning = parseMoney(dueStr);
  } else if (offerType === OfferTypeEnum.Finance) {
    aprRate = rateStr != null ? parseFloat(String(rateStr).replace(/[,%\s]/g, '')) || null : null;
    aprTermMonths = durationVal;
  }

  let leaseMiles: number | null = null;
  let downPayment: number | null = null;
  let acquisitionFee: number | null = null;
  let msrp: number | null = null;

  if (offerType === OfferTypeEnum.Lease && disclaimer) {
    const extracted = extractDisclaimerFields(disclaimer);
    leaseMiles = extracted.leaseMiles ?? leaseMiles;
    downPayment = extracted.downPayment ?? downPayment;
    acquisitionFee = extracted.acquisitionFee ?? acquisitionFee;
    msrp = extracted.msrp ?? msrp;
  }

  const record: CentralAtlanticOfferRecord = {
    externalId: offerId,
    storeCode: STORE_CODE,
    make: MAKE,
    model,
    year: year ?? null,
    trim,
    condition: VehicleCondition.NEW,
    startDate,
    endDate,
    status,
    inventoryUrl: null,
    imageUrl,
    leasePayment,
    leaseTerm,
    leaseMiles,
    dueAtSigning,
    acquisitionFee,
    downPayment,
    msrp,
    discount: null,
    buyFor: null,
    stockNumber: null,
    offerType,
    aprRate,
    aprTermMonths,
    rebateTotal: null,
    customerCash: null,
    leaseCash: null,
    aprCash: null,
    bonusCash: null,
    disclaimer,
    additionalNotes,
  };

  return record;
}
