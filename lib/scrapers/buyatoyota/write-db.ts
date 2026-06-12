/**
 * Toyota Central Atlantic scraper DB write: upsert by offerId (externalId).
 * Always set startDate = new Date() on every write (create and update).
 * No inactivate-others logic; only upserts records we scrape.
 */

import { prisma } from '@/lib/prisma';
import { OfferStatus, VehicleCondition, OfferTypeEnum } from '@prisma/client';
import type { CentralAtlanticOfferRecord } from './detail';

const STORE_CODE = 'TOY';

export interface WriteCentralAtlanticResult {
  inserted: number;
  updated: number;
  error?: string;
}

/** Only persist Lease/Finance; Cash offers are created manually. */
function toOfferType(v: unknown): OfferTypeEnum | null {
  if (v == null) return null;
  const s = typeof v === 'string' ? v.trim() : String(v);
  if (!s || !['Lease', 'Finance'].includes(s)) return null;
  return s as OfferTypeEnum;
}

/**
 * Upsert one offer by externalId (offerId). startDate is set to now() on every write.
 */
export async function upsertCentralAtlanticOffer(
  record: CentralAtlanticOfferRecord,
  options?: { updatedBy?: string | null }
): Promise<{ inserted: boolean }> {
  const updatedBy = options?.updatedBy ?? 'scraper-centralatlantic';
  const externalId = record.externalId;
  const startDate = new Date();

  const makeVal =
    record.condition === VehicleCondition.USED && record.make?.trim() ? record.make.trim() : null;

  const data = {
    storeCode: STORE_CODE,
    externalId,
    make: makeVal,
    model: record.model,
    year: record.year ?? null,
    trim: record.trim || null,
    condition: (record.condition as VehicleCondition) ?? VehicleCondition.NEW,
    startDate,
    endDate: record.endDate instanceof Date ? record.endDate : new Date(record.endDate),
    status: (record.status as OfferStatus) ?? OfferStatus.LIVE,
    inventoryUrl: record.inventoryUrl || null,
    imageUrl: record.imageUrl || null,
    leasePayment: record.leasePayment ?? null,
    leaseTerm: record.leaseTerm ?? null,
    leaseMiles: record.leaseMiles ?? null,
    dueAtSigning: record.dueAtSigning ?? null,
    acquisitionFee: record.acquisitionFee ?? null,
    downPayment: record.downPayment ?? null,
    msrp: record.msrp ?? null,
    discount: record.discount ?? null,
    buyFor: record.buyFor ?? null,
    stockNumber: record.stockNumber || null,
    offerType: toOfferType(record.offerType),
    aprRate: record.aprRate ?? null,
    aprTermMonths: record.aprTermMonths ?? null,
    rebateTotal: record.rebateTotal ?? null,
    customerCash: record.customerCash ?? null,
    leaseCash: record.leaseCash ?? null,
    aprCash: record.aprCash ?? null,
    bonusCash: record.bonusCash ?? null,
    disclaimer: record.disclaimer || null,
    additionalNotes: record.additionalNotes || null,
    updatedBy,
  };

  const existing = await prisma.offer.findUnique({
    where: {
      storeCode_externalId: { storeCode: STORE_CODE, externalId },
    },
  });

  const { externalId: _e, ...updatePayload } = data as typeof data & { externalId: string };

  if (existing) {
    await prisma.offer.update({
      where: { id: existing.id },
      data: updatePayload as Parameters<typeof prisma.offer.update>[0]['data'],
    });
    return { inserted: false };
  }

  await prisma.offer.create({
    data: data as Parameters<typeof prisma.offer.create>[0]['data'],
  });
  return { inserted: true };
}

/**
 * Upsert multiple offers. Returns inserted/updated counts. Continues on per-row errors;
 * errors are not thrown but can be tracked by the caller if needed.
 */
export async function upsertCentralAtlanticOffers(
  records: CentralAtlanticOfferRecord[],
  options?: { updatedBy?: string | null }
): Promise<WriteCentralAtlanticResult> {
  const result: WriteCentralAtlanticResult = { inserted: 0, updated: 0 };
  for (const record of records) {
    try {
      const { inserted } = await upsertCentralAtlanticOffer(record, options);
      if (inserted) result.inserted++;
      else result.updated++;
    } catch (err) {
      result.error = err instanceof Error ? err.message : String(err);
      throw err;
    }
  }
  return result;
}
