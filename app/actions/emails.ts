'use server';

import { requireAdmin } from '@/lib/auth';
import { getDisclaimerTemplatesConfig } from '@/lib/disclaimers/template-resolver-db';
import { prisma } from '@/lib/prisma';
import { renderEmailHtml } from '@/lib/renderers/email';
import { groupOffersForCards } from '@/lib/domain/card-groups';
import { buildOfferDisclaimerText } from '@/lib/disclaimers';

export type GenerateEmailHtmlSuccess = {
  html: string;
  disclaimerMinified: string;
  disclaimerAlerts: string[];
  disclaimerHtml: string;
};

/**
 * Fetches offers by IDs and returns parcel.io-safe email HTML (grid of offer cards)
 * plus universal minified disclaimer text.
 */
export async function generateEmailHtml(
  storeCode: string,
  offerIds: string[],
  orderedGroupKeys?: string[]
): Promise<
  | { success: true; data: GenerateEmailHtmlSuccess }
  | { success: false; errors: Array<{ message: string }> }
> {
  try {
    await requireAdmin();
    if (!storeCode || offerIds.length === 0) {
      return { success: false, errors: [{ message: 'Store and at least one offer required' }] };
    }
    const offers = await prisma.offer.findMany({
      where: { id: { in: offerIds } },
      orderBy: [{ model: 'asc' }, { trim: 'asc' }],
    });
    let orderedOffers = offers;

    if (orderedGroupKeys && orderedGroupKeys.length > 0) {
      const groups = groupOffersForCards(offers, storeCode);
      const groupsByKey = new Map(groups.map((g) => [g.groupKey, g.offers]));
      const usedKeys = new Set<string>();
      const flattened: typeof offers = [];

      for (const key of orderedGroupKeys) {
        const groupOffers = groupsByKey.get(key);
        if (groupOffers && !usedKeys.has(key)) {
          flattened.push(...groupOffers);
          usedKeys.add(key);
        }
      }

      for (const g of groups) {
        if (!usedKeys.has(g.groupKey)) {
          flattened.push(...g.offers);
        }
      }

      if (flattened.length > 0) {
        orderedOffers = flattened;
      }
    }

    const html = renderEmailHtml(orderedOffers, storeCode);
    const templates = await getDisclaimerTemplatesConfig();
    const disc = buildOfferDisclaimerText(orderedOffers, storeCode, templates);
    return {
      success: true,
      data: {
        html,
        disclaimerMinified: disc.textMinified,
        disclaimerAlerts: disc.alerts,
        disclaimerHtml: disc.html,
      },
    };
  } catch (e) {
    console.error('generateEmailHtml:', e);
    return {
      success: false,
      errors: [{ message: e instanceof Error ? e.message : 'Failed to generate email' }],
    };
  }
}
