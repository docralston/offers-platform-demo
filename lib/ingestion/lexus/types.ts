/**
 * Lexus OEM offers API response types.
 *
 * Shape derived from:
 * https://www.lexus.com/rest/lexus/offers?zip=18901&offerCategory=NEW&consolidate=true&experience=offers
 * https://www.lexus.com/rest/lexus/offers?zip=18901&offerCategory=CPO&consolidate=true&experience=offers
 */

export type LexusOfferCategory = 'new' | 'cpo' | string;

export interface LexusTrim {
  trimCode?: string;
  year: string;
  name: string;
  id: string;
}

export interface LexusFeedOffer {
  offerId?: string; // program-level identifier (can apply across multiple vehicles)
  offerType: string; // e.g. "APR"
  offerCategory: LexusOfferCategory;
  amount: string; // e.g. "0", "4.99"
  term: string; // e.g. "72"
  aprCash?: string; // e.g. "2,000"
  downPayment?: string; // e.g. "3,999" (for lease offers, this is dueAtSigning)
  additionalOffer?: string; // e.g. "+$2,000 Finance Cash Incentive"
  trims: LexusTrim[];
  year: string; // e.g. "2026"
  seriesId: string; // e.g. "RZ"
  seriesShortName: string; // e.g. "RZ"
  cardTemplate: string; // e.g. "apr"
  cardHeading: string;
  offerLabel: string; // e.g. "Finance"
  offerTypeDisplayName: string; // e.g. "Finance"
  amountQualifier?: string; // e.g. "APR"
  termPreQualifier?: string; // e.g. "Financing up to"
  termPostQualifier?: string; // e.g. "mos."
  description?: string; // often starts with "Expires MM-DD-YYYY."
  disclaimer?: string; // long legal text
}

export interface LexusMarket {
  marketName: string;
  marketLdaTitle: string;
  offers: LexusFeedOffer[];
}

export interface LexusOffersResponse {
  markets: Record<string, LexusMarket>;
}

