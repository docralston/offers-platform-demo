import { OFFERS_TABLE_COLUMN_ORDER } from '@/lib/ingestion/constants';

/**
 * Toyota ingestion constants.
 * Region: ZIP 18901 (Demotown). Do NOT rely on "tri-state" or pre-selected region.
 * Store: all Toyota offers map to storeCode = "TOY".
 */

export const TOYOTA_STORE_CODE = 'TOY' as const;
export const TOYOTA_ZIP = '18901';

/** BuyAToyota Central Atlantic offers page. Use ZIP 18901; set via cookie/localStorage/UI and confirm before capture. */
export const BUYATOYOTA_OFFERS_URL =
  'https://www.buyatoyota.com/centralatlantic/offers/?limit=all';

/** Navigation timeout (ms). */
export const NAVIGATION_TIMEOUT_MS = 45_000;

/** Page load timeout (ms). */
export const PAGE_LOAD_TIMEOUT_MS = 60_000;

/** Delay (ms) after loading offers page before considering capture "complete" (let XHR/fetch settle). */
export const CAPTURE_SETTLE_MS = 2_000;

/** Max retries for scraper/orchestrator on failure. */
export const MAX_RETRIES = 2;

/** CSV column order for Toyota/offers export.
 * Reuses the canonical ingestion header ordering.
 */
export const OFFERS_CSV_HEADERS = OFFERS_TABLE_COLUMN_ORDER;
