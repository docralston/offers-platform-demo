/**
 * Toyota Central Atlantic list scraper: load offers list page, collect offerId + detailUrl
 * from each offer card. No jsds_* class names.
 */

import type { Page } from 'playwright';

export const LIST_URL = 'https://www.buyatoyota.com/centralatlantic/offers/?limit=all';
const BASE_URL = 'https://www.buyatoyota.com';
const OFFER_CARD_SELECTOR = 'div.offer-card';
const VIEW_OFFER_LINK_SELECTOR = "a[data-testid='viewOffer']";
const LIST_WAIT_TIMEOUT_MS = 30_000;

export interface ListOfferItem {
  offerId: string;
  detailUrl: string;
}

/**
 * Scrape the list page: navigate, wait for offer cards, collect { offerId, detailUrl } from each,
 * de-dupe by offerId. Uses data-testid and div.offer-card only.
 */
export async function scrapeOfferList(
  page: Page,
  options?: { listUrl?: string; timeoutMs?: number }
): Promise<ListOfferItem[]> {
  const listUrl = options?.listUrl ?? LIST_URL;
  const timeoutMs = options?.timeoutMs ?? LIST_WAIT_TIMEOUT_MS;

  await page.goto(listUrl, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
  await page.waitForSelector(OFFER_CARD_SELECTOR, { state: 'attached', timeout: timeoutMs });

  const items = await page.evaluate(
    (args) => {
      const { viewOfferSelector, baseUrl } = args;
      const cards = document.querySelectorAll('div.offer-card');
      const seen = new Set<string>();
      const result: Array<{ offerId: string; detailUrl: string }> = [];

      for (const card of cards) {
        const link = card.querySelector(viewOfferSelector) as HTMLAnchorElement | null;
        if (!link || !link.href) continue;
        try {
          const url = new URL(link.href, baseUrl);
          const offerId =
            url.searchParams.get('offerId') ??
            url.searchParams.get('offerid') ??
            url.searchParams.get('OfferId') ??
            '';
          const id = String(offerId).trim();
          if (!id || seen.has(id)) continue;
          seen.add(id);
          result.push({ offerId: id, detailUrl: url.href });
        } catch {
          // skip invalid URL
        }
      }
      return result;
    },
    {
      viewOfferSelector: VIEW_OFFER_LINK_SELECTOR,
      baseUrl: BASE_URL,
    }
  );

  return items;
}
