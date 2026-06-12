import type { Offer, OfferTypeEnum } from '@prisma/client';

/** Embed slots show one trim / offer block — not a multi-card specials grid. */
export function pickEmbedWidgetOffers(offers: Offer[], offerType?: OfferTypeEnum): Offer[] {
  if (offers.length === 0) return [];
  const filtered = offerType ? offers.filter((o) => o.offerType === offerType) : offers;
  return filtered.length > 0 ? [filtered[0]] : [];
}
