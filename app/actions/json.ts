'use server';

import { requireAdmin } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { renderWebJson } from '@/lib/renderers/json';

function serializeOffer<T extends { endDate: Date; startDate: Date; updatedAt: Date; createdAt: Date; aprRate: unknown; rebateTotal: unknown; customerCash: unknown; leaseCash: unknown; aprCash: unknown; bonusCash: unknown }>(o: T) {
  const decimalToNumber = (v: unknown): number | null => (v == null ? null : Number(v));
  return {
    ...o,
    endDate: o.endDate.toISOString(),
    startDate: o.startDate.toISOString(),
    updatedAt: o.updatedAt.toISOString(),
    createdAt: o.createdAt.toISOString(),
    aprRate: decimalToNumber(o.aprRate),
    rebateTotal: decimalToNumber(o.rebateTotal),
    customerCash: decimalToNumber(o.customerCash),
    leaseCash: decimalToNumber(o.leaseCash),
    aprCash: decimalToNumber(o.aprCash),
    bonusCash: decimalToNumber(o.bonusCash),
  };
}

/**
 * Fetches offers by IDs and returns JSON string (full offer objects, serialized for client).
 * Uses Schema.org-style structure from renderWebJson; storeCode used for inventory URLs.
 */
export async function getOffersJson(
  offerIds: string[],
  storeCode: string,
  format: 'full' | 'schema' = 'full'
): Promise<{ success: true; data: string } | { success: false; errors: Array<{ message: string }> }> {
  try {
    await requireAdmin();
    if (offerIds.length === 0) {
      return { success: false, errors: [{ message: 'Select at least one offer' }] };
    }
    const offers = await prisma.offer.findMany({
      where: { id: { in: offerIds } },
      orderBy: [{ model: 'asc' }, { trim: 'asc' }],
    });
    if (format === 'schema') {
      const json = renderWebJson(offers, storeCode);
      return { success: true, data: json };
    }
    const serialized = offers.map(serializeOffer);
    return { success: true, data: JSON.stringify(serialized, null, 2) };
  } catch (e) {
    console.error('getOffersJson:', e);
    return {
      success: false,
      errors: [{ message: e instanceof Error ? e.message : 'Failed to generate JSON' }],
    };
  }
}
