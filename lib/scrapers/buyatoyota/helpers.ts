/**
 * Toyota Central Atlantic scraper helpers: money parsing, date parsing (MM/DD/YY),
 * and deep object search for offer in __SSR_STATE__.
 */

import { createEasternDate } from '@/lib/utils/dates';

/** Parse money string (e.g. "$4,120" or "4120") to integer dollars. */
export function parseMoney(s: string | null | undefined): number | null {
  if (s == null || typeof s !== 'string') return null;
  const cleaned = s.replace(/[$,\s]/g, '');
  if (!cleaned) return null;
  const n = parseFloat(cleaned);
  return Number.isNaN(n) ? null : Math.round(n);
}

/** Parse MM/DD/YY or MM/DD/YYYY to Date (end-of-day Eastern). Returns null if invalid. */
export function parseMmDdYy(s: string | null | undefined): Date | null {
  if (s == null || typeof s !== 'string') return null;
  const trimmed = s.trim();
  if (!trimmed) return null;
  // MM/DD/YY or MM/DD/YYYY
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(trimmed);
  if (!match) return null;
  const [, mm, dd, yy] = match;
  const month = parseInt(mm!, 10);
  const day = parseInt(dd!, 10);
  let year = parseInt(yy!, 10);
  if (year < 100) year += year >= 50 ? 1900 : 2000;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const yyyy = String(year);
  const mmPad = String(month).padStart(2, '0');
  const ddPad = String(day).padStart(2, '0');
  const dateString = `${yyyy}-${mmPad}-${ddPad}`;
  try {
    return createEasternDate(dateString);
  } catch {
    return null;
  }
}

/**
 * Recursively search SSR state for an object that has offerId === targetOfferId and has details.
 * Avoids relying on fixed paths (e.g. route.data).
 */
export function findOfferInSsrState(ssrState: unknown, targetOfferId: string): Record<string, unknown> | null {
  if (ssrState == null) return null;
  const normId = String(targetOfferId).trim();
  if (!normId) return null;

  function search(node: unknown): Record<string, unknown> | null {
    if (node == null) return null;
    if (typeof node === 'object' && !Array.isArray(node)) {
      const obj = node as Record<string, unknown>;
      const nodeOfferId = obj.offerId;
      const hasDetails = obj.details != null && typeof obj.details === 'object';
      if (
        (String(nodeOfferId) === normId || (typeof nodeOfferId === 'string' && nodeOfferId.trim() === normId)) &&
        hasDetails
      ) {
        return obj;
      }
      for (const key of Object.keys(obj)) {
        const found = search(obj[key]);
        if (found) return found;
      }
      return null;
    }
    if (Array.isArray(node)) {
      for (const item of node) {
        const found = search(item);
        if (found) return found;
      }
    }
    return null;
  }

  return search(ssrState);
}
