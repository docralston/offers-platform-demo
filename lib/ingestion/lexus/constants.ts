import { OFFERS_TABLE_COLUMN_ORDER } from '@/lib/ingestion/constants';

/**
 * Lexus ingestion constants.
 * Region: ZIP 18901 (Demotown / Philadelphia market).
 * Store codes: LEXDT (Demotown), LEXWG (Exampleville).
 *
 * Unlike Toyota, Lexus offers are available via a direct OEM JSON API
 * (no Playwright / DOM scraping needed).
 */

export const LEXUS_ZIP = '18901';

export const LEXUS_NEW_OFFERS_URL =
  'https://www.lexus.com/rest/lexus/offers?zip=18901&offerCategory=NEW&consolidate=true&experience=offers';

export const LEXUS_CPO_OFFERS_URL =
  'https://www.lexus.com/rest/lexus/offers?zip=18901&offerCategory=CPO&consolidate=true&experience=offers';

/** Default market key used in the OEM response. */
export const LEXUS_DEFAULT_MARKET_KEY = 'Philadelphia';

export const LEXUS_STORE_CODES = ['LEXDT', 'LEXWG'] as const;
export type LexusStoreCode = (typeof LEXUS_STORE_CODES)[number];

/** CSV column order for Lexus/offers export.
 * Reuses the canonical ingestion header ordering.
 */
export const LEXUS_OFFERS_CSV_HEADERS = OFFERS_TABLE_COLUMN_ORDER;

