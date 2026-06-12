export type CrosscheckSeverity = 'info' | 'warning';

export interface CrosscheckWarning {
  code: string;
  severity: CrosscheckSeverity;
  fields: string[];
  sourceA: 'api' | 'pdf' | 'db' | 'manual';
  sourceB?: 'api' | 'pdf' | 'db' | 'manual';
  message: string;
  rowRefs: string[];
}

export interface CrosscheckSummary {
  matchedCount: number;
  unmatchedApiCount: number;
  unmatchedPdfCount: number;
  unmatchedDbCount: number;
  enrichedFields: number;
  conflicts: number;
  totalPdfRows?: number;
  comparablePdfRows?: number;
  parseDiagnostics: string[];
}

