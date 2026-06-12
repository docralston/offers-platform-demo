'use server';

import { requireAdmin } from '@/lib/auth';
import { selectOffersForPublish, selectOffersForSelection, type SelectionFilters } from '@/lib/domain/selection';
import { renderEmailHtml } from '@/lib/renderers/email';
import { renderParcelEmailHtml } from '@/lib/renderers/parcel-email';
import { renderLandingPageHtml } from '@/lib/renderers/landing-page';
import { renderWebJson } from '@/lib/renderers/json';
import { renderAdsCsv } from '@/lib/renderers/csv';
import { validatePublishOffers } from '@/lib/renderers/utils';
import { prisma } from '@/lib/prisma';

function serializeOffers(offers: Awaited<ReturnType<typeof selectOffersForPublish>>) {
  const decimalToNumber = (v: unknown): number | null =>
    v == null ? null : Number(v);
  return offers.map((o) => ({
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
  }));
}

/**
 * Server action to get offers for Emails/JSON selection (store + optional date range, search, status).
 * Returns serialized offers for client.
 */
export async function getOffersForSelection(filters: SelectionFilters) {
  await requireAdmin();
  const offers = await selectOffersForSelection(filters);
  return serializeOffers(offers);
}
export async function getOffersForPublish(
  storeCode: string,
  dateFrom: Date | string,
  dateTo: Date | string
) {
  await requireAdmin(); // Ensure authenticated

  const from = typeof dateFrom === 'string' ? new Date(dateFrom) : dateFrom;
  const to = typeof dateTo === 'string' ? new Date(dateTo) : dateTo;

  return await selectOffersForPublish(storeCode, from, to);
}

/**
 * Server action to generate all publish outputs
 */
export async function generatePublishOutputs(
  storeCode: string,
  dateFrom: Date | string,
  dateTo: Date | string
) {
  await requireAdmin(); // Ensure authenticated

  const from = typeof dateFrom === 'string' ? new Date(dateFrom) : dateFrom;
  const to = typeof dateTo === 'string' ? new Date(dateTo) : dateTo;

  const offers = await selectOffersForPublish(storeCode, from, to);
  const warnings = validatePublishOffers(offers);

  const outputs = {
    emailHtml: renderEmailHtml(offers, storeCode),
    parcelEmailHtml: renderParcelEmailHtml(offers, storeCode),
    landingPageHtml: renderLandingPageHtml(offers, storeCode),
    webJson: renderWebJson(offers, storeCode),
    adsCsv: renderAdsCsv(offers),
  };

  const serializedOffers = serializeOffers(offers);

  return {
    offers: serializedOffers,
    warnings,
    outputs,
  };
}
