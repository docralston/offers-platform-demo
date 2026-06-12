import type { VehicleFuelType } from '@prisma/client';
import { OfferStatus, VehicleCondition } from '@/lib/domain/offer-status';
import { OFFER_TYPE_EXPLICIT, type OfferTypeExplicit } from './offer-type';
import type { OfferInput } from './validation';

export function parseNum(v: FormDataEntryValue | null): number | null {
  if (!v || typeof v !== 'string') return null;
  const n = parseFloat(v.trim());
  return isNaN(n) ? null : n;
}

export function parseIntSafe(v: FormDataEntryValue | null): number | null {
  if (!v || typeof v !== 'string') return null;
  const n = parseInt(v.trim(), 10);
  return isNaN(n) ? null : n;
}

export function parseOfferType(v: FormDataEntryValue | null): OfferTypeExplicit | null {
  const s = (v as string)?.trim();
  return s && OFFER_TYPE_EXPLICIT.includes(s as OfferTypeExplicit) ? (s as OfferTypeExplicit) : null;
}

export function parseStr(v: FormDataEntryValue | null): string | null {
  const s = (v as string)?.trim();
  return s || null;
}

export function parseFuelTypeField(v: FormDataEntryValue | null): VehicleFuelType | null {
  const s = typeof v === 'string' ? v.trim() : '';
  if (s === 'GAS' || s === 'HYBRID' || s === 'PLUG_IN_HYBRID') return s;
  return null;
}

export interface FinanceRateRow {
  aprRate: string;
  aprTermMonths: string;
  fuelType?: string;
}

export interface ParseOfferFormOptions {
  financeRatesRowCount: number;
  includeFuelType?: boolean;
}

export function parseOfferFormData(fd: FormData, options: ParseOfferFormOptions): OfferInput & { status: OfferStatus } {
  const cond = ((fd.get('condition') as VehicleCondition) || VehicleCondition.NEW) as VehicleCondition;
  const ot = parseOfferType(fd.get('offerType'));
  const isCertifiedFinance = cond === VehicleCondition.CERTIFIED && ot === 'Finance';

  const data: OfferInput & { status: OfferStatus } = {
    storeCode: fd.get('storeCode') as string,
    make: cond === VehicleCondition.USED ? ((fd.get('make') as string) || '') : null,
    model: fd.get('model') as string,
    year: isCertifiedFinance ? null : parseInt(fd.get('year') as string),
    trim: (fd.get('trim') as string) || null,
    condition: cond,
    startDate: fd.get('startDate') as string,
    endDate: fd.get('endDate') as string,
    status: ((fd.get('status') as OfferStatus) || OfferStatus.INACTIVE) as OfferStatus,
    inventoryUrl: (fd.get('inventoryUrl') as string) || null,
    imageUrl: (fd.get('imageUrl') as string) || null,
    leasePayment: fd.get('leasePayment') ? parseInt(fd.get('leasePayment') as string) : null,
    leaseTerm: fd.get('leaseTerm') ? parseInt(fd.get('leaseTerm') as string) : null,
    leaseMiles: fd.get('leaseMiles') ? parseInt(fd.get('leaseMiles') as string) : null,
    dueAtSigning: fd.get('dueAtSigning') ? parseInt(fd.get('dueAtSigning') as string) : null,
    capCostReduction: parseIntSafe(fd.get('capCostReduction')),
    grossCapCost: parseIntSafe(fd.get('grossCapCost')),
    netCapCost: parseIntSafe(fd.get('netCapCost')),
    securityDeposit: parseIntSafe(fd.get('securityDeposit')),
    perExcessMile: parseNum(fd.get('perExcessMile')),
    acquisitionFee: fd.get('acquisitionFee') ? parseInt(fd.get('acquisitionFee') as string) : null,
    downPayment: fd.get('downPayment') ? parseInt(fd.get('downPayment') as string) : null,
    msrp: fd.get('msrp') ? parseInt(fd.get('msrp') as string) : null,
    discount: fd.get('discount') ? parseInt(fd.get('discount') as string) : null,
    buyFor: fd.get('buyFor') ? parseInt(fd.get('buyFor') as string) : null,
    stockNumber: (fd.get('stockNumber') as string) || null,
    offerType: ot,
    rebateTotal: parseNum(fd.get('rebateTotal')),
    customerCash: parseNum(fd.get('customerCash')),
    leaseCash: parseNum(fd.get('leaseCash')),
    aprCash: parseNum(fd.get('aprCash')),
    bonusCash: parseNum(fd.get('bonusCash')),
    disclaimer: parseStr(fd.get('disclaimer')),
    disclaimerSource: ((fd.get('disclaimerSource') as string) === 'MANUAL' ? 'MANUAL' : 'AUTO') as 'AUTO' | 'MANUAL',
    additionalNotes: parseStr(fd.get('additionalNotes')),
  };

  if (options.includeFuelType) {
    data.fuelType = parseFuelTypeField(fd.get('fuelType'));
    data.modelCode = parseStr(fd.get('modelCode'));
  }

  if (ot === 'Finance') {
    const rates: Array<{ aprRate: number; aprTermMonths: number; fuelType?: VehicleFuelType }> = [];
    for (let i = 0; i < options.financeRatesRowCount; i++) {
      const aprRate = parseNum(fd.get(`financeRate_${i}_aprRate`));
      const aprTermMonths = parseIntSafe(fd.get(`financeRate_${i}_aprTermMonths`));
      const rowFuel = options.includeFuelType ? parseFuelTypeField(fd.get(`financeRate_${i}_fuelType`)) : null;
      if (aprRate != null && aprTermMonths != null && aprTermMonths >= 1) {
        const row: { aprRate: number; aprTermMonths: number; fuelType?: VehicleFuelType } = {
          aprRate,
          aprTermMonths,
        };
        if (rowFuel) row.fuelType = rowFuel;
        rates.push(row);
      }
    }
    if (rates.length > 0) {
      data.financeRates = rates;
    } else {
      data.aprRate = parseNum(fd.get('financeRate_0_aprRate'));
      data.aprTermMonths = parseIntSafe(fd.get('financeRate_0_aprTermMonths'));
    }
  } else {
    data.aprRate = parseNum(fd.get('aprRate'));
    data.aprTermMonths = parseIntSafe(fd.get('aprTermMonths'));
  }

  return data;
}

/** Subset of offer fields for disclaimer live preview. */
export function buildOfferInputPreviewFromForm(
  fd: FormData,
  defaults?: Partial<OfferInput>,
): OfferInput {
  const cond = ((fd.get('condition') as VehicleCondition) || VehicleCondition.NEW) as VehicleCondition;
  const ot = parseOfferType(fd.get('offerType'));
  const isCertifiedFinance = cond === VehicleCondition.CERTIFIED && ot === 'Finance';
  return {
    storeCode: (fd.get('storeCode') as string) || defaults?.storeCode || 'TOY',
    make: cond === VehicleCondition.USED ? ((fd.get('make') as string) || '') : null,
    model: (fd.get('model') as string) || defaults?.model || '',
    year: isCertifiedFinance ? null : parseInt(fd.get('year') as string),
    trim: (fd.get('trim') as string) || null,
    condition: cond,
    startDate: (fd.get('startDate') as string) || '',
    endDate: (fd.get('endDate') as string) || '',
    leasePayment: fd.get('leasePayment') ? parseInt(fd.get('leasePayment') as string) : null,
    leaseTerm: fd.get('leaseTerm') ? parseInt(fd.get('leaseTerm') as string) : null,
    leaseMiles: fd.get('leaseMiles') ? parseInt(fd.get('leaseMiles') as string) : null,
    dueAtSigning: fd.get('dueAtSigning') ? parseInt(fd.get('dueAtSigning') as string) : null,
    capCostReduction: parseIntSafe(fd.get('capCostReduction')),
    grossCapCost: parseIntSafe(fd.get('grossCapCost')),
    netCapCost: parseIntSafe(fd.get('netCapCost')),
    securityDeposit: parseIntSafe(fd.get('securityDeposit')),
    perExcessMile: parseNum(fd.get('perExcessMile')),
    acquisitionFee: fd.get('acquisitionFee') ? parseInt(fd.get('acquisitionFee') as string) : null,
    offerType: ot,
    msrp: fd.get('msrp') ? parseInt(fd.get('msrp') as string) : null,
    modelCode: parseStr(fd.get('modelCode')) ?? defaults?.modelCode ?? null,
    fuelType: parseFuelTypeField(fd.get('fuelType')) ?? defaults?.fuelType ?? null,
    aprRate: parseNum(fd.get('aprRate')),
    aprTermMonths: parseIntSafe(fd.get('aprTermMonths')),
  };
}
