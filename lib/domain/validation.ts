import { OfferStatus, VehicleCondition, type VehicleFuelType } from '@prisma/client';
import { OFFER_TYPE_EXPLICIT, OFFER_TYPE_ACTIVE, type OfferTypeExplicit } from './offer-type';
import { STORE_CODES } from '@/lib/config/stores';
import { isSafeHttpsUrl } from '@/lib/domain/safe-url';

export interface ValidationError {
  field: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

export interface OfferInput {
  storeCode: string;
  /** When non-empty, offer applies to all listed stores; else treat as [storeCode]. */
  storeCodes?: string[] | null;
  make?: string | null;  // required when condition is USED
  model: string;
   /** High-level series grouping (e.g. "3 Series", "X5", "i4", "M Models"). Optional and brand-specific. */
  series?: string | null;
  year?: number | null;
  trim?: string | null;
  /** Toyota numeric code (e.g. "2557") or BMW local code (e.g. "262V") */
  modelCode?: string | null;
  condition?: VehicleCondition;
  startDate: Date | string;
  endDate: Date | string;
  status?: OfferStatus;
  inventoryUrl?: string | null;
  imageUrl?: string | null;
  leasePayment?: number | null;
  leaseTerm?: number | null;
  leaseMiles?: number | null;
  dueAtSigning?: number | null;
  capCostReduction?: number | null;
  grossCapCost?: number | null;
  netCapCost?: number | null;
  securityDeposit?: number | null;
  /** Cost per mile over lease allowance (e.g. 0.25). */
  perExcessMile?: number | null;
  acquisitionFee?: number | null;
  downPayment?: number | null;
  msrp?: number | null;
  discount?: number | null;
  buyFor?: number | null;
  stockNumber?: string | null;

  // Explicit offer type and APR
  offerType?: OfferTypeExplicit | string | null;
  /** APR in percent units, e.g. 3.99 for 3.99% */
  aprRate?: number | null;
  aprTermMonths?: number | null;
  /** When offerType=Finance, multiple rate/term options. Best is derived for aprRate/aprTermMonths. */
  financeRates?: Array<{ aprRate: number; aprTermMonths: number; fuelType?: VehicleFuelType }> | null;

  /** Vehicle fuel / powertrain (finance APR matching). */
  fuelType?: VehicleFuelType | null;

  // Rebates (store as numbers, no $)
  rebateTotal?: number | null;
  customerCash?: number | null;
  leaseCash?: number | null;
  aprCash?: number | null;
  bonusCash?: number | null;

  // Text
  disclaimer?: string | null;
  disclaimerSource?: 'AUTO' | 'MANUAL' | null;
  additionalNotes?: string | null;
}

/**
 * Validates offer data according to business rules
 */
export function validateOffer(data: OfferInput): ValidationResult {
  const errors: ValidationError[] = [];

  // storeCode must be a known store
  const validStoreCodes: readonly string[] = STORE_CODES;
  if (!data.storeCode || !validStoreCodes.includes(data.storeCode)) {
    errors.push({
      field: 'storeCode',
      message: `storeCode must be one of: ${STORE_CODES.join(', ')}`,
    });
  }

  // storeCodes entries must all be known stores
  if (data.storeCodes != null && Array.isArray(data.storeCodes)) {
    const invalid = data.storeCodes.filter((c) => !validStoreCodes.includes(c));
    if (invalid.length > 0) {
      errors.push({
        field: 'storeCodes',
        message: `Invalid store codes: ${invalid.join(', ')}. Must be one of: ${STORE_CODES.join(', ')}`,
      });
    }
  }

  // Date validation
  const startDate = typeof data.startDate === 'string' ? new Date(data.startDate) : data.startDate;
  const endDate = typeof data.endDate === 'string' ? new Date(data.endDate) : data.endDate;
  
  if (endDate < startDate) {
    errors.push({
      field: 'endDate',
      message: 'End date must be greater than or equal to start date',
    });
  }

  // Make is required when condition is USED
  const cond = (data.condition || 'NEW').toString();
  if (cond === 'USED') {
    if (!data.make || !String(data.make).trim()) {
      errors.push({ field: 'make', message: 'Make is required when condition is Used' });
    }
  }

  // Lease completeness: if ANY lease field is present, require core lease fields
  const hasLeaseFields = [
    data.leasePayment,
    data.leaseTerm,
    data.leaseMiles,
    data.dueAtSigning,
    data.acquisitionFee,
    data.downPayment,
  ].some(val => val !== null && val !== undefined);

  if (hasLeaseFields) {
    // Core lease fields are required if any lease field is present
    if (data.leasePayment === null || data.leasePayment === undefined) {
      errors.push({
        field: 'leasePayment',
        message: 'Lease payment is required when other lease fields are provided',
      });
    }
    if (data.leaseTerm === null || data.leaseTerm === undefined) {
      errors.push({
        field: 'leaseTerm',
        message: 'Lease term is required when other lease fields are provided',
      });
    }
    if (data.leaseMiles === null || data.leaseMiles === undefined) {
      errors.push({
        field: 'leaseMiles',
        message: 'Lease miles is required when other lease fields are provided',
      });
    }
    if (data.dueAtSigning === null || data.dueAtSigning === undefined) {
      errors.push({
        field: 'dueAtSigning',
        message: 'Due at signing is required when other lease fields are provided',
      });
    }
    // Acquisition fee and down payment are optional even when lease fields are present
  }

  // Buy rules
  // - buyFor can exist alone
  // - If discount > 0 then msrp is required
  if (data.discount !== null && data.discount !== undefined && data.discount > 0) {
    if (data.msrp === null || data.msrp === undefined) {
      errors.push({
        field: 'msrp',
        message: 'MSRP is required when discount is greater than 0',
      });
    }
  }

  // offerType: must be one of Lease | Finance | Cash | Other if provided
  const ot = data.offerType != null && String(data.offerType).trim() ? String(data.offerType).trim() : null;
  if (ot !== null && !OFFER_TYPE_EXPLICIT.includes(ot as OfferTypeExplicit)) {
    errors.push({
      field: 'offerType',
      message: `offerType must be one of: ${OFFER_TYPE_EXPLICIT.join(', ')}`,
    });
  }
  // Check for deprecated offer types (Other)
  if (ot !== null && !OFFER_TYPE_ACTIVE.includes(ot as any)) {
    errors.push({
      field: 'offerType',
      message: `Offer type "${ot}" is not supported. Use Lease, Finance, or Cash.`,
    });
  }

  // aprRate: soft 0–25 if provided (when not using financeRates)
  const hasFinanceRates = Array.isArray(data.financeRates) && data.financeRates.length > 0;
  if (!hasFinanceRates) {
    const apr = data.aprRate;
    if (apr != null && (typeof apr !== 'number' || isNaN(apr) || apr < 0 || apr > 25)) {
      errors.push({ field: 'aprRate', message: 'APR rate must be a number between 0 and 25' });
    }
    const term = data.aprTermMonths;
    if (term != null && (typeof term !== 'number' || isNaN(term) || term < 1 || !Number.isInteger(term))) {
      errors.push({ field: 'aprTermMonths', message: 'APR term must be a positive integer' });
    }
  }

  const validFuelTypes = ['GAS', 'HYBRID', 'PLUG_IN_HYBRID'] as const;
  if (data.fuelType != null && !validFuelTypes.includes(data.fuelType as (typeof validFuelTypes)[number])) {
    errors.push({
      field: 'fuelType',
      message: 'fuelType must be GAS, HYBRID, PLUG_IN_HYBRID, or empty',
    });
  }

  // financeRates: when provided, each entry must have valid aprRate and aprTermMonths
  if (data.financeRates != null && Array.isArray(data.financeRates)) {
    for (let i = 0; i < data.financeRates.length; i++) {
      const entry = data.financeRates[i];
      if (entry == null || typeof entry !== 'object') {
        errors.push({ field: 'financeRates', message: `Finance rate entry ${i + 1} is invalid` });
        continue;
      }
      const r = (entry as { aprRate?: unknown }).aprRate;
      const t = (entry as { aprTermMonths?: unknown }).aprTermMonths;
      const ft = (entry as { fuelType?: unknown }).fuelType;
      if (typeof r !== 'number' || isNaN(r) || r < 0 || r > 25) {
        errors.push({ field: 'financeRates', message: `Entry ${i + 1}: APR rate must be 0–25` });
      }
      if (typeof t !== 'number' || isNaN(t) || t < 1 || !Number.isInteger(t)) {
        errors.push({ field: 'financeRates', message: `Entry ${i + 1}: APR term must be a positive integer` });
      }
      if (ft != null && !validFuelTypes.includes(ft as (typeof validFuelTypes)[number])) {
        errors.push({
          field: 'financeRates',
          message: `Entry ${i + 1}: fuelType must be GAS, HYBRID, PLUG_IN_HYBRID, or omitted`,
        });
      }
    }
  }

  // Cash fields and rebateTotal: >= 0 if provided
  const cashFields = [
    ['rebateTotal', data.rebateTotal],
    ['customerCash', data.customerCash],
    ['leaseCash', data.leaseCash],
    ['aprCash', data.aprCash],
    ['bonusCash', data.bonusCash],
  ] as const;
  for (const [field, val] of cashFields) {
    if (val != null && (typeof val !== 'number' || isNaN(val) || val < 0)) {
      errors.push({ field, message: `${field} must be 0 or greater` });
    }
  }

  if (data.inventoryUrl?.trim() && !isSafeHttpsUrl(data.inventoryUrl)) {
    errors.push({ field: 'inventoryUrl', message: 'Inventory URL must be a valid https URL' });
  }
  if (data.imageUrl?.trim() && !isSafeHttpsUrl(data.imageUrl)) {
    errors.push({ field: 'imageUrl', message: 'Image URL must be a valid https URL' });
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
