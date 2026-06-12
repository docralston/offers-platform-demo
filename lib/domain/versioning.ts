import { Offer } from '@prisma/client';
import { prisma } from '../prisma';

/**
 * Creates a new version snapshot of an offer
 * Called on create/update/restore operations
 */
export async function createOfferVersion(
  offerId: string,
  userId: string,
  changeNote?: string | null
): Promise<void> {
  // Get the current offer
  const offer = await prisma.offer.findUnique({
    where: { id: offerId },
  });

  if (!offer) {
    throw new Error(`Offer ${offerId} not found`);
  }

  // Get the current max version number for this offer
  const maxVersion = await prisma.offerVersion.findFirst({
    where: { offerId },
    orderBy: { versionNumber: 'desc' },
    select: { versionNumber: true },
  });

  const nextVersionNumber = (maxVersion?.versionNumber || 0) + 1;

  // Create snapshot of full offer data
  const snapshot: Omit<Offer, 'id' | 'createdAt' | 'updatedAt'> = {
    storeCode: offer.storeCode,
    storeCodes: offer.storeCodes,
    externalId: offer.externalId,
    make: offer.make,
    model: offer.model,
    series: offer.series,
    year: offer.year,
    trim: offer.trim,
    modelCode: offer.modelCode,
    fuelType: offer.fuelType,
    condition: offer.condition,
    startDate: offer.startDate,
    endDate: offer.endDate,
    acquisitionFee: offer.acquisitionFee,
    downPayment: offer.downPayment,
    stockNumber: offer.stockNumber,
    status: offer.status,
    inventoryUrl: offer.inventoryUrl,
    imageUrl: offer.imageUrl,
    leasePayment: offer.leasePayment,
    leaseTerm: offer.leaseTerm,
    leaseMiles: offer.leaseMiles,
    dueAtSigning: offer.dueAtSigning,
    capCostReduction: offer.capCostReduction,
    grossCapCost: offer.grossCapCost,
    netCapCost: offer.netCapCost,
    securityDeposit: offer.securityDeposit,
    perExcessMile: offer.perExcessMile,
    msrp: offer.msrp,
    discount: offer.discount,
    buyFor: offer.buyFor,
    offerType: offer.offerType,
    aprRate: offer.aprRate,
    aprTermMonths: offer.aprTermMonths,
    financeRates: offer.financeRates,
    rebateTotal: offer.rebateTotal,
    customerCash: offer.customerCash,
    leaseCash: offer.leaseCash,
    aprCash: offer.aprCash,
    bonusCash: offer.bonusCash,
    disclaimer: offer.disclaimer,
    disclaimerSource: offer.disclaimerSource,
    additionalNotes: offer.additionalNotes,
    validationIssues: offer.validationIssues,
    updatedBy: offer.updatedBy,
  };

  // Create version record
  await prisma.offerVersion.create({
    data: {
      offerId,
      versionNumber: nextVersionNumber,
      changedBy: userId,
      changeNote: changeNote || null,
      snapshot: snapshot as any, // Prisma Json type
    },
  });
}
