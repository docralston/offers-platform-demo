/**
 * BMW ingestion constants.
 * Store: all BMW offers map to storeCode = "BMW".
 */

export const BMW_STORE_CODE = 'BMW' as const;

/** Section header rows used to disambiguate duplicate labels in V2 workbooks. */
export const LEASE_PAYMENT_INFO_LABEL = 'Lease Payment Info';
export const LOAN_PAYMENT_INFO_LABEL = 'Loan Payment Info';

/**
 * Row labels found in columns A/B of the BMW Excel sheets.
 * Used for label-based row matching (more robust than hardcoded indices).
 */
export const LEASE_ROW_LABELS = {
  offerStatus: 'Offer Status on Special Offers',
  modelYear: 'Model Year',
  officialModelName: 'Official Model Name',
  localModelCode: 'Local Model Code',
  msrp: 'MSRP (Well Equipped)',
  annualMileage: 'Annual Mileage',
  leaseCredit: 'Lease Credit',
  leasePayment: 'Monthly Payment',
  leaseTerm: 'Lease Term',
  dueAtSigning: 'Due at Signing',
  acquisitionFee: 'Acquisition Fee',
  nationalCredit: 'National Credit',
  centerContribution: 'Center Contribution',
  totalCost: 'Total Cost',
} as const;

export const LOAN_ROW_LABELS = {
  aprOfferStatus: 'APR Offer Status on Special Offers',
  modelYear: 'Model Year',
  officialModelName: 'Official Model Name',
  localModelCode: 'Local Model Code',
  msrp: 'MSRP (Well Equipped)',
  msrpAlt: 'MSRP',
  totalCost: 'Total Cost',
  customerDownPayment: 'Customer Down Payment',
  purchaseCredit: 'Purchase Credit',
  nationalCredit: 'National Credit',
  centerContribution: 'Center Contribution',
  aprRate60mo: 'APR Rate 60mo',
  aprTerm: 'APR Term',
} as const;

/** Alternate spreadsheet row names that map to the same field. */
export const LOAN_ROW_LABEL_ALTS: Record<string, readonly string[]> = {
  aprRate60mo: ['APR Rate', 'APR', 'Rate'],
  aprTerm: ['Term'],
};

/** Label resolution hints for duplicate rows in V2 sheets. */
export const LEASE_LABEL_HINTS: Partial<
  Record<keyof typeof LEASE_ROW_LABELS, { preferAfter?: string; preferLast?: boolean }>
> = {
  leasePayment: { preferAfter: LEASE_PAYMENT_INFO_LABEL },
  dueAtSigning: { preferAfter: LEASE_PAYMENT_INFO_LABEL },
  acquisitionFee: { preferLast: true },
};

export const LOAN_LABEL_HINTS: Partial<
  Record<keyof typeof LOAN_ROW_LABELS, { preferAfter?: string; preferLast?: boolean }>
> = {
  msrpAlt: { preferAfter: LOAN_PAYMENT_INFO_LABEL, preferLast: true },
  customerDownPayment: { preferAfter: LOAN_PAYMENT_INFO_LABEL, preferLast: true },
};
