import type { StoreCode } from '@/lib/config/stores';

/** Doc fee disclosed in universal disclaimer outro (all brands). */
export const DISCLAIMER_DOC_FEE_USD = 490;

/** Manufacturer captive finance abbreviations used in marketing disclaimers. */
export type CaptiveLenderAbbrev = 'TFS' | 'LFS' | 'BMWFS';

export function getCaptiveLenderAbbrev(storeCode: string): CaptiveLenderAbbrev {
  switch (storeCode as StoreCode) {
    case 'TOY':
      return 'TFS';
    case 'LEXDT':
    case 'LEXWG':
      return 'LFS';
    case 'BMW':
      return 'BMWFS';
    default:
      return 'TFS';
  }
}

/** Toyota & Lexus → Sales Consultant; BMW → Client Advisor */
export function getSalespersonTitleForStore(storeCode: string): 'Sales Consultant' | 'Client Advisor' {
  return storeCode === 'BMW' ? 'Client Advisor' : 'Sales Consultant';
}
