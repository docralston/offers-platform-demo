'use server';

import { requireAdmin } from '@/lib/auth';
import { getDisclaimerTemplatesConfig } from '@/lib/disclaimers/template-resolver-db';
import { prisma } from '@/lib/prisma';
import { renderWebSpecialsHtml } from '@/lib/renderers/web-specials';
import type { SpecialsBrand } from '@/lib/renderers/specials-shared';
import { groupOffersForCards } from '@/lib/domain/card-groups';

/**
 * Generates full HTML for the Web Specials page for a brand.
 * Fetches offers by IDs; storeCode must match the brand (TOY for Toyota, BMW for BMW, LEXDT/LEXWG for Lexus).
 */
export async function generateSpecialsHtml(
  brand: SpecialsBrand,
  storeCode: string,
  offerIds: string[],
  orderedGroupKeys?: string[]
): Promise<{ success: true; data: string } | { success: false; errors: Array<{ message: string }> }> {
  try {
    await requireAdmin();
    if (!brand || !storeCode || offerIds.length === 0) {
      return { success: false, errors: [{ message: 'Brand, store, and at least one offer required' }] };
    }
    const brandFromStore = getBrandForStoreCode(storeCode);
    if (!brandFromStore) {
      return { success: false, errors: [{ message: `Unsupported store code: ${storeCode}` }] };
    }
    const offers = await prisma.offer.findMany({
      where: { id: { in: offerIds }, storeCode },
      orderBy: [{ model: 'asc' }, { trim: 'asc' }],
    });
    if (offers.length === 0) {
      return { success: false, errors: [{ message: 'No offers found for the selected IDs and store' }] };
    }
    let orderedOffers = offers;
    const effectiveBrand: SpecialsBrand = brandFromStore;

    if (orderedGroupKeys && orderedGroupKeys.length > 0) {
      const groups = groupOffersForCards(offers, storeCode, effectiveBrand);
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

    const templates = await getDisclaimerTemplatesConfig();
    const html = renderWebSpecialsHtml(orderedOffers, storeCode, effectiveBrand, templates);
    return { success: true, data: html };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to generate specials HTML';
    console.error('generateSpecialsHtml:', e);
    return {
      success: false,
      errors: [{ message }],
    };
  }
}

function getBrandForStoreCode(storeCode: string): SpecialsBrand | null {
  if (storeCode === 'TOY') return 'toyota';
  if (storeCode === 'BMW') return 'bmw';
  if (storeCode === 'LEXDT' || storeCode === 'LEXWG') return 'lexus';
  return null;
}
