import type { CardGroup } from '@/lib/domain/card-groups';
import type { SerializedOfferForSelection } from '@/components/admin/OfferSelectionSection';
import { computeBestFinanceRate, parseFinanceRates } from '@/lib/domain/finance-rates';

/**
 * Sort key for admin card lists (specials, emails): lowest lease payment first, then lowest finance APR, then title.
 */
export function compareCardGroupsByOfferValue(
  a: Pick<CardGroup<SerializedOfferForSelection>, 'title' | 'offers'>,
  b: Pick<CardGroup<SerializedOfferForSelection>, 'title' | 'offers'>
): number {
  const aMonthly = getLowestMonthlyPayment(a.offers);
  const bMonthly = getLowestMonthlyPayment(b.offers);
  if (aMonthly !== bMonthly) return aMonthly - bMonthly;

  const aApr = getLowestFinanceApr(a.offers);
  const bApr = getLowestFinanceApr(b.offers);
  if (aApr !== bApr) return aApr - bApr;

  return a.title.localeCompare(b.title, undefined, { sensitivity: 'base', numeric: true });
}

function getLowestMonthlyPayment(offers: SerializedOfferForSelection[]): number {
  const monthlyValues = offers
    .map((offer) => toFiniteNumber(offer.leasePayment))
    .filter((value): value is number => value !== null);
  if (monthlyValues.length === 0) return Number.POSITIVE_INFINITY;
  return Math.min(...monthlyValues);
}

function getLowestFinanceApr(offers: SerializedOfferForSelection[]): number {
  const aprValues = offers
    .map((offer) => getOfferBestApr(offer))
    .filter((value): value is number => value !== null);
  if (aprValues.length === 0) return Number.POSITIVE_INFINITY;
  return Math.min(...aprValues);
}

function getOfferBestApr(offer: SerializedOfferForSelection): number | null {
  const directApr = toFiniteNumber(offer.aprRate);
  if (directApr !== null) return directApr;
  const best = computeBestFinanceRate(parseFinanceRates(offer.financeRates));
  return best ? best.aprRate : null;
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}
