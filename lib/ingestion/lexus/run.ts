/**
 * Lexus ingestion orchestrator: direct OEM API → normalize → optional DB write.
 * No Playwright or scraping; the OEM feed is JSON.
 */

import {
  normalizeLexusOffersDetailed,
  type NormalizedLexusOffer,
  type LexusSkipReason,
} from './normalize';
import { dedupeAndWarnLexusRows, type LexusDuplicateWarningGroup } from './dedupe';
import {
  LEXUS_CPO_OFFERS_URL,
  LEXUS_DEFAULT_MARKET_KEY,
  LEXUS_NEW_OFFERS_URL,
  LEXUS_STORE_CODES,
  type LexusStoreCode,
} from './constants';
import type { LexusOffersResponse, LexusFeedOffer } from './types';
import { writeLexusOffers } from './write-db';
import type { OfferInput } from '@/lib/domain/validation';

export type LexusPreviewRow = Record<string, unknown>;

export interface LexusRunSummary {
  success: boolean;
  runId: string;
  inserted: number;
  updated: number;
  inactivated: number;
  skipped: number;
  skipReasons: Record<LexusSkipReason, number>;
  skippedOffers: Array<Record<string, unknown>>;
  byOfferType: { Lease: number; Finance: number; Other: number };
  rawOfferCount: number;
  normalizedCount: number;
  dedupedCount: number;
  warningCount: number;
  warningGroups: LexusDuplicateWarningGroup[];
  errors: string[];
  previewRows?: LexusPreviewRow[];
}

export interface LexusRunOptions {
  /** When true, does not write to DB; returns previewRows instead. */
  skipDb?: boolean;
  /** Optional subset of store codes to target; defaults to all Lexus stores. */
  storeCodes?: LexusStoreCode[];
  /** When set (e.g. from server action), used as updatedBy for DB writes. */
  updatedBy?: string | null;
}

export async function runLexusIngestion(
  options: LexusRunOptions = {}
): Promise<LexusRunSummary> {
  const runId = RUN_TIMESTAMP();
  const errors: string[] = [];
  const byOfferType = { Lease: 0, Finance: 0, Other: 0 };
  const storeCodes = options.storeCodes ?? [...LEXUS_STORE_CODES];

  let newOffers: LexusFeedOffer[] = [];
  let cpoOffers: LexusFeedOffer[] = [];

  try {
    newOffers = await fetchLexusOffers(LEXUS_NEW_OFFERS_URL);
  } catch (e) {
    errors.push(
      `Failed to fetch Lexus NEW offers: ${
        e instanceof Error ? e.message : String(e)
      }`
    );
  }

  try {
    cpoOffers = await fetchLexusOffers(LEXUS_CPO_OFFERS_URL);
  } catch (e) {
    errors.push(
      `Failed to fetch Lexus CPO offers: ${
        e instanceof Error ? e.message : String(e)
      }`
    );
  }

  const normalizedResult = normalizeLexusOffersDetailed({
    newOffers,
    cpoOffers,
    storeCodes,
  });
  const normalized = normalizedResult.rows;
  const dedupeResult = dedupeAndWarnLexusRows(normalized);
  const deduped = dedupeResult.rows;
  const dedupedPreviewRows = dedupeResult.previewRows;

  const skipped = Object.values(normalizedResult.stats.skippedByReason).reduce(
    (sum, n) => sum + n,
    0
  );
  const allRows: OfferInput[] = [];
  for (const row of deduped) {
    // Only Lease / Finance / Other are tracked; cash-only is not expected from OEM APR feed.
    const ot = String(row.offerType ?? '');
    if (ot === 'Lease') byOfferType.Lease++;
    else if (ot === 'Finance') byOfferType.Finance++;
    else byOfferType.Other++;

    allRows.push(row);
  }

  let inserted = 0;
  let updated = 0;
  let inactivated = 0;

  if (!options.skipDb && deduped.length > 0) {
    try {
      const writeResult = await writeLexusOffers(deduped, {
        updatedBy: options.updatedBy ?? null,
      });
      inserted = writeResult.inserted;
      updated = writeResult.updated;
      inactivated = writeResult.inactivated;
      if (writeResult.error) errors.push(writeResult.error);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`Lexus DB write failed: ${msg}`);
    }
  }

  const summary: LexusRunSummary = {
    success: errors.length === 0,
    runId,
    inserted,
    updated,
    inactivated,
    skipped,
    skipReasons: normalizedResult.stats.skippedByReason,
    skippedOffers: normalizedResult.stats.skippedOffers as Array<Record<string, unknown>>,
    byOfferType,
    rawOfferCount: newOffers.length + cpoOffers.length,
    normalizedCount: normalized.length,
    dedupedCount: allRows.length,
    warningCount: dedupeResult.warningGroups.length,
    warningGroups: dedupeResult.warningGroups,
    errors,
    ...(options.skipDb && {
      previewRows: dedupedPreviewRows.map((row) => {
        const r = { ...row } as Record<string, unknown>;
        if (r.startDate instanceof Date) {
          r.startDate = r.startDate.toISOString().slice(0, 10);
        }
        if (r.endDate instanceof Date) {
          r.endDate = r.endDate.toISOString().slice(0, 10);
        }
        return r;
      }),
    }),
  };

  return summary;
}

async function fetchLexusOffers(url: string): Promise<LexusFeedOffer[]> {
  const res = await fetch(url, {
    headers: {
      accept: 'application/json',
    },
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText}`);
  }

  const data = (await res.json()) as LexusOffersResponse;
  if (!data || typeof data !== 'object' || !data.markets) {
    return [];
  }

  const markets = data.markets;
  const market =
    markets[LEXUS_DEFAULT_MARKET_KEY] ??
    Object.values(markets)[0] ??
    null;
  if (!market || !Array.isArray(market.offers)) return [];

  return market.offers;
}

function RUN_TIMESTAMP(): string {
  const d = new Date();
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
    '-',
    String(d.getHours()).padStart(2, '0'),
    String(d.getMinutes()).padStart(2, '0'),
    String(d.getSeconds()).padStart(2, '0'),
  ].join('');
}

