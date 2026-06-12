/**
 * Toyota ingestion types.
 * ToyotaRawOffer reflects the smallest useful unit from captured payloads (one offer/program row).
 * All fields optional so missing data stays blank.
 */

export interface ToyotaRawOffer {
  year?: number | null;
  make?: string | null;
  model?: string | null;
  trim?: string | null;
  /** Toyota model code from spec line e.g. 2557 from "(2557) 2WD 4Dr. Sedan XSE..." */
  modelCode?: number | null;
  programType?: 'lease' | 'finance' | 'cash' | string | null;
  monthlyPayment?: number | null;
  dueAtSigning?: number | null;
  termMonths?: number | null;
  milesPerYear?: number | null;
  msrp?: number | null;
  apr?: number | null;
  aprTermMonths?: number | null;
  acquisitionFee?: number | null;
  downPayment?: number | null;
  /** Incentive/cash fields from raw payload; names may vary. */
  rebateTotal?: number | null;
  customerCash?: number | null;
  leaseCash?: number | null;
  aprCash?: number | null;
  bonusCash?: number | null;
  startDate?: string | null;
  endDate?: string | null;
  disclaimer?: string | null;
  additionalNotes?: string | null;
  programId?: string | null;
  inventoryUrl?: string | null;
  imageUrl?: string | null;
  discount?: number | null;
  buyFor?: number | null;
  stockNumber?: string | null;
}

/** Captured response used for detection and parsing. */
export interface CapturedResponse {
  url: string;
  status: number;
  body: unknown;
}

/** Raw payload snapshot written to artifacts for debugging. */
export interface ToyotaRawPayloadSnapshot {
  capturedAt: string;
  url: string;
  responses: CapturedResponse[];
}

/** Toyota offers payload shape (structure we look for in responses). */
export interface ToyotaOffersPayload {
  offers?: unknown[];
  programs?: unknown[];
  incentives?: unknown[];
  leaseDeals?: unknown[];
  financeDeals?: unknown[];
  data?: unknown;
  [key: string]: unknown;
}
