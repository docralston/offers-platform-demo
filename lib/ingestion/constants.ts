/**
 * Shared ingestion constants used across Toyota, Lexus, and BMW.
 */

/** Max upload size for XLSX/PDF imports (10 MB). */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/** Max spreadsheet rows per import. */
export const MAX_IMPORT_ROWS = 500;

/** Canonical column order for offer import/export tables.
 * This is the universal schema that brand-specific flows normalize into.
 */
export const OFFERS_TABLE_COLUMN_ORDER = [
  'status',
  'storeCode',
  'storeCodes',
  'stockNumber',
  'condition',
  'year',
  'make',
  'model',
  'series',
  'modelCode',
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
] as const;
