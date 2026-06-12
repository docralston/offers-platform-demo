import { formatConditionPrefix, formatVehicleTitle, modelForDisplay } from '@/lib/domain/offer-type';

export type CardGroupInput = {
  id: string;
  storeCode: string;
  condition: string | null;
  year: number | null;
  make: string | null;
  model: string | null;
  offerType: string | null;
  // Allow loose shapes from serialized selection results and full Offer objects
  // (lease/finance fields, financeRates, etc.).
  [key: string]: unknown;
};

export interface CardGroup<T extends CardGroupInput = CardGroupInput> {
  groupKey: string;
  title: string;
  titleOffer: T;
  offers: T[];
  hasCertifiedFinance: boolean;
}

function isCertifiedFinance(o: CardGroupInput): boolean {
  return o.condition === 'CERTIFIED' && o.offerType === 'Finance';
}

export function getCardGroupKey(o: CardGroupInput): string {
  const base = `${o.storeCode}\0${o.condition}\0${o.make ?? ''}\0${o.model ?? ''}`;
  if (isCertifiedFinance(o)) {
    // Group Certified finance offers by model (store + condition + make + model), ignoring year.
    return `CF\0${base}`;
  }
  return `${base}\0${o.year ?? ''}`;
}

function hasLeaseLikeData(o: CardGroupInput): boolean {
  const leasePayment = o.leasePayment;
  const leaseTerm = o.leaseTerm;
  const leaseMiles = o.leaseMiles;
  const dueAtSigning = o.dueAtSigning;
  return (
    o.offerType === 'Lease' ||
    (leasePayment != null && leaseTerm != null && leaseMiles != null && dueAtSigning != null)
  );
}

function hasFinanceLikeData(o: CardGroupInput): boolean {
  const financeRates = o.financeRates;
  return (
    o.offerType === 'Finance' ||
    (o.aprRate != null && o.aprTermMonths != null) ||
    (Array.isArray(financeRates) && financeRates.length > 0)
  );
}

export type CardBrand = 'toyota' | 'bmw' | 'lexus';

export function formatCertifiedVehicleTitle(
  offer: CardGroupInput,
  brand: CardBrand
): string {
  const make = (offer.make ?? (brand === 'lexus' ? 'Lexus' : '')).trim();
  const model = modelForDisplay(make, offer.model);

  if (brand === 'lexus') {
    const base = `L/Certified ${make}`.trim();
    return model ? `${base} ${model}`.trim() : base;
  }

  const prefix = formatConditionPrefix(offer.condition);
  const parts = [prefix.trim(), make, model].filter((p) => p && p !== '');
  return parts.join(' ').trim();
}

/**
 * Groups offers into card-level groups using the same key logic as email/web specials:
 * - Base: storeCode, condition, make, model, year
 * - Certified finance override: CF + storeCode + condition + make + model (year ignored)
 *
 * Also picks a title offer per group (preferring Lease → Finance → first) and derives a
 * human-readable title using formatVehicleTitle, with Lexus Certified overrides where relevant.
 */
export function groupOffersForCards<T extends CardGroupInput>(
  offers: T[],
  storeCode: string,
  brand?: CardBrand
): CardGroup<T>[] {
  const groupsMap = new Map<string, T[]>();

  for (const offer of offers) {
    const key = getCardGroupKey(offer);
    if (!groupsMap.has(key)) groupsMap.set(key, []);
    groupsMap.get(key)!.push(offer);
  }

  const groups: CardGroup<T>[] = [];

  for (const [groupKey, groupOffers] of groupsMap.entries()) {
    const leaseOffers = groupOffers.filter(hasLeaseLikeData);
    const financeOffers = groupOffers.filter((o) => !hasLeaseLikeData(o) && hasFinanceLikeData(o));

    const titleOffer =
      leaseOffers[0] ?? financeOffers[0] ?? groupOffers[0];

    const hasCertified = groupOffers.some(isCertifiedFinance);

    const title =
      hasCertified && brand === 'lexus'
        ? formatCertifiedVehicleTitle(titleOffer, brand)
        : formatVehicleTitle(titleOffer);

    groups.push({
      groupKey,
      title,
      titleOffer,
      offers: groupOffers,
      hasCertifiedFinance: hasCertified,
    });
  }

  return groups;
}

