/**
 * From captured responses, detect "offers payload" by stable keys (offers arrays / program structures),
 * parse into ToyotaRawOffer[], and optionally persist timestamped raw JSON for debugging.
 */

import fs from 'fs';
import path from 'path';
import type { ToyotaRawOffer, ToyotaRawPayloadSnapshot, CapturedResponse } from './types';

function unwrapValue(v: unknown): unknown {
  if (v && typeof v === 'object' && 'value' in (v as any)) {
    return (v as any).value;
  }
  return v;
}

/** Heuristic: object looks like an offer (has model and payment/msrp/apr). */
function looksLikeOffer(obj: unknown): obj is Record<string, unknown> {
  if (!obj || typeof obj !== 'object') return false;
  const o = obj as Record<string, unknown>;
  const modelRaw = o.model ?? o.modelName ?? o.vehicleModel ?? o.series ?? o.seriesName;
  const model = unwrapValue(modelRaw);
  const hasModel = typeof model === 'string' && model.length > 0;

  const moneyRaw =
    o.monthlyPayment ??
    o.payment ??
    o.leasePayment ??
    o.msrp ??
    o.apr ??
    o.aprRate ??
    o.rate ??
    o.termMonths ??
    o.term;
  const money = unwrapValue(moneyRaw);
  const hasMoney = typeof money === 'number' || typeof money === 'string';
  return !!hasModel && !!hasMoney;
}

/** Find arrays in object that contain offer-like elements. */
function findOfferArrays(obj: unknown): unknown[] {
  const out: unknown[] = [];
  if (!obj || typeof obj !== 'object') return out;
  const o = obj as Record<string, unknown>;

  for (const v of Object.values(o)) {
    if (Array.isArray(v)) {
      const offerLike = v.filter((item) => looksLikeOffer(item));
      if (offerLike.length > 0) out.push(...offerLike);
    }
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const inner = findOfferArrays(v);
      out.push(...inner);
    }
  }
  return out;
}

function parseEmbeddedStateFromText(text: string): unknown[] {
  const out: unknown[] = [];
  const t = text || '';

  // Next.js: <script id="__NEXT_DATA__" type="application/json">...</script>
  const nextMatch = t.match(/<script[^>]+id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
  if (nextMatch?.[1]) {
    try {
      out.push(JSON.parse(nextMatch[1]));
    } catch {
      // ignore
    }
  }

  // Common inline state: window.__PRELOADED_STATE__ = {...};
  const assignMatches = [
    /window\.__PRELOADED_STATE__\s*=\s*({[\s\S]*?});/,
    /window\.__INITIAL_STATE__\s*=\s*({[\s\S]*?});/,
    /window\.__APOLLO_STATE__\s*=\s*({[\s\S]*?});/,
  ];
  for (const re of assignMatches) {
    const m = t.match(re);
    if (m?.[1]) {
      try {
        out.push(JSON.parse(m[1]));
      } catch {
        // ignore
      }
    }
  }

  return out;
}

/** Safe number from unknown (no rounding). */
function toNum(v: unknown): number | null {
  v = unwrapValue(v);
  if (v == null) return null;
  if (typeof v === 'number' && !Number.isNaN(v)) return v;
  if (typeof v === 'string') {
    const n = parseFloat(v.replace(/[,$\s]/g, ''));
    return Number.isNaN(n) ? null : n;
  }
  return null;
}

/** Safe string from unknown. */
function toStr(v: unknown): string | null {
  v = unwrapValue(v);
  if (v == null) return null;
  const s = String(v).trim();
  return s || null;
}

/** Skip rebate/special offers and header fragments that are not vehicle model names. */
const SKIP_MODELS = new Set(['college', 'military', 'hybrids and', 'crossovers and']);

function isInvalidModel(model: string | null): boolean {
  if (!model || model.length < 2) return true;
  const lower = model.toLowerCase().trim();
  if (SKIP_MODELS.has(lower)) return true;
  if (lower.endsWith(' and')) return true;
  return false;
}

/** Normalize known short model names (e.g. from API). */
function normalizeModelName(model: string): string {
  const m = model.trim();
  if (m === 'Land') return 'Land Cruiser';
  return m;
}

/** Map a raw object (from API) to ToyotaRawOffer using common key variants. */
function mapToRawOffer(obj: Record<string, unknown>): ToyotaRawOffer {
  const get = (...keys: string[]) => {
    for (const k of keys) {
      const v = obj[k];
      const unwrapped = unwrapValue(v);
      if (unwrapped !== undefined && unwrapped !== null && unwrapped !== '') return v;
    }
    return null;
  };

  const payment = toNum(get('monthlyPayment', 'payment', 'leasePayment', 'monthlyLeasePayment'));
  const msrp = toNum(get('msrp', 'msrpAmount', 'retailPrice'));
  const apr = toNum(get('apr', 'aprRate', 'rate', 'annualPercentageRate'));
  const term = toNum(get('termMonths', 'term', 'leaseTerm', 'termMonths'));
  const miles = toNum(get('milesPerYear', 'mileage', 'annualMileage', 'miles'));

  return {
    year: toNum(get('year', 'modelYear')) ?? undefined,
    make: toStr(get('make', 'makeName', 'brand')) ?? undefined,
    model: toStr(get('model', 'modelName', 'vehicleModel', 'series', 'seriesName')) ?? undefined,
    trim: toStr(get('trim', 'trimName', 'grade')) ?? undefined,
    modelCode: toNum(get('modelCode', 'modelCode')) ?? undefined,
    programType: toStr(get('programType', 'type', 'offerType', 'dealType')) ?? undefined,
    monthlyPayment: payment ?? undefined,
    dueAtSigning: toNum(get('dueAtSigning', 'das', 'dueAtSigningAmount', 'cashDueAtSigning')) ?? undefined,
    termMonths: term ?? undefined,
    milesPerYear: miles ?? undefined,
    msrp: msrp ?? undefined,
    apr: apr ?? undefined,
    aprTermMonths: toNum(get('aprTermMonths', 'financeTerm', 'aprTerm')) ?? undefined,
    acquisitionFee: toNum(get('acquisitionFee', 'acqFee', 'acquisitionFeeAmount')) ?? undefined,
    downPayment: toNum(get('downPayment', 'downPaymentAmount')) ?? undefined,
    rebateTotal: toNum(get('rebateTotal', 'rebate', 'totalRebate', 'incentiveTotal')) ?? undefined,
    customerCash: toNum(get('customerCash', 'customerCashAmount', 'consumerCash')) ?? undefined,
    leaseCash: toNum(get('leaseCash', 'leaseCashAmount', 'leaseIncentive')) ?? undefined,
    aprCash: toNum(get('aprCash', 'aprCashAmount', 'financeCash')) ?? undefined,
    bonusCash: toNum(get('bonusCash', 'bonusCashAmount')) ?? undefined,
    startDate: toStr(get('startDate', 'effectiveDate', 'validFrom')) ?? undefined,
    endDate: toStr(get('endDate', 'expiryDate', 'validTo', 'expirationDate')) ?? undefined,
    disclaimer: toStr(get('disclaimer', 'disclaimerText', 'legalText')) ?? undefined,
    additionalNotes: toStr(get('additionalNotes', 'notes', 'comments')) ?? undefined,
    programId: toStr(get('programId', 'id', 'offerId', 'programCode')) ?? undefined,
    inventoryUrl: toStr(get('inventoryUrl', 'inventoryLink', 'vehicleUrl')) ?? undefined,
    imageUrl: toStr(get('imageUrl', 'image', 'imageLink')) ?? undefined,
    discount: toNum(get('discount', 'discountAmount')) ?? undefined,
    buyFor: toNum(get('buyFor', 'buyForPrice', 'sellingPrice')) ?? undefined,
    stockNumber: toStr(get('stockNumber', 'stockNo', 'vin')) ?? undefined,
  };
}

export interface ExtractResult {
  rawOffers: ToyotaRawOffer[];
  snapshot: ToyotaRawPayloadSnapshot;
}

/**
 * Detect offers payload from captured responses and parse into ToyotaRawOffer[].
 * Writes timestamped raw JSON to artifactsDir when provided.
 */
export function extractOffersFromResponses(
  responses: CapturedResponse[],
  options?: { pageUrl?: string; artifactsDir?: string }
): ExtractResult {
  const capturedAt = new Date().toISOString();
  const pageUrl = options?.pageUrl ?? '';

  const rawOffers: ToyotaRawOffer[] = [];
  const seen = new Set<string>();

  for (const r of responses) {
    const body = r.body as any;

    const candidates: unknown[] = [];
    candidates.push(body);

    // Handle dom://rendered-offers response format
    if (r.url === 'dom://rendered-offers' && body && typeof body === 'object' && Array.isArray(body.offers)) {
      // DOM-extracted offers are already in the right format, add them directly
      for (const offer of body.offers) {
        if (offer && typeof offer === 'object') {
          const key = JSON.stringify(offer);
          if (seen.has(key)) continue;
          seen.add(key);
          const mapped = mapToRawOffer(offer as Record<string, unknown>);
          if (!mapped.model || isInvalidModel(mapped.model)) continue;
          mapped.model = normalizeModelName(mapped.model);
          rawOffers.push(mapped);
        }
      }
      continue; // Skip further processing for DOM offers
    }

    // Handle window://offer-like-state response format
    if (r.url === 'window://offer-like-state' && body && typeof body === 'object' && Array.isArray(body.offers)) {
      for (const offer of body.offers) {
        if (offer && typeof offer === 'object') {
          const key = JSON.stringify(offer);
          if (seen.has(key)) continue;
          seen.add(key);
          const mapped = mapToRawOffer(offer as Record<string, unknown>);
          if (!mapped.model || isInvalidModel(mapped.model)) continue;
          mapped.model = normalizeModelName(mapped.model);
          rawOffers.push(mapped);
        }
      }
      continue;
    }

    // Handle page://network-log entries (extract JSON from fetch/XHR responses)
    if (r.url === 'page://network-log' && body && typeof body === 'object' && Array.isArray(body.entries)) {
      for (const entry of body.entries) {
        if (entry && typeof entry === 'object' && entry.text) {
          try {
            const parsed = JSON.parse(entry.text);
            if (parsed && typeof parsed === 'object') {
              candidates.push(parsed);
            }
          } catch {
            // Not JSON, skip
          }
        }
      }
    }

    // If we captured truncated text (scripts or document), try to parse embedded JSON state.
    if (body && typeof body === 'object' && typeof body._text === 'string') {
      const embedded = parseEmbeddedStateFromText(body._text);
      for (const e of embedded) candidates.push(e);
    }

    const items: unknown[] = [];
    for (const c of candidates) items.push(...findOfferArrays(c));

    for (const item of items) {
      if (!item || typeof item !== 'object') continue;
      const key = JSON.stringify(item);
      if (seen.has(key)) continue;
      seen.add(key);
      const offer = mapToRawOffer(item as Record<string, unknown>);
      if (!offer.model || isInvalidModel(offer.model)) continue;
      offer.model = normalizeModelName(offer.model);
      rawOffers.push(offer);
    }
  }

  const snapshot: ToyotaRawPayloadSnapshot = {
    capturedAt,
    url: pageUrl,
    responses: responses.map(({ url, status, body }) => ({ url, status, body })),
  };

  const artifactsDir = options?.artifactsDir;
  if (artifactsDir) {
    const d = new Date(capturedAt);
    const ts =
      [d.getFullYear(), d.getMonth() + 1, d.getDate()]
        .map((x) => String(x).padStart(2, '0'))
        .join('') +
      '-' +
      [d.getHours(), d.getMinutes(), d.getSeconds()]
        .map((x) => String(x).padStart(2, '0'))
        .join('');
    const name = `toyota-raw-${ts}.json`;
    const filePath = path.join(artifactsDir, name);
    try {
      fs.mkdirSync(artifactsDir, { recursive: true });
      fs.writeFileSync(filePath, JSON.stringify(snapshot, null, 2), 'utf-8');
    } catch (e) {
      // non-fatal
    }
  }

  return { rawOffers, snapshot };
}
