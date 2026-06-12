import type { OfferInput } from '@/lib/domain/validation';
import { VehicleCondition } from '@prisma/client';

/**
 * Validation issue codes - stable constants for UI/analytics
 */
export const ISSUE_CODES = {
  MISSING_DATES: 'MISSING_DATES',
  INVALID_DATE_RANGE: 'INVALID_DATE_RANGE',
  INVALID_STORE_CODE: 'INVALID_STORE_CODE',
  INVALID_OFFER_TYPE: 'INVALID_OFFER_TYPE',
  MISSING_MAKE_MODEL: 'MISSING_MAKE_MODEL',
  MISSING_YEAR: 'MISSING_YEAR',
  INVALID_NUMERIC: 'INVALID_NUMERIC',
  LEASE_MISSING_FIELDS: 'LEASE_MISSING_FIELDS',
  FINANCE_MISSING_FIELDS: 'FINANCE_MISSING_FIELDS',
  APR_OVER_5: 'APR_OVER_5',
  APR_OVER_20: 'APR_OVER_20',
  TOY_UNKNOWN_MODEL: 'TOY_UNKNOWN_MODEL',
  LEX_LEASE_MISSING_MSRP: 'LEX_LEASE_MISSING_MSRP',
  LEX_CPO_WRONG_OFFER_TYPE: 'LEX_CPO_WRONG_OFFER_TYPE',
  LEX_CPO_TERM_NOT_72: 'LEX_CPO_TERM_NOT_72',
  LEX_LEASE_INVALID_ACQUISITION_FEE: 'LEX_LEASE_INVALID_ACQUISITION_FEE',
  TOY_LEASE_INVALID_ACQUISITION_FEE: 'TOY_LEASE_INVALID_ACQUISITION_FEE',
  BMW_LEASE_MISSING_MSRP: 'BMW_LEASE_MISSING_MSRP',
  BMW_FINANCE_MSRP_CROSS_REF_MISS: 'BMW_FINANCE_MSRP_CROSS_REF_MISS',
  MISSING_DISCLAIMER: 'MISSING_DISCLAIMER',
  OFFER_TYPE_FROZEN: 'OFFER_TYPE_FROZEN',
  YEAR_TOO_OLD: 'YEAR_TOO_OLD',
} as const;

export interface ValidationIssue {
  code: string;
  severity: 'error' | 'warning';
  field?: string;
  message: string;
}

export interface ValidationResult {
  normalizedRow: OfferInput;
  issues: ValidationIssue[];
}

/**
 * Toyota model normalization map
 * Maps common aliases/variations to canonical model names
 */
const TOYOTA_MODEL_NORMALIZATION: Record<string, string> = {
  'RAV4 HV': 'RAV4 Hybrid',
  'RAV4 HYBRID': 'RAV4 Hybrid',
  'RAV4H': 'RAV4 Hybrid',
  'TACOMA': 'Tacoma',
  'TACOMA HYBRID': 'Tacoma Hybrid',
  'TACOMA I-FORCE MAX': 'Tacoma i-FORCE MAX',
  'COROLLA': 'Corolla',
  'COROLLA HYBRID': 'Corolla Hybrid',
  'COROLLA HATCHBACK': 'Corolla Hatchback',
  'COROLLA CROSS': 'Corolla Cross',
  'COROLLA CROSS HYBRID': 'Corolla Cross Hybrid',
  'CAMRY': 'Camry',
  'CAMRY HYBRID': 'Camry Hybrid',
  'HIGHLANDER': 'Highlander',
  'HIGHLANDER HYBRID': 'Highlander Hybrid',
  'GRAND HIGHLANDER': 'Grand Highlander',
  'GRAND HIGHLANDER HYBRID': 'Grand Highlander Hybrid',
  'TUNDRA': 'Tundra',
  'TUNDRA I-FORCE MAX': 'Tundra i-FORCE MAX',
  '4RUNNER': '4Runner',
  'FOUR RUNNER': '4Runner',
  '4RUNNER I-FORCE MAX': '4Runner i-FORCE MAX',
  'SEQUOIA': 'Sequoia',
  'PRIUS': 'Prius',
  'PRIUS PRIME': 'Prius Prime',
  'PRIUS PLUG-IN HYBRID': 'Prius Plug-in Hybrid',
  'PRIUS PLUG IN HYBRID': 'Prius Plug-in Hybrid',
  'PRIUS PLUGIN HYBRID': 'Prius Plug-in Hybrid',
  'RAV4 PLUG-IN HYBRID': 'RAV4 Plug-in Hybrid',
  'RAV4 PLUG IN HYBRID': 'RAV4 Plug-in Hybrid',
  'RAV4 PLUGIN HYBRID': 'RAV4 Plug-in Hybrid',
  'SIENNA': 'Sienna',
  'VENZA': 'Venza',
  'C-HR': 'C-HR',
  'CHR': 'C-HR',
  'GR COROLLA': 'GR Corolla',
  'GR COROLLA HATCHBACK': 'GR Corolla',
  'GR86': 'GR86',
  'SUPRA': 'Supra',
  'BZ4X': 'bZ4X',
  'BZ 4X': 'bZ4X',
  'BZ': 'bZ',
  'BZ WOODLAND': 'bZ Woodland',
  'LAND CRUISER': 'Land Cruiser',
  'LAND CRUISER HYBRID': 'Land Cruiser Hybrid',
};

/**
 * Toyota model whitelist - canonical model names
 * Add new models here as needed
 */
const TOYOTA_MODEL_WHITELIST = [
  'Camry',
  'Camry Hybrid',
  'Corolla',
  'Corolla Hybrid',
  'Corolla Hatchback',
  'Corolla Cross',
  'Corolla Cross Hybrid',
  'RAV4',
  'RAV4 Hybrid',
  'RAV4 Plug-in Hybrid',
  'Highlander',
  'Highlander Hybrid',
  'Grand Highlander',
  'Grand Highlander Hybrid',
  'Tacoma',
  'Tacoma Hybrid',
  'Tacoma i-FORCE MAX',
  'Tundra',
  'Tundra i-FORCE MAX',
  '4Runner',
  '4Runner i-FORCE MAX',
  'Sequoia',
  'Prius',
  'Prius Prime',
  'Prius Plug-in Hybrid',
  'Sienna',
  'Venza',
  'C-HR',
  'GR Corolla',
  'GR86',
  'Supra',
  'bZ4X',
  'bZ',
  'bZ Woodland',
  'Land Cruiser',
  'Land Cruiser Hybrid',
  'Crown',
] as const;

/**
 * Valid store codes
 */
const VALID_STORE_CODES = ['TOY', 'BMW', 'LEXDT', 'LEXWG'] as const;

/**
 * Valid offer types (all types including frozen)
 */
const VALID_OFFER_TYPES = ['Lease', 'Finance', 'Cash', 'Other'] as const; // Other kept for backward compat

/**
 * Active offer types (currently in use)
 * Cash and Other are frozen - they will trigger validation issues
 */
const ACTIVE_OFFER_TYPES = ['Lease', 'Finance', 'Cash'] as const;

/**
 * Normalizes Toyota model names
 */
function normalizeToyotaModel(model: string): string {
  let normalized = model.trim();

  // Strip leading "Toyota " so we never store "Toyota Crown" (avoids "Toyota Toyota Crown" in display)
  const makePrefix = 'toyota';
  while (normalized.toLowerCase().startsWith(`${makePrefix} `)) {
    normalized = normalized.slice(makePrefix.length).trimStart();
  }

  const upper = normalized.toUpperCase();

  // Check normalization map
  if (TOYOTA_MODEL_NORMALIZATION[upper]) {
    return TOYOTA_MODEL_NORMALIZATION[upper];
  }

  // If already in whitelist, return as-is
  if (TOYOTA_MODEL_WHITELIST.includes(normalized as any)) {
    return normalized;
  }

  // Try case-insensitive match against whitelist
  const whitelistLower = TOYOTA_MODEL_WHITELIST.map(m => m.toLowerCase());
  const modelLower = normalized.toLowerCase();
  const index = whitelistLower.indexOf(modelLower);
  if (index >= 0) {
    return TOYOTA_MODEL_WHITELIST[index];
  }

  // No normalization found, return original
  return normalized;
}

/**
 * Validates and normalizes an offer row for import
 * Returns normalized row and array of validation issues
 */
export function validateOffer(row: OfferInput): ValidationResult {
  const issues: ValidationIssue[] = [];
  const normalizedRow: OfferInput = { ...row };

  // Normalize Toyota models
  if (normalizedRow.storeCode === 'TOY' && normalizedRow.model) {
    normalizedRow.model = normalizeToyotaModel(normalizedRow.model);
  }

  // Global checks: storeCode
  if (!VALID_STORE_CODES.includes(normalizedRow.storeCode as any)) {
    issues.push({
      code: ISSUE_CODES.INVALID_STORE_CODE,
      severity: 'error',
      field: 'storeCode',
      message: `Store code must be one of: ${VALID_STORE_CODES.join(', ')}`,
    });
  }

  // Global checks: offerType
  if (normalizedRow.offerType && !VALID_OFFER_TYPES.includes(normalizedRow.offerType as any)) {
    issues.push({
      code: ISSUE_CODES.INVALID_OFFER_TYPE,
      severity: 'error',
      field: 'offerType',
      message: `Offer type must be one of: ${VALID_OFFER_TYPES.join(', ')}`,
    });
  }
  
  // Check for frozen offer types (Cash, Other)
  if (normalizedRow.offerType && !ACTIVE_OFFER_TYPES.includes(normalizedRow.offerType as any)) {
    issues.push({
      code: ISSUE_CODES.OFFER_TYPE_FROZEN,
      severity: 'error',
      field: 'offerType',
      message: `Offer type "${normalizedRow.offerType}" is not supported. Use Lease, Finance, or Cash.`,
    });
  }

  // Global checks: dates
  const startDate = typeof normalizedRow.startDate === 'string' 
    ? new Date(normalizedRow.startDate) 
    : normalizedRow.startDate;
  const endDate = typeof normalizedRow.endDate === 'string'
    ? new Date(normalizedRow.endDate)
    : normalizedRow.endDate;

  if (!startDate || isNaN(startDate.getTime())) {
    issues.push({
      code: ISSUE_CODES.MISSING_DATES,
      severity: 'error',
      field: 'startDate',
      message: 'Start date is required and must be a valid date',
    });
  }
  if (!endDate || isNaN(endDate.getTime())) {
    issues.push({
      code: ISSUE_CODES.MISSING_DATES,
      severity: 'error',
      field: 'endDate',
      message: 'End date is required and must be a valid date',
    });
  }
  if (startDate && endDate && !isNaN(startDate.getTime()) && !isNaN(endDate.getTime())) {
    if (endDate < startDate) {
      issues.push({
        code: ISSUE_CODES.INVALID_DATE_RANGE,
        severity: 'error',
        field: 'endDate',
        message: 'End date must be greater than or equal to start date',
      });
    }
  }

  // Global checks: make and model
  if (!normalizedRow.model || !normalizedRow.model.trim()) {
    issues.push({
      code: ISSUE_CODES.MISSING_MAKE_MODEL,
      severity: 'error',
      field: 'model',
      message: 'Model is required',
    });
  }
  // Make is required for USED condition (handled by existing validation, but check here too)
  if (normalizedRow.condition === VehicleCondition.USED && (!normalizedRow.make || !normalizedRow.make.trim())) {
    issues.push({
      code: ISSUE_CODES.MISSING_MAKE_MODEL,
      severity: 'error',
      field: 'make',
      message: 'Make is required when condition is Used',
    });
  }

  // Year validation: required except for certified finance offers
  const isCertifiedFinance = normalizedRow.condition === VehicleCondition.CERTIFIED && normalizedRow.offerType === 'Finance';
  if (!isCertifiedFinance && normalizedRow.year == null) {
    issues.push({
      code: ISSUE_CODES.MISSING_YEAR,
      severity: 'error',
      field: 'year',
      message: 'Year is required',
    });
  }

  // Year validation: NEW vehicles should not be >1 year old
  if (normalizedRow.condition === VehicleCondition.NEW && normalizedRow.year) {
    const currentYear = new Date().getFullYear();
    const maxAllowedYear = currentYear - 1;
    if (normalizedRow.year < maxAllowedYear) {
      issues.push({
        code: ISSUE_CODES.YEAR_TOO_OLD,
        severity: 'error',
        field: 'year',
        message: `Year ${normalizedRow.year} is more than 1 year old. New vehicles should be ${maxAllowedYear} or newer.`,
      });
    }
  }

  // Global checks: numeric parsing sanity
  const numericFields: Array<{ field: keyof OfferInput; name: string }> = [
    { field: 'leasePayment', name: 'leasePayment' },
    { field: 'leaseTerm', name: 'leaseTerm' },
    { field: 'leaseMiles', name: 'leaseMiles' },
    { field: 'dueAtSigning', name: 'dueAtSigning' },
    { field: 'acquisitionFee', name: 'acquisitionFee' },
    { field: 'downPayment', name: 'downPayment' },
    { field: 'msrp', name: 'msrp' },
    { field: 'discount', name: 'discount' },
    { field: 'buyFor', name: 'buyFor' },
    { field: 'aprRate', name: 'aprRate' },
    { field: 'aprTermMonths', name: 'aprTermMonths' },
    { field: 'customerCash', name: 'customerCash' },
    { field: 'leaseCash', name: 'leaseCash' },
    { field: 'aprCash', name: 'aprCash' },
    { field: 'bonusCash', name: 'bonusCash' },
    { field: 'rebateTotal', name: 'rebateTotal' },
  ];

  for (const { field, name } of numericFields) {
    const value = normalizedRow[field];
    if (value != null && value !== '' && (typeof value !== 'number' || isNaN(value))) {
      issues.push({
        code: ISSUE_CODES.INVALID_NUMERIC,
        severity: 'error',
        field: name,
        message: `${name} must be a valid number if provided`,
      });
    }
  }

  // Lease requirements
  if (normalizedRow.offerType === 'Lease') {
    if (!normalizedRow.leasePayment || normalizedRow.leasePayment <= 0) {
      issues.push({
        code: ISSUE_CODES.LEASE_MISSING_FIELDS,
        severity: 'error',
        field: 'leasePayment',
        message: 'Lease payment is required and must be greater than 0 for Lease offers',
      });
    }
    if (!normalizedRow.leaseTerm || normalizedRow.leaseTerm <= 0) {
      issues.push({
        code: ISSUE_CODES.LEASE_MISSING_FIELDS,
        severity: 'error',
        field: 'leaseTerm',
        message: 'Lease term is required and must be greater than 0 for Lease offers',
      });
    }
    if (!normalizedRow.leaseMiles || normalizedRow.leaseMiles <= 0) {
      issues.push({
        code: ISSUE_CODES.LEASE_MISSING_FIELDS,
        severity: 'error',
        field: 'leaseMiles',
        message: 'Lease miles is required and must be greater than 0 for Lease offers',
      });
    }
  }

  // Finance requirements
  if (normalizedRow.offerType === 'Finance') {
    if (normalizedRow.aprRate == null) {
      issues.push({
        code: ISSUE_CODES.FINANCE_MISSING_FIELDS,
        severity: 'error',
        field: 'aprRate',
        message: 'APR rate is required for Finance offers (0 is valid)',
      });
    } else if (typeof normalizedRow.aprRate === 'number' && normalizedRow.aprRate < 0) {
      issues.push({
        code: ISSUE_CODES.FINANCE_MISSING_FIELDS,
        severity: 'error',
        field: 'aprRate',
        message: 'APR rate cannot be negative',
      });
    }
    if (!normalizedRow.aprTermMonths || normalizedRow.aprTermMonths <= 0) {
      issues.push({
        code: ISSUE_CODES.FINANCE_MISSING_FIELDS,
        severity: 'error',
        field: 'aprTermMonths',
        message: 'APR term months is required and must be greater than 0 for Finance offers',
      });
    }
    // APR sanity checks
    if (normalizedRow.aprRate && normalizedRow.aprRate > 20) {
      issues.push({
        code: ISSUE_CODES.APR_OVER_20,
        severity: 'error',
        field: 'aprRate',
        message: 'APR rate exceeds 20% - please verify',
      });
    }
    if (normalizedRow.aprRate && normalizedRow.aprRate > 5) {
      issues.push({
        code: ISSUE_CODES.APR_OVER_5,
        severity: 'error',
        field: 'aprRate',
        message: 'APR rate exceeds 5% - only rates <= 5% are typically exported',
      });
    }
  }

  // Disclaimer warning (optional, but triggers NeedsReview per "any issue" rule)
  if (!normalizedRow.disclaimer || !normalizedRow.disclaimer.trim()) {
    issues.push({
      code: ISSUE_CODES.MISSING_DISCLAIMER,
      severity: 'warning',
      field: 'disclaimer',
      message: 'Disclaimer is missing - recommended for all offers',
    });
  }

  // Brand-aware checks: Toyota
  if (normalizedRow.storeCode === 'TOY') {
    if (normalizedRow.model) {
      const normalizedModel = normalizedRow.model;
      if (!TOYOTA_MODEL_WHITELIST.includes(normalizedModel as any)) {
        issues.push({
          code: ISSUE_CODES.TOY_UNKNOWN_MODEL,
          severity: 'error',
          field: 'model',
          message: `Unknown Toyota model: "${normalizedModel}". Please verify or add to whitelist.`,
        });
      }
    }
    // Toyota lease acquisition fee must be $750
    if (normalizedRow.offerType === 'Lease') {
      if (normalizedRow.acquisitionFee == null || normalizedRow.acquisitionFee !== 750) {
        issues.push({
          code: ISSUE_CODES.TOY_LEASE_INVALID_ACQUISITION_FEE,
          severity: 'error',
          field: 'acquisitionFee',
          message: 'Toyota lease offers must have an acquisition fee of $750',
        });
      }
    }
  }

  // Brand-aware checks: Lexus
  const isLexus = normalizedRow.storeCode === 'LEXDT' || normalizedRow.storeCode === 'LEXWG';
  if (isLexus) {
    // Lexus lease requires msrp
    if (normalizedRow.offerType === 'Lease') {
      if (!normalizedRow.msrp || normalizedRow.msrp <= 0) {
        issues.push({
          code: ISSUE_CODES.LEX_LEASE_MISSING_MSRP,
          severity: 'error',
          field: 'msrp',
          message: 'MSRP is required for Lexus lease offers',
        });
      }
      // Lexus lease acquisition fee must be $895
      if (normalizedRow.acquisitionFee == null || normalizedRow.acquisitionFee !== 895) {
        issues.push({
          code: ISSUE_CODES.LEX_LEASE_INVALID_ACQUISITION_FEE,
          severity: 'error',
          field: 'acquisitionFee',
          message: 'Lexus lease offers must have an acquisition fee of $895',
        });
      }
    }
    // Lexus Certified rules
    if (normalizedRow.condition === VehicleCondition.CERTIFIED) {
      if (normalizedRow.offerType !== 'Finance') {
        issues.push({
          code: ISSUE_CODES.LEX_CPO_WRONG_OFFER_TYPE,
          severity: 'error',
          field: 'offerType',
          message: 'Certified Lexus offers must be Finance type',
        });
      }
      if (normalizedRow.aprTermMonths !== 72) {
        issues.push({
          code: ISSUE_CODES.LEX_CPO_TERM_NOT_72,
          severity: 'error',
          field: 'aprTermMonths',
          message: 'Certified Lexus offers must have 72-month term',
        });
      }
    }
  }

  // Brand-aware checks: BMW
  if (normalizedRow.storeCode === 'BMW') {
    if (normalizedRow.offerType === 'Lease') {
      if (!normalizedRow.msrp || normalizedRow.msrp <= 0) {
        issues.push({
          code: ISSUE_CODES.BMW_LEASE_MISSING_MSRP,
          severity: 'error',
          field: 'msrp',
          message: 'MSRP is required for BMW lease offers',
        });
      }
    }
    if (normalizedRow.offerType === 'Finance') {
      if (!normalizedRow.msrp || normalizedRow.msrp <= 0) {
        issues.push({
          code: ISSUE_CODES.BMW_FINANCE_MSRP_CROSS_REF_MISS,
          severity: 'warning',
          field: 'msrp',
          message:
            'Finance MSRP could not be resolved from lease sheet cross-reference or loan fallbacks',
        });
      }
    }
  }

  return {
    normalizedRow,
    issues,
  };
}
