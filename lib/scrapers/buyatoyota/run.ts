/**
 * Toyota Central Atlantic scraper runner: list -> detail -> upsert per offer.
 * Logs total queue count (warn if != 95), success/failures, and byOfferType (Lease/Finance).
 */

import { chromium } from 'playwright';
import { OfferTypeEnum } from '@prisma/client';
import { scrapeOfferList, LIST_URL } from './list';
import { scrapeOfferDetail } from './detail';
import { upsertCentralAtlanticOffer } from './write-db';

/** Expected list count as of plan date; temporary sanity check. */
const EXPECTED_LIST_TOTAL = 95;
const EXPECTED_LEASE_FINANCE_COUNT = 87;

export interface RunCentralAtlanticOptions {
  headless?: boolean;
  skipDb?: boolean;
  updatedBy?: string | null;
  listUrl?: string;
}

export interface RunCentralAtlanticFailure {
  offerId: string;
  error: string;
}

export interface RunCentralAtlanticSummary {
  success: boolean;
  total: number;
  successCount: number;
  failures: RunCentralAtlanticFailure[];
  byOfferType: { Lease: number; Finance: number };
  listCountMismatch?: boolean;
}

export async function runCentralAtlanticScraper(
  options?: RunCentralAtlanticOptions
): Promise<RunCentralAtlanticSummary> {
  const headless = options?.headless ?? true;
  const skipDb = options?.skipDb ?? false;
  const updatedBy = options?.updatedBy ?? null;
  const listUrl = options?.listUrl ?? LIST_URL;

  const summary: RunCentralAtlanticSummary = {
    success: false,
    total: 0,
    successCount: 0,
    failures: [],
    byOfferType: { Lease: 0, Finance: 0 },
  };

  const browser = await chromium.launch({
    headless,
    channel: process.env.PLAYWRIGHT_CHANNEL === 'chrome' ? 'chrome' : undefined,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 720 },
      locale: 'en-US',
      timezoneId: 'America/New_York',
    });

    const listPage = await context.newPage();
    const queue = await scrapeOfferList(listPage, { listUrl });
    await listPage.close();

    summary.total = queue.length;

    if (summary.total !== EXPECTED_LIST_TOTAL) {
      console.warn(
        `[Central Atlantic] List count mismatch: got ${summary.total}, expected ${EXPECTED_LIST_TOTAL}. Investigate before considering complete.`
      );
      summary.listCountMismatch = true;
    } else {
      console.log(`[Central Atlantic] List count: ${summary.total} offers`);
    }

    for (const item of queue) {
      const page = await context.newPage();
      try {
        const record = await scrapeOfferDetail(page, item.offerId, item.detailUrl);
        await page.close();

        if (!record) {
          summary.failures.push({ offerId: item.offerId, error: 'Offer not found in __SSR_STATE__' });
          continue;
        }

        // Skip persisting "Other" — we don't extract deal terms for it, so the record would be empty
        if (record.offerType === OfferTypeEnum.Other) {
          summary.failures.push({ offerId: item.offerId, error: 'Offer type "Other" not persisted (no deal terms)' });
          continue;
        }

        if (!skipDb) {
          await upsertCentralAtlanticOffer(record, { updatedBy });
        }

        summary.successCount++;
        if (record.offerType === OfferTypeEnum.Lease) summary.byOfferType.Lease++;
        else if (record.offerType === OfferTypeEnum.Finance) summary.byOfferType.Finance++;
      } catch (err) {
        await page.close().catch(() => {});
        const message = err instanceof Error ? err.message : String(err);
        summary.failures.push({ offerId: item.offerId, error: message });
        console.error(`[Central Atlantic] Failed ${item.offerId}: ${message}`);
      }
    }

    const leaseFinanceTotal = summary.byOfferType.Lease + summary.byOfferType.Finance;
    if (leaseFinanceTotal !== EXPECTED_LEASE_FINANCE_COUNT) {
      console.warn(
        `[Central Atlantic] Lease+Finance count: got ${leaseFinanceTotal}, expected ${EXPECTED_LEASE_FINANCE_COUNT}. Investigate before considering complete.`
      );
    }

    summary.success = summary.failures.length === 0;
  } finally {
    await browser.close();
  }

  return summary;
}
