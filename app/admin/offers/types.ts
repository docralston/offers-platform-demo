import type { ValidationIssue } from '@/lib/validation/offers';

/**
 * Shape of an offer after server serialization (dates → ISO strings, Decimals → numbers).
 * Used by admin list, table, and review components so they stay in sync with the API.
 */
export interface SerializedOffer {
  id: string;
  status: string;
  storeCode: string;
  /** When non-empty, offer applies to all listed stores. Used to expand rows when Store column visible. */
  storeCodes?: string[] | null;
  condition: string;
  year: number | null;
  make: string | null;
  model: string;
  modelCode: string | null;
  trim: string | null;
  offerType: string | null;
  rebateTotal: unknown;
  endDate: string | Date;
  updatedAt: string | Date;
  startDate?: string | Date;
  createdAt?: string | Date;
  validationIssues?: ValidationIssue[] | null;
  leasePayment?: number | null;
  leaseTerm?: number | null;
  leaseMiles?: number | null;
  aprRate?: number | null;
  aprTermMonths?: number | null;
}
