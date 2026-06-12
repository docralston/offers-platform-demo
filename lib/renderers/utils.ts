import { Offer } from '@prisma/client';
import { getImageUrlForOffer } from '@/lib/domain/offer-assets';

export interface Warning {
  level: 'warning' | 'error';
  message: string;
  offerId?: string;
}

/**
 * Validates offers for publishing and returns warnings
 */
export function validatePublishOffers(offers: Offer[]): Warning[] {
  const warnings: Warning[] = [];

  for (const offer of offers) {
    // Required for publishing email
    if (!offer.storeCode) {
      warnings.push({
        level: 'error',
        message: `Offer ${offer.id}: Missing storeCode`,
        offerId: offer.id,
      });
    }

    // Year is optional for certified finance offers
    const isCertifiedFinance = offer.condition === 'CERTIFIED' && offer.offerType === 'Finance';
    if (!offer.model || (!isCertifiedFinance && !offer.year)) {
      warnings.push({
        level: 'error',
        message: `Offer ${offer.id}: Missing required vehicle info (model${!isCertifiedFinance ? ', year' : ''})`,
        offerId: offer.id,
      });
    }
    if (offer.condition === 'USED' && !offer.make) {
      warnings.push({
        level: 'error',
        message: `Offer ${offer.id}: Make is required when condition is Used`,
        offerId: offer.id,
      });
    }

    // Check for buyFor OR lease fields OR finance fields
    const hasBuy = offer.buyFor !== null && offer.buyFor !== undefined;
    const hasLease = offer.leasePayment !== null && offer.leaseTerm !== null &&
                     offer.leaseMiles !== null && offer.dueAtSigning !== null;
    const hasFinance =
      offer.aprRate != null ||
      (offer.financeRates != null &&
        Array.isArray(offer.financeRates) &&
        (offer.financeRates as unknown[]).length > 0);

    if (!hasBuy && !hasLease && !hasFinance) {
      warnings.push({
        level: 'error',
        message: `Offer ${offer.id}: Missing pricing info (need buyFor OR all lease fields OR finance rates)`,
        offerId: offer.id,
      });
    }

    // Warnings for missing optional but recommended fields
    // Only warn when imageUrl cannot be computed (same logic as Offer Details page)
    const imageUrl = getImageUrlForOffer(offer);
    if (!imageUrl) {
      warnings.push({
        level: 'warning',
        message: `Offer ${offer.id}: Missing imageUrl (recommended for email)`,
        offerId: offer.id,
      });
    }

    if (!offer.inventoryUrl) {
      warnings.push({
        level: 'warning',
        message: `Offer ${offer.id}: Missing inventoryUrl (recommended for email)`,
        offerId: offer.id,
      });
    }

    // Validate numbers
    if (offer.discount !== null && offer.discount !== undefined && offer.discount < 0) {
      warnings.push({
        level: 'error',
        message: `Offer ${offer.id}: Discount cannot be negative`,
        offerId: offer.id,
      });
    }

    if (offer.discount !== null && offer.discount > 0 && (!offer.msrp || offer.msrp <= 0)) {
      warnings.push({
        level: 'error',
        message: `Offer ${offer.id}: MSRP required when discount > 0`,
        offerId: offer.id,
      });
    }
  }

  return warnings;
}
