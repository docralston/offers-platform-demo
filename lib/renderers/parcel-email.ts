import { renderEmailHtml } from './email';
import { Offer } from '@prisma/client';

/**
 * Renders Parcel.io-compatible email HTML
 * Uses the same format as email renderer (must match Excel U2 cell exactly)
 */
export function renderParcelEmailHtml(offers: Offer[], storeCode: string): string {
  return renderEmailHtml(offers, storeCode);
}
