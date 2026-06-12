export interface StoreConfig {
  storeKey: string;
  brand: string;
  domain: string;
  siteUrl: string;
  dealerName: string;
  legalName: string;
  location: {
    address: string;
    city: string;
    state: string;
    zip: string;
    county: string;
  };
  contact: {
    phone: string;
  };
  branding: {
    accentColor: string;
    theme: string;
  };
  links: {
    newInventory: string;
    usedInventory: string;
    service: string;
    finance: string;
    trade: string;
    contact: string;
  };
  images?: {
    dealership?: {
      path?: string;
      src?: string;
      alt: string;
    };
  };
  defaults?: {
    leadFormAnchor: string;
    inventoryAnchor: string;
  };
  schema?: {
    includeLocalBusiness?: boolean;
    includeBreadcrumbs?: boolean;
    includeFAQPage?: boolean;
    includeTrimsItemList?: boolean;
  };
  assets?: {
    r2BaseUrl?: string;
  };
  seo?: {
    serviceArea?: string[];
  };
  geo?: {
    latitude?: number;
    longitude?: number;
  };
  openingHours?: string[];
}

export const STORE_CODES = ['TOY', 'LEXDT', 'LEXWG', 'BMW'] as const;

export type StoreCode = (typeof STORE_CODES)[number];

export const STORE_DISPLAY_NAMES: Record<StoreCode, string> = {
  TOY: 'Toyota',
  LEXWG: 'Lexus WG',
  LEXDT: 'Lexus DT',
  BMW: 'BMW',
};

/** Make (brand) name for import/display when condition is NEW or CERTIFIED. */
export const STORE_CODE_TO_MAKE: Record<StoreCode, string> = {
  TOY: 'Toyota',
  LEXDT: 'Lexus',
  LEXWG: 'Lexus',
  BMW: 'BMW',
};

export function getMakeForStoreCode(storeCode: string): string | null {
  return STORE_CODE_TO_MAKE[storeCode as StoreCode] ?? null;
}

/** Default acquisition fee for lease offers by store (used when not set manually). Toyota $750, Lexus $895, BMW $0. */
export const STORE_CODE_TO_ACQUISITION_FEE: Record<StoreCode, number> = {
  TOY: 750,
  LEXDT: 895,
  LEXWG: 895,
  BMW: 0,
};

export function getDefaultAcquisitionFee(storeCode: string): number | null {
  return STORE_CODE_TO_ACQUISITION_FEE[storeCode as StoreCode] ?? null;
}
