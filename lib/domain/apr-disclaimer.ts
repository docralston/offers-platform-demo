/**
 * APR disclaimer generator for finance offers.
 * Computes monthly payment per $1,000 borrowed using standard amortization
 * and returns OEM-style disclosure sentence. Deterministic; no AI.
 */
import { Prisma } from '@prisma/client';

import { formatAprPercent } from './apr-format';

/**
 * Monthly payment per $1,000 borrowed (standard amortization).
 * @param aprPercent - Annual percentage rate (e.g. 1.9 for 1.9%)
 * @param termMonths - Loan term in months (e.g. 72)
 * @returns Payment rounded to 2 decimal places
 */
export function monthlyPaymentPer1000(aprPercent: number, termMonths: number): number {
  const n = Number(termMonths);
  if (n < 1 || !Number.isFinite(n)) {
    return 0;
  }
  const apr = Number(aprPercent);
  if (!Number.isFinite(apr) || apr < 0) {
    return 0;
  }
  if (apr === 0) {
    const payment = 1000 / n;
    return Math.round(payment * 100) / 100;
  }
  const r = (apr / 100) / 12;
  const payment = 1000 * (r / (1 - Math.pow(1 + r, -n)));
  return Math.round(payment * 100) / 100;
}

/**
 * Format dollar amount: always two decimals with $ prefix.
 */
function formatPaymentDollars(payment: number): string {
  return `$${payment.toFixed(2)}`;
}

/**
 * Build the full APR disclaimer sentence.
 * @param aprPercent - Annual percentage rate (e.g. 1.9 for 1.9%)
 * @param termMonths - Loan term in months (e.g. 72)
 * @returns Sentence: "X% APR financing with XX monthly payments of $X.XX for each $1,000 borrowed."
 */
export function formatAprDisclaimer(aprPercent: number, termMonths: number): string {
  const n = Math.floor(Number(termMonths));
  if (n < 1) {
    return '';
  }
  const payment = monthlyPaymentPer1000(aprPercent, n);
  const aprStr = formatAprPercent(aprPercent);
  const paymentStr = formatPaymentDollars(payment);
  return `${aprStr} APR financing with ${n} monthly payments of ${paymentStr} for each $1,000 borrowed.`;
}

export interface FinanceOfferLike {
  offerType?: string | null;
  /** number (input) or Prisma Decimal (from DB) */
  aprRate?: number | Prisma.Decimal | null;
  aprTermMonths?: number | null;
  disclaimer?: string | null;
}

/**
 * Return generated disclaimer for a Finance offer with APR and term; otherwise null.
 * Use at integration points: disclaimer = getDisclaimerForFinanceOffer(data) ?? data.disclaimer ?? null
 */
export function getDisclaimerForFinanceOffer(offer: FinanceOfferLike): string | null {
  if (offer.offerType !== 'Finance') return null;
  const apr = offer.aprRate != null ? Number(offer.aprRate) : null;
  const term = offer.aprTermMonths != null ? Number(offer.aprTermMonths) : null;
  if (apr == null || term == null || !Number.isFinite(apr) || !Number.isFinite(term) || term < 1) {
    return null;
  }
  return formatAprDisclaimer(apr, term);
}
