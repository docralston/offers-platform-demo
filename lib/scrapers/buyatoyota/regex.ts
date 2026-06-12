/**
 * Toyota Central Atlantic scraper: regex extractors for disclaimer text.
 * Lease-only fields: leaseMiles, downPayment, acquisitionFee, msrp (Total SRP).
 */

export interface DisclaimerFields {
  leaseMiles: number | null;
  downPayment: number | null;
  acquisitionFee: number | null;
  msrp: number | null;
}

function parseIntFromMatch(s: string | undefined): number | null {
  if (s == null || s === '') return null;
  const n = parseInt(s.replace(/,/g, ''), 10);
  return Number.isNaN(n) ? null : n;
}

/** Extract lease-related fields from disclaimer text via regex. */
export function extractDisclaimerFields(disclaimerText: string): DisclaimerFields {
  const text = typeof disclaimerText === 'string' ? disclaimerText : '';
  return {
    leaseMiles: parseLeaseMiles(text),
    downPayment: parseDownPayment(text),
    acquisitionFee: parseAcquisitionFee(text),
    msrp: parseMsrp(text),
  };
}

/** e.g. "10,000 miles per year" or "over ... miles per year" */
function parseLeaseMiles(text: string): number | null {
  const m = text.match(/([0-9,]+)\s*miles per year/i) ?? text.match(/over\s+([0-9,]+)\s*miles per year/i);
  return parseIntFromMatch(m?.[1]);
}

/** e.g. "...includes $4,120 customer down payment..." */
function parseDownPayment(text: string): number | null {
  const m = text.match(/includes\s*\$\s*([0-9,]+)\s*customer down payment/i);
  return parseIntFromMatch(m?.[1]);
}

/** e.g. "$650 Acquisition Fee" */
function parseAcquisitionFee(text: string): number | null {
  const m = text.match(/\$\s*([0-9,]+)\s*Acquisition Fee/i);
  return parseIntFromMatch(m?.[1]);
}

/** Toyota uses "Total SRP of $42,670" — store in msrp */
function parseMsrp(text: string): number | null {
  const m = text.match(/Total SRP of \$\s*([0-9,]+)/i);
  return parseIntFromMatch(m?.[1]);
}
