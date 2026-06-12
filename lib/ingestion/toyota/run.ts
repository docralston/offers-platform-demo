/**
 * Toyota ingestion orchestrator: scraper → extract → normalize → dedupe → DB write.
 * Returns run summary. Used by server action and (via CLI) GitHub Actions.
 * M1: scraper + extract only; M2/M3 add normalize, dedupe, DB.
 */

import fs from 'fs';
import path from 'path';
import { runToyotaScraper } from './scraper';
import { extractOffersFromResponses } from './extract-offers';
import { normalizeRawOffersDetailed, type ToyotaSkipReason } from './normalize';
import { dedupeByTrimRelevance } from './dedupe';
import { MAX_RETRIES } from './constants';
import { buildInventoryUrl } from '@/lib/utils/inventory-url';

const RUN_TIMESTAMP = (): string => {
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
};

/** Serializable row for preview (same shape as OfferInput; dates as strings). */
export type ToyotaPreviewRow = Record<string, unknown>;

export interface ToyotaRunSummary {
  success: boolean;
  runId: string;
  inserted: number;
  updated: number;
  inactivated: number;
  skippedCashOnly: number;
  skippedCount: number;
  skipReasons: Record<ToyotaSkipReason, number>;
  skippedOffers: Array<Record<string, unknown>>;
  byOfferType: { Lease: number; Finance: number; Other: number };
  rawOfferCount: number;
  normalizedCount: number;
  dedupedCount: number;
  errors: string[];
  /** Set when skipDb: true; rows that would be written (for editable preview). */
  previewRows?: ToyotaPreviewRow[];
}

export interface ToyotaRunOptions {
  artifactsDir?: string;
  skipDb?: boolean;
  headless?: boolean;
  /** Optional persistent Playwright profile dir (session/cookies). */
  userDataDir?: string | null;
  /** Optional Playwright storageState file (cookies + localStorage). */
  storageStatePath?: string | null;
  /** Optional browser channel override (e.g. 'chrome'). */
  channel?: 'chrome' | 'chromium' | null;
  /** When set (e.g. from server action), used as updatedBy for DB writes. */
  updatedBy?: string | null;
}

/**
 * Run Toyota ingestion: scrape → extract → (normalize → dedupe → DB when implemented).
 */
export async function runToyotaIngestion(
  options: ToyotaRunOptions = {}
): Promise<ToyotaRunSummary> {
  const runId = RUN_TIMESTAMP();
  // No artifacts when preview (skipDb); full run and CLI still write to artifacts/
  const artifactsDir = options.skipDb ? undefined : (options.artifactsDir ?? path.join(process.cwd(), 'artifacts'));
  const errors: string[] = [];
  const byOfferType = { Lease: 0, Finance: 0, Other: 0 };

  if (artifactsDir) fs.mkdirSync(artifactsDir, { recursive: true });

  // Retry scraper up to MAX_RETRIES times (MAX_RETRIES=2 => up to 3 total attempts).
  let scraperResult:
    | Awaited<ReturnType<typeof runToyotaScraper>>
    | null = null;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    scraperResult = await runToyotaScraper({
      artifactsDir,
      headless: options.headless ?? true,
      channel:
        (options.channel ?? null) ??
        (process.env.PLAYWRIGHT_CHANNEL === 'chrome' ? 'chrome' : undefined),
      userDataDir: (options.userDataDir ?? process.env.TOYOTA_USER_DATA_DIR) || undefined,
      storageStatePath:
        (options.storageStatePath ?? process.env.TOYOTA_STORAGE_STATE_PATH) || undefined,
    });
    if (scraperResult.ok) break;
    if (attempt < MAX_RETRIES) {
      await sleep(1000 * (attempt + 1));
    }
  }
  scraperResult ??= { ok: false, url: '', responses: [], error: 'Scraper did not run' };

  if (!scraperResult.ok && scraperResult.error) {
    errors.push(`Scraper failed: ${scraperResult.error}`);
  }

  const { rawOffers } = extractOffersFromResponses(scraperResult.responses, {
    pageUrl: scraperResult.url,
    ...(artifactsDir && { artifactsDir }),
  });

  const normalizedResult = normalizeRawOffersDetailed(rawOffers);
  const normalized = normalizedResult.rows;
  const skipReasons = normalizedResult.stats.skippedByReason;
  const skippedOffers = normalizedResult.stats.skippedOffers;
  const skippedCount = Object.values(skipReasons).reduce((sum, n) => sum + n, 0);
  const skippedCashOnly = skipReasons.cash_without_lease_or_finance_context;
  const deduped = dedupeByTrimRelevance(normalized);

  // Auto-fill inventoryUrl from store config (Dealer.com format) when missing
  const toyStorePath = path.join(
    process.cwd(),
    'lab',
    'modelpager',
    'configs',
    'stores',
    'toyota',
    'toy.json'
  );
  if (fs.existsSync(toyStorePath)) {
    try {
      const storeConfig = JSON.parse(fs.readFileSync(toyStorePath, 'utf-8')) as {
        siteUrl?: string;
        links?: { newInventory?: string };
      };
      const site = (storeConfig.siteUrl ?? '').replace(/\/+$/, '');
      const inv = storeConfig.links?.newInventory ?? '/new-inventory/index.htm';
      const baseUrl = inv.startsWith('/') ? site + inv : site + '/' + inv;
      for (const row of deduped) {
        if (!row.inventoryUrl?.trim() && row.model?.trim()) {
          row.inventoryUrl = buildInventoryUrl({
            baseUrl,
            format: 'dealer_com',
            models: [row.model],
          });
        }
      }
    } catch {
      // Skip enrichment if config is missing or invalid
    }
  }

  for (const row of deduped) {
    const ot = (row.offerType ?? '').toString();
    if (ot === 'Lease') byOfferType.Lease++;
    else if (ot === 'Finance') byOfferType.Finance++;
    else byOfferType.Other++;
  }

  let inserted = 0;
  let updated = 0;
  let inactivated = 0;

  if (!options.skipDb && deduped.length >= 0) {
    try {
      const { writeToyotaOffers } = await import('./write-db');
      const writeResult = await writeToyotaOffers(deduped, {
        updatedBy: options.updatedBy ?? null,
      });
      inserted = writeResult.inserted;
      updated = writeResult.updated;
      inactivated = writeResult.inactivated;
      if (writeResult.error) errors.push(writeResult.error);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`DB write failed: ${msg}`);
    }
  }

  const summary: ToyotaRunSummary = {
    success: scraperResult.ok && errors.length === 0,
    runId,
    inserted,
    updated,
    inactivated,
    skippedCashOnly,
    skippedCount,
    skipReasons,
    skippedOffers: skippedOffers as Array<Record<string, unknown>>,
    byOfferType,
    rawOfferCount: rawOffers.length,
    normalizedCount: normalized.length,
    dedupedCount: deduped.length,
    errors,
    ...(options.skipDb && {
      previewRows: deduped.map((row) => {
        const r = { ...row } as Record<string, unknown>;
        if (r.startDate instanceof Date) r.startDate = r.startDate.toISOString().slice(0, 10);
        if (r.endDate instanceof Date) r.endDate = r.endDate.toISOString().slice(0, 10);
        return r;
      }),
    }),
  };

  if (artifactsDir) {
    const summaryPath = path.join(artifactsDir, `toyota-run-summary-${runId}.json`);
    fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2), 'utf-8');

    const normalizedPath = path.join(artifactsDir, `toyota-normalized-${runId}.json`);
    fs.writeFileSync(
      normalizedPath,
      JSON.stringify(
        { capturedAt: new Date().toISOString(), runId, rows: deduped },
        null,
        2
      ),
      'utf-8'
    );
  }

  return summary;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
