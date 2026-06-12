import { Offer } from '@prisma/client';
import { formatEasternDate } from '@/lib/utils/dates';
import { modelForDisplay } from '@/lib/domain/offer-type';

/**
 * Renders offers as Ads CSV
 */
export function renderAdsCsv(offers: Offer[]): string {
  const headers = [
    'storeCode',
    'make',
    'model',
    'year',
    'trim',
    'condition',
    'headline',
    'lease_payment',
    'buy_for',
    'inventory_url',
    'start_date',
    'end_date',
  ];

  const rows = offers.map(offer => {
    const modelDisplay = modelForDisplay(offer.make, offer.model);
    const headline = `${[offer.year, offer.make, modelDisplay].filter(Boolean).join(' ')} — Lease or Buy`;
    
    return [
      offer.storeCode,
      offer.make ?? '',
      offer.model,
      offer.year?.toString() ?? '',
      offer.trim || '',
      offer.condition || 'NEW',
      headline,
      offer.leasePayment?.toString() || '',
      offer.buyFor?.toString() || '',
      offer.inventoryUrl || '',
      formatEasternDate(offer.startDate),
      formatEasternDate(offer.endDate),
    ].map(field => {
      // Escape CSV fields (wrap in quotes if contains comma, quote, or newline)
      const str = String(field || '');
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    });
  });

  return [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
}

/**
 * Renders offers as full schema CSV.
 */
export function renderOffersCsvFull(offers: Offer[]): string {
  const headers = [
    'status',
    'storeCode',
    'stockNumber',
    'condition',
    'year',
    'make',
    'model',
    'trim',
    'msrp',
    'offerType',
    'leasePayment',
    'leaseTerm',
    'leaseMiles',
    'downPayment',
    'dueAtSigning',
    'capCostReduction',
    'grossCapCost',
    'netCapCost',
    'securityDeposit',
    'perExcessMile',
    'acquisitionFee',
    'aprRate',
    'aprTermMonths',
    'discount',
    'buyFor',
    'customerCash',
    'leaseCash',
    'aprCash',
    'bonusCash',
    'rebateTotal',
    'disclaimer',
    'inventoryUrl',
    'imageUrl',
    'additionalNotes',
    'startDate',
    'endDate',
  ];

  const escape = (field: unknown) => {
    const str = field == null ? '' : String(field);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const rows = offers.map((offer) => {
    return [
      offer.status ?? 'INACTIVE',
      offer.storeCode ?? '',
      offer.stockNumber ?? '',
      offer.condition ?? 'NEW',
      offer.year ?? '',
      offer.make ?? '',
      offer.model ?? '',
      offer.trim ?? '',
      offer.msrp ?? '',
      offer.offerType ?? '',
      offer.leasePayment ?? '',
      offer.leaseTerm ?? '',
      offer.leaseMiles ?? '',
      offer.downPayment ?? '',
      offer.dueAtSigning ?? '',
      offer.capCostReduction ?? '',
      offer.grossCapCost ?? '',
      offer.netCapCost ?? '',
      offer.securityDeposit ?? '',
      offer.perExcessMile != null ? offer.perExcessMile.toString() : '',
      offer.acquisitionFee ?? '',
      offer.aprRate != null ? offer.aprRate.toString() : '',
      offer.aprTermMonths ?? '',
      offer.discount ?? '',
      offer.buyFor ?? '',
      offer.customerCash != null ? offer.customerCash.toString() : '',
      offer.leaseCash != null ? offer.leaseCash.toString() : '',
      offer.aprCash != null ? offer.aprCash.toString() : '',
      offer.bonusCash != null ? offer.bonusCash.toString() : '',
      offer.rebateTotal != null ? offer.rebateTotal.toString() : '',
      offer.disclaimer ?? '',
      offer.inventoryUrl ?? '',
      offer.imageUrl ?? '',
      offer.additionalNotes ?? '',
      offer.startDate ? formatEasternDate(offer.startDate) : '',
      offer.endDate ? formatEasternDate(offer.endDate) : '',
    ].map(escape);
  });

  return [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');
}
